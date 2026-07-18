// TOLERANT initial parser for borderline/uber-eats-scraper-ppr (uber-eats-borderline-parse-0.1.0).
//
// Deliberately minimal (per the pre-run brief): identify the outlet, retain the COMPLETE raw record
// in source_extra, and locate only the safe geography/identity fields (title, url, uuid, full
// address, postcode, country, lat, lng). Detailed field mappings are calibrated AFTER the one paid
// run from the real payload — not invented from documentation. Tolerant to object/nested variants.
// Source PLATFORM stays "uber_eats"; the ACQUISITION identity (uber_eats_borderline_ppr) is tracked
// separately (registry / provenance / observation query_context).

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

export function parseBorderlineStore(raw: any, observedAt: string): SourceOutlet {
  const loc = raw && typeof raw.location === "object" && raw.location ? raw.location : {};
  const geo = loc && typeof loc.geo === "object" && loc.geo ? loc.geo : {};

  const pc = ukPostcode(loc.postalCode ?? raw.postalCode ?? raw.postcode);
  const ph = ukPhone(raw.phoneNumber ?? raw.phone);
  const latitude = firstNum(loc.latitude, loc.lat, raw.latitude, raw.lat, geo.latitude, geo.lat);
  const longitude = firstNum(loc.longitude, loc.lng, loc.lon, raw.longitude, raw.lng, geo.longitude, geo.lng);

  const composed = [s(loc.address), s(loc.streetAddress), s(loc.city), s(loc.region), s(loc.postalCode), s(loc.country)].filter(Boolean).join(", ") || null;
  const address = s(loc.address) || s(raw.address) || composed;

  // Retain the COMPLETE raw record plus the located geography signals. Detailed field mappings are
  // added at calibration; for now everything the actor returned is preserved verbatim.
  const source_extra: Record<string, unknown> = {
    provider_impl: "uber_eats_borderline_ppr",
    address_country: s(loc.country ?? raw.country),
    address_locality: s(loc.city),
    address_region: s(loc.region),
    address_street: s(loc.streetAddress),
    source_postcode: pc.sourceValue,
    phone_number: ph.source,
    geo_slugs: geo && Object.keys(geo).length ? geo : null,
    provider_distance: raw.distance ?? null,
    merchant_type: s(raw.merchantType),
    sanitized_title: decodeEntities(s(raw.sanitizedTitle)),
    currency_code: s(raw.currencyCode),
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
    rating: null,          // calibrated post-run from the real payload (not invented here)
    review_count: null,
    cuisines: [],
    is_delivery: null,
    is_collection: null,
    delivery_cost: null,
    minimum_order: null,
    eta_minutes: null,
    is_sponsored: null,
    halal_flag: null,
    logo_url: s(raw.logoImageUrl ?? raw.heroImageUrl),
    observed_at: observedAt,
    source_extra,
  };
}

export function parseBorderlineSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.stores) ? raw.stores : (Array.isArray(raw) ? raw : []);
  return list.map((r) => parseBorderlineStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
