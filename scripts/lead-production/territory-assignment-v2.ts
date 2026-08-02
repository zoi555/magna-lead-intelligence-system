// Native loader/validator for config/lead-production/sales-territories-v2.json — the current,
// active 13-representative / 112-Postcode-District assignment. Superseded the old 22-rep CSV
// (see territory-assignments-tonight.SUPERSEDED.md); loadAssignmentFile() in load-assignments.ts
// (CSV/Excel) remains available but is no longer the source of truth for this assignment.
//
// This module owns: reading the config, expanding a human "AREA{n}-AREA{m}" or comma-list range
// string and cross-checking it against the config's own pre-expanded postcodeDistricts array,
// and validating global representative ownership (no district assigned twice, no district
// missing, map-required only for field_sales reps).

import { promises as fs } from "node:fs";

export type SalespersonRole = "telesales" | "field_sales";

export interface TerritoryRepresentative {
  representative: string;
  role: SalespersonRole;
  salesTerritory: string; // human-readable label, e.g. "RM1-RM14" or "WD17, WD18, ..."
  postcodeDistricts: string[]; // fully expanded, order-preserved
  districtCount: number;
  mapsRequired: boolean;
}

export interface SalesTerritoriesV2Config {
  assignmentVersion: string;
  totalRepresentatives: number;
  totalDistricts: number;
  representatives: TerritoryRepresentative[];
}

export class TerritoryAssignmentValidationError extends Error {}

const POSTCODE_DISTRICT_RE = /^([A-Z]{1,2})(\d{1,2})$/;

// Parses "RM1-RM14" (or en-dash "RM1–RM14") into ["RM1", "RM2", ..., "RM14"], or a
// comma-separated explicit list ("WD17, WD18, WD19") into its literal members (non-contiguous
// districts, e.g. Wajahat's territory, are never expressed as a range). Inclusive on both ends.
export function expandPostcodeDistrictRange(label: string): string[] {
  const rangeMatch = label.trim().match(/^([A-Z]{1,2}\d{1,2})\s*[-–]\s*([A-Z]{1,2}\d{1,2})$/);
  if (rangeMatch) {
    const [, startCode, endCode] = rangeMatch;
    const startParsed = startCode.match(POSTCODE_DISTRICT_RE);
    const endParsed = endCode.match(POSTCODE_DISTRICT_RE);
    if (!startParsed || !endParsed) throw new TerritoryAssignmentValidationError(`Cannot parse postcode district range "${label}".`);
    const [, startArea, startNumRaw] = startParsed;
    const [, endArea, endNumRaw] = endParsed;
    if (startArea !== endArea) throw new TerritoryAssignmentValidationError(`Range "${label}" spans two different postcode areas ("${startArea}" and "${endArea}") — a Sales Territory range must stay within one postcode area.`);
    const startNum = Number(startNumRaw);
    const endNum = Number(endNumRaw);
    if (endNum < startNum) throw new TerritoryAssignmentValidationError(`Range "${label}" has an end district number smaller than its start.`);
    const out: string[] = [];
    for (let n = startNum; n <= endNum; n++) out.push(`${startArea}${n}`); // inclusive both ends
    return out;
  }
  // Explicit comma-separated list — the non-contiguous case (e.g. Wajahat).
  const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new TerritoryAssignmentValidationError(`Cannot parse postcode district label "${label}" as either a range or a list.`);
  for (const p of parts) if (!POSTCODE_DISTRICT_RE.test(p)) throw new TerritoryAssignmentValidationError(`"${p}" in "${label}" is not a valid Postcode District (expected AREA + number, e.g. "RM1").`);
  return parts;
}

export async function loadSalesTerritoriesV2(filePath: string): Promise<SalesTerritoriesV2Config> {
  const config = JSON.parse(await fs.readFile(filePath, "utf8")) as SalesTerritoriesV2Config;
  validateSalesTerritoriesV2(config, filePath);
  return config;
}

