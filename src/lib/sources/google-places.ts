// Google Places enrichment — Vertical Slice 001 (PLACEHOLDER, key-ready, DISABLED).
//
// PAID API — disabled by default and never called in this slice. Returns a
// "not_configured" envelope. When enabled later, cost MUST be controlled with a
// tight field mask and per-run caps.
//
// Real API (LATER): Places API (New) — https://places.googleapis.com/v1/places:searchText
//   Auth: header `X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>` (server-side only).
//   COST CONTROL: header `X-Goog-FieldMask` restricts returned fields and billing SKU, e.g.
//     X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,
//                       places.nationalPhoneNumber,places.websiteUri,places.businessStatus
//   Never request unbounded fields. Enable only with GOOGLE_PLACES_ENABLED=1 + key + a run cap.

import type { GooglePlacesEnrichment } from "../pipeline/types";

export const GOOGLE_PLACES_API_BASE = "https://places.googleapis.com/v1";
export const GOOGLE_PLACES_API_KEY_ENV = "GOOGLE_PLACES_API_KEY";

/** The tight field mask we will use when this is enabled (documented; not sent yet). */
export const GOOGLE_PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
].join(",");

export function isGooglePlacesEnabled(): boolean {
  // Requires an explicit opt-in AND a key. Paid — stays off in this slice.
  return process.env.GOOGLE_PLACES_ENABLED === "1" && Boolean(process.env[GOOGLE_PLACES_API_KEY_ENV]);
}

const NOT_CONFIGURED: Omit<GooglePlacesEnrichment, "checked_at"> = {
  source: "google_places",
  status: "not_configured",
  confidence: 0,
  placeId: null,
  formattedPhone: null,
  website: null,
  businessStatus: null,
  notes: "Google Places is a PAID API — disabled by default in Vertical Slice 001. No live call.",
};

/** Placeholder enrichment. Always not_configured in this slice. */
export function enrichGooglePlaces(_businessName: string, _postcode: string, checkedAt: string | null = null): GooglePlacesEnrichment {
  return { ...NOT_CONFIGURED, checked_at: checkedAt };
}
