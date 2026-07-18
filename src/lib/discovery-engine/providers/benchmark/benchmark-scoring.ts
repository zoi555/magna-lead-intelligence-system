// UB1 discovery-actor benchmark scoring — provider-neutral, pure, no network.
//
// Scores a set of parsed SourceOutlet records (from ANY discovery actor) against the independently
// compiled reference set (`ub1-reference-set.ts`) and the existing geography-validation gate. This
// module contains NO Apify-specific logic and does not execute anything — it is pure analysis over
// already-parsed data, so it works identically for a live diagnostic result or a dry-run fixture.
//
// Distinct virtual storefronts are NEVER merged into one commercial entity here just because they
// share an address or phone number — each source_outlet_id is counted as its own storefront/UUID.
// A separate `entity_type` classification (physical/virtual_brand/chain_branch) is reported
// alongside, but does not collapse counts.

import type { SourceOutlet } from "../../consolidation/types";
import { partitionByGeography, type GeographyRunContext } from "../../geography/provider-geography-gate";
import { summariseFidelity, type FidelityContext } from "../../geography/location-fidelity";
import { UB1_BENCHMARK_REFERENCE_SET, type UB1ReferenceListing } from "./ub1-reference-set";

function normaliseName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

export interface ReferenceMatch {
  reference: UB1ReferenceListing;
  matchedOutlet: SourceOutlet | null;
  matchMethod: "uuid" | "name" | "none";
}

/** Match each reference-set listing against the returned outlets. UUID match (strongest) first,
 *  then a conservative name match (normalised name is contained in, or contains, the outlet name).
 *  A reference listing with no plausible match is honestly reported as `matchMethod: "none"`. */
export function matchReferenceSet(outlets: SourceOutlet[], referenceSet: UB1ReferenceListing[] = UB1_BENCHMARK_REFERENCE_SET): ReferenceMatch[] {
  return referenceSet.map((reference) => {
    if (reference.uber_uuid) {
      const byUuid = outlets.find((o) => o.source_outlet_id === reference.uber_uuid);
      if (byUuid) return { reference, matchedOutlet: byUuid, matchMethod: "uuid" as const };
    }
    const refName = normaliseName(reference.name);
    const byName = outlets.find((o) => {
      const n = normaliseName(o.name);
      return n.length > 0 && (n.includes(refName) || refName.includes(n));
    });
    if (byName) return { reference, matchedOutlet: byName, matchMethod: "name" as const };
    return { reference, matchedOutlet: null, matchMethod: "none" as const };
  });
}

export interface FieldCompleteness {
  field: keyof SourceOutlet;
  present: number;
  total: number;
  pct: number;
}

const COMPLETENESS_FIELDS: (keyof SourceOutlet)[] = [
  "postcode", "latitude", "phone", "rating", "review_count", "cuisines", "is_delivery",
  "delivery_cost", "eta_minutes", "halal_flag",
];

function fieldCompleteness(outlets: SourceOutlet[]): FieldCompleteness[] {
  return COMPLETENESS_FIELDS.map((field) => {
    const present = outlets.filter((o) => {
      const v = (o as unknown as Record<string, unknown>)[field as string];
      if (Array.isArray(v)) return v.length > 0;
      return v !== null && v !== undefined;
    }).length;
    return { field, present, total: outlets.length, pct: outlets.length ? Math.round((present / outlets.length) * 1000) / 10 : 0 };
  });
}

export interface DuplicateReport {
  distinctIds: number;
  totalRecords: number;
  duplicateCount: number;
  duplicateRate: number;   // 0..1
}

function duplicateReport(outlets: SourceOutlet[]): DuplicateReport {
  const ids = new Set(outlets.map((o) => o.source_outlet_id));
  const duplicateCount = outlets.length - ids.size;
  return { distinctIds: ids.size, totalRecords: outlets.length, duplicateCount, duplicateRate: outlets.length ? duplicateCount / outlets.length : 0 };
}

