// UB1 discovery-actor benchmark scoring — provider-neutral, pure, no network.
//
// Scores a set of parsed SourceOutlet records (from ANY discovery actor) against the independently
// compiled reference set (`ub1-reference-set.ts`) and the existing geography-validation gate. This
// module contains NO Apify-specific logic and does not execute anything — it is pure analysis over
// already-parsed data, so it works identically for a live diagnostic result or a dry-run fixture.
//
// Distinct virtual storefronts are NEVER merged into one commercial entity here just because they
// share an address or phone number — each source_outlet_id is counted as its own storefront/UUID.
// A separate entity-type breakdown is reported alongside, but never collapses counts.
//
// AUDIT CORRECTION (2026-07-18, see docs/69 "Audit correction"): the first version of this module
// matched the reference set against ALL raw returned outlets, so an out-of-UB1 record sharing a
// reference restaurant's name earned recall credit it should not have. Recall is now computed ONLY
// against geography-VALID records (`part.valid`), never the raw outlet list.

import type { SourceOutlet } from "../../consolidation/types";
import { partitionByGeography, type GeographyRunContext } from "../../geography/provider-geography-gate";
import { summariseFidelity, type FidelityContext } from "../../geography/location-fidelity";
import { UB1_BENCHMARK_REFERENCE_SET, type UB1ReferenceListing, type ReferenceEntityType } from "./ub1-reference-set";

function normaliseName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The last non-empty path segment of a URL — where Uber Eats store UUIDs live. Pure string
 *  manipulation, no fetch. */
