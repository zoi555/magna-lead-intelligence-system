/**
 * Data-completeness scoring module.
 *
 * Self-contained: intentionally does NOT import from ../types or anywhere else,
 * so it can be reused/tested in isolation. Compiles under `strict` TypeScript.
 *
 * The idea: given whatever we currently know about a lead, produce a single
 * 0–100 "how sales-ready is this record" score, a plain-English band, the list
 * of fields we are still missing, and a hint at which data source would fill
 * each gap. An aggregate helper rolls many records up into a dataset report.
 */

/** Everything we might know about a single lead before it is enriched. */
export interface CompletenessInput {
  businessName?: string | null;
  tradingAddress?: string | null;
  postcode?: string | null;
  phone?: string | null;
  website?: string | null;
  platformUrl?: string | null;
  /** True if the lead has been matched against an FSA (Food Standards Agency) record. */
  fsaRecord?: boolean;
  /** True if the lead has been matched to a Google Place. */
  googlePlace?: boolean;
  /** True if we hold a rating and/or review count. */
  ratingOrReviewCount?: boolean;
  /** True if the lead has been checked against the existing-customer exclusion list. */
  customerExclusionChecked?: boolean;
  /** True if the lead has been checked against Companies House. */
  companiesHouseChecked?: boolean;
  /** A URL evidencing where the lead came from. */
  sourceEvidenceUrl?: string | null;
  /** True if we hold latitude/longitude coordinates. */
  coordinates?: boolean;
}

/** The result of scoring a single lead. */
export interface CompletenessResult {
  data_completeness_score: number;
  completeness_band: "ready" | "usable" | "weak" | "poor";
  missing_fields: string[];
  enrichment_needed: string[];
  present_count: number;
  weighted_total: number;
}

/**
 * Field weights. These sum to 100, so a fully-populated record scores exactly
 * 100. Weights reflect how much each field matters to a salesperson picking up
 * the lead: identity and contact details are worth most, "nice to have"
 * signals (coordinates, Companies House flag) least.
 */
const FIELD_WEIGHTS = {
  businessName: 12,
  tradingAddress: 12,
  postcode: 10,
  phone: 12,
  website: 8,
  platformUrl: 10,
  fsaRecord: 8,
  googlePlace: 6,
  ratingOrReviewCount: 6,
  customerExclusionChecked: 6,
  companiesHouseChecked: 4,
  sourceEvidenceUrl: 4,
  coordinates: 2,
} as const;

type FieldKey = keyof typeof FIELD_WEIGHTS;

/**
 * For each field, the source that would fill it if it is missing. Used to build
 * the `enrichment_needed` list so a report can say "turn on Google Places to
 * recover phone and website".
 */
const ENRICHMENT_SOURCE: Record<FieldKey, string> = {
  businessName: "platform_collector_or_fsa",
  tradingAddress: "fsa_or_google_places",
  postcode: "fsa_or_google_places",
  phone: "google_places_or_platform",
  website: "google_places",
  platformUrl: "platform_collector",
  fsaRecord: "fsa",
  googlePlace: "google_places",
  ratingOrReviewCount: "google_places",
  customerExclusionChecked: "customer_exclusion_list",
  companiesHouseChecked: "companies_house",
  sourceEvidenceUrl: "source_collector",
  coordinates: "google_places_or_geocoder",
};

/** A non-empty, non-whitespace string counts as present. */
function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A boolean-style field counts as present only when explicitly true. */
function isTrue(value: boolean | undefined): boolean {
  return value === true;
}

