// Provider LOCATION FIDELITY — an EVALUATION dimension, separate from business-geography validity.
//
// Business-geography validity (provider-geography-gate) answers "is this restaurant's address inside
// the requested UB1 district?" and controls operational consolidation. Location fidelity answers a
// DIFFERENT question — "did the actor return restaurants NEAR the requested Southall delivery
// location at all, even if their business postcode is outside UB1?" — used only to judge whether an
// actor genuinely binds to the delivery area. It NEVER admits records into a UB1 lead run; that
// remains governed solely by the gate.

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";

export type LocationFidelity = "target_district" | "near_target" | "unrelated_location" | "unverifiable_location";

// Reference anchor for Southall / UB1 3HA (Southall Town Hall). This is an EVALUATION reference only
// — never written into any record as data.
export const SOUTHALL_ANCHOR = { lat: 51.5074, lng: -0.3778 } as const;
const DEFAULT_NEAR_RADIUS_M = 8_000;   // ~local delivery/search radius around Southall

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface FidelityContext {
  targetDistrict: string;                 // e.g. "UB1"
  anchor?: { lat: number; lng: number };  // defaults to Southall
  nearRadiusM?: number;
}

export interface FidelityVerdict {
  fidelity: LocationFidelity;
  distanceM: number | null;
  reason: string;
}

export function classifyLocationFidelity(o: SourceOutlet, ctx: FidelityContext): FidelityVerdict {
  const anchor = ctx.anchor ?? SOUTHALL_ANCHOR;
  const nearRadiusM = ctx.nearRadiusM ?? DEFAULT_NEAR_RADIUS_M;
  const targetDistrict = classifyPostcode(ctx.targetDistrict);
  const pc = o.postcode ? classifyPostcode(o.postcode) : null;
  const pcValid = pc && pc.level !== "invalid";

  // Exactly in the requested district → target.
  if (pcValid && targetDistrict && pc.district && pc.district === targetDistrict.district) {
    return { fidelity: "target_district", distanceM: 0, reason: `business postcode ${pc.value} is in ${targetDistrict.district}` };
  }

  // Distance from the delivery anchor when coordinates are available.
  if (o.latitude != null && o.longitude != null) {
    const d = haversineM(anchor.lat, anchor.lng, o.latitude, o.longitude);
    if (d <= nearRadiusM) return { fidelity: "near_target", distanceM: Math.round(d), reason: `${Math.round(d)}m from Southall anchor (≤${nearRadiusM}m) but outside ${ctx.targetDistrict}` };
    return { fidelity: "unrelated_location", distanceM: Math.round(d), reason: `${Math.round(d)}m from Southall anchor (>${nearRadiusM}m)` };
  }

  // No coordinates — fall back to postcode area proximity (weak signal).
  if (pcValid && targetDistrict && pc.area && pc.area === targetDistrict.area) {
    return { fidelity: "near_target", distanceM: null, reason: `same postcode area ${pc.area} as target (no coordinates)` };
  }
  if (pcValid) return { fidelity: "unrelated_location", distanceM: null, reason: `UK postcode ${pc.value} in a different area, no coordinates` };
  return { fidelity: "unverifiable_location", distanceM: null, reason: "no coordinates and no usable postcode" };
}

export interface FidelitySummary { target_district: number; near_target: number; unrelated_location: number; unverifiable_location: number }

export function summariseFidelity(outlets: SourceOutlet[], ctx: FidelityContext): { summary: FidelitySummary; verdicts: { outlet: SourceOutlet; verdict: FidelityVerdict }[] } {
  const verdicts = outlets.map((outlet) => ({ outlet, verdict: classifyLocationFidelity(outlet, ctx) }));
  const summary: FidelitySummary = { target_district: 0, near_target: 0, unrelated_location: 0, unverifiable_location: 0 };
  for (const v of verdicts) summary[v.verdict.fidelity]++;
  return { summary, verdicts };
}
