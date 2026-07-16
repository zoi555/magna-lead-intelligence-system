// Just Eat source-field capability catalogue (machine-readable mirror of docs/57).
//
// This is the single source of truth for WHAT the Just Eat listing endpoint provides,
// its availability, and how each field is treated. The data-quality report and tests
// assert against it, so "available" claims stay honest and verifiable.

export type SourceLevel = "search" | "outlet_detail" | "menu";
export type Availability =
  | "direct"          // present directly in the listing payload
  | "detail_only"     // only via an outlet-detail request (not acquired in Stage 1)
  | "menu_only"       // only via menu data (not acquired in Stage 1)
  | "derived"         // computed safely from available fields
  | "inconsistent"    // present but optional/variable
  | "unavailable"     // not provided by this source
  | "prohibited";     // inappropriate/unsafe to collect

export type Sensitivity = "business" | "operational" | "sensitive" | "personal";
export type ExportVisibility = "all_internal" | "management_only" | "telesales_safe" | "never_export";
export type CollectionStatus = "collected" | "conditional" | "not_collected";

export interface CatalogueField {
  key: string;                 // internal field key
  jePath: string | null;       // Just Eat source path/name (null = not in source)
  level: SourceLevel;
  dataType: "string" | "number" | "boolean" | "array" | "object" | "date";
  availability: Availability;
  required: boolean;
  exampleShape: string;        // shape WITHOUT personal data
  normalisation: string;
  sensitivity: Sensitivity;
  exportVisibility: ExportVisibility;
  collectionStatus: CollectionStatus;
  parserVersion: string;
}

const V = "je-search-1.0.0";

