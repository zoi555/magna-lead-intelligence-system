// Just Eat search-response parser.
//
// Maps ONE raw Just Eat restaurant object (from the bypostcode listing endpoint) to a
// normalised outlet payload + field provenance + a rating observation + halal evidence.
// Uses the verified field catalogue (docs/57). Reuses the lawful source module's
// outward-code and territory-classification helpers (no duplication).

import { outwardCode, classifyTerritory, type JustEatTerritoryClass } from "@/lib/sources/just-eat";
import { PARSER_VERSION, NORMALISATION_VERSION } from "../version";

export interface HalalEvidenceItem { type: "platform_flag" | "description" | "cuisine_or_tag"; path: string; excerpt: string; confidence: number }

/** Data fields the parser extracts (snake_case = je_outlets columns). tenant_id,
 *  observation linkage and lifecycle fields are added by the worker/repository. */
export interface ParsedOutlet {
  je_outlet_id: string;
  unique_name: string | null;
  trading_name: string;
  brand_name: string | null;
  is_brand: boolean;
  merchant_type: string | null;
  address_first_line: string | null;
  city: string | null;
  postcode: string | null;
  outcode: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_zipcode: string | null;
  telephone_raw: string | null;      // always null from the listing endpoint (honest)
  telephone_e164: string | null;
  telephone_national: string | null;
  telephone_extension: string | null;
  telephone_valid: boolean | null;
  telephone_invalid_reason: string | null;
  rating_average: number | null;
  rating_count: number | null;
  rating_stars: number | null;
  cuisines: string[];
  primary_cuisine: string | null;
  service_models: string[];
  tags: string[];
  badges: string[];
  is_open_now: boolean | null;
  open_for_delivery: boolean | null;
  open_for_collection: boolean | null;
  open_for_preorder: boolean | null;
  is_delivery: boolean | null;
  is_collection: boolean | null;
  is_temporarily_offline: boolean | null;
  offline_reason: string | null;
  delivery_cost: number | null;
  is_free_delivery: boolean | null;
  minimum_delivery_value: number | null;
  delivery_eta_lower: number | null;
  delivery_eta_upper: number | null;
  opening_times: unknown[];
  logo_url: string | null;
  deals: unknown[];
  offers: unknown[];
  offer_percent: number | null;
  is_sponsored: boolean | null;
  default_display_rank: number | null;
  halal_flag: boolean;
  halal_evidence: HalalEvidenceItem[];
  halal_confidence: number;
  territory_class: JustEatTerritoryClass;
  territory_confidence: number;
  source_url: string | null;
  source_extra: Record<string, unknown>;
}

export interface ParsedProvenance {
  field_key: string;
  value: unknown;
  original_value: unknown;
  source_field_path: string | null;
  transform_rule: string | null;
  transform_version: string;
  is_derived: boolean;
  confidence: number | null;
}

export interface ParsedRating { score: number | null; max_scale: number; review_count: number | null; source_label: string | null }

export interface ParsedRecord {
  raw: unknown;               // the source restaurant object (for immutable observation + hash)
  outlet: ParsedOutlet;
  provenance: ParsedProvenance[];
  rating: ParsedRating;
  warnings: string[];
}

// ---- helpers ----
function s(v: unknown): string | null { const t = (v ?? "").toString().trim(); return t || null; }
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; }
function intOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function boolOrNull(v: unknown): boolean | null { return typeof v === "boolean" ? v : null; }
function normPostcode(pc: string | null): string | null {
  if (!pc) return null;
  const up = pc.toUpperCase().replace(/\s+/g, "");
  if (up.length < 5) return up;
  return `${up.slice(0, up.length - 3)} ${up.slice(up.length - 3)}`;
}

const HALAL_RE = /\bhalal\b/i;

// Remaining USEFUL per-outlet fields captured into controlled source_extra JSONB (the ~40
// searchable fields are structured columns above). Only present/non-empty values are kept.
const SOURCE_EXTRA_KEYS = [
  "Description", "RatingStars", "IsPremier", "IsNew", "NewnessDate", "SponsoredPosition",
  "SecondDateRank", "SecondDateRanking", "DeliveryChargeBands", "DeliveryTime", "DeliveryTimeMinutes",
  "DeliveryWorkingTimeMinutes", "DeliveryStartTime", "DeliveryOpeningTimeLocal", "DriveDistance",
  "DriveInfoCalculated", "ServiceableAreas", "CuisineTypes", "CollectionMenuId", "DeliveryMenuId",
  "LastUpdated", "Score", "ScoreMetaData", "ShowSmiley", "SmileyResult", "SmileyElite", "SmileyUrl",
  "HygieneRating", "IsCloseBy", "IsTemporaryBoost", "SendsOnItsWayNotifications", "IsFreeDelivery",
];
function buildSourceExtra(raw: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SOURCE_EXTRA_KEYS) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  }
  return out;
}

