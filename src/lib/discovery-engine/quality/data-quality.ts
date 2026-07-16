// Data-quality report for a Just Eat execution. Percentages are fractions (0..1) so
// the UI can format them. Coverage is measured over UNIQUE outlets; rates are over
// observations/queries. Fields Just Eat does not supply (phone, menu) report honestly
// as 0 — the report is what decides whether Just Eat alone gives sufficient coverage.

import type { ParsedOutlet, QualityReport } from "../types";

const FULL_POSTCODE_RE = /\d[A-Za-z]{2}$/;   // has an inward code (e.g. "… 1AA")

export interface QualityInput {
  outlets: ParsedOutlet[];
  totalObservations: number;
  duplicateObservations: number;
  parseWarnings: number;
  plannedQueries: number;
  completedQueries: number;
  failedQueries: number;
}

function ratio(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 10000) / 10000 : 0; }

export function computeQualityReport(input: QualityInput): QualityReport {
  const o = input.outlets;
  const n = o.length;
  const has = (pred: (x: ParsedOutlet) => boolean) => ratio(o.filter(pred).length, n);

  const coverage = {
    pct_phone: has((x) => !!x.telephone_e164),                       // 0 — not supplied by listing
    pct_full_postcode: has((x) => !!x.postcode && FULL_POSTCODE_RE.test(x.postcode)),
    pct_coordinates: has((x) => x.latitude != null && x.longitude != null),
    pct_review_score: has((x) => x.rating_average != null),
    pct_review_count: has((x) => x.rating_count != null),
    pct_cuisine: has((x) => x.cuisines.length > 0),
    pct_delivery: has((x) => x.is_delivery === true),
    pct_collection: has((x) => x.is_collection === true),
    pct_opening_hours: has((x) => Array.isArray(x.opening_times) && x.opening_times.length > 0),
    pct_menu_data: has(() => false),                                 // 0 — not acquired in Stage 1
    pct_halal_evidence: has((x) => x.halal_evidence.length > 0),
  };

  return {
    total_raw_observations: input.totalObservations,
    unique_outlets: n,
    duplicate_observations: input.duplicateObservations,
    duplicate_rate: ratio(input.duplicateObservations, input.totalObservations),
    ...coverage,
    parse_warning_rate: ratio(input.parseWarnings, input.totalObservations),
    query_failure_rate: ratio(input.failedQueries, input.plannedQueries),
    field_availability_by_response_type: { search: { ...coverage } },
    planned_queries: input.plannedQueries,
    completed_queries: input.completedQueries,
    failed_queries: input.failedQueries,
  };
}