export const JUST_EAT_FIELD_CATALOGUE: CatalogueField[] = [
  // identity
  f("je_outlet_id", "Id", "search", "number", "direct", true, "900001", "String(Id)", "business", "all_internal", "collected"),
  f("unique_name", "UniqueName", "search", "string", "direct", false, "\"example-grill\"", "trim", "business", "all_internal", "collected"),
  f("trading_name", "Name", "search", "string", "direct", true, "\"Example Grill\"", "trim/collapse ws", "business", "all_internal", "collected"),
  f("brand_name", "BrandName", "search", "string", "inconsistent", false, "\"Example Brand\"|null", "trim or null", "business", "all_internal", "collected"),
  f("is_brand", "IsBrand", "search", "boolean", "direct", false, "true", "Boolean", "business", "all_internal", "collected"),
  f("description", "Description", "search", "string", "inconsistent", false, "\"Halal grill\"", "trim; scanned for halal wording", "business", "all_internal", "collected"),
  f("outlet_url", "Url", "search", "string", "direct", false, "\"https://www.just-eat.co.uk/...\"", "as-is", "business", "all_internal", "collected"),
  // contact
  f("telephone", null, "outlet_detail", "string", "unavailable", false, "(not supplied by listing)", "would need a verified detail endpoint", "business", "telesales_safe", "not_collected"),
  f("website", null, "outlet_detail", "string", "unavailable", false, "(not supplied by listing)", "n/a", "business", "all_internal", "not_collected"),
  // location
  f("address_first_line", "Address.FirstLine", "search", "string", "direct", false, "\"1 Example Road\"", "trim", "business", "all_internal", "collected"),
  f("city", "Address.City", "search", "string", "direct", false, "\"Southall\"", "trim", "business", "all_internal", "collected"),
  f("postcode", "Postcode", "search", "string", "direct", false, "\"UB1 1AA\"", "uppercase; space-format", "business", "all_internal", "collected"),
  f("outcode", "Postcode", "search", "string", "derived", false, "\"UB1\"", "outward code of postcode", "business", "all_internal", "collected"),
  f("latitude", "Address.Latitude", "search", "number", "direct", false, "51.5081", "number|null (0 => null)", "business", "all_internal", "collected"),
  f("longitude", "Address.Longitude", "search", "number", "direct", false, "-0.3762", "number|null (0 => null)", "business", "all_internal", "collected"),
  f("delivery_zipcode", "DeliveryZipcode", "search", "string", "inconsistent", false, "\"UB1\"|null", "trim or null", "operational", "all_internal", "collected"),
  // ratings (aggregate only)
  f("rating_average", "Rating.Average", "search", "number", "direct", false, "4.6", "number|null (0 => null)", "business", "all_internal", "collected"),
  f("rating_count", "Rating.Count", "search", "number", "direct", false, "342", "int|null", "business", "all_internal", "collected"),
  f("rating_stars", "Rating.StarRating", "search", "number", "inconsistent", false, "4.6", "number", "business", "all_internal", "collected"),
  f("review_text", null, "outlet_detail", "string", "unavailable", false, "(not supplied)", "never inferred from snippets", "personal", "never_export", "not_collected"),
  // trading / availability
  f("is_open_now", "IsOpenNow", "search", "boolean", "direct", false, "true", "Boolean|null", "operational", "all_internal", "collected"),
  f("open_for_delivery", "IsOpenNowForDelivery", "search", "boolean", "direct", false, "true", "Boolean", "operational", "all_internal", "collected"),
  f("open_for_collection", "IsOpenNowForCollection", "search", "boolean", "direct", false, "false", "Boolean", "operational", "all_internal", "collected"),
  f("open_for_preorder", "IsOpenNowForPreorder", "search", "boolean", "direct", false, "false", "Boolean", "operational", "all_internal", "collected"),
  f("is_delivery", "IsDelivery", "search", "boolean", "direct", false, "true", "Boolean", "operational", "all_internal", "collected"),
  f("is_collection", "IsCollection", "search", "boolean", "direct", false, "true", "Boolean", "operational", "all_internal", "collected"),
  f("is_temporarily_offline", "IsTemporarilyOffline", "search", "boolean", "direct", false, "false", "Boolean", "operational", "all_internal", "collected"),
  f("offline_reason", "ReasonWhyTemporarilyOffline", "search", "string", "inconsistent", false, "\"...\"|null", "trim or null", "operational", "all_internal", "collected"),
  f("delivery_cost", "DeliveryCost", "search", "number", "direct", false, "2.49", "number", "operational", "all_internal", "collected"),
  f("is_free_delivery", "IsFreeDelivery", "search", "boolean", "direct", false, "false", "Boolean", "operational", "all_internal", "collected"),
  f("minimum_delivery_value", "MinimumDeliveryValue", "search", "number", "direct", false, "12.0", "number", "operational", "all_internal", "collected"),
  f("delivery_eta_lower", "DeliveryEtaMinutes.RangeLower", "search", "number", "inconsistent", false, "30", "int|null", "operational", "all_internal", "collected"),
  f("delivery_eta_upper", "DeliveryEtaMinutes.RangeUpper", "search", "number", "inconsistent", false, "45", "int|null", "operational", "all_internal", "collected"),
  f("opening_times", "OpeningTimes", "search", "array", "inconsistent", false, "[{DayOfWeek,OpeningTime,ClosingTime}]", "array as-is", "operational", "all_internal", "collected"),
  // cuisine / classification
  f("cuisines", "Cuisines[].Name", "search", "array", "direct", false, "[\"Indian\",\"Curry\"]", "names[]", "business", "all_internal", "collected"),
  f("primary_cuisine", "CuisineTypes[].IsTopCuisine", "search", "string", "derived", false, "\"Indian\"", "top cuisine or first", "business", "all_internal", "collected"),
  f("tags", "Tags", "search", "array", "inconsistent", false, "[\"halal\"]", "array as-is", "business", "all_internal", "collected"),
  f("badges", "Badges", "search", "array", "inconsistent", false, "[\"premier\"]", "array as-is", "business", "all_internal", "collected"),
  f("service_models", "IsDelivery/IsCollection", "search", "array", "derived", false, "[\"delivery\",\"collection\"]", "from delivery/collection flags", "business", "all_internal", "collected"),
  // promotions / media
  f("logo_url", "LogoUrl", "search", "string", "inconsistent", false, "\"https://.../logo.png\"", "url or null", "business", "all_internal", "collected"),
  f("deals", "Deals", "search", "array", "inconsistent", false, "[{Description}]", "array as-is", "business", "all_internal", "collected"),
  f("offers", "Offers", "search", "array", "inconsistent", false, "[{Description}]", "array as-is", "business", "all_internal", "collected"),
  f("offer_percent", "OfferPercent", "search", "number", "inconsistent", false, "20", "number", "business", "all_internal", "collected"),
  f("is_sponsored", "IsSponsored", "search", "boolean", "direct", false, "false", "Boolean", "operational", "management_only", "collected"),
  f("default_display_rank", "DefaultDisplayRank", "search", "number", "direct", false, "1", "int (result position)", "operational", "management_only", "collected"),
  // halal evidence
  f("halal_flag", "IsHalal", "search", "boolean", "direct", false, "true", "Boolean (source evidence, not certification)", "business", "all_internal", "collected"),
  f("halal_evidence", "IsHalal/Description/Tags", "search", "array", "derived", false, "[{type,path,excerpt,confidence}]", "conservative; never from cuisine alone", "business", "all_internal", "collected"),
  // menu
  f("menu_items", null, "menu", "array", "menu_only", false, "(requires a verified menu endpoint)", "not acquired in Stage 1", "business", "all_internal", "not_collected"),
];

function f(
  key: string, jePath: string | null, level: SourceLevel, dataType: CatalogueField["dataType"],
  availability: Availability, required: boolean, exampleShape: string, normalisation: string,
  sensitivity: Sensitivity, exportVisibility: ExportVisibility, collectionStatus: CollectionStatus
): CatalogueField {
  return { key, jePath, level, dataType, availability, required, exampleShape, normalisation, sensitivity, exportVisibility, collectionStatus, parserVersion: V };
}

/** Fields we actually collect at Stage 1 (used by the data-quality report). */
export const COLLECTED_FIELD_KEYS = JUST_EAT_FIELD_CATALOGUE
  .filter((c) => c.collectionStatus === "collected").map((c) => c.key);

/** Honestly-unavailable fields (phone, reviews, menu) — reported as 0% coverage. */
export const UNAVAILABLE_FIELD_KEYS = JUST_EAT_FIELD_CATALOGUE
  .filter((c) => c.availability === "unavailable" || c.availability === "menu_only" || c.availability === "detail_only")
  .map((c) => c.key);
