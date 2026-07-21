// Deliveroo search parser → source-neutral SourceOutlet. Structure mirrors the public
// listing response shape; values in tests come from SANITISED fixtures only.

import { classifyPostcode } from "@zoi555/geospatial-map";
import type { SourceOutlet } from "../consolidation/types";
import { phoneComparison } from "../consolidation/source-adapter";
import { SCHEMA_VERSION, DELIVEROO_PARSER_VERSION, DELIVEROO_ADAPTER_VERSION } from "../version";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
// Guard null/undefined/'' explicitly — Number(null) is 0 and Number('') is 0, which would
// silently fabricate a rating/fee/eta of zero for a genuinely-absent value.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normPc = (pc: string | null): string | null => (pc ? classifyPostcode(pc).value || pc.toUpperCase() : null);

export function parseDeliverooRestaurant(raw: any, observedAt: string): SourceOutlet {
  const addr = raw?.address ?? {};
  const loc = raw?.location ?? {};
  return {
    source: "deliveroo",
    source_outlet_id: String(raw?.id ?? raw?.uname ?? ""),
    source_url: s(raw?.url),
    name: s(raw?.name) ?? "",
    brand: s(raw?.brand),
    address: s(addr?.address1 ?? raw?.addressLine),
    postcode: normPc(s(addr?.postcode ?? raw?.postcode)),
    latitude: num(loc?.lat ?? raw?.latitude),
    longitude: num(loc?.lon ?? raw?.longitude),
    phone: phoneComparison(s(raw?.phone)),
    rating: num(raw?.rating),
    review_count: num(raw?.numberOfReviews ?? raw?.reviewCount),
    cuisines: Array.isArray(raw?.cuisines) ? raw.cuisines.map(String) : [],
    is_delivery: typeof raw?.deliverable === "boolean" ? raw.deliverable : null,
    is_collection: typeof raw?.collection === "boolean" ? raw.collection : null,
    delivery_cost: raw?.deliveryFee != null ? Number(raw.deliveryFee) / 100 : null,
    minimum_order: raw?.minimumOrderValue != null ? Number(raw.minimumOrderValue) / 100 : null,
    eta_minutes: num(raw?.prepTime),
    is_sponsored: typeof raw?.promoted === "boolean" ? raw.promoted : null,
    halal_flag: typeof raw?.halal === "boolean" ? raw.halal : null,
    logo_url: s(raw?.image),
    observed_at: observedAt,

    schema_version: String(SCHEMA_VERSION),
    branch_name: null,                    // no branch/trading-name distinction seen in the assumed shape
    address_line1: s(addr?.address1),
    address_line2: s(addr?.address2),     // present only if the real response supplies it (unconfirmed)
    locality: s(addr?.locality),
    city: s(addr?.city),
    categories: Array.isArray(raw?.cuisines) ? raw.cuisines.map(String) : [],
    rating_distribution: null,            // no per-star breakdown in the assumed shape (FIELD_MAPPING.md: likely absent)
    is_open: typeof raw?.isOpen === "boolean" ? raw.isOpen : null,
    opening_hours: raw?.openingHours ?? null,
    service_fee: raw?.serviceFee != null ? Number(raw.serviceFee) / 100 : null,
    distance_miles: null,                 // not in the assumed listing shape
    offers: Array.isArray(raw?.offers) ? raw.offers : [],
    badges: Array.isArray(raw?.badges) ? raw.badges.map(String) : [],
    image_url: s(raw?.heroImage ?? raw?.image),
    hygiene_rating: null,                 // Deliveroo does not expose FHRS/hygiene data in this shape
    anchor_id: null,                      // set by the caller (per-query anchor), not known here
    pipeline_run_id: null,                // set by the caller (worker/execution), not known here
    provider_version: DELIVEROO_ADAPTER_VERSION,
    parser_version: DELIVEROO_PARSER_VERSION,
    raw_evidence_reference: null,         // set by the caller once a live provider is configured
  };
}

export function parseDeliverooSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.restaurants) ? raw.restaurants : [];
  return list.map((r) => parseDeliverooRestaurant(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
