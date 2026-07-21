"use client";

// Coverage Map — the shared portable @zoi555/geospatial-map with AspectLead lead-coverage
// overlays layered on top. The geographic map (roads, labels, postcodes) is generic and
// lead-independent; only the coverage points come from the current TW run via an adapter.
// The delivery-coverage area is an application overlay (currently a labelled mock).

import React from "react";
import type { MapOverlayDefinition, MapInstanceReference, MapFeatureSelection } from "@zoi555/geospatial-map";
import { AspectLeadMap } from "@/features/geospatial/AspectLeadMap";
import { loadCoverageOverlays, deliveryCoverageOverlay } from "@/features/geospatial/aspectlead-coverage-overlays";

export default function CoverageMapPage() {
  const [overlays, setOverlays] = React.useState<MapOverlayDefinition[]>([deliveryCoverageOverlay()]);
  const [summary, setSummary] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [vis, setVis] = React.useState<Record<string, boolean>>({});
  const [sel, setSel] = React.useState<MapFeatureSelection | null>(null);
  const handleRef = React.useRef<MapInstanceReference | null>(null);

  React.useEffect(() => {
    loadCoverageOverlays().then((r) => {
      // Delivery coverage (application operational overlay) sits beneath the lead points.
      const all = [deliveryCoverageOverlay(), ...r.overlays];
      setOverlays(all); setSummary(r.summary); setError(r.error ?? null);
      setVis(Object.fromEntries(all.map((o) => [o.id, o.defaultVisible])));
    });
  }, []);

  const toggle = (id: string) => {
    const next = !vis[id]; setVis((v) => ({ ...v, [id]: next }));
    handleRef.current?.setOverlayVisibility(id, next);
  };

  const groups = ["Operational", "Lead coverage"];
  const TW_VIEW = { longitude: -0.336, latitude: 51.447, zoom: 12 };

  return (
    <div style={{ height: "calc(100vh - 104px)", width: "100%", position: "relative" }}>
      <AspectLeadMap
        mode="coverage"
        embeddedClassName="h-full"
        initialView={TW_VIEW}
        overlays={overlays}
        onMapReady={(h) => { handleRef.current = h; }}
        onFeatureSelect={setSel}
        legendPanel={
          <div style={{ position: "absolute", top: 10, right: 10, zIndex: 6, width: 244, background: "rgba(255,255,255,0.97)", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", font: "13px system-ui, sans-serif", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
            <div style={{ fontWeight: 700 }}>TW Independent run — coverage</div>
            {error && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>{error}</div>}
            {summary && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                {String((summary as any).total ?? "")} total · {String((summary as any).clean ?? "")} ready · {String((summary as any).manual ?? "")} manual · {String((summary as any).excluded ?? "")} excluded
              </div>
            )}
            {groups.map((g) => {
              const inGroup = overlays.filter((o) => o.group === g);
              if (!inGroup.length) return null;
              return (
                <div key={g} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "#9ca3af", marginBottom: 2 }}>{g}</div>
                  {inGroup.map((o) => (
                    <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
                      <input type="checkbox" checked={!!vis[o.id]} onChange={() => toggle(o.id)} />
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: o.legend?.items[0]?.colour, display: "inline-block" }} />
                      {o.label}
                      {typeof (o.metadata as any)?.count === "number" && <span style={{ color: "#9ca3af", fontSize: 10 }}>({String((o.metadata as any).count)})</span>}
                    </label>
                  ))}
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 10, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 6px" }}>
              Delivery coverage is an <b>illustrative mock</b>, not the confirmed delivery area. Awaiting a canonical boundary source.
            </div>
            {sel && <div style={{ marginTop: 8, fontSize: 11, borderTop: "1px solid #eee", paddingTop: 6 }}><b>{sel.displayName}</b> · {sel.featureType}</div>}
            <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>Geographic labels are independent of lead data. The map is national; coverage points are the current run only.</div>
          </div>
        }
      />
    </div>
  );
}