export interface UB1BenchmarkScore {
  actorLabel: string;
  totalRecords: number;
  distinctRecords: number;
  duplicates: DuplicateReport;
  // Recall — known-listing / reference-set coverage.
  referenceMatches: ReferenceMatch[];
  knownListingRecall: { matched: number; total: number; pct: number };
  // Business geography (the existing gate) — precision.
  geography: { valid: number; outOfScope: number; unverifiable: number; total: number };
  physicalUB1Precision: { validCount: number; totalRecords: number; pct: number };
  outsideAreaCount: number;
  unverifiableCount: number;
  // Distinct storefronts vs unique physical restaurants (never merged by address/phone alone).
  distinctStorefrontCount: number;
  uniquePhysicalUB1RestaurantCount: number;   // == valid-geography distinct storefront count; virtual
                                               // brands sharing a kitchen are NOT collapsed here —
                                               // that judgement is left to the consolidation layer,
                                               // which records `confirmed_same` explicitly (docs/68).
  // Field completeness.
  fieldCompleteness: FieldCompleteness[];
  // Cost.
  costPerUniqueValidRestaurant: number | null;
}

export interface ScoreUB1BenchmarkInput {
  actorLabel: string;
  outlets: SourceOutlet[];
  geoCtx?: GeographyRunContext;
  fidelityCtx?: FidelityContext;
  referenceSet?: UB1ReferenceListing[];
  actualCostUsd?: number | null;
}

const DEFAULT_GEO_CTX: GeographyRunContext = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };
const DEFAULT_FIDELITY_CTX: FidelityContext = { targetDistrict: "UB1" };

/** Pure scoring — no network, no DB, no Apify. Works on a fixture set exactly as it would on a
 *  real diagnostic's parsed outlets. */
export function scoreUB1Benchmark(input: ScoreUB1BenchmarkInput): UB1BenchmarkScore {
  const { outlets } = input;
  const geoCtx = input.geoCtx ?? DEFAULT_GEO_CTX;
  const fidelityCtx = input.fidelityCtx ?? DEFAULT_FIDELITY_CTX;
  const referenceSet = input.referenceSet ?? UB1_BENCHMARK_REFERENCE_SET;

  const part = partitionByGeography(outlets, geoCtx);
  const fidelity = summariseFidelity(outlets, fidelityCtx);
  const dupes = duplicateReport(outlets);
  const referenceMatches = matchReferenceSet(outlets, referenceSet);
  const matchedCount = referenceMatches.filter((m) => m.matchedOutlet !== null).length;

  // Raw (per-record, duplicates included) valid count — for precision, which is about what
  // fraction of RETURNED RECORDS are correctly located.
  const validCount = part.valid.length;
  // Distinct-storefront valid count — for "unique restaurant" metrics and cost-per-restaurant,
  // which must not double-count a repeated/duplicate observation as a second restaurant.
  const uniqueValidCount = new Set(part.valid.map((o) => o.source_outlet_id)).size;
  const costPerUniqueValidRestaurant = input.actualCostUsd != null && uniqueValidCount > 0 ? Math.round((input.actualCostUsd / uniqueValidCount) * 10000) / 10000 : null;

  return {
    actorLabel: input.actorLabel,
    totalRecords: outlets.length,
    distinctRecords: dupes.distinctIds,
    duplicates: dupes,
    referenceMatches,
    knownListingRecall: { matched: matchedCount, total: referenceSet.length, pct: referenceSet.length ? Math.round((matchedCount / referenceSet.length) * 1000) / 10 : 0 },
    geography: { valid: part.runStatus.valid, outOfScope: part.runStatus.outOfScope, unverifiable: part.runStatus.unverifiable, total: part.runStatus.total },
    physicalUB1Precision: { validCount, totalRecords: outlets.length, pct: outlets.length ? Math.round((validCount / outlets.length) * 1000) / 10 : 0 },
    outsideAreaCount: fidelity.summary.near_target + fidelity.summary.unrelated_location,
    unverifiableCount: fidelity.summary.unverifiable_location,
    distinctStorefrontCount: dupes.distinctIds,
    uniquePhysicalUB1RestaurantCount: uniqueValidCount,
    fieldCompleteness: fieldCompleteness(outlets),
    costPerUniqueValidRestaurant,
  };
}
