// AspectLead application adapter — lead-coverage overlays.
// Turns this app's operational lead data (from /api/tw-map-data) into GENERIC
// MapOverlayDefinition objects the portable map can render. The map package never
// imports this file — coverage is application-specific.

import type { MapOverlayDefinition } from "@geospatial/map";

interface Lead { id: string; lat?: number; lng?: number; has_coordinates?: boolean; halal_signal?: string }

const COLOURS = { clean: "#2563eb", manual: "#d97706", excluded: "#9ca3af" };

function pointsFC(leads: Lead[]) {
  return {
    type: "FeatureCollection",
    features: (leads || []).filter((l) => l.has_coordinates && l.lng != null && l.lat != null)
      .map((l) => ({ type: "Feature", geometry: { type: "Point", coordinates: [l.lng, l.lat] }, properties: { id: l.id, halal: l.halal_signal || "unknown" } })),
  };
}

function overlay(id: string, label: string, colour: string, leads: Lead[], defaultVisible: boolean): MapOverlayDefinition {
  return {
    id, label, group: "Lead coverage",
    source: { kind: "geojson", data: pointsFC(leads) },
    layers: [{ id: "pts", type: "circle", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 15, 6], "circle-color": colour, "circle-stroke-color": "#fff", "circle-stroke-width": 1, "circle-opacity": 0.85 } }],
    defaultVisible,
    legend: { items: [{ colour, label }] },
    metadata: { count: (leads || []).filter((l) => l.has_coordinates).length },
  };
}

// ── Delivery-coverage overlay (Part 7) ──────────────────────────────────────
// AspectLead-specific "current delivery coverage" area, expressed as a generic
// MapOverlayDefinition. Restrained outline + subtle fill, deliberately distinct from
// the orange run territory and the blue point selection.
//
// HONESTY: there is no CANONICAL Magna delivery-coverage geometry yet. The only asset
// available is public/map/delivery_boundary.geojson, which self-describes as
// "Mock delivery area (illustrative)". We wire the contract against it and label it a
// mock. The real source is recorded below and in docs so it can be swapped in later.
export const DELIVERY_COVERAGE_SOURCE_STATUS = {
  canonicalGeometryAvailable: false,
  currentAsset: "/map/delivery_boundary.geojson",
  assetKind: "mock" as const,
  note: "Illustrative mock over Code-Point-derived districts. Awaiting a confirmed operational delivery-area boundary (e.g. from routing/depot coverage export).",
};

const DELIVERY_COLOUR = "#0f766e"; // teal — distinct from territory (orange) and selection (blue)

/** Build the delivery-coverage overlay. Off by default; the host toggles visibility. */
export function deliveryCoverageOverlay(): MapOverlayDefinition {
  return {
    id: "delivery-coverage",
    label: "Current delivery coverage (mock)",
    group: "Operational",
    source: { kind: "geojson", data: DELIVERY_COVERAGE_SOURCE_STATUS.currentAsset },
    layers: [
      { id: "fill", type: "fill", paint: { "fill-color": DELIVERY_COLOUR, "fill-opacity": 0.08 } },
      { id: "outline", type: "line", paint: { "line-color": DELIVERY_COLOUR, "line-width": 1.6, "line-opacity": 0.7, "line-dasharray": [3, 2] } },
    ],
    defaultVisible: false,
    legend: { items: [{ colour: DELIVERY_COLOUR, label: "Delivery coverage (mock)" }] },
    metadata: { ...DELIVERY_COVERAGE_SOURCE_STATUS },
  };
}

/** Fetch the current TW run and build ready / manual / excluded coverage overlays. */
export async function loadCoverageOverlays(): Promise<{ overlays: MapOverlayDefinition[]; summary: Record<string, unknown> | null; error?: string }> {
  try {
    const res = await fetch("/api/tw-map-data");
    if (!res.ok) return { overlays: [], summary: null, error: `HTTP ${res.status}` };
    const api = await res.json();
    if (!api.ok) return { overlays: [], summary: null, error: api.error || "No TW run data" };
    return {
      overlays: [
        overlay("coverage-clean", "Ready to call", COLOURS.clean, api.clean_leads, true),
        overlay("coverage-manual", "Manual review", COLOURS.manual, api.manual_review_leads, true),
        overlay("coverage-excluded", "Excluded", COLOURS.excluded, api.excluded_leads, false),
      ],
      summary: api.summary ?? null,
    };
  } catch (e: unknown) {
    return { overlays: [], summary: null, error: String((e as Error)?.message || e) };
  }
}