/** Response-LEVEL metadata (not per-outlet): RestaurantSets / CuisineSets / Dishes /
 *  promotedPlacement / deliveryFees / MetaData. Captured per query for the occurrence report. */
export function extractResponseMeta(rawResponse: any): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const arrLen = (k: string) => (Array.isArray(rawResponse?.[k]) ? rawResponse[k].length : undefined);
  const rs = arrLen("RestaurantSets"); if (rs !== undefined) meta.RestaurantSets = rs;
  const cs = arrLen("CuisineSets"); if (cs !== undefined) meta.CuisineSets = cs;
  const dishes = arrLen("Dishes"); if (dishes !== undefined) meta.Dishes = dishes;
  if (rawResponse?.promotedPlacement !== undefined) meta.promotedPlacement = rawResponse.promotedPlacement;
  if (rawResponse?.deliveryFees !== undefined && rawResponse?.deliveryFees !== null) meta.deliveryFees = true;
  if (rawResponse?.MetaData !== undefined) meta.MetaData = true;
  if (rawResponse?.ShortResultText) meta.ShortResultText = rawResponse.ShortResultText;
  return meta;
}

/** True if a raw restaurant object is a Just Eat test record (never persisted). */
export function isTestRestaurant(raw: any): boolean { return Boolean(raw?.IsTestRestaurant); }

