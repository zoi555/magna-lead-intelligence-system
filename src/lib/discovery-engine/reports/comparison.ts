// Multi-source comparison + data-completeness report (Part 9). Per-source field coverage,
// cross-source overlap, and an honest per-candidate completeness status. Fields that no
// source supplies (phone/menu/opening hours) are reported as needing enrichment — never
// falsely marked complete.

import type { SourceOutlet, SourceName, ConsolidatedCandidate } from "../consolidation/types";

const FULL_PC = /\d[A-Z]{2}$/;
function frac(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 10000) / 10000 : 0; }

export interface SourceReport {
  source: SourceName;
  outlets: number;
  coverage: Record<string, number>;    // 0..1 per field
}

export type CandidateCompleteness = "complete" | "enrichment_required" | "conflicting" | "unavailable_after_verified_search" | "manual_review";

export interface ComparisonReport {
  sources: SourceReport[];
  totalCandidates: number;
  inMultipleSources: number;
  uniqueToSource: Record<string, number>;
  matchStatusCounts: Record<string, number>;
  completenessCounts: Record<CandidateCompleteness, number>;
  fieldsUnavailableAllSources: string[];   // honestly confirmed unavailable
}

function sourceReport(source: SourceName, outlets: SourceOutlet[]): SourceReport {
  const n = outlets.length;
  const has = (p: (o: SourceOutlet) => boolean) => frac(outlets.filter(p).length, n);
  return {
    source, outlets: n,
    coverage: {
      full_postcode: has((o) => !!o.postcode && FULL_PC.test(o.postcode.replace(/\s+/g, ""))),
      coordinates: has((o) => o.latitude != null && o.longitude != null),
      review_score: has((o) => o.rating != null),
      review_count: has((o) => o.review_count != null),
      cuisine: has((o) => o.cuisines.length > 0),
      delivery: has((o) => o.is_delivery === true),
      collection: has((o) => o.is_collection === true),
      halal_evidence: has((o) => o.halal_flag === true),
      website: has((o) => !!o.source_url),
      promotion: has((o) => o.is_sponsored === true),
      phone: has((o) => !!o.phone),        // typically 0 — not supplied
      menu: has(() => false),              // 0 — not collected from any source
      opening_hours: has(() => false),     // 0 — not supplied
    },
  };
}

export function candidateCompleteness(c: ConsolidatedCandidate): CandidateCompleteness {
  if (c.conflicts.length || c.matchStatus === "source_conflict") return "conflicting";
  if (c.matchStatus === "ambiguous_manual") return "manual_review";
  const hasPhone = c.sources.some((o) => !!o.phone);
  const hasCore = !!c.postcode && c.latitude != null && c.sources.some((o) => o.rating != null) && c.sources.some((o) => o.cuisines.length);
  if (hasCore && hasPhone) return "complete";
  return "enrichment_required";   // phone/menu/hours pending lawful enrichment — honest
}

export function buildComparisonReport(outletsBySource: Record<SourceName, SourceOutlet[]>, candidates: ConsolidatedCandidate[]): ComparisonReport {
  const sourceNames = Object.keys(outletsBySource) as SourceName[];
  const sources = sourceNames.map((sn) => sourceReport(sn, outletsBySource[sn] ?? []));

  const uniqueToSource: Record<string, number> = {};
  for (const sn of sourceNames) uniqueToSource[sn] = candidates.filter((c) => c.sourceNames.length === 1 && c.sourceNames[0] === sn).length;

  const matchStatusCounts: Record<string, number> = {};
  const completenessCounts = { complete: 0, enrichment_required: 0, conflicting: 0, unavailable_after_verified_search: 0, manual_review: 0 } as Record<CandidateCompleteness, number>;
  for (const c of candidates) {
    matchStatusCounts[c.matchStatus] = (matchStatusCounts[c.matchStatus] ?? 0) + 1;
    completenessCounts[candidateCompleteness(c)]++;
  }

  return {
    sources,
    totalCandidates: candidates.length,
    inMultipleSources: candidates.filter((c) => c.sourceNames.length > 1).length,
    uniqueToSource,
    matchStatusCounts,
    completenessCounts,
    fieldsUnavailableAllSources: ["phone", "opening_hours", "menu"],
  };
}