/** Decide whether a given field is present on the input. */
function isPresent(inp: CompletenessInput, field: FieldKey): boolean {
  switch (field) {
    case "businessName":
      return hasText(inp.businessName);
    case "tradingAddress":
      return hasText(inp.tradingAddress);
    case "postcode":
      return hasText(inp.postcode);
    case "phone":
      return hasText(inp.phone);
    case "website":
      return hasText(inp.website);
    case "platformUrl":
      return hasText(inp.platformUrl);
    case "sourceEvidenceUrl":
      return hasText(inp.sourceEvidenceUrl);
    case "fsaRecord":
      return isTrue(inp.fsaRecord);
    case "googlePlace":
      return isTrue(inp.googlePlace);
    case "ratingOrReviewCount":
      return isTrue(inp.ratingOrReviewCount);
    case "customerExclusionChecked":
      return isTrue(inp.customerExclusionChecked);
    case "companiesHouseChecked":
      return isTrue(inp.companiesHouseChecked);
    case "coordinates":
      return isTrue(inp.coordinates);
    default: {
      // Exhaustiveness guard: if a new field is added to FIELD_WEIGHTS the
      // compiler will flag this line until the switch handles it.
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

/** Round to one decimal place to keep scores tidy. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Map a 0–100 score to a plain-English band. */
function bandFor(score: number): CompletenessResult["completeness_band"] {
  if (score >= 80) return "ready";
  if (score >= 60) return "usable";
  if (score >= 40) return "weak";
  return "poor";
}

/**
 * Score a single lead for data completeness.
 *
 * Adds up the weight of every field that is present, out of a possible 100.
 * Because the weights already sum to 100 the weighted total IS the score, but
 * we keep them as separate fields for readability in reports.
 */
export function scoreCompleteness(inp: CompletenessInput): CompletenessResult {
  const fields = Object.keys(FIELD_WEIGHTS) as FieldKey[];

  let weightedTotal = 0;
  let presentCount = 0;
  const missingFields: string[] = [];
  const enrichmentNeeded: string[] = [];

  for (const field of fields) {
    if (isPresent(inp, field)) {
      weightedTotal += FIELD_WEIGHTS[field];
      presentCount += 1;
    } else {
      missingFields.push(field);
      const source = ENRICHMENT_SOURCE[field];
      if (!enrichmentNeeded.includes(source)) {
        enrichmentNeeded.push(source);
      }
    }
  }

  const score = round1(weightedTotal);

  return {
    data_completeness_score: score,
    completeness_band: bandFor(score),
    missing_fields: missingFields,
    enrichment_needed: enrichmentNeeded,
    present_count: presentCount,
    weighted_total: round1(weightedTotal),
  };
}

/** Shape of the dataset-level aggregate report. */
export interface CompletenessAggregate {
  average: number;
  over80: number;
  band_60_79: number;
  below60: number;
  topMissingFields: { field: string; count: number }[];
}

/**
 * Roll a batch of per-lead results up into a dataset report: the average score,
 * how many records fall into each readiness band, and the most commonly missing
 * fields (so we know which source to enable to lift the whole dataset).
 */
export function aggregateCompleteness(
  results: CompletenessResult[]
): CompletenessAggregate {
  if (results.length === 0) {
    return {
      average: 0,
      over80: 0,
      band_60_79: 0,
      below60: 0,
      topMissingFields: [],
    };
  }

  let sum = 0;
  let over80 = 0;
  let band6079 = 0;
  let below60 = 0;
  const missingCounts = new Map<string, number>();

  for (const result of results) {
    sum += result.data_completeness_score;

    if (result.data_completeness_score >= 80) {
      over80 += 1;
    } else if (result.data_completeness_score >= 60) {
      band6079 += 1;
    } else {
      below60 += 1;
    }

    for (const field of result.missing_fields) {
      missingCounts.set(field, (missingCounts.get(field) ?? 0) + 1);
    }
  }

  const topMissingFields = Array.from(missingCounts.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));

  return {
    average: round1(sum / results.length),
    over80,
    band_60_79: band6079,
    below60,
    topMissingFields,
  };
}

/**
 * Lightweight self-test. NOT auto-run. Call `__selfTest()` from a script or a
 * REPL to sanity-check the scoring. Throws on the first failed assertion,
 * otherwise returns true.
 */
export function __selfTest(): boolean {
  const assert = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new Error(`__selfTest failed: ${message}`);
    }
  };

  // Fully-populated input should be "ready" (>= 80). In fact it should be 100.
  const full: CompletenessInput = {
    businessName: "The Corner Cafe",
    tradingAddress: "12 High Street, Leeds",
    postcode: "LS1 4DY",
    phone: "0113 496 0000",
    website: "https://thecornercafe.example",
    platformUrl: "https://just-eat.example/the-corner-cafe",
    fsaRecord: true,
    googlePlace: true,
    ratingOrReviewCount: true,
    customerExclusionChecked: true,
    companiesHouseChecked: true,
    sourceEvidenceUrl: "https://source.example/evidence/123",
    coordinates: true,
  };
  const fullResult = scoreCompleteness(full);
  assert(
    fullResult.data_completeness_score >= 80,
    `full input should score >= 80, got ${fullResult.data_completeness_score}`
  );
  assert(
    fullResult.completeness_band === "ready",
    `full input should be "ready", got "${fullResult.completeness_band}"`
  );
  assert(
    fullResult.missing_fields.length === 0,
    `full input should have no missing fields, got ${fullResult.missing_fields.length}`
  );

  // Almost-empty input should be "poor" (< 40).
  const almostEmpty: CompletenessInput = {
    businessName: "Mystery Takeaway",
  };
  const emptyResult = scoreCompleteness(almostEmpty);
  assert(
    emptyResult.data_completeness_score < 40,
    `almost-empty input should score < 40, got ${emptyResult.data_completeness_score}`
  );
  assert(
    emptyResult.completeness_band === "poor",
    `almost-empty input should be "poor", got "${emptyResult.completeness_band}"`
  );

  // Aggregate sanity check across the two records above.
  const agg = aggregateCompleteness([fullResult, emptyResult]);
  assert(agg.over80 === 1, `aggregate over80 should be 1, got ${agg.over80}`);
  assert(agg.below60 === 1, `aggregate below60 should be 1, got ${agg.below60}`);
  assert(
    agg.topMissingFields.length > 0,
    "aggregate should surface at least one missing field"
  );

  return true;
}
