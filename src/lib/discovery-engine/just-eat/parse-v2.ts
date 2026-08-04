// Just Eat ENRICHED search-response parser (ISS-0035 recovery, 2026-08-04).
//
// Maps ONE raw restaurant object from the REPLACEMENT endpoint
// (/discovery/uk/restaurants/enriched/bypostcode/{queryPoint}) to the SAME normalised
// ParsedOutlet/ParsedRecord shape the legacy parser (parse.ts) produces, so every downstream
// consumer (worker/execute.ts, consolidation, exports) is unchanged. The legacy parser is
// kept undeleted for its own retired endpoint — this is a SEPARATE, versioned parser for a
// SEPARATE, versioned endpoint, never a silent in-place substitution.
//
// Genuine schema differences from the legacy payload (documented, not silently guessed):
//   - No brand_name/is_brand equivalent at all (0/170 records had one in the CM1 verification
//     sample) — left honestly null/false, never inferred from the trading name.
//   - No single top-level "is open" flag — derived from isOpenNowForDelivery/Collection
//     (documented as derived provenance, exactly like the legacy service_models field was).
//   - No Description field — halal evidence can only come from a "Halal" cuisine tag, never a
//     description scan (that source no longer exists to scan).
//   - Rating is a single fractional starRating (verified: quarter-point increments, e.g. 4.25,
//     not merely a rounded bucket) — reused for both rating_average and rating_stars, since
//     only one figure is now provided; never fabricated into two different numbers.
//   - No offer_percent, is_sponsored, opening_times array, offline_reason equivalents — left
//     honestly null/empty; richer new fields (availability, driveDistanceMeters, isPremier,
//     openingTimeLocal) captured in source_extra instead of being discarded.

import { outwardCode, classifyTerritory, type JustEatTerritoryClass } from "@/lib/sources/just-eat";
import { JE_ENRICHED_PARSER_VERSION, NORMALISATION_VERSION } from "../version";
import type { ParsedOutlet, ParsedProvenance, ParsedRating, ParsedRecord, HalalEvidenceItem } from "./parse";
export type { ParsedRecord } from "./parse";

function s(v: unknown): string | null { const t = (v ?? "").toString().trim(); return t || null; }
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function intOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function boolOrNull(v: unknown): boolean | null { return typeof v === "boolean" ? v : null; }

const HALAL_RE = /\bhalal\b/i;

const SOURCE_EXTRA_KEYS_ENRICHED = [
  "driveDistanceMeters", "openingTimeLocal", "deliveryOpeningTimeLocal", "isPremier",
  "isTemporaryBoost", "isNew", "availability",
] as const;
function buildSourceExtra(raw: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SOURCE_EXTRA_KEYS_ENRICHED) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  }
  return out;
}

/** True if a raw enriched restaurant object is a Just Eat test record (never persisted). */
export function isTestRestaurantEnriched(raw: any): boolean { return Boolean(raw?.isTestRestaurant); }

