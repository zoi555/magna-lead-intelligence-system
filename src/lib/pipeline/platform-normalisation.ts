// Platform public-evidence normalisation — Sprint #49.
//
// Self-contained normalised record + helpers for the compliant public-evidence
// collectors (Just Eat live API, Deliveroo/Uber Eats evidence-only). This module
// deliberately does NOT import from src/lib/pipeline/types.ts: the platform
// collector layer keeps its own shape so it can evolve without touching the main
// pipeline types. The pipeline stage maps PlatformRecord into WorkingRecords
// elsewhere.
//
// Compliance note: nothing here fetches anti-bot-protected pages. This file is
// pure data-shaping and string helpers only.

// ---------- platform + status vocabularies ----------

/** Platforms we represent. Kept as a string union for clarity in exports. */
export type PlatformName = "just_eat" | "deliveroo" | "uber_eats";

/**
 * Collector method, layered per the sprint:
 *   1 official_endpoint  — a public JSON endpoint the platform's own site uses (Just Eat).
 *   2 public_page        — fetch a public HTML page (SKIPPED for Deliveroo/Uber: anti-bot).
 *   3 public_search_url  — generate a public search URL as manual-research evidence.
 *   4 imported_csv       — read manually-collected evidence from an import CSV.
 *   5 google_fallback    — noted here but handled by the Google Places source elsewhere.
 */
export type CollectorMethod =
  | "official_endpoint"
  | "public_page"
  | "public_search_url"
  | "imported_csv"
  | "google_fallback"
  | "none";

/** Outcome of a collector attempt for one platform + area. */
export type CollectorStatus =
  | "collected"
  | "partially_collected"
  | "not_found"
  | "blocked"
  | "rate_limited"
  | "captcha_or_login_required"
  | "disabled"
  | "imported"
  | "manual_review_required";

/** What kind of evidence backs this record. */
export type EvidenceType =
  | "public_api"
  | "public_search_url"
  | "public_page"
  | "imported_csv"
  | "none";

// ---------- normalised record ----------

/**
 * One normalised public-evidence record for a business on a delivery platform.
 * Any field that cannot legitimately be obtained is `null` (never guessed).
 * Array fields default to `[]` when empty.
 */
export interface PlatformRecord {
  platform: PlatformName;
  platform_business_id: string | null;
  platform_url: string | null;

  business_name: string | null;
  trading_name: string | null;
  brand_name: string | null;

  address_text: string | null;
  address_line_1: string | null;
  postcode: string | null;
  postcode_area: string | null;
  postcode_district: string | null;
  postcode_sector: string | null;

  latitude: number | null;
  longitude: number | null;

  phone_number: string | null;
  website: string | null;

  cuisine_categories: string[];
  primary_cuisine: string | null;
  tags: string[];
  halal_flag: boolean | null;
  vegetarian_flag: boolean | null;

  // Aggregate only — we never collect review text or reviewer names.
  rating: number | null;
  review_count: number | null;

  opening_status: string | null;
  delivery_available: boolean | null;
  collection_available: boolean | null;
  delivery_fee: number | null;
  minimum_order: number | null;
  estimated_delivery_time: string | null;

  serves_selected_area: boolean | null;
  source_search_area: string | null;

  evidence_url: string | null;
  evidence_type: EvidenceType;
  fetched_at: string;

  collector_method: CollectorMethod;
  collector_status: CollectorStatus;
  collector_warning: string | null;
  confidence_score: number | null;
}

/**
 * Loose input shape accepted by normalisePlatformRecord. Every field optional so
 * a collector can supply whatever it legitimately has. Unknown fields are ignored.
 */
export type RawPlatformInput = Partial<
  Omit<PlatformRecord, "platform" | "source_search_area">
>;

// ---------- postcode helpers ----------

/** Uppercase, trim, and collapse internal whitespace to a single space. */
export function normalisePostcode(postcode: string | null | undefined): string {
  return (postcode ?? "").toUpperCase().trim().replace(/\s+/g, " ");
}

/** Postcode with all spaces removed (compact form), e.g. "SW1A1AA". */
function compactPostcode(postcode: string | null | undefined): string {
  return normalisePostcode(postcode).replace(/\s+/g, "");
}

/**
 * Outward code (the part before the space in a full postcode), e.g.
 * "SW1A 1AA" → "SW1A". For inputs that are already an outcode (<= 4 chars, no
 * inward part) the input is returned as-is.
 */
export function outwardCode(postcode: string | null | undefined): string | null {
  const compact = compactPostcode(postcode);
  if (!compact) return null;
  // A full UK postcode's inward code is always the last three characters.
  if (compact.length <= 4) return compact; // already an outcode / district
  return compact.slice(0, compact.length - 3);
}

/** Inward code (last three characters of a full postcode), e.g. "1AA". */
export function inwardCode(postcode: string | null | undefined): string | null {
  const compact = compactPostcode(postcode);
  if (compact.length <= 4) return null; // no inward part present
  return compact.slice(compact.length - 3);
}

