"use client";

// Coverage Map — the shared portable @geospatial/map with AspectLead lead-coverage
// overlays layered on top. The geographic map (roads, labels, postcodes) is generic and
// lead-independent; only the coverage points come from the current TW run via an adapter.

import React from "react";
import { GeospatialMap } from "@geospatial-map";
import type { MapOverlayDefinition, MapInstanceReference, MapFeatureSelection } from "@geospatial-map";
import { aspectleadSourceConfig } from "@/features/geospatial/aspectlead-map-config";
import { loadCoverageOverlays } from "@/features/geospatial/aspectlead-coverage-overlays";

const TW_VIEW = { longitude: -0.336, latitude: 51.447, zoom: 12 };

export default function CoverageMapPage() {
  const [overlays, setOverlays] = React.useState<MapOverlayDefinition[]>([]);
  const [summary, setSummary] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [vis, setVis] = React.useState<Record<string, boolean>>({});
  const [sel, setSel] = React.useState<MapFeatureSelection | null>(null);
  const handleRef = React.useRef<MapInstanceReference | null>(null);

  React.useEffect(() => {
    loadCoverageOverlays().then((r) => {
      setOverlays(r.overlays); setSummary(r.summary); setError(r.error ?? null);
      setVis(Object.fromEntries(r.overlays.map((o) => [o.id, o.defaultVisible])));
    });
  }, []);

  const toggle = (id: string) => {
    const next = !vis[id]; setVis((v) => ({ ...v, [id]: next }));
    handleRef.current?.setOverlayVisibility(id, next);
  };

  return (
    <div style={{ height: "calc(100vh - 104px)", width: "100%", position: "relative" }}>
      <GeospatialMap
        sources={aspectleadSourceConfig()}
        initialView={TW_VIEW}
        overlays={overlays}
        onMapReady={(h) => { handleRef.current = h; }}
        onFeatureSelect={setSel}
        controls={{ layerDrawer: true, featureInspector: false, search: true, roads: true, feederRoads: true, placesAndLabels: true, postcodes: true, transport: true, environment: true, nationalView: true }}
      />

      {/* AspectLead coverage panel (operational overlay controls — application-specific) */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 6, width: 236, background: "rgba(255,255,255,0.97)", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", font: "13px system-ui, sans-serif", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
        <div style={{ fontWeight: 700 }}>TW Independent run — coverage</div>
        {error && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>{error}</div>}
        {summary && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            {String((summary as any).total ?? "")} total · {String((summary as any).clean ?? "")} ready · {String((summary as any).manual ?? "")} manual · {String((summary as any).excluded ?? "")} excluded
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          {overlays.map((o) => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
              <input type="checkbox" checked={!!vis[o.id]} onChange={() => toggle(o.id)} />
              <span style={{ width: 11, height: 11, borderRadius: 11, background: o.legend?.items[0]?.colour, display: "inline-block" }} />
              {o.label}<span style={{ color: "#9ca3af", fontSize: 10 }}>({String((o.metadata as any)?.count ?? 0)})</span>
            </label>
          ))}
        </div>
        {sel && <div style={{ marginTop: 8, fontSize: 11, borderTop: "1px solid #eee", paddingTop: 6 }}><b>{sel.displayName}</b> · {sel.featureType}</div>}
        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>Geographic labels are independent of lead data. The map is national; coverage points are the current run only.</div>
      </div>
    </div>
  );
}
