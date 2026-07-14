// Generic geospatial utilities — coordinates, bounds, validation, serialisation.
import type { MapBounds } from "../types";

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Web-Mercator tile x/y for a lon/lat at a zoom (used by tests + tooling). */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  return { x, y };
}

export function boundsFromCoords(coords: [number, number][]): MapBounds | null {
  if (!coords.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of coords) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  return { west: w, south: s, east: e, north: n };
}

export const isValidLngLat = (lng: number, lat: number) => Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

/** Great Britain bounding box (rough) — for "national view" fitting. */
export const GB_BOUNDS: MapBounds = { west: -8.65, south: 49.85, east: 1.77, north: 60.86 };
