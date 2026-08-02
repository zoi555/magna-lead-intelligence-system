// Campaign-scoped territory assignment loader/validator — additive, versioned, separate from
// (and never modifying) config/lead-production/sales-territories-v2.json (the first campaign's
// frozen, historical assignment). ISS-0033 (docs/11_ISSUES_LOG.md): the five-district pilot's
// district->representative pairings do not match sales-territories-v2.json at all (different
// districts entirely for 4 of the 5 reps, and RM1 is already owned by Nauman under the first
// campaign) — the CC supplied a new, explicit allocation for this campaign only, so it lives in
// its own versioned config directory under config/lead-production/campaigns/<campaign-id>/,
// never edited into or merged with the historical file.
//
// Same fail-closed philosophy as territory-assignment-v2.ts: an unlisted postcode district must
// throw, never silently proceed unassigned.

import { promises as fs } from "node:fs";
import type { SalespersonRole, TerritoryRepresentative } from "./territory-assignment-v2";

export interface CampaignAssignment {
  postcodeDistrict: string;
  internalName: string; // short internal name (e.g. "Kunz") — used for output paths/logging/orchestration, NEVER written into an exported field
  role: SalespersonRole;
  salesProRepresentativeValue: string; // the CC's exact required "Sales Rep"/"Field Sales Rep" cell value, written verbatim
  regionRoute: string; // the CC's exact required "Region/Route" cell value, written verbatim
  mapsRequired: boolean;
}

export interface CampaignTerritoryConfig {
  campaignId: string;
  campaignVersion: string;
  effectiveDate: string;
  sourceOfAllocation: string;
  totalDistricts: number;
  assignments: CampaignAssignment[];
}

export class CampaignTerritoryValidationError extends Error {}
export class UnconfiguredCampaignDistrictError extends CampaignTerritoryValidationError {}

const POSTCODE_DISTRICT_RE = /^([A-Z]{1,2})(\d{1,2})$/;

export async function loadCampaignTerritory(filePath: string): Promise<CampaignTerritoryConfig> {
  const config = JSON.parse(await fs.readFile(filePath, "utf8")) as CampaignTerritoryConfig;
  validateCampaignTerritoryConfig(config, filePath);
  return config;
}

// Full structural validation. Fails closed — any violation throws rather than silently
// proceeding with an inconsistent or incomplete campaign assignment.
export function validateCampaignTerritoryConfig(config: CampaignTerritoryConfig, sourceLabel: string): void {
  if (!config.campaignId || config.campaignId.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: campaignId is required.`);
  if (!config.campaignVersion || config.campaignVersion.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: campaignVersion is required.`);
  if (!config.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(config.effectiveDate)) throw new CampaignTerritoryValidationError(`${sourceLabel}: effectiveDate must be an ISO date (YYYY-MM-DD), got "${config.effectiveDate}".`);
  if (!config.sourceOfAllocation || config.sourceOfAllocation.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: sourceOfAllocation is required.`);
  if (!Array.isArray(config.assignments) || config.assignments.length === 0) throw new CampaignTerritoryValidationError(`${sourceLabel}: assignments must be a non-empty array.`);
  if (config.assignments.length !== config.totalDistricts) throw new CampaignTerritoryValidationError(`${sourceLabel}: totalDistricts=${config.totalDistricts} but ${config.assignments.length} assignment entries present.`);

  const seenDistricts = new Set<string>();
  for (const a of config.assignments) {
    if (!a.postcodeDistrict || !POSTCODE_DISTRICT_RE.test(a.postcodeDistrict)) throw new CampaignTerritoryValidationError(`${sourceLabel}: invalid or missing Postcode District "${a.postcodeDistrict}".`);
    const district = a.postcodeDistrict.toUpperCase();
    if (seenDistricts.has(district)) throw new CampaignTerritoryValidationError(`${sourceLabel}: Postcode District "${district}" is assigned more than once — every district must have exactly one owner within a campaign.`);
    seenDistricts.add(district);
    if (!a.internalName || a.internalName.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: ${district} is missing internalName.`);
    if (a.role !== "telesales" && a.role !== "field_sales") throw new CampaignTerritoryValidationError(`${sourceLabel}: ${district} (${a.internalName}) has invalid role "${a.role}".`);
    if (!a.salesProRepresentativeValue || a.salesProRepresentativeValue.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: ${district} (${a.internalName}) is missing salesProRepresentativeValue.`);
    if (!a.regionRoute || a.regionRoute.trim() === "") throw new CampaignTerritoryValidationError(`${sourceLabel}: ${district} (${a.internalName}) is missing regionRoute.`);
    if (a.mapsRequired && a.role !== "field_sales") throw new CampaignTerritoryValidationError(`${sourceLabel}: ${district} (${a.internalName}) has mapsRequired=true but role="${a.role}" — maps are only required for field_sales representatives.`);
  }
}

export function findCampaignAssignmentForDistrict(config: CampaignTerritoryConfig, district: string): CampaignAssignment | null {
  const upper = district.toUpperCase();
  return config.assignments.find((a) => a.postcodeDistrict.toUpperCase() === upper) ?? null;
}

export function findCampaignAssignmentByInternalName(config: CampaignTerritoryConfig, name: string): CampaignAssignment | null {
  return config.assignments.find((a) => a.internalName.toLowerCase() === name.toLowerCase()) ?? null;
}

// Locked policy, same as assertDistrictIsConfigured() (territory-assignment-v2.ts): a district
// with a valid AREA+number format that is not actually assigned in this campaign's config must
// never be silently treated as "no owner, proceed anyway" — never released. Also enforces the
// pilot's own explicit scope rule ("do not run any other district") for any caller that consults
// this campaign config specifically, without needing to separately hardcode the 5-district list.
export function assertCampaignDistrictIsConfigured(config: CampaignTerritoryConfig, district: string): CampaignAssignment {
  const assignment = findCampaignAssignmentForDistrict(config, district);
  if (!assignment) {
    throw new UnconfiguredCampaignDistrictError(
      `Postcode District "${district.toUpperCase()}" is not assigned to any representative in campaign "${config.campaignId}" — failing closed rather than releasing an unassigned-territory candidate for this campaign. Add it to the campaign's assignments (and re-validate) before this district can produce released leads under this campaign.`,
    );
  }
  return assignment;
}

// Adapts one campaign assignment into the existing TerritoryRepresentative shape so it can be
// consumed by the already-tested orchestration code (run-sales-territory.ts, run-full-territory.ts)
// unchanged. Deliberately uses `internalName` (never `salesProRepresentativeValue`, which contains
// spaces/`<`/`>`/`@` characters) for `.representative` — this value is used for output-directory
// naming and logging throughout the existing orchestration path, and must stay filesystem-safe.
// The exact CC-supplied Sales Pro value/Region-Route are applied separately, directly as the
// exporters' own `--representative=`/`--sales-territory=` ad-hoc CLI arguments at export time —
// never threaded through this adapter or the orchestration manifest.
export function campaignAssignmentToTerritoryRepresentative(assignment: CampaignAssignment): TerritoryRepresentative {
  return {
    representative: assignment.internalName,
    role: assignment.role,
    salesTerritory: assignment.postcodeDistrict,
    postcodeDistricts: [assignment.postcodeDistrict.toUpperCase()],
    districtCount: 1,
    mapsRequired: assignment.mapsRequired,
  };
}