export function parseEnrichedSearchRestaurant(raw: any, queriedOutcode: string, pilotOutcodes: string[]): ParsedRecord {
  const warnings: string[] = [];
  const prov: ParsedProvenance[] = [];
  const addr = raw?.address ?? {};
  const rating = raw?.rating ?? {};

  const rawPostcode = s(addr?.postalCode);
  // the enriched endpoint already returns "CM1 2LQ"-style spaced postcodes — trust, don't reformat blindly
  const postcode = rawPostcode ? rawPostcode.toUpperCase() : null;
  const outcode = postcode ? outwardCode(postcode.replace(/\s+/g, "")) : "";
  const { territoryClass, territoryConfidence } = classifyTerritory(outcode, queriedOutcode, pilotOutcodes);

  const cuisines: string[] = Array.isArray(raw?.cuisines)
    ? raw.cuisines.map((c: any) => s(c?.name)).filter(Boolean) as string[]
    : [];
  // no top-cuisine marker in this schema (genuine gap vs legacy CuisineTypes[].IsTopCuisine)
  const primaryCuisine = cuisines[0] ?? null;

  const isDelivery = boolOrNull(raw?.isDelivery);
  const isCollection = boolOrNull(raw?.isCollection);
  const serviceModels = [isDelivery ? "delivery" : null, isCollection ? "collection" : null].filter(Boolean) as string[];

  const openForDelivery = boolOrNull(raw?.isOpenNowForDelivery);
  const openForCollection = boolOrNull(raw?.isOpenNowForCollection);
  // derived: no single top-level "open now" flag in this schema (documented gap above)
  const isOpenNow = openForDelivery === null && openForCollection === null ? null : Boolean(openForDelivery || openForCollection);

  // halal — conservative, evidence only; only a cuisine/tag match is possible on this schema
  // (no IsHalal flag, no Description field to scan — both retired with the old endpoint)
  const halalEvidence: HalalEvidenceItem[] = [];
  const tagsArr: string[] = Array.isArray(raw?.tags) ? raw.tags.map(String) : [];
  const tagHit = [...tagsArr, ...cuisines].find((x) => HALAL_RE.test(String(x)));
  if (tagHit) halalEvidence.push({ type: "cuisine_or_tag", path: "tags/cuisines", excerpt: clip(String(tagHit)), confidence: 0.5 });
  const halalConfidence = halalEvidence.reduce((m, e) => Math.max(m, e.confidence), 0);

  const starRating = numOrNull(rating?.starRating);
  const deliveryCost = numOrNull(raw?.deliveryCost);

  const outlet: ParsedOutlet = {
    je_outlet_id: String(raw?.id ?? raw?.uniqueName ?? ""),
    unique_name: s(raw?.uniqueName),
    trading_name: s(raw?.name) ?? "",
    brand_name: null,          // genuine gap — never inferred from trading_name
    is_brand: false,           // genuine gap — honest default, never guessed
    merchant_type: null,
    address_first_line: s(addr?.firstLine),
    city: s(addr?.city),
    postcode,
    outcode: outcode || null,
    // GeoJSON coordinates are [lng, lat] — verified against metaData.location for known towns
    latitude: numOrNull(addr?.location?.coordinates?.[1]),
    longitude: numOrNull(addr?.location?.coordinates?.[0]),
    delivery_zipcode: null,    // genuine gap
    telephone_raw: null, telephone_e164: null, telephone_national: null,
    telephone_extension: null, telephone_valid: null, telephone_invalid_reason: null,
    rating_average: starRating,   // only one rating figure is provided now (see file header)
    rating_count: intOrNull(rating?.count),
    rating_stars: starRating,
    cuisines,
    primary_cuisine: primaryCuisine,
    service_models: serviceModels,
    tags: tagsArr,
    badges: [],                // genuine gap — no equivalent field in this schema
    is_open_now: isOpenNow,
    open_for_delivery: openForDelivery,
    open_for_collection: openForCollection,
    open_for_preorder: boolOrNull(raw?.isOpenNowForPreorder),
    is_delivery: isDelivery,
    is_collection: isCollection,
    is_temporarily_offline: Boolean(raw?.isTemporarilyOffline),
    offline_reason: null,      // genuine gap
    delivery_cost: deliveryCost,
    is_free_delivery: deliveryCost == null ? null : deliveryCost === 0,   // derived, not a direct flag
    minimum_delivery_value: numOrNull(raw?.minimumDeliveryValue),
    delivery_eta_lower: intOrNull(raw?.deliveryEtaMinutes?.rangeLower),
    delivery_eta_upper: intOrNull(raw?.deliveryEtaMinutes?.rangeUpper),
    opening_times: [],         // genuine gap — no OpeningTimes array in this schema
    logo_url: s(raw?.logoUrl),
    deals: Array.isArray(raw?.deals) ? raw.deals : [],
    offers: [],                // genuine gap — deals[] covers this schema's promotions
    offer_percent: null,       // genuine gap — not worth regex-parsing out of deal descriptions
    is_sponsored: null,        // genuine gap
    default_display_rank: intOrNull(raw?.defaultDisplayRank),
    halal_flag: false,         // genuine gap — no IsHalal-equivalent flag; evidence-only below
    halal_evidence: halalEvidence,
    halal_confidence: halalConfidence,
    territory_class: territoryClass,
    territory_confidence: territoryConfidence,
    source_url: raw?.uniqueName ? `https://www.just-eat.co.uk/restaurants-${raw.uniqueName}` : null,
    source_extra: buildSourceExtra(raw),
  };

  if (!outlet.je_outlet_id) warnings.push("missing id/uniqueName");
  if (!outlet.trading_name) warnings.push("missing name");
  if (!postcode) warnings.push("missing postcode");

  const P = (field_key: string, value: unknown, original_value: unknown, path: string | null, derived: boolean, confidence: number | null, rule: string) =>
    prov.push({ field_key, value, original_value, source_field_path: path, transform_rule: rule, transform_version: NORMALISATION_VERSION, is_derived: derived, confidence });
  P("name", outlet.trading_name, raw?.name, "name", false, 1, "trim");
  P("telephone", null, null, null, false, null, "unavailable-from-source");
  P("address", outlet.address_first_line, addr?.firstLine, "address.firstLine", false, 0.9, "trim");
  P("postcode", outlet.postcode, rawPostcode, "address.postalCode", false, postcode ? 0.95 : 0, "uppercase (already spaced by source)");
  P("coordinates", outlet.latitude != null && outlet.longitude != null ? [outlet.latitude, outlet.longitude] : null, addr?.location?.coordinates ?? null, "address.location.coordinates", false, outlet.latitude != null ? 0.9 : 0, "geojson[lng,lat]->[lat,lng]");
  P("review_score", outlet.rating_average, rating?.starRating, "rating.starRating", false, outlet.rating_average != null ? 0.9 : 0, "number|null (single figure, no separate average)");
  P("review_count", outlet.rating_count, rating?.count, "rating.count", false, outlet.rating_count != null ? 0.9 : 0, "int|null");
  P("cuisine", outlet.cuisines, raw?.cuisines, "cuisines[].name", false, cuisines.length ? 0.9 : 0, "names[]");
  P("service_models", outlet.service_models, { isDelivery: raw?.isDelivery, isCollection: raw?.isCollection }, "isDelivery/isCollection", true, 0.9, "from-flags");
  P("opening_status", { is_open_now: outlet.is_open_now, offline: outlet.is_temporarily_offline }, { isOpenNowForDelivery: raw?.isOpenNowForDelivery, isOpenNowForCollection: raw?.isOpenNowForCollection }, "isOpenNowForDelivery/isOpenNowForCollection", true, isOpenNow != null ? 0.8 : 0, "derived: either channel open (no single flag in this schema)");
  P("halal_evidence", outlet.halal_evidence, { tags: raw?.tags, cuisines: raw?.cuisines }, "tags/cuisines", true, halalConfidence, "conservative-evidence (cuisine/tag match only — no flag/description field in this schema)");
  P("brand", null, null, null, false, 0, "unavailable-from-source (schema gap)");
  P("delivery_economics", { cost: outlet.delivery_cost, minimum: outlet.minimum_delivery_value, eta: [outlet.delivery_eta_lower, outlet.delivery_eta_upper] }, { deliveryCost: raw?.deliveryCost, minimumDeliveryValue: raw?.minimumDeliveryValue }, "deliveryCost/minimumDeliveryValue/deliveryEtaMinutes", false, 0.9, "numbers");
  P("promotions", { deals: outlet.deals.length }, { deals: raw?.deals }, "deals", false, 0.8, "array");
  P("media", outlet.logo_url, raw?.logoUrl, "logoUrl", false, outlet.logo_url ? 0.8 : 0, "url");
  P("ranking", { default_rank: outlet.default_display_rank }, { defaultDisplayRank: raw?.defaultDisplayRank }, "defaultDisplayRank", false, 0.8, "int");
  P("phone", null, null, null, false, null, "unavailable-from-source");
  P("opening_hours", null, null, null, false, null, "unavailable-from-source (schema gap — see openingTimeLocal in source_extra)");
  P("menu", null, null, null, false, null, "unavailable-from-source");

  const parsedRating: ParsedRating = {
    score: outlet.rating_average,
    max_scale: 5,
    review_count: outlet.rating_count,
    source_label: outlet.rating_average != null ? `${outlet.rating_average} (${outlet.rating_count ?? 0} ratings)` : null,
  };

  return { raw, outlet, provenance: prov, rating: parsedRating, warnings };
}

