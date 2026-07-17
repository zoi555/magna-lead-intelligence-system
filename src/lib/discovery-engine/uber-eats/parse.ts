// Uber Eats search parser → source-neutral SourceOutlet.
//
// CALIBRATED (uber-eats-parse-1.1.0) against the REAL output of the authorised Apify actor
// `sourabhbgp/ubereats-scraper` in `discover` mode (see docs/64). That actor nests the address
// under `address.*`, supplies cuisines as `cuisineList`, a numeric `rating`/`ratingCount`,
// images as `{ url }` objects, and a `phoneNumber` string. This parser maps those real fields,
// stays backward-compatible with the earlier flat/`location.*` fixture shape, retains every
// unmapped field in a controlled `source_extra` JSONB, and NEVER fabricates a missing value.
//
// Honesty rules baked in:
//  - `postcode` is populated ONLY for a recognisable UK postcode (US ZIPs → null, raw kept in
//    source_extra.source_postcode). `latitude`/`longitude` only when the actor supplies them.
//  - `phone` (the UK comparison key) is populated ONLY for a valid UK number; the raw string is
//    always kept in source_extra.phone_number.

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";
import { normaliseUkPhone } from "../just-eat/phone";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

// Decode the small set of HTML entities the actor leaves in titles (e.g. "Total Wine &amp; More").
function decodeEntities(v: string | null): string | null {
  if (!v) return v;
  let out = v;
  for (let i = 0; i < 3 && /&(amp|lt|gt|quot|apos|#3[489]);/i.test(out); i++) {
    out = out
      .replace(/&amp;/gi, "&").replace(/&#38;/g, "&")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'").replace(/&apos;/gi, "'");
  }
  return out;
}

// UK postcode only. classifyPostcode marks US ZIPs (e.g. "94103") as level "invalid" while still
// echoing the raw value — so we accept it as a postcode ONLY when it is a real UK level.
function ukPostcode(raw: unknown): { normalised: string | null; sourceValue: string | null } {
  const v = s(raw);
  if (!v) return { normalised: null, sourceValue: null };
  const c = classifyPostcode(v);
  return { normalised: c && c.level !== "invalid" ? c.value : null, sourceValue: v };
}

// UK phone comparison key only. Non-UK numbers (e.g. US "+1…") → null key, raw always retained.
function ukPhone(raw: unknown): { comparison: string | null; source: string | null } {
  const v = s(raw);
  if (!v) return { comparison: null, source: null };
  const n = normaliseUkPhone(v);
  return { comparison: n.valid ? (n.e164 ?? n.comparison) : null, source: v };
}

// Images arrive either as a bare URL string (old fixture) or a { url, widths } object (real actor).
function imageUrl(img: unknown): string | null {
  if (!img) return null;
  if (typeof img === "string") return s(img);
  return s((img as { url?: unknown })?.url);
}

function diningModes(v: unknown): string[] {
  return Array.isArray(v) ? (v.map((m) => s(m)).filter(Boolean) as string[]).map((m) => m.toUpperCase()) : [];
}
// true/false from an explicit mode list; null when the actor supplies no modes at all (unknown).
function hasMode(modes: string[], ...want: string[]): boolean | null {
  if (!modes.length) return null;
  return want.some((w) => modes.some((m) => m.includes(w)));
}

export function parseUberEatsStore(raw: any, observedAt: string): SourceOutlet {
  const addr = raw && typeof raw.address === "object" && raw.address ? raw.address : {};
  const loc = raw && typeof raw.location === "object" && raw.location ? raw.location : {};   // legacy shape

  const cuisineSource: unknown = raw?.cuisineList ?? raw?.cuisines ?? raw?.categories;
  const cuisines = Array.isArray(cuisineSource)
    ? (cuisineSource.map((c: any) => (typeof c === "string" ? decodeEntities(c) : decodeEntities(s(c?.name ?? c?.title)))).filter(Boolean) as string[])
    : [];

  const pc = ukPostcode(addr.postalCode ?? raw?.postalCode ?? raw?.postcode ?? loc.postalCode ?? loc.postcode);
  const ph = ukPhone(raw?.phoneNumber ?? raw?.phone);
  const modes = diningModes(raw?.supportedDiningModes);

  const latitude = num(addr.lat ?? addr.latitude ?? loc.latitude ?? loc.lat ?? raw?.latitude ?? raw?.lat);
  const longitude = num(addr.lng ?? addr.longitude ?? loc.longitude ?? loc.lng ?? raw?.longitude ?? raw?.lng);

  // Formatted address: prefer an explicit line, else compose from the parts the actor supplies.
  const composed = [s(addr.raw), s(addr.address ?? loc.address ?? loc.streetAddress), s(addr.city), s(addr.region), s(addr.postalCode), s(addr.country)]
    .filter(Boolean).join(", ") || null;
  const address = s(addr.raw) || s(addr.address ?? loc.address ?? loc.streetAddress) || composed;

  const heroImage = imageUrl(raw?.heroImage ?? raw?.heroImageUrl);
  const logoImage = imageUrl(raw?.logoImage ?? raw?.logoUrl ?? raw?.imageUrl ?? raw?.image);

  const parentChain = raw?.parentChain;
  const brand =
    typeof parentChain === "string" ? decodeEntities(s(parentChain))
    : parentChain && (parentChain.name || parentChain.title) ? decodeEntities(s(parentChain.name ?? parentChain.title))
    : decodeEntities(s(raw?.brand ?? raw?.brandName));

  const deliveryFee = num(raw?.deliveryFee ?? raw?.deliveryFeeAmount);
  const serviceFee = num(raw?.serviceFee);

  // Everything not mapped to a first-class field is retained here (controlled JSONB). The full
  // raw provider record is ALSO stored immutably on the observation (je_raw_observations.raw_payload).
  const source_extra: Record<string, unknown> = {
    city_id: raw?.cityId ?? null,
    city_slug: s(raw?.citySlug),
    currency_code: s(raw?.currencyCode),
    scraped_at: s(raw?.scrapedAt),
    scraped_from: s(raw?.scrapedFrom),
    address_locality: s(addr.city),
    address_region: s(addr.region),
    address_country: s(addr.country),
    address_neighborhood: s(addr.neighborhood),
    source_postcode: pc.sourceValue,          // raw postcode string as supplied (may be a non-UK ZIP)
    phone_number: ph.source,                  // raw phone string as supplied (may be non-UK)
    rating_count_text: s(raw?.ratingCountText),
    cuisine_source: Array.isArray(cuisineSource) ? cuisineSource : null,
    is_open: boolOrNull(raw?.isOpen),
    is_orderable: boolOrNull(raw?.isOrderable),
    closed_message: s(raw?.closedMessage),
    fare_badge: s(raw?.fareBadge),
    supported_dining_modes: modes,
    delivery_fee_raw: deliveryFee,
    service_fee: serviceFee,
    eta_min_minutes: num(raw?.etaMinMinutes),
    eta_max_minutes: num(raw?.etaMaxMinutes),
    eta_text: s(raw?.etaText),
    working_hours_tagline: s(raw?.workingHoursTagline),
    hours: Array.isArray(raw?.hours) && raw.hours.length ? raw.hours : null,
    menu_item_count: num(raw?.menuItemCount),
    menu_section_count: num(raw?.menuSectionCount),
    menu: Array.isArray(raw?.menu) && raw.menu.length ? raw.menu : null,
    analytics: raw?.analytics ?? null,
    reviews_available: raw?.reviews != null,   // response shape retained even when includeReviews=false
    reviews: raw?.reviews ?? null,
    promotion: raw?.promotion ?? null,
    hero_image: heroImage,
    logo_image: logoImage,
    parent_chain: parentChain ?? null,
  };

  return {
    source: "uber_eats",
    source_outlet_id: String(raw?.uuid ?? raw?.id ?? raw?.storeUuid ?? raw?.slug ?? ""),
    source_url: s(raw?.url ?? raw?.storeUrl ?? raw?.link),
    name: decodeEntities(s(raw?.title ?? raw?.name ?? raw?.storeName)) ?? "",
    brand,
    address,
    postcode: pc.normalised,
    latitude,
    longitude,
    phone: ph.comparison,
    rating: num(raw?.rating?.score ?? raw?.rating ?? raw?.ratingValue ?? raw?.averageRating),
    review_count: num(raw?.ratingCount ?? raw?.rating?.count ?? raw?.reviewCount ?? raw?.numberOfReviews ?? raw?.numRatings),
    cuisines,
    is_delivery: hasMode(modes, "DELIVERY") ?? boolOrNull(raw?.delivery) ?? boolOrNull(raw?.isDelivery),
    is_collection: hasMode(modes, "PICKUP", "PICK_UP", "COLLECTION") ?? boolOrNull(raw?.pickup) ?? boolOrNull(raw?.isPickup),
    delivery_cost: deliveryFee != null ? deliveryFee / 100 : null,   // minor units → major (see docs/64: unverified on live discover, calibrate when non-null)
    minimum_order: raw?.minOrder != null ? Number(raw.minOrder) / 100 : (raw?.minimumOrder != null ? Number(raw.minimumOrder) : null),
    eta_minutes: num(raw?.etaMinMinutes ?? raw?.etaMinutes ?? raw?.eta ?? raw?.deliveryTime),
    is_sponsored: boolOrNull(raw?.sponsored) ?? boolOrNull(raw?.isSponsored),   // promotion≠sponsored: kept separate in source_extra.promotion
    halal_flag: boolOrNull(raw?.halal),
    logo_url: logoImage ?? heroImage,
    observed_at: observedAt,
    source_extra,
  };
}

export function parseUberEatsSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.stores) ? raw.stores : (Array.isArray(raw) ? raw : []);
  return list.map((r) => parseUberEatsStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
