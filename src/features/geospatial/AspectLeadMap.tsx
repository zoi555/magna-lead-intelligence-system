"use client";

// AspectLeadMap — the ONE shared map implementation behind Coverage Map, Create New Run's
// territory/anchor planning, and a run's results view. Every mode uses the same MapLibre
// instance (via ExpandableMap), the same source config, the same territory-outline adapter,
// and the same anchor-overlay renderer — no separate map codebases per screen. Mode-specific
// behaviour (which overlays, whether clicking adds an anchor, the legend panel content) is
// the only thing that varies; the map plumbing itself does not.

import React from "react";
import type { MapOverlayDefinition, MapInstanceReference, MapFeatureSelection, MapViewState, TerritoryGeometry } from "@zoi555/geospatial-map";
import { ExpandableMap } from "./ExpandableMap";
import { aspectleadSourceConfig, NATIONAL_INITIAL_VIEW } from "./aspectlead-map-config";
import { runTerritoryGeometry } from "./aspectlead-territory";

export type AspectLeadMapMode = "coverage" | "run-planning" | "run-results";
export interface MapAnchor { id: string; label: string; lat: number; lng: number }

function anchorsOverlay(anchors: MapAnchor[], colour: string): MapOverlayDefinition {
  return {
    id: "run-anchors", label: "Anchors", group: "Run",
    source: {
      kind: "geojson",
      data: {
        type: "FeatureCollection",
        features: anchors.map((a) => ({ type: "Feature", properties: { label: a.label }, geometry: { type: "Point", coordinates: [a.lng, a.lat] } })),
      },
    } as MapOverlayDefinition["source"],
    layers: [{ id: "anchor-pts", type: "circle", paint: { "circle-radius": 7, "circle-color": colour, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } }],
    defaultVisible: true,
    legend: { items: [{ colour, label: "Anchor" }] },
    metadata: { count: anchors.length },
  };
}

export interface AspectLeadMapProps {
  mode: AspectLeadMapMode;
  /** Outline this run's territory (orange overlay) — used by run-planning and run-results. */
  territoryInput?: string;
  /** Anchor pins to plot — used by run-planning and run-results. */
  anchors?: MapAnchor[];
  /** Mode-specific overlays the caller supplies (e.g. coverage-map's lead-coverage points). */
  overlays?: MapOverlayDefinition[];
  /** Initial camera position — defaults to the shared national view. Coverage Map overrides
   *  this to open on its operational area rather than the whole of Great Britain. */
  initialView?: MapViewState;
  /** App-specific overlay/legend panel content, rendered above the map — kept out of the
   *  shared component so the map itself stays generic across modes. */
  legendPanel?: React.ReactNode;
  embeddedClassName?: string;
  /** run-planning only: clicking the map calls this with the clicked point (adds an anchor).
   *  Uses the raw MapLibre instance exposed via onMapReady — no change to the map package. */
  onMapClickPoint?: (pt: { lat: number; lng: number }) => void;
  onMapReady?: (h: MapInstanceReference) => void;
  onFeatureSelect?: (s: MapFeatureSelection | null) => void;
}

/** One shared component for all three map modes. No separate map codebase per screen. */
export function AspectLeadMap({
  mode, territoryInput, anchors = [], overlays = [], legendPanel, embeddedClassName, initialView,
  onMapClickPoint, onMapReady, onFeatureSelect,
}: AspectLeadMapProps) {
  const [territoryGeom, setTerritoryGeom] = React.useState<TerritoryGeometry[]>([]);
  const handleRef = React.useRef<MapInstanceReference | null>(null);

  React.useEffect(() => {
    let live = true;
    runTerritoryGeometry(territoryInput ?? "").then((g) => { if (live) setTerritoryGeom(g); });
    return () => { live = false; };
  }, [territoryInput]);

  const anchorColour = mode === "run-results" ? "#137a3b" : "#7C3AED";
  const allOverlays = anchors.length ? [...overlays, anchorsOverlay(anchors, anchorColour)] : overlays;

  const resetView = () => handleRef.current?.flyTo(initialView ?? NATIONAL_INITIAL_VIEW);

  const handleMapReady = (h: MapInstanceReference) => {
    handleRef.current = h;
    onMapReady?.(h);
    if (mode === "run-planning" && onMapClickPoint) {
      const raw = h.map as { on?: (event: string, cb: (e: { lngLat: { lat: number; lng: number } }) => void) => void } | undefined;
      raw?.on?.("click", (e) => onMapClickPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <ExpandableMap
        embeddedClassName={embeddedClassName}
        sources={aspectleadSourceConfig()}
        initialView={initialView ?? NATIONAL_INITIAL_VIEW}
        overlays={allOverlays}
        selectedTerritories={territoryGeom}
        onMapReady={handleMapReady}
        onFeatureSelect={onFeatureSelect}
        controls={{ layerDrawer: true, featureInspector: mode === "coverage", search: true, roads: true, feederRoads: mode !== "run-results", placesAndLabels: true, postcodes: true, transport: true, environment: true, nationalView: true, fitSelection: true }}
      >
        {legendPanel}
        <button type="button" onClick={resetView} className="absolute bottom-2.5 left-2.5 z-[7] inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
          ⟲ Reset view
        </button>
        {mode === "run-planning" && onMapClickPoint && (
          <div className="absolute bottom-2.5 right-2.5 z-[7] rounded-md border border-gray-300 bg-white/95 px-2.5 py-1.5 text-[11px] text-gray-600 shadow-sm">
            Click the map to add an anchor
          </div>
        )}
      </ExpandableMap>
      {territoryInput && territoryGeom.length === 0 && (
        <div className="absolute top-2.5 right-2.5 z-[7] rounded-md border border-amber-200 bg-amber-50/95 px-2.5 py-1.5 text-[11px] text-amber-700 shadow-sm">
          Boundary geometry unavailable for &ldquo;{territoryInput}&rdquo; — no invented outline is shown.
        </div>
      )}
    </div>
  );
}