export function parseSearchRestaurant(raw: any, queriedOutcode: string, pilotOutcodes: string[]): ParsedRecord {
  const warnings: string[] = [];
  const prov: ParsedProvenance[] = [];
  const addr = raw?.Address ?? {};
  const rating = raw?.Rating ?? {};

  const rawPostcode = s(raw?.Postcode ?? addr?.Postcode);
  const postcode = normPostcode(rawPostcode);
  const outcode = postcode ? outwardCode(postcode) : "";
  const { territoryClass, territoryConfidence } = classifyTerritory(outcode, queriedOutcode, pilotOutcodes);

  const cuisines: string[] = Array.isArray(raw?.Cuisines)
    ? raw.Cuisines.map((c: any) => s(c?.Name)).filter(Boolean) as string[]
    : [];
  // primary cuisine: the top cuisine flag, else first
  let primaryCuisine: string | null = null;
  if (Array.isArray(raw?.CuisineTypes)) {
    const top = raw.CuisineTypes.find((c: any) => c?.IsTopCuisine);
    primaryCuisine = s(top?.Name) ?? s(raw.CuisineTypes[0]?.Name);
  }
  if (!primaryCuisine) primaryCuisine = cuisines[0] ?? null;

  const isDelivery = boolOrNull(raw?.IsDelivery);
  const isCollection = boolOrNull(raw?.IsCollection);
  const serviceModels = [isDelivery ? "delivery" : null, isCollection ? "collection" : null].filter(Boolean) as string[];

  // halal — conservative, evidence only, never inferred from cuisine
  const halalEvidence: HalalEvidenceItem[] = [];
  if (raw?.IsHalal === true) halalEvidence.push({ type: "platform_flag", path: "IsHalal", excerpt: "IsHalal=true", confidence: 0.9 });
  const desc = s(raw?.Description);
  if (desc && HALAL_RE.test(desc)) halalEvidence.push({ type: "description", path: "Description", excerpt: clip(desc), confidence: 0.6 });
  const tagHit = [...(Array.isArray(raw?.Tags) ? raw.Tags : []), ...cuisines].map((x) => String(x)).find((x) => HALAL_RE.test(x));
  if (tagHit) halalEvidence.push({ type: "cuisine_or_tag", path: "Tags/Cuisines", excerpt: clip(String(tagHit)), confidence: 0.5 });
  const halalFlag = raw?.IsHalal === true;
  const halalConfidence = halalEvidence.reduce((m, e) => Math.max(m, e.confidence), 0);

  const outlet: ParsedOutlet = {
    je_outlet_id: String(raw?.Id ?? raw?.UniqueName ?? ""),
    unique_name: s(raw?.UniqueName),
    trading_name: s(raw?.Name) ?? "",
    brand_name: s(raw?.BrandName),
    is_brand: Boolean(raw?.IsBrand),
    merchant_type: null,
    address_first_line: s(addr?.FirstLine),
    city: s(addr?.City ?? raw?.City),
    postcode,
    outcode: outcode || null,
    latitude: numOrNull(addr?.Latitude ?? raw?.Latitude),
    longitude: numOrNull(addr?.Longitude ?? raw?.Longitude),
    delivery_zipcode: s(raw?.DeliveryZipcode),
    // listing endpoint supplies NO phone — honest nulls, never fabricated
    telephone_raw: null, telephone_e164: null, telephone_national: null,
    telephone_extension: null, telephone_valid: null, telephone_invalid_reason: null,
    rating_average: numOrNull(rating?.Average ?? raw?.RatingAverage),
    rating_count: intOrNull(rating?.Count ?? raw?.NumberOfRatings),
    rating_stars: numOrNull(rating?.StarRating ?? raw?.RatingStars),
    cuisines,
    primary_cuisine: primaryCuisine,
    service_models: serviceModels,
    tags: Array.isArray(raw?.Tags) ? raw.Tags.map(String) : [],
    badges: Array.isArray(raw?.Badges) ? raw.Badges.map(String) : [],
    is_open_now: boolOrNull(raw?.IsOpenNow),
    open_for_delivery: boolOrNull(raw?.IsOpenNowForDelivery),
    open_for_collection: boolOrNull(raw?.IsOpenNowForCollection),
    open_for_preorder: boolOrNull(raw?.IsOpenNowForPreorder),
    is_delivery: isDelivery,
    is_collection: isCollection,
    is_temporarily_offline: Boolean(raw?.IsTemporarilyOffline),
    offline_reason: s(raw?.ReasonWhyTemporarilyOffline),
    delivery_cost: Number.isFinite(Number(raw?.DeliveryCost)) ? Number(raw.DeliveryCost) : null,
    is_free_delivery: boolOrNull(raw?.IsFreeDelivery),
    minimum_delivery_value: Number.isFinite(Number(raw?.MinimumDeliveryValue)) ? Number(raw.MinimumDeliveryValue) : null,
    delivery_eta_lower: intOrNull(raw?.DeliveryEtaMinutes?.RangeLower),
    delivery_eta_upper: intOrNull(raw?.DeliveryEtaMinutes?.RangeUpper),
    opening_times: Array.isArray(raw?.OpeningTimes) ? raw.OpeningTimes : [],
    logo_url: s(raw?.LogoUrl ?? raw?.Logo?.[0]?.StandardResolutionURL),
    deals: Array.isArray(raw?.Deals) ? raw.Deals : [],
    offers: Array.isArray(raw?.Offers) ? raw.Offers : [],
    offer_percent: numOrNull(raw?.OfferPercent),
    is_sponsored: boolOrNull(raw?.IsSponsored),
    default_display_rank: intOrNull(raw?.DefaultDisplayRank),
    halal_flag: halalFlag,
    halal_evidence: halalEvidence,
    halal_confidence: halalConfidence,
    territory_class: territoryClass,
    territory_confidence: territoryConfidence,
    source_url: s(raw?.Url) ?? (raw?.UniqueName ? `https://www.just-eat.co.uk/restaurants-${raw.UniqueName}` : null),
    source_extra: buildSourceExtra(raw),
  };

  if (!outlet.je_outlet_id) warnings.push("missing Id/UniqueName");
  if (!outlet.trading_name) warnings.push("missing Name");
  if (!postcode) warnings.push("missing postcode");

  // provenance for the important fields
  const P = (field_key: string, value: unknown, original_value: unknown, path: string | null, derived: boolean, confidence: number | null, rule: string) =>
    prov.push({ field_key, value, original_value, source_field_path: path, transform_rule: rule, transform_version: NORMALISATION_VERSION, is_derived: derived, confidence });
  P("name", outlet.trading_name, raw?.Name, "Name", false, 1, "trim");
  P("telephone", null, null, null, false, null, "unavailable-from-source");
  P("address", outlet.address_first_line, addr?.FirstLine, "Address.FirstLine", false, 0.9, "trim");
  P("postcode", outlet.postcode, rawPostcode, "Postcode", false, postcode ? 0.95 : 0, "uppercase+space-format");
  P("coordinates", outlet.latitude != null && outlet.longitude != null ? [outlet.latitude, outlet.longitude] : null, [addr?.Latitude, addr?.Longitude], "Address.Latitude/Longitude", false, outlet.latitude != null ? 0.9 : 0, "number|null");
  P("review_score", outlet.rating_average, rating?.Average, "Rating.Average", false, outlet.rating_average != null ? 0.9 : 0, "number|null");
  P("review_count", outlet.rating_count, rating?.Count, "Rating.Count", false, outlet.rating_count != null ? 0.9 : 0, "int|null");
  P("cuisine", outlet.cuisines, raw?.Cuisines, "Cuisines[].Name", false, cuisines.length ? 0.9 : 0, "names[]");
  P("service_models", outlet.service_models, { IsDelivery: raw?.IsDelivery, IsCollection: raw?.IsCollection }, "IsDelivery/IsCollection", true, 0.9, "from-flags");
  P("opening_status", { is_open_now: outlet.is_open_now, offline: outlet.is_temporarily_offline }, { IsOpenNow: raw?.IsOpenNow, IsTemporarilyOffline: raw?.IsTemporarilyOffline }, "IsOpenNow/IsTemporarilyOffline", false, 0.9, "flags");
  P("halal_evidence", outlet.halal_evidence, { IsHalal: raw?.IsHalal }, "IsHalal/Description/Tags", true, halalConfidence, "conservative-evidence");
  P("brand", outlet.brand_name, raw?.BrandName, "BrandName/IsBrand", false, outlet.is_brand ? 0.9 : 0, "trim");
  P("description", s(raw?.Description), raw?.Description, "Description", false, desc ? 0.9 : 0, "trim");
  P("delivery_economics", { cost: outlet.delivery_cost, minimum: outlet.minimum_delivery_value, eta: [outlet.delivery_eta_lower, outlet.delivery_eta_upper] }, { DeliveryCost: raw?.DeliveryCost, MinimumDeliveryValue: raw?.MinimumDeliveryValue }, "DeliveryCost/MinimumDeliveryValue/DeliveryEtaMinutes", false, 0.9, "numbers");
  P("promotions", { deals: outlet.deals.length, offers: outlet.offers.length, offer_percent: outlet.offer_percent, sponsored: outlet.is_sponsored }, { Deals: raw?.Deals, Offers: raw?.Offers }, "Deals/Offers/OfferPercent/IsSponsored", false, 0.8, "arrays+flags");
  P("media", outlet.logo_url, raw?.LogoUrl ?? raw?.Logo, "LogoUrl/Logo", false, outlet.logo_url ? 0.8 : 0, "url");
  P("ranking", { default_rank: outlet.default_display_rank, sponsored_position: raw?.SponsoredPosition ?? null }, { DefaultDisplayRank: raw?.DefaultDisplayRank }, "DefaultDisplayRank/SponsoredPosition", false, 0.8, "int");
  P("phone", null, null, null, false, null, "unavailable-from-source");
  P("opening_hours", null, null, null, false, null, "unavailable-from-source");
  P("menu", null, null, null, false, null, "unavailable-from-source");

  const parsedRating: ParsedRating = {
    score: outlet.rating_average,
    max_scale: 5,
    review_count: outlet.rating_count,
    source_label: outlet.rating_average != null ? `${outlet.rating_average} (${outlet.rating_count ?? 0} ratings)` : null,
  };

  return { raw, outlet, provenance: prov, rating: parsedRating, warnings };
}

/** Parse a full search response, dropping JE test restaurants. */
export function parseSearchResponse(rawResponse: any, queriedOutcode: string, pilotOutcodes: string[]): { records: ParsedRecord[]; restaurantCount: number } {
  const list: any[] = Array.isArray(rawResponse?.Restaurants) ? rawResponse.Restaurants : [];
  const records = list.filter((r) => !isTestRestaurant(r)).map((r) => parseSearchRestaurant(r, queriedOutcode, pilotOutcodes));
  return { records, restaurantCount: list.length };
}

function clip(text: string, max = 240): string { return text.length > max ? text.slice(0, max) + "…" : text; }

export { PARSER_VERSION };