/** Shape guard for the enriched endpoint's top-level response — used by the adapter to fail
 *  closed on an unrecognised schema BEFORE attempting to read `.restaurants`. */
export function isRecognisedEnrichedResponse(rawResponse: unknown): rawResponse is { metaData: unknown; restaurants: unknown[] } {
  if (!rawResponse || typeof rawResponse !== "object") return false;
  const r = rawResponse as Record<string, unknown>;
  return "metaData" in r && Array.isArray(r.restaurants);
}

/** Parse a full enriched search response, dropping JE test restaurants. Caller must have
 *  already confirmed isRecognisedEnrichedResponse() — this does not re-check the shape. */
export function parseEnrichedSearchResponse(rawResponse: any, queriedOutcode: string, pilotOutcodes: string[]): { records: ParsedRecord[]; restaurantCount: number; recognisedByProvider: boolean } {
  const list: any[] = Array.isArray(rawResponse?.restaurants) ? rawResponse.restaurants : [];
  const records = list.filter((r) => !isTestRestaurantEnriched(r)).map((r) => parseEnrichedSearchRestaurant(r, queriedOutcode, pilotOutcodes));
  // the provider returns HTTP 200 + canonicalName:null/location:null for an unrecognised
  // postcode — a legitimate empty result, not an error, but worth recording honestly
  const recognisedByProvider = rawResponse?.metaData?.canonicalName != null || rawResponse?.metaData?.location != null;
  return { records, restaurantCount: list.length, recognisedByProvider };
}

function clip(text: string, max = 240): string { return text.length > max ? text.slice(0, max) + "…" : text; }

export { JE_ENRICHED_PARSER_VERSION };