function urlTrailingSegment(url: string | null | undefined): string | null {
  const parts = (url ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

// Names shorter than this (after normalisation) are too generic/short to trust for an exact-name
// match on their own (e.g. a single common word) — they still require UUID/URL confirmation.
const MIN_NAME_LENGTH_FOR_MATCH = 6;

export type MatchMethod = "uuid" | "url_uuid" | "exact_name" | "alias" | "none";

export interface ReferenceMatch {
  reference: UB1ReferenceListing;
  matchedOutlet: SourceOutlet | null;
  matchMethod: MatchMethod;
}

/**
 * Match each reference-set listing against a supplied outlet list, in strict preference order:
 *   1. exact Uber UUID (source_outlet_id === reference.uber_uuid)
 *   2. canonical Uber URL, or a UUID recovered from the URL's trailing path segment
 *   3. conservative normalised EXACT name match (never containment/substring)
 *   4. a bounded exact-match alias lookup (reference.aliases — an explicit list, never fuzzy)
 * A listing with no plausible match is honestly reported as `matchMethod: "none"`.
 *
 * This function does NOT filter by geography — callers that care about geography-gated recall
 * (i.e. `scoreUB1Benchmark`) must pass only geography-valid outlets. Passing the raw, ungated
 * outlet list is intentionally still possible (and tested) so callers can demonstrate exactly why
 * gating matters — a same-name restaurant outside the target district still "matches" here, and
 * must be excluded further up the pipeline, not by weakening the name matcher.
 */
export function matchReferenceSet(outlets: SourceOutlet[], referenceSet: UB1ReferenceListing[] = UB1_BENCHMARK_REFERENCE_SET): ReferenceMatch[] {
  return referenceSet.map((reference) => {
    // 1. exact UUID.
    if (reference.uber_uuid) {
      const byUuid = outlets.find((o) => o.source_outlet_id === reference.uber_uuid);
      if (byUuid) return { reference, matchedOutlet: byUuid, matchMethod: "uuid" as const };
    }
    // 2. canonical URL, or a UUID recovered from the URL's trailing segment.
    if (reference.uber_url) {
      const refUrlUuid = urlTrailingSegment(reference.uber_url);
      const byUrl = outlets.find((o) => {
        if (o.source_url && o.source_url === reference.uber_url) return true;
        const outletUrlUuid = urlTrailingSegment(o.source_url);
        return !!refUrlUuid && !!outletUrlUuid && outletUrlUuid === refUrlUuid;
      });
      if (byUrl) return { reference, matchedOutlet: byUrl, matchMethod: "url_uuid" as const };
    }
    // 3. conservative normalised EXACT name match — no containment, no substring.
    const refName = normaliseName(reference.name);
    if (refName.length >= MIN_NAME_LENGTH_FOR_MATCH) {
      const byExactName = outlets.find((o) => normaliseName(o.name) === refName);
      if (byExactName) return { reference, matchedOutlet: byExactName, matchMethod: "exact_name" as const };
    }
    // 4. bounded alias match — ONLY against explicitly declared aliases, never free substring matching.
    if (reference.aliases?.length) {
      const byAlias = outlets.find((o) => {
        const n = normaliseName(o.name);
        return reference.aliases!.some((a) => {
          const na = normaliseName(a);
          return na.length >= MIN_NAME_LENGTH_FOR_MATCH && na === n;
        });
      });
      if (byAlias) return { reference, matchedOutlet: byAlias, matchMethod: "alias" as const };
    }
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

export interface StorefrontEntityBreakdown {
  uniqueValidUB1StorefrontCount: number;
  /** Distinct valid storefronts whose entity type is known from a matched reference-set listing,
   *  or (physical/virtual heuristic only) inferred from sharing an identical non-null
   *  address+phone with at least one other distinct valid storefront — the same shared-kitchen
   *  signal documented in docs/68 (Loaded Burgers/Wings 100/Tasty Tenders at one UB1 address).
   *  This is a TAG, never a merge: each storefront keeps its own row/UUID/count. */
  knownPhysicalLocations: number;
  knownVirtualStorefronts: number;
  chainBranches: number;
  unknownEntityType: number;
}

function classifyStorefrontEntities(validOutlets: SourceOutlet[], referenceMatches: ReferenceMatch[]): StorefrontEntityBreakdown {
  const byId = new Map<string, SourceOutlet>();
  for (const o of validOutlets) if (!byId.has(o.source_outlet_id)) byId.set(o.source_outlet_id, o);
  const distinctOutlets = [...byId.values()];

  const knownTypeById = new Map<string, ReferenceEntityType>();
  for (const m of referenceMatches) {
    if (m.matchedOutlet) knownTypeById.set(m.matchedOutlet.source_outlet_id, m.reference.entity_type);
  }

  // Heuristic (evidence-based tag, NOT a merge): distinct storefronts sharing an identical
  // non-null address+phone pair with at least one other distinct storefront are flagged as a
  // shared-kitchen / virtual-brand cluster.
  const addressPhoneKey = (o: SourceOutlet): string | null => {
    const addr = (o.address ?? "").trim().toLowerCase();
    const phone = (o.phone ?? "").trim();
    if (!addr || !phone) return null;
    return `${addr}|${phone}`;
  };
  const groups = new Map<string, string[]>();
  for (const o of distinctOutlets) {
    const key = addressPhoneKey(o);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(o.source_outlet_id);
    groups.set(key, arr);
  }
  const sharedKitchenIds = new Set<string>();
  for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) sharedKitchenIds.add(id);

  let knownPhysicalLocations = 0, knownVirtualStorefronts = 0, chainBranches = 0, unknownEntityType = 0;
  for (const o of distinctOutlets) {
    const knownType = knownTypeById.get(o.source_outlet_id);
    if (knownType === "physical_restaurant") { knownPhysicalLocations++; continue; }
    if (knownType === "virtual_brand") { knownVirtualStorefronts++; continue; }
    if (knownType === "chain_branch") { chainBranches++; continue; }
    if (sharedKitchenIds.has(o.source_outlet_id)) { knownVirtualStorefronts++; continue; }
    unknownEntityType++;
  }
  return { uniqueValidUB1StorefrontCount: distinctOutlets.length, knownPhysicalLocations, knownVirtualStorefronts, chainBranches, unknownEntityType };
}

export interface RecallMetric { matched: number; total: number; pct: number }

export interface UB1BenchmarkScore {
  actorLabel: string;
  totalRecords: number;
  distinctRecords: number;
  duplicates: DuplicateReport;
  // Recall — computed ONLY against geography-valid records (part.valid), never raw outlets.
  referenceMatches: ReferenceMatch[];
  /** Recall against the strongest evidence tier only (verified_active, optionally active_presumed
   *  if the caller explicitly opts in). This is the metric to treat as pass/fail-grade evidence. */
  verifiedActiveRecall: RecallMetric;
  /** Informational coverage across the FULL reference set regardless of status tier — useful
   *  context, but must NOT be used as hard pass/fail evidence on its own (some entries are
   *  unconfirmed/inactive/unknown). */
  candidateReferenceCoverage: RecallMetric;
  // Business geography (the existing gate) — precision. Raw totals kept separate from recall.
  geography: { valid: number; outOfScope: number; unverifiable: number; total: number };
  physicalUB1Precision: { validCount: number; totalRecords: number; pct: number };
  outsideAreaCount: number;
  unverifiableCount: number;
  // Distinct storefronts (renamed from the misleading "uniquePhysicalUB1RestaurantCount" — a
  // distinct source_outlet_id is a storefront, not a confirmed physical kitchen) plus an honest
  // entity-type breakdown where evidence supports one.
  distinctStorefrontCount: number;
  uniqueValidUB1StorefrontCount: number;
  storefrontEntityBreakdown: StorefrontEntityBreakdown;
  // Field completeness.
  fieldCompleteness: FieldCompleteness[];
  // Cost — divides by the deduplicated valid-storefront count, never the raw valid-record count.
  costPerUniqueValidStorefront: number | null;
}

export interface ScoreUB1BenchmarkInput {
  actorLabel: string;
  outlets: SourceOutlet[];
  geoCtx?: GeographyRunContext;
  fidelityCtx?: FidelityContext;
  referenceSet?: UB1ReferenceListing[];
  actualCostUsd?: number | null;
  /** Explicit opt-in to also count `active_presumed` reference listings in verifiedActiveRecall's
   *  denominator/numerator. Defaults to false — verifiedActiveRecall is verified_active-only unless
   *  a caller deliberately accepts the weaker evidence tier. */
  includeActivePresumedInVerifiedRecall?: boolean;
}

const DEFAULT_GEO_CTX: GeographyRunContext = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };
const DEFAULT_FIDELITY_CTX: FidelityContext = { targetDistrict: "UB1" };

function recallMetric(referenceMatches: ReferenceMatch[], predicate: (m: ReferenceMatch) => boolean): RecallMetric {
  const scoped = referenceMatches.filter(predicate);
  const matched = scoped.filter((m) => m.matchedOutlet !== null).length;
  const total = scoped.length;
  return { matched, total, pct: total ? Math.round((matched / total) * 1000) / 10 : 0 };
}

/** Pure scoring — no network, no DB, no Apify. Works on a fixture set exactly as it would on a
 *  real diagnostic's parsed outlets. */
export function scoreUB1Benchmark(input: ScoreUB1BenchmarkInput): UB1BenchmarkScore {
  const { outlets } = input;
  const geoCtx = input.geoCtx ?? DEFAULT_GEO_CTX;
  const fidelityCtx = input.fidelityCtx ?? DEFAULT_FIDELITY_CTX;
  const referenceSet = input.referenceSet ?? UB1_BENCHMARK_REFERENCE_SET;
  const acceptActivePresumed = input.includeActivePresumedInVerifiedRecall ?? false;

  const part = partitionByGeography(outlets, geoCtx);
  const fidelity = summariseFidelity(outlets, fidelityCtx);
  const dupes = duplicateReport(outlets);

  // AUDIT-CORRECTED: match against geography-VALID records only — never the raw outlet list — so
  // an out-of-UB1 same-name record can never earn recall credit.
  const referenceMatches = matchReferenceSet(part.valid, referenceSet);

  const verifiedActiveRecall = recallMetric(referenceMatches, (m) =>
    m.reference.status === "verified_active" || (acceptActivePresumed && m.reference.status === "active_presumed"));
  const candidateReferenceCoverage = recallMetric(referenceMatches, () => true);

  // Raw (per-record, duplicates included) valid count — for precision, which is about what
  // fraction of RETURNED RECORDS are correctly located.
  const validCount = part.valid.length;
  const storefrontEntityBreakdown = classifyStorefrontEntities(part.valid, referenceMatches);
  const uniqueValidUB1StorefrontCount = storefrontEntityBreakdown.uniqueValidUB1StorefrontCount;
  const costPerUniqueValidStorefront = input.actualCostUsd != null && uniqueValidUB1StorefrontCount > 0
    ? Math.round((input.actualCostUsd / uniqueValidUB1StorefrontCount) * 10000) / 10000
    : null;

  return {
    actorLabel: input.actorLabel,
    totalRecords: outlets.length,
    distinctRecords: dupes.distinctIds,
    duplicates: dupes,
    referenceMatches,
    verifiedActiveRecall,
    candidateReferenceCoverage,
    geography: { valid: part.runStatus.valid, outOfScope: part.runStatus.outOfScope, unverifiable: part.runStatus.unverifiable, total: part.runStatus.total },
    physicalUB1Precision: { validCount, totalRecords: outlets.length, pct: outlets.length ? Math.round((validCount / outlets.length) * 1000) / 10 : 0 },
    outsideAreaCount: fidelity.summary.near_target + fidelity.summary.unrelated_location,
    unverifiableCount: fidelity.summary.unverifiable_location,
    distinctStorefrontCount: dupes.distinctIds,
    uniqueValidUB1StorefrontCount,
    storefrontEntityBreakdown,
    fieldCompleteness: fieldCompleteness(outlets),
    costPerUniqueValidStorefront,
  };
}