/** Postcode AREA — the leading letters of the outward code, e.g. "SW". */
export function postcodeArea(postcode: string | null | undefined): string | null {
  const out = outwardCode(postcode);
  if (!out) return null;
  const m = out.match(/^[A-Z]+/);
  return m ? m[0] : null;
}

/** Postcode DISTRICT — the full outward code, e.g. "SW1A". */
export function postcodeDistrict(postcode: string | null | undefined): string | null {
  return outwardCode(postcode);
}

/**
 * Postcode SECTOR — outward code + space + the first inward digit, e.g.
 * "SW1A 1". Returns null when there is no inward part to read the digit from.
 */
export function postcodeSector(postcode: string | null | undefined): string | null {
  const out = outwardCode(postcode);
  const inward = inwardCode(postcode);
  if (!out || !inward) return null;
  const firstInward = inward.charAt(0);
  if (!/[0-9]/.test(firstInward)) return null;
  return `${out} ${firstInward}`;
}

// ---------- number coercion ----------

/** Coerce to a finite number or null (empty/NaN → null). Zero is preserved. */
export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- normaliser ----------

/**
 * Build a complete, strict PlatformRecord from a loose collector input.
 * - Derives postcode_area / district / sector from `raw.postcode`.
 * - Fills every unsupplied field with null (or [] for arrays).
 * - Never invents data: absent facts stay null.
 */
export function normalisePlatformRecord(
  raw: RawPlatformInput,
  platform: PlatformName,
  searchArea: string
): PlatformRecord {
  const postcode = raw.postcode ? normalisePostcode(raw.postcode) : null;

  return {
    platform,
    platform_business_id: raw.platform_business_id ?? null,
    platform_url: raw.platform_url ?? null,

    business_name: raw.business_name ?? null,
    trading_name: raw.trading_name ?? null,
    brand_name: raw.brand_name ?? null,

    address_text: raw.address_text ?? null,
    address_line_1: raw.address_line_1 ?? null,
    postcode,
    postcode_area: postcode ? postcodeArea(postcode) : null,
    postcode_district: postcode ? postcodeDistrict(postcode) : null,
    postcode_sector: postcode ? postcodeSector(postcode) : null,

    latitude: toNumberOrNull(raw.latitude),
    longitude: toNumberOrNull(raw.longitude),

    phone_number: raw.phone_number ?? null,
    website: raw.website ?? null,

    cuisine_categories: Array.isArray(raw.cuisine_categories)
      ? raw.cuisine_categories.filter((c): c is string => Boolean(c))
      : [],
    primary_cuisine:
      raw.primary_cuisine ??
      (Array.isArray(raw.cuisine_categories) && raw.cuisine_categories.length > 0
        ? raw.cuisine_categories[0]
        : null),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => Boolean(t)) : [],
    halal_flag: raw.halal_flag ?? null,
    vegetarian_flag: raw.vegetarian_flag ?? null,

    rating: toNumberOrNull(raw.rating),
    review_count: toNumberOrNull(raw.review_count),

    opening_status: raw.opening_status ?? null,
    delivery_available: raw.delivery_available ?? null,
    collection_available: raw.collection_available ?? null,
    delivery_fee: toNumberOrNull(raw.delivery_fee),
    minimum_order: toNumberOrNull(raw.minimum_order),
    estimated_delivery_time: raw.estimated_delivery_time ?? null,

    serves_selected_area: raw.serves_selected_area ?? null,
    source_search_area: searchArea || null,

    evidence_url: raw.evidence_url ?? null,
    evidence_type: raw.evidence_type ?? "none",
    fetched_at: raw.fetched_at ?? new Date().toISOString(),

    collector_method: raw.collector_method ?? "none",
    collector_status: raw.collector_status ?? "manual_review_required",
    collector_warning: raw.collector_warning ?? null,
    confidence_score: raw.confidence_score ?? null,
  };
}

/** Column order used by the CSV exports (single source of truth). */
export const PLATFORM_RECORD_COLUMNS: (keyof PlatformRecord)[] = [
  "platform",
  "platform_business_id",
  "platform_url",
  "business_name",
  "trading_name",
  "brand_name",
  "address_text",
  "address_line_1",
  "postcode",
  "postcode_area",
  "postcode_district",
  "postcode_sector",
  "latitude",
  "longitude",
  "phone_number",
  "website",
  "cuisine_categories",
  "primary_cuisine",
  "tags",
  "halal_flag",
  "vegetarian_flag",
  "rating",
  "review_count",
  "opening_status",
  "delivery_available",
  "collection_available",
  "delivery_fee",
  "minimum_order",
  "estimated_delivery_time",
  "serves_selected_area",
  "source_search_area",
  "evidence_url",
  "evidence_type",
  "fetched_at",
  "collector_method",
  "collector_status",
  "collector_warning",
  "confidence_score",
];
