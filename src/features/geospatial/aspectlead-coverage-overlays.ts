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
