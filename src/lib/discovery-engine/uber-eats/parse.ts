// Uber Eats search parser → source-neutral SourceOutlet. Structure mirrors the public
// storefront response shape; values in tests come from SANITISED fixtures only.

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";
import { phoneComparison } from "../consolidation/source-adapter";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const normPc = (pc: string | null): string | null => (pc ? classifyPostcode(pc).value || pc.toUpperCase() : null);

export function parseUberEatsStore(raw: any, observedAt: string): SourceOutlet {
  const loc = raw?.location ?? {};
  return {
    source: "uber_eats",
    source_outlet_id: String(raw?.uuid ?? raw?.id ?? ""),
    source_url: s(raw?.url),
    name: s(raw?.title ?? raw?.name) ?? "",
    brand: s(raw?.brand),
    address: s(loc?.address ?? raw?.address),
    postcode: normPc(s(loc?.postalCode ?? raw?.postcode)),
    latitude: num(loc?.latitude),
    longitude: num(loc?.longitude),
    phone: phoneComparison(s(raw?.phone)),          // usually null from the public surface
    rating: num(raw?.rating?.score ?? raw?.rating),
    review_count: num(raw?.rating?.count ?? raw?.reviewCount),
    cuisines: Array.isArray(raw?.categories) ? raw.categories.map(String) : [],
    is_delivery: typeof raw?.delivery === "boolean" ? raw.delivery : null,
    is_collection: typeof raw?.pickup === "boolean" ? raw.pickup : null,
    delivery_cost: raw?.deliveryFee != null ? Number(raw.deliveryFee) / 100 : null,
    minimum_order: raw?.minOrder != null ? Number(raw.minOrder) / 100 : null,
    eta_minutes: num(raw?.etaMinutes),
    is_sponsored: typeof raw?.sponsored === "boolean" ? raw.sponsored : null,
    halal_flag: typeof raw?.halal === "boolean" ? raw.halal : null,
    logo_url: s(raw?.heroImageUrl ?? raw?.logoUrl),
    observed_at: observedAt,
  };
}

export function parseUberEatsSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.stores) ? raw.stores : [];
  return list.map((r) => parseUberEatsStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