// Full structural + ownership validation. Fails closed — any violation throws rather than
// silently proceeding with an inconsistent assignment.
export function validateSalesTerritoriesV2(config: SalesTerritoriesV2Config, sourceLabel: string): void {
  if (config.assignmentVersion !== "v2") throw new TerritoryAssignmentValidationError(`${sourceLabel}: expected assignmentVersion "v2", got "${config.assignmentVersion}".`);
  if (config.representatives.length !== config.totalRepresentatives) throw new TerritoryAssignmentValidationError(`${sourceLabel}: totalRepresentatives=${config.totalRepresentatives} but ${config.representatives.length} representative entries present.`);

  const allDistricts: string[] = [];
  const ownerByDistrict = new Map<string, string>();

  for (const rep of config.representatives) {
    if (rep.postcodeDistricts.length !== rep.districtCount) {
      throw new TerritoryAssignmentValidationError(`${sourceLabel}: ${rep.representative}'s districtCount=${rep.districtCount} does not match its own postcodeDistricts array length (${rep.postcodeDistricts.length}).`);
    }
    // Cross-check the stored array against an independent re-expansion of the human label —
    // catches any hand-edited drift between salesTerritory and postcodeDistricts.
    const reExpanded = expandPostcodeDistrictRange(rep.salesTerritory);
    const storedSet = new Set(rep.postcodeDistricts);
    const reExpandedSet = new Set(reExpanded);
    if (storedSet.size !== reExpandedSet.size || [...storedSet].some((d) => !reExpandedSet.has(d))) {
      throw new TerritoryAssignmentValidationError(`${sourceLabel}: ${rep.representative}'s salesTerritory label "${rep.salesTerritory}" expands to a different district set than the stored postcodeDistricts array.`);
    }
    const seenWithinRep = new Set<string>();
    for (const d of rep.postcodeDistricts) {
      if (!POSTCODE_DISTRICT_RE.test(d)) throw new TerritoryAssignmentValidationError(`${sourceLabel}: ${rep.representative} has an invalid Postcode District "${d}".`);
      if (seenWithinRep.has(d)) throw new TerritoryAssignmentValidationError(`${sourceLabel}: ${rep.representative} lists district "${d}" more than once.`);
      seenWithinRep.add(d);
      const existingOwner = ownerByDistrict.get(d);
      if (existingOwner && existingOwner !== rep.representative) {
        throw new TerritoryAssignmentValidationError(`${sourceLabel}: Postcode District "${d}" is assigned to both "${existingOwner}" and "${rep.representative}" — every district must have exactly one owner.`);
      }
      ownerByDistrict.set(d, rep.representative);
      allDistricts.push(d);
    }
    // Map requirement is a field_sales-only concept in this assignment (Nauman/Manraj/Ayesha) —
    // any telesales rep with mapsRequired=true, or a field_sales rep with mapsRequired=false, is
    // a genuine config defect, not a stylistic choice.
    if (rep.mapsRequired && rep.role !== "field_sales") {
      throw new TerritoryAssignmentValidationError(`${sourceLabel}: ${rep.representative} has mapsRequired=true but role="${rep.role}" — maps are only required for field_sales representatives.`);
    }
  }

  if (allDistricts.length !== config.totalDistricts) {
    throw new TerritoryAssignmentValidationError(`${sourceLabel}: totalDistricts=${config.totalDistricts} but ${allDistricts.length} district assignments found across all representatives.`);
  }
  if (new Set(allDistricts).size !== allDistricts.length) {
    throw new TerritoryAssignmentValidationError(`${sourceLabel}: duplicate Postcode District assignment detected across representatives (${allDistricts.length} entries, ${new Set(allDistricts).size} unique).`);
  }
}

export function findRepresentativeForDistrict(config: SalesTerritoriesV2Config, district: string): TerritoryRepresentative | null {
  const upper = district.toUpperCase();
  return config.representatives.find((r) => r.postcodeDistricts.includes(upper)) ?? null;
}

export function findRepresentative(config: SalesTerritoriesV2Config, name: string): TerritoryRepresentative | null {
  return config.representatives.find((r) => r.representative.toLowerCase() === name.toLowerCase()) ?? null;
}

// Locked policy (2026-08-02): "Unlisted postcode districts are excluded... Unknown or
// unassigned districts fail closed." A district with valid AREA+number FORMAT but that is not
// actually assigned to any representative in the live config must never be silently treated as
// "no owner, proceed anyway" — it must throw, so a candidate can never be released under a
// district this config doesn't recognise. This is the release-time counterpart to
// findRepresentativeForDistrict()'s soft lookup above (which returns null and is otherwise dead
// code in the production path — kept for the test suite and this new caller).
export class UnconfiguredDistrictError extends TerritoryAssignmentValidationError {}

export function assertDistrictIsConfigured(config: SalesTerritoriesV2Config, district: string): TerritoryRepresentative {
  const rep = findRepresentativeForDistrict(config, district);
  if (!rep) {
    throw new UnconfiguredDistrictError(
      `Postcode District "${district.toUpperCase()}" is not assigned to any representative in ${config.assignmentVersion} — failing closed rather than releasing an unassigned-territory candidate. Add it to a representative's postcodeDistricts (and re-validate) before this district can produce released leads.`,
    );
  }
  return rep;
}
