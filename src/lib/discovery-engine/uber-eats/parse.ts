// Uber Eats search parser → source-neutral SourceOutlet. Structure mirrors the public
// storefront response shape; values in tests come from SANITISED fixtures only.

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";
import { phoneComparison } from "../consolidation/source-adapter";

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const normPc = (pc: string | null): string | null => (pc ? classifyPostcode(pc).value || pc.toUpperCase() : null);

// Defensive across common Apify Uber Eats actor field names. Calibrate on the first real
// pilot run against the actor's actual output (missing fields → null, never fabricated).
export function parseUberEatsStore(raw: any, observedAt: string): SourceOutlet {
  const loc = raw?.location ?? {};
  const cats = raw?.categories ?? raw?.cuisines ?? raw?.cuisineList;
  return {
    source: "uber_eats",
    source_outlet_id: String(raw?.uuid ?? raw?.id ?? raw?.storeUuid ?? raw?.slug ?? ""),
    source_url: s(raw?.url ?? raw?.link ?? raw?.storeUrl),
    name: s(raw?.title ?? raw?.name ?? raw?.storeName) ?? "",
    brand: s(raw?.brand ?? raw?.brandName),
    address: s(loc?.address ?? raw?.address ?? raw?.fullAddress ?? loc?.streetAddress),
    postcode: normPc(s(loc?.postalCode ?? raw?.postcode ?? raw?.postalCode ?? loc?.postcode)),
    latitude: num(loc?.latitude ?? raw?.latitude ?? loc?.lat ?? raw?.lat),
    longitude: num(loc?.longitude ?? raw?.longitude ?? loc?.lng ?? raw?.lng),
    phone: phoneComparison(s(raw?.phone ?? raw?.phoneNumber)),   // usually null from the public surface
    rating: num(raw?.rating?.score ?? raw?.rating ?? raw?.ratingValue ?? raw?.averageRating),
    review_count: num(raw?.rating?.count ?? raw?.reviewCount ?? raw?.numberOfReviews ?? raw?.numRatings ?? raw?.ratingCount),
    cuisines: Array.isArray(cats) ? cats.map((c: any) => (typeof c === "string" ? c : s(c?.name))).filter(Boolean) as string[] : [],
    is_delivery: typeof raw?.delivery === "boolean" ? raw.delivery : (typeof raw?.isDelivery === "boolean" ? raw.isDelivery : null),
    is_collection: typeof raw?.pickup === "boolean" ? raw.pickup : (typeof raw?.isPickup === "boolean" ? raw.isPickup : null),
    delivery_cost: raw?.deliveryFee != null ? Number(raw.deliveryFee) / 100 : (raw?.deliveryFeeAmount != null ? Number(raw.deliveryFeeAmount) : null),
    minimum_order: raw?.minOrder != null ? Number(raw.minOrder) / 100 : (raw?.minimumOrder != null ? Number(raw.minimumOrder) : null),
    eta_minutes: num(raw?.etaMinutes ?? raw?.eta ?? raw?.deliveryTime),
    is_sponsored: typeof raw?.sponsored === "boolean" ? raw.sponsored : (typeof raw?.isSponsored === "boolean" ? raw.isSponsored : null),
    halal_flag: typeof raw?.halal === "boolean" ? raw.halal : null,
    logo_url: s(raw?.heroImageUrl ?? raw?.logoUrl ?? raw?.imageUrl ?? raw?.image),
    observed_at: observedAt,
  };
}

export function parseUberEatsSearch(raw: any, observedAt: string): SourceOutlet[] {
  const list: any[] = Array.isArray(raw?.stores) ? raw.stores : [];
  return list.map((r) => parseUberEatsStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}
