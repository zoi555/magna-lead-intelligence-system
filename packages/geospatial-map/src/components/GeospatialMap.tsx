"use client";

// Portable national map. Generic: knows geography, rendering, controls, selection,
// layers and extension points — NOT leads, customers or runs. Operational data is
// supplied via `overlays` and `selectedTerritories`. Territory never restricts browsing.

import React from "react";
import type {
  GeospatialMapProps, MapProfile, MapOverlayDefinition, MapFeatureSelection, TerritoryGeometry, MapViewState,
} from "../types";
import { createMapStyle } from "../core/createMapStyle";
import { ensureMaplibre } from "../core/mapLifecycle";
import { registerPmtilesProtocol } from "../core/pmtilesProtocol";
import { layerVisibilityForProfile } from "../config/layerRegistry";
import { createDefaultMapProfile } from "../config/defaultMapProfile";
import { includedFeederNumbers } from "../feeder/feederEngine";
import { defaultFeatureInfoAdapter, createDefaultSearchAdapter } from "../adapters/adapters";
import { MapControlDrawer } from "./MapControlDrawer";
import { FeatureInspector } from "./FeatureInspector";
import { MapSearch } from "./MapSearch";
import { MapStatus } from "./MapStatus";

const GB: MapViewState = { longitude: -2.9, latitude: 54.3, zoom: 5.2 };
const HOVER_LAYERS = ["road-motorway", "road-a-primary", "road-a-other", "road-b", "road-minor", "road-local", "pc-hit", "label-city", "label-town", "label-village", "env-funcsite"];

