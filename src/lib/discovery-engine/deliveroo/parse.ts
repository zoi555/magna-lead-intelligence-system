// Deliveroo search parser → source-neutral SourceOutlet. Structure mirrors the public
// listing response shape; values in tests come from SANITISED fixtures only.

import { classifyPostcode } from "@zoi555/geospatial-map";
import type { SourceOutlet } from "../consolidation/types";
import { phoneComparison } from "../consolidation/source-adapter";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
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
  };
}

export function parseDeliverooSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.restaurants) ? raw.restaurants : [];
  return list.map((r) => parseDeliverooRestaurant(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
