"use client";

// Portability demo — proves the @geospatial/map package works with ONLY generic
// configuration and no AspectLead operational data. It imports nothing from
// src/lib/discovery, src/features, leads, customers or the TW API. Any TypeScript/React
// app could render exactly this.

import React from "react";
import { GeospatialMap } from "@geospatial-map";
import type { GeospatialSourceConfig, FeederRoadEntry, MapOverlayDefinition } from "@geospatial-map";

// Generic, self-contained source config (points at whatever asset host you configure).
const DEMO_SOURCES: GeospatialSourceConfig = {
  tileBaseUrl: (process.env.NEXT_PUBLIC_MAP_ASSET_BASE_URL || "/map") + "/tiles",
  glyphBaseUrl: (process.env.NEXT_PUBLIC_MAP_ASSET_BASE_URL || "/map") + "/fonts/{fontstack}/{range}.pbf",
  sources: {
    zoomstack: "zoomstack.pmtiles", openRoads: "openroads.pmtiles", codePoint: "codepoint.pmtiles",
    openMapLocal: "funcsite.pmtiles", greenspace: "opengreenspace.pmtiles", rivers: "openrivers.pmtiles",
    postcodeLabels: (process.env.NEXT_PUBLIC_MAP_ASSET_BASE_URL || "/map") + "/postcode_labels.geojson",
  },
  attribution: [{ text: "Contains OS data © Crown copyright and database right 2026 · OGL v3.0" }],
};

// Clearly-labelled DEMONSTRATION feeders (not production defaults).
const DEMO_FEEDERS: FeederRoadEntry[] = [
  { id: "A316", displayName: "A316 (demo corridor)", roadNumber: "A316", roadName: null, sourceFeatureIds: [], source: "application", status: "included", priority: "primary", reason: "Demonstration feeder corridor" },
];

// A generic overlay — this is how ANY app injects its own geographic data.
const DEMO_OVERLAY: MapOverlayDefinition = {
  id: "demo-points", label: "Demo points", group: "Demo",
  source: { kind: "geojson", data: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-0.336, 51.447] }, properties: { name: "Demo site A" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-2.24, 53.48] }, properties: { name: "Demo site B" } },
  ] } },
  layers: [{ id: "pts", type: "circle", paint: { "circle-radius": 6, "circle-color": "#7c3aed", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } }],
  defaultVisible: true,
  legend: { items: [{ colour: "#7c3aed", label: "Demo points" }] },
};

export default function MapComponentDemoPage() {
  const [sel, setSel] = React.useState<string | null>(null);
  return (
    <div style={{ height: "calc(100vh - 104px)", width: "100%", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 6, background: "rgba(255,255,255,0.95)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", font: "12px system-ui", maxWidth: 260 }}>
        <b>Portable map demo</b>
        <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>Uses only <code>@geospatial-map</code> + generic config. No AspectLead data.</div>
        {sel && <div style={{ marginTop: 6 }}>Selected: <b>{sel}</b></div>}
      </div>
      <GeospatialMap
        sources={DEMO_SOURCES}
        initialView={{ longitude: -2.9, latitude: 54.3, zoom: 5.4 }}
        feederRoads={DEMO_FEEDERS}
        overlays={[DEMO_OVERLAY]}
        onFeatureSelect={(f) => setSel(f?.displayName ?? null)}
        controls={{ layerDrawer: true, search: true, featureInspector: true, roads: true, feederRoads: true, placesAndLabels: true, postcodes: true, transport: true, environment: true, nationalView: true }}
      />
    </div>
  );
}