export function GeospatialMap(props: GeospatialMapProps) {
  const { sources, initialView, controls = {}, className } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const appliedOverlays = React.useRef<Set<string>>(new Set());
  const [profile, setProfile] = React.useState<MapProfile>(props.profile ?? createDefaultMapProfile());
  const profileRef = React.useRef(profile); profileRef.current = profile;
  const feedersRef = React.useRef(props.feederRoads ?? []); feedersRef.current = props.feederRoads ?? [];
  const [status, setStatus] = React.useState("Loading map…");
  const [zoom, setZoom] = React.useState(initialView?.zoom ?? GB.zoom);
  const [selection, setSelection] = React.useState<MapFeatureSelection | null>(null);
  const featureInfo = props.featureInfo ?? defaultFeatureInfoAdapter;

  // ---- init ----
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibregl = await ensureMaplibre();
        if (cancelled || !containerRef.current) return;
        registerPmtilesProtocol(maplibregl);
        const view = initialView ?? GB;
        const map = new maplibregl.Map({
          container: containerRef.current, style: createMapStyle(sources, profileRef.current) as any,
          center: [view.longitude, view.latitude], zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0,
          minZoom: 4, maxZoom: 17, attributionControl: false,
        });
        mapRef.current = map;
        if (controls.zoomIndicator !== false) map.addControl(new maplibregl.NavigationControl({ showZoom: true, showCompass: false }), "bottom-right");
        if (controls.scale) map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: sources.attribution.map((a) => a.text).join(" · ") }), "bottom-right");

        map.on("zoom", () => { setZoom(Number(map.getZoom().toFixed(1))); props.onViewChange?.(readView(map)); });
        map.on("moveend", () => { props.onViewChange?.(readView(map)); updateFeeders(); });
        map.on("mousemove", (e: any) => onHover(map, e));
        map.on("click", (e: any) => onClick(map, e));
        map.on("error", (e: any) => { const m = e?.error?.message || String(e?.error || e); if (/pmtiles|glyph|tiles|font/i.test(m)) setStatus("Map asset error: " + m); });

        map.on("load", () => {
          if (cancelled) return;
          if (!map.getLayer("pc-hit")) map.addLayer({ id: "pc-hit", type: "circle", source: "codepoint", "source-layer": "codepoint", minzoom: 13, paint: { "circle-radius": 6, "circle-color": "#000", "circle-opacity": 0 } });
          if (!map.getSource("territory")) map.addSource("territory", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          if (!map.getLayer("territory-fill")) map.addLayer({ id: "territory-fill", type: "fill", source: "territory", paint: { "fill-color": "#ea580c", "fill-opacity": 0.06 } });
          if (!map.getLayer("territory-line")) map.addLayer({ id: "territory-line", type: "line", source: "territory", paint: { "line-color": "#ea580c", "line-width": 2, "line-dasharray": [2, 1] } });
          applyTerritories(props.selectedTerritories ?? []);
          (props.overlays ?? []).forEach(addOverlay);
          updateFeeders();
          setStatus("");
          props.onMapReady?.(makeHandle());
          // dev/test hooks (not set in production) for headless visual verification
          if (process.env.NODE_ENV !== "production") { (window as any).__map = map; (window as any).__mapReady = true; }
        });
      } catch (e: any) { if (!cancelled) setStatus("Map failed — " + (e?.message || e)); }
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- react to prop changes ----
  React.useEffect(() => { applyProfile(profile); props.onProfileChange?.(profile); /* eslint-disable-next-line */ }, [profile]);
  React.useEffect(() => { if (mapRef.current?.isStyleLoaded?.()) diffOverlays(props.overlays ?? []); /* eslint-disable-next-line */ }, [props.overlays]);
  React.useEffect(() => { if (mapRef.current) applyTerritories(props.selectedTerritories ?? []); /* eslint-disable-next-line */ }, [props.selectedTerritories]);
  React.useEffect(() => { updateFeeders(); /* eslint-disable-next-line */ }, [props.feederRoads]);

  // ---- helpers ----
  function readView(map: any) { const c = map.getCenter(); return { longitude: c.lng, latitude: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; }
  function applyProfile(p: MapProfile) {
    const map = mapRef.current; if (!map?.getLayer) return;
    const v = layerVisibilityForProfile(p);
    Object.entries(v).forEach(([id, onv]) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", onv ? "visible" : "none"); });
    if (map.getLayer("feeder-highlight")) map.setLayoutProperty("feeder-highlight", "visibility", p.feederRoads.showFeeders ? "visible" : "none");
  }
  function updateFeeders() {
    const map = mapRef.current; if (!map?.getSource) return;
    const nums = new Set(includedFeederNumbers(feedersRef.current));
    if (!nums.size) { map.getSource("feeders")?.setData({ type: "FeatureCollection", features: [] }); return; }
    const layers = ["road-motorway", "road-a-primary", "road-a-other", "road-b"].filter((l) => map.getLayer(l));
    const fs = map.queryRenderedFeatures({ layers }).filter((f: any) => nums.has(String(f.properties?.road_classification_number || "").toUpperCase()));
    map.getSource("feeders")?.setData({ type: "FeatureCollection", features: fs.map((f: any) => ({ type: "Feature", geometry: f.geometry, properties: {} })) });
  }
  function applyTerritories(ts: TerritoryGeometry[]) {
    const map = mapRef.current; if (!map?.getSource?.("territory")) return;
    map.getSource("territory").setData({ type: "FeatureCollection", features: ts.map((t) => ({ type: "Feature", geometry: (t.geojson as any)?.geometry ?? t.geojson, properties: { id: t.id } })) });
  }
  function addOverlay(o: MapOverlayDefinition) {
    const map = mapRef.current; if (!map || appliedOverlays.current.has(o.id)) return;
    const srcId = `ov:${o.id}`;
    if (!map.getSource(srcId)) map.addSource(srcId, o.source.kind === "geojson" ? { type: "geojson", data: o.source.data } : { type: "vector", url: o.source.url });
    o.layers.forEach((l) => { if (!map.getLayer(`ov:${o.id}:${l.id}`)) map.addLayer({ id: `ov:${o.id}:${l.id}`, type: l.type, source: srcId, ...(o.source.kind === "vector" ? { "source-layer": l.sourceLayer } : {}), ...(l.minzoom != null ? { minzoom: l.minzoom } : {}), ...(l.maxzoom != null ? { maxzoom: l.maxzoom } : {}), ...(l.filter ? { filter: l.filter } : {}), paint: l.paint ?? {}, layout: { ...(l.layout ?? {}), visibility: o.defaultVisible ? "visible" : "none" } }); });
    appliedOverlays.current.add(o.id);
  }
  function removeOverlay(id: string) {
    const map = mapRef.current; if (!map) return;
    map.getStyle()?.layers?.filter((l: any) => l.id.startsWith(`ov:${id}:`)).forEach((l: any) => map.getLayer(l.id) && map.removeLayer(l.id));
    if (map.getSource(`ov:${id}`)) map.removeSource(`ov:${id}`);
    appliedOverlays.current.delete(id);
  }
  function diffOverlays(next: MapOverlayDefinition[]) {
    const nextIds = new Set(next.map((o) => o.id));
    [...appliedOverlays.current].forEach((id) => { if (!nextIds.has(id)) removeOverlay(id); });
    next.forEach(addOverlay);
  }
  function setOverlayVisibility(id: string, visible: boolean) {
    const map = mapRef.current; if (!map) return;
    map.getStyle()?.layers?.filter((l: any) => l.id.startsWith(`ov:${id}:`)).forEach((l: any) => map.getLayer(l.id) && map.setLayoutProperty(l.id, "visibility", visible ? "visible" : "none"));
  }
  function makeHandle() {
    const map = mapRef.current;
    return {
      map, addOverlay, removeOverlay, setOverlayVisibility,
      setLayerVisibility: (id: string, v: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none"),
      fitBounds: (b: any, pad = 40) => map.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: pad }),
      flyTo: (v: any) => map.flyTo({ center: [v.longitude, v.latitude], zoom: v.zoom }),
    };
  }
  function onHover(map: any, e: any) {
    const fs = map.queryRenderedFeatures(e.point, { layers: HOVER_LAYERS.filter((l) => map.getLayer(l)) });
    if (!fs.length) { props.onFeatureHover?.(null); map.getSource("hover")?.setData({ type: "FeatureCollection", features: [] }); return; }
    const sel = featureInfo.describe(fs[0]); props.onFeatureHover?.(sel);
    if (fs[0].geometry) map.getSource("hover")?.setData({ type: "Feature", geometry: fs[0].geometry, properties: {} });
  }
  function onClick(map: any, e: any) {
    const fs = map.queryRenderedFeatures(e.point, { layers: HOVER_LAYERS.filter((l) => map.getLayer(l)) });
    if (!fs.length) { setSelection(null); props.onFeatureSelect?.(null); map.getSource("selection")?.setData({ type: "FeatureCollection", features: [] }); return; }
    const sel = featureInfo.describe(fs[0]); setSelection(sel); props.onFeatureSelect?.(sel);
    if (fs[0].geometry) map.getSource("selection")?.setData({ type: "Feature", geometry: fs[0].geometry, properties: {} });
  }
  const goNational = () => mapRef.current?.flyTo({ center: [GB.longitude, GB.latitude], zoom: GB.zoom, duration: 800 });

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} data-testid="geospatial-map" style={{ position: "absolute", inset: 0 }} />
      {controls.layerDrawer !== false && (
        <MapControlDrawer profile={profile} onChange={setProfile} capabilities={controls} feederRoads={props.feederRoads ?? []}
          onFeederChange={props.onFeederRoadsChange} getMap={() => mapRef.current} onUpdateFeeders={updateFeeders} />
      )}
      {controls.search && <MapSearch adapter={props.search ?? createDefaultSearchAdapter(() => mapRef.current)} onGo={(r) => mapRef.current?.flyTo({ center: [r.longitude, r.latitude], zoom: r.zoom ?? 13 })} />}
      {controls.nationalView !== false && <button onClick={goNational} style={{ position: "absolute", top: 10, right: 10, zIndex: 5, background: "#fff", border: "1px solid #d1d5db", borderRadius: 7, padding: "5px 9px", fontSize: 12, cursor: "pointer" }}>National view</button>}
      {controls.zoomIndicator !== false && <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 4, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#374151" }}>zoom {zoom}</div>}
      {controls.featureInspector !== false && <FeatureInspector selection={selection} />}
      <MapStatus status={status} />
    </div>
  );
}
