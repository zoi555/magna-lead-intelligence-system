// CALIBRATED parser for borderline/uber-eats-scraper-ppr (uber-eats-borderline-parse-0.2.0).
//
// Calibrated from the REAL payload of run jg2xJwXcMgvmggYnT (docs/68). Maps the rich fields the
// actor actually returns: nested `location` (address/postcode/country/lat/lng), `rating`
// {ratingValue, reviewCount(string)}, `cuisineList`, `supportedDiningModes` (array of OBJECTS
// {mode,isAvailable}), `phoneNumber` (valid UK E.164), text `etaRange`/`fareBadge`, `hours`, `menu`,
// media. UK-only postcode/phone gating; missing fields → null (never fabricated); the COMPLETE raw
// record + all unmapped fields retained in source_extra. Source PLATFORM stays "uber_eats"; the
// ACQUISITION identity (uber_eats_borderline_ppr) is tracked separately (registry/provenance).

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";
import { normaliseUkPhone } from "../just-eat/phone";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

function decodeEntities(v: string | null): string | null {
  if (!v) return v;
  let out = v;
  for (let i = 0; i < 3 && /&(amp|lt|gt|quot|apos|#3[489]);/i.test(out); i++) {
    out = out.replace(/&amp;/gi, "&").replace(/&#38;/g, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
             .replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/gi, "'");
  }
  return out;
}

function ukPostcode(raw: unknown): { normalised: string | null; sourceValue: string | null } {
  const v = s(raw);
  if (!v) return { normalised: null, sourceValue: null };
  const c = classifyPostcode(v);
  return { normalised: c && c.level !== "invalid" ? c.value : null, sourceValue: v };
}
function ukPhone(raw: unknown): { comparison: string | null; source: string | null } {
  const v = s(raw);
  if (!v) return { comparison: null, source: null };
  const n = normaliseUkPhone(v);
  return { comparison: n.valid ? (n.e164 ?? n.comparison) : null, source: v };
}
function firstNum(...vs: unknown[]): number | null { for (const v of vs) { const n = num(v); if (n != null) return n; } return null; }

// supportedDiningModes is an array of OBJECTS {mode,title,isAvailable,isSelected} (real payload) —
// tolerate a plain-string array too. Returns availability for a given mode, or null if unknown.
function modeAvailable(modes: unknown, ...want: string[]): boolean | null {
  if (!Array.isArray(modes) || !modes.length) return null;
  const norm = (m: unknown): { mode: string; available: boolean } | null => {
    if (typeof m === "string") return { mode: m.toUpperCase(), available: true };
    if (m && typeof m === "object") { const o = m as any; const mode = s(o.mode ?? o.title); return mode ? { mode: mode.toUpperCase(), available: o.isAvailable !== false } : null; }
    return null;
  };
  const list = modes.map(norm).filter(Boolean) as { mode: string; available: boolean }[];
  if (!list.length) return null;
  return list.some((m) => want.some((w) => m.mode.includes(w)) && m.available);
}
// etaRange is free text ("Delivered in 15 to 29 min") — extract the lower-bound minutes if present.
function etaLowerMinutes(v: unknown): number | null { const t = s(v); if (!t) return null; const m = t.match(/(\d+)/); return m ? Number(m[1]) : null; }

export function parseBorderlineStore(raw: any, observedAt: string): SourceOutlet {
  const loc = raw && typeof raw.location === "object" && raw.location ? raw.location : {};
  const geo = loc && typeof loc.geo === "object" && loc.geo ? loc.geo : {};

  const pc = ukPostcode(loc.postalCode ?? raw.postalCode ?? raw.postcode);
  const ph = ukPhone(raw.phoneNumber ?? raw.phone);
  const latitude = firstNum(loc.latitude, loc.lat, raw.latitude, raw.lat, geo.latitude, geo.lat);
  const longitude = firstNum(loc.longitude, loc.lng, loc.lon, raw.longitude, raw.lng, geo.longitude, geo.lng);

  const composed = [s(loc.address), s(loc.streetAddress), s(loc.city), s(loc.region), s(loc.postalCode), s(loc.country)].filter(Boolean).join(", ") || null;
  const address = s(loc.address) || s(raw.address) || composed;

  const cuisines = Array.isArray(raw.cuisineList) ? (raw.cuisineList.map((c: unknown) => decodeEntities(s(c))).filter(Boolean) as string[]) : [];
  const menuArr = Array.isArray(raw.menu) ? raw.menu : [];
  const menuItemCount = menuArr.reduce((acc: number, sec: any) => acc + (Array.isArray(sec?.catalogItems) ? sec.catalogItems.length : 0), 0);

  // COMPLETE raw record + all unmapped useful fields retained (in-memory; also immutable on the observation).
  const source_extra: Record<string, unknown> = {
    provider_impl: "uber_eats_borderline_ppr",
    address_country: s(loc.country ?? raw.country),
    address_locality: s(loc.city),
    address_region: s(loc.region),
    address_street: s(loc.streetAddress),
    location_type: s(loc.locationType),
    source_postcode: pc.sourceValue,
    phone_number: ph.source,
    emails: Array.isArray(raw.emails) && raw.emails.length ? raw.emails : null,
    geo_slugs: geo && Object.keys(geo).length ? geo : null,
    provider_distance: raw.distance ?? null,
    merchant_type: s(raw.merchantType),
    sanitized_title: decodeEntities(s(raw.sanitizedTitle)),
    currency_code: s(raw.currencyCode),
    rating_review_count_raw: raw?.rating?.reviewCount ?? null,
    cuisine_source: Array.isArray(raw.cuisineList) ? raw.cuisineList : null,
    categories: Array.isArray(raw.categories) ? raw.categories : null,
    categories_link: Array.isArray(raw.categoriesLink) ? raw.categoriesLink : null,
    supported_dining_modes: raw.supportedDiningModes ?? null,
    is_open: typeof raw.isOpen === "boolean" ? raw.isOpen : null,
    store_availability_status: s(raw.storeAvailablityStatus),
    closed_message: s(raw.closedMessage),
    eta_range: s(raw.etaRange),
    fare_badge: s(raw.fareBadge),
    hours: Array.isArray(raw.hours) && raw.hours.length ? raw.hours : null,
    menu_section_count: menuArr.length || null,
    menu_item_count: menuItemCount || null,
    menu: menuArr.length ? menuArr : null,
    featured_items: Array.isArray(raw.featuredItems) && raw.featuredItems.length ? raw.featuredItems : null,
    reviews_available: (Array.isArray(raw.storeReviews) && raw.storeReviews.length > 0) || (Array.isArray(raw.featuredReviews) && raw.featuredReviews.length > 0),
    store_reviews: Array.isArray(raw.storeReviews) && raw.storeReviews.length ? raw.storeReviews : null,
    featured_reviews: Array.isArray(raw.featuredReviews) && raw.featuredReviews.length ? raw.featuredReviews : null,
    hero_image: s(raw.heroImageUrl),
    logo_image: s(raw.logoImageUrl),
    raw_record: raw,     // complete raw record retained (also stored immutably on the observation)
  };

  return {
    source: "uber_eats",
    source_outlet_id: String(raw.uuid ?? raw.id ?? raw.storeUuid ?? ""),
    source_url: s(raw.url ?? raw.storeUrl ?? raw.link),
    name: decodeEntities(s(raw.title ?? raw.name ?? raw.storeName ?? raw.sanitizedTitle)) ?? "",
    brand: null,
    address,
    postcode: pc.normalised,
    latitude,
    longitude,
    phone: ph.comparison,
    rating: num(raw?.rating?.ratingValue ?? raw?.rating),
    review_count: num(raw?.rating?.reviewCount),          // string in the payload → number
    cuisines,
    is_delivery: modeAvailable(raw.supportedDiningModes, "DELIVERY"),
    is_collection: modeAvailable(raw.supportedDiningModes, "PICKUP", "PICK_UP", "COLLECTION"),
    delivery_cost: null,   // no clean numeric fee (fareBadge is promotional text) — kept in source_extra
    minimum_order: null,
    eta_minutes: etaLowerMinutes(raw.etaRange),
    is_sponsored: null,
    halal_flag: cuisines.some((c) => /halal/i.test(c)) ? true : null,
    logo_url: s(raw.logoImageUrl ?? raw.heroImageUrl),
    observed_at: observedAt,
    source_extra,
  };
}

export function parseBorderlineSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.stores) ? raw.stores : (Array.isArray(raw) ? raw : []);
  return list.map((r) => parseBorderlineStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
