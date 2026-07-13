"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { PageHeader } from "@/components/PageHeader";

// TW coverage map — MapLibre GL + real OS geometry (from the accepted map POC),
// now driven by the INDEPENDENT review workflow (clean / manual review / excluded)
// via /api/tw-map-data. Sales-safe data only.

interface Lead { id: string; kind: string; business_name: string; postcode: string; postcode_area: string; postcode_district: string; postcode_sector: string; full_postcode: string; lat: number | null; lng: number | null; has_coordinates: boolean; [k: string]: any }
interface ApiData { ok: boolean; error?: string; mode: string; warning?: string; summary: any; clean_leads: Lead[]; manual_review_leads: Lead[]; excluded_leads: Lead[]; districts: string[]; sectors: string[]; fullPostcodes: string[]; metadata: any }

type Gran = "pc_areas" | "pc_districts" | "pc_sectors" | "full";
type Mode = "clean" | "manual" | "excluded";
const COV = ["rgba(84,120,205,0.34)", "rgba(98,96,196,0.5)", "rgba(118,74,186,0.62)", "rgba(138,58,176,0.76)", "rgba(156,42,166,0.9)"];
const HALAL: Record<string, string> = { confirmed: "#16A34A", likely: "#F59E0B", not_detected: "#64748B", unknown: "#94A3B8" };
const KEY_FEEDERS = ["A316", "A30", "A4", "A312", "A315", "A308", "A305", "A244", "A320", "A310", "A311", "A314"];
const loadScript = (src: string) => new Promise<void>((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
const loadCss = (href: string) => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); } };
function eachCoord(g: any, cb: (c: number[]) => void) { const walk = (a: any) => { if (typeof a[0] === "number") cb(a); else a.forEach(walk); }; walk(g.coordinates); }
function codeAt(l: Lead, g: Gran): string { if (g === "pc_areas") return l.postcode_area; if (g === "pc_districts") return l.postcode_district; if (g === "pc_sectors") return l.postcode_sector; return l.full_postcode; }

export default function CoverageMapPage() {
  const mapRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const geomRef = React.useRef<{ pc_areas?: any; pc_districts?: any; pc_sectors?: any; roads?: any }>({});
  const shieldsRef = React.useRef<any[]>([]);
  const [status, setStatus] = React.useState("Loading map…");
  const [data, setData] = React.useState<ApiData | null>(null);
  const [gran, setGran] = React.useState<Gran>("pc_districts");
  const [roadMode, setRoadMode] = React.useState("feeder");
  const [mode, setMode] = React.useState<Mode>("clean");
  const [sel, setSel] = React.useState<{ code?: string; lead?: Lead } | null>(null);
  const [q, setQ] = React.useState("");
  const dataRef = React.useRef<ApiData | null>(null); dataRef.current = data;
  const modeRef = React.useRef<Mode>("clean"); modeRef.current = mode;
  const granRef = React.useRef<Gran>("pc_districts"); granRef.current = gran;

  const setForMode = (d: ApiData, m: Mode) => m === "clean" ? d.clean_leads : m === "manual" ? d.manual_review_leads : d.excluded_leads;

  const mergedFC = React.useCallback((g: Gran, d: ApiData) => {
    const src = g === "pc_areas" ? geomRef.current.pc_areas : g === "pc_sectors" ? geomRef.current.pc_sectors : geomRef.current.pc_districts;
    if (!src) return { type: "FeatureCollection", features: [] };
    const cc = new Map<string, number>(); d.clean_leads.forEach((l) => cc.set(codeAt(l, g), (cc.get(codeAt(l, g)) ?? 0) + 1));
    return { type: "FeatureCollection", features: src.features.map((f: any) => { const code = f.properties.code; return { ...f, properties: { ...f.properties, count: cc.get(code) ?? 0, tw: String(code).toUpperCase().startsWith("TW") ? 1 : 0 } }; }) };
  }, []);
  const pointsFC = (leads: Lead[]) => ({ type: "FeatureCollection", features: leads.filter((l) => l.has_coordinates).map((l) => ({ type: "Feature", geometry: { type: "Point", coordinates: [l.lng, l.lat] }, properties: { id: l.id, halal: l.halal_signal || "unknown" } })) });

  // Fetch libs + geometry + data. Does NOT create the map here — the container is
  // mounted by React first, then a separate effect (keyed on `data`) initialises it.
  const jget = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → HTTP ${r.status} ${r.statusText}`); return r.json(); };
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        loadCss("/vendor/maplibre-gl.css");
        try { await loadScript("/vendor/maplibre-gl.js"); } catch { throw new Error("Failed to load /vendor/maplibre-gl.js (MapLibre library missing)"); }
        if (!(window as any).maplibregl) throw new Error("MapLibre loaded but window.maplibregl is undefined");
        const api = await jget("/api/tw-map-data").catch((e) => { throw new Error("Data API failed: " + e.message); });
        const areas = await jget("/map/pc_areas.geojson");
        const districts = await jget("/map/pc_districts.geojson");
        const sectors = await jget("/map/pc_sectors.geojson");
        const roads = await jget("/map/roads.geojson");
        if (cancelled) return;
        if (!api.ok) { setStatus(api.error || "No TW data. Run npm run leads:tw-platform-first"); return; }
        geomRef.current = { pc_areas: areas, pc_districts: districts, pc_sectors: sectors, roads };
        setData(api); dataRef.current = api; // map is created by the effect below, once the container exists
      } catch (e: any) { setStatus("Map failed to load — " + (e?.message || e)); }
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create the MapLibre map ONLY after `data` is set and the container is in the DOM.
  React.useEffect(() => {
    if (!data || mapRef.current || !containerRef.current || !(window as any).maplibregl) return;
    try { initMap(data); } catch (e: any) { setStatus("Map init error — " + (e?.message || e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const fillColor = (): any => ["case", ["==", ["get", "count"], 0], ["case", ["==", ["get", "tw"], 1], "rgba(0,0,0,0)", "rgba(148,163,184,0.05)"], ["step", ["get", "count"], COV[0], 3, COV[1], 8, COV[2], 16, COV[3], 30, COV[4]]];
  const circleColor = (m: Mode): any => m === "clean" ? ["match", ["get", "halal"], "confirmed", HALAL.confirmed, "likely", HALAL.likely, "not_detected", HALAL.not_detected, HALAL.unknown] : m === "manual" ? "#e8961a" : "#6b7688";

  function initMap(api: ApiData) {
    const maplibregl: any = (window as any).maplibregl; if (!maplibregl || !containerRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0e1826" } }] }, center: [-0.35, 51.44], zoom: 10.6, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showZoom: true, showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Contains OS data © Crown copyright & database right 2026 · Royal Mail © · National Statistics © · postcode polygons from OS Code-Point Open (feasibility layer)" }), "bottom-right");
    map.on("load", () => {
      map.addSource("pc", { type: "geojson", data: mergedFC("pc_districts", api), generateId: true });
      map.addLayer({ id: "pc-fill", source: "pc", type: "fill", paint: { "fill-color": fillColor(), "fill-opacity": 1 } });
      map.addLayer({ id: "pc-line", source: "pc", type: "line", paint: { "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#f59e0b", ["==", ["get", "tw"], 1], "#3a4b63", "#26324a"], "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.2, ["==", ["get", "tw"], 1], 0.9, 0.5], "line-dasharray": ["case", ["==", ["get", "tw"], 1], ["literal", [1, 0]], ["literal", [2, 2]]] } });
      map.addSource("roads", { type: "geojson", data: geomRef.current.roads });
      map.addLayer({ id: "road-a", source: "roads", type: "line", filter: ["==", ["get", "roadClass"], "A Road"], paint: { "line-color": "#3a9e63", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 2.6] } });
      map.addLayer({ id: "road-m", source: "roads", type: "line", filter: ["==", ["get", "roadClass"], "Motorway"], paint: { "line-color": "#4f79c4", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 5.5] } });
      map.addSource("pts", { type: "geojson", data: pointsFC(api.clean_leads) });
      map.addLayer({ id: "pts", source: "pts", type: "circle", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.4, 14, 5], "circle-color": circleColor("clean"), "circle-stroke-color": "#0e1826", "circle-stroke-width": 0.7, "circle-opacity": 0.92 } });
      addRoadShields(map); applyRoadMode(map, "feeder"); fitTo(map, "pc_districts");
      let hoverId: any = null, selId: any = null;
      const tip = document.getElementById("tw-tip");
      map.on("mousemove", "pc-fill", (e: any) => { map.getCanvas().style.cursor = "pointer"; const f = e.features[0]; if (hoverId !== null) map.setFeatureState({ source: "pc", id: hoverId }, { hover: false }); hoverId = f.id; map.setFeatureState({ source: "pc", id: hoverId }, { hover: true }); const d = dataRef.current; if (tip && d) { const code = f.properties.code; const cl = d.clean_leads.filter((l) => codeAt(l, granRef.current) === code).length; const mr = d.manual_review_leads.filter((l) => codeAt(l, granRef.current) === code).length; const ex = d.excluded_leads.filter((l) => codeAt(l, granRef.current) === code).length; tip.style.display = "block"; tip.style.left = e.point.x + 14 + "px"; tip.style.top = e.point.y + 14 + "px"; tip.innerHTML = `<b>${code}</b><br>clean ${cl} · review ${mr} · excluded ${ex}`; } });
      map.on("mouseleave", "pc-fill", () => { map.getCanvas().style.cursor = ""; if (hoverId !== null) map.setFeatureState({ source: "pc", id: hoverId }, { hover: false }); hoverId = null; if (tip) tip.style.display = "none"; });
      map.on("click", "pc-fill", (e: any) => { const f = e.features[0]; if (selId !== null) map.setFeatureState({ source: "pc", id: selId }, { selected: false }); selId = f.id; map.setFeatureState({ source: "pc", id: selId }, { selected: true }); if (String(f.properties.code).toUpperCase().startsWith("TW")) setSel({ code: f.properties.code }); });
      map.on("click", "pts", (e: any) => { const id = e.features[0].properties.id; const d = dataRef.current; const l = d && setForMode(d, modeRef.current).find((x) => x.id === id); if (l) setSel({ lead: l }); });
      setStatus("");
    });
    map.on("error", (e: any) => { if (!mapRef.current?.loaded()) setStatus("MapLibre error: " + (e?.error?.message || "unknown")); });
  }
  function shouldShowRoad(road: { kind: string; num: string; primary?: boolean }, m: string): boolean { if (road.kind === "motorway") return true; if (m === "hide") return false; if (m === "all") return true; if (m === "feeder") return KEY_FEEDERS.includes(road.num); if (m === "primary") return !!road.primary || KEY_FEEDERS.includes(road.num); return KEY_FEEDERS.includes(road.num); }
  function applyRoadMode(map: any, m: string) { if (!map.getLayer) return; map.setLayoutProperty("road-m", "visibility", "visible"); let aVis = true, aFilter: any = ["==", ["get", "roadClass"], "A Road"]; if (m === "hide") aVis = false; else if (m === "feeder") aFilter = ["all", ["==", ["get", "roadClass"], "A Road"], ["in", ["get", "roadNumber"], ["literal", KEY_FEEDERS]]]; else if (m === "primary") aFilter = ["all", ["==", ["get", "roadClass"], "A Road"], ["any", ["==", ["get", "primary"], 1], ["in", ["get", "roadNumber"], ["literal", KEY_FEEDERS]]]]; map.setFilter("road-a", aFilter); map.setLayoutProperty("road-a", "visibility", aVis ? "visible" : "none"); shieldsRef.current.forEach((o: any) => { o.marker.getElement().style.display = shouldShowRoad({ kind: o.cls === "Motorway" ? "motorway" : "a", num: o.num, primary: o.primary }, m) ? "" : "none"; }); }
  function addRoadShields(map: any) { const maplibregl: any = (window as any).maplibregl; const roads = geomRef.current.roads; if (!roads) return; const best: Record<string, any> = {}; roads.features.forEach((f: any) => { const num = f.properties.roadNumber; if (!num) return; const coords = f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat(); const primary = best[num]?.primary || f.properties.primary === 1; if (!best[num] || coords.length > best[num].len) best[num] = { len: coords.length, mid: coords[Math.floor(coords.length / 2)], cls: f.properties.roadClass, primary }; }); Object.entries(best).forEach(([num, info]: any) => { const el = document.createElement("div"); el.textContent = num; el.style.cssText = `font:600 10px ui-monospace,Menlo,monospace;color:#fff;padding:1px 4px;border-radius:3px;background:${info.cls === "Motorway" ? "#4f79c4" : "#2f7d4f"};box-shadow:0 1px 3px rgba(0,0,0,.4)`; const m = new maplibregl.Marker({ element: el }).setLngLat(info.mid).addTo(map); shieldsRef.current.push({ num, cls: info.cls, primary: info.primary, marker: m }); }); }
  function fitTo(map: any, g: Gran) { const maplibregl: any = (window as any).maplibregl; const src = g === "pc_areas" ? geomRef.current.pc_areas : g === "pc_sectors" ? geomRef.current.pc_sectors : geomRef.current.pc_districts; if (!src) return; const b = new maplibregl.LngLatBounds(); src.features.forEach((f: any) => { if (String(f.properties.code).toUpperCase().startsWith("TW")) eachCoord(f.geometry, (c: any) => b.extend(c)); }); if (!b.isEmpty()) map.fitBounds(b, { padding: 48, duration: 500 }); }

  React.useEffect(() => { const map = mapRef.current, d = dataRef.current; if (!map || !d || !map.getSource) return; if (gran === "full") { map.setLayoutProperty("pc-fill", "visibility", "none"); map.setLayoutProperty("pc-line", "visibility", "none"); } else { map.setLayoutProperty("pc-fill", "visibility", "visible"); map.setLayoutProperty("pc-line", "visibility", "visible"); map.getSource("pc").setData(mergedFC(gran, d)); fitTo(map, gran); } setSel(null); /* eslint-disable-next-line */ }, [gran]);
  React.useEffect(() => { const map = mapRef.current; if (map && map.getLayer) applyRoadMode(map, roadMode); }, [roadMode]);
  React.useEffect(() => { const map = mapRef.current, d = dataRef.current; if (!map || !d || !map.getSource("pts")) return; map.getSource("pts").setData(pointsFC(setForMode(d, mode))); map.setPaintProperty("pts", "circle-color", circleColor(mode)); map.setPaintProperty("pts", "circle-opacity", mode === "excluded" ? 0.5 : 0.92); setSel(null); /* eslint-disable-next-line */ }, [mode]);

  const activeLeads = data ? setForMode(data, mode) : [];
  const selLeads = React.useMemo(() => { if (!sel?.code || !data) return []; const g = gran === "full" ? "pc_sectors" : gran; return activeLeads.filter((l) => codeAt(l, g as Gran) === sel.code); }, [sel, activeLeads, gran, data]);
  const searchHits = React.useMemo(() => { const s = q.trim().toLowerCase(); if (!s || !data) return []; return [...data.clean_leads, ...data.manual_review_leads, ...data.excluded_leads].filter((l) => l.business_name.toLowerCase().includes(s) || l.postcode.toLowerCase().includes(s)).slice(0, 40); }, [q, data]);
  const sm = data?.summary;
  // NOTE: never early-return before the map container renders — otherwise the
  // container ref is null when init runs and the map is stuck on "Loading map…".

  return (
    <div className="space-y-3">
      <PageHeader title="TW Coverage Map" subtitle="Independent restaurant/cafe coverage for postcode area TW — MapLibre + OS Code-Point Open polygons + OS Open Roads." />
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-[#16a34a55] bg-[#16a34a12] px-3 py-2 text-[12.5px]">
        <span className="inline-block h-2 w-2 rounded-full bg-[#16a34a]" /><b className="text-[#137a3b]">LIVE TW INDEPENDENT WORKFLOW</b>
        <span className="text-muted">Using cleaned sales-safe export and manual-review workflow.{data?.metadata?.fallback_used ? " (fallback: platform-first data)" : ""}</span>
      </div>
      {sm && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Stat label="Clean ready-to-call" value={String(sm.clean_ready_to_call)} good /><Stat label="Manual review" value={String(sm.manual_review)} />
          <Stat label="Excluded" value={String(sm.excluded)} /><Stat label="Research-phone" value={String(sm.research_phone)} />
          <Stat label="Avg completeness" value={String(sm.average_completeness_clean)} good /><Stat label="FSA-only leakage" value="0" good />
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[1fr_370px]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3 rounded-card border border-bordergrey bg-card p-2.5 shadow-soft">
            <Ctrl label="Layer"><Seg opts={[["clean", "Clean leads"], ["manual", "Manual review"], ["excluded", "Excluded audit"]]} value={mode} onChange={(v) => setMode(v as Mode)} /></Ctrl>
            <Ctrl label="Granularity"><Seg opts={[["pc_areas", "Area"], ["pc_districts", "District"], ["pc_sectors", "Sector"], ["full", "Full postcode"]]} value={gran} onChange={(v) => setGran(v as Gran)} /></Ctrl>
            <Ctrl label="Roads"><select value={roadMode} onChange={(e) => setRoadMode(e.target.value)} className="rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] outline-none focus:border-actionblue"><option value="hide">Motorways only</option><option value="feeder">Feeder A roads</option><option value="primary">Primary A roads</option><option value="all">All A roads</option></select></Ctrl>
            <Ctrl label="Fit"><button onClick={() => { if (mapRef.current) fitTo(mapRef.current, gran === "full" ? "pc_districts" : gran); }} className="rounded-btn border border-bordergrey px-2.5 py-1.5 text-[13px] hover:bg-[#f0f3f7]">Fit TW</button></Ctrl>
            <Ctrl label="Search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="postcode or business…" className="w-[170px] rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] outline-none focus:border-actionblue" /></Ctrl>
          </div>
          <div className="relative overflow-hidden rounded-card border border-bordergrey shadow-soft" style={{ height: "min(64vh, 700px)" }}>
            <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
            <div id="tw-tip" style={{ position: "absolute", zIndex: 9, background: "#1f2933", color: "#fff", fontSize: 12, padding: "6px 8px", borderRadius: 4, pointerEvents: "none", display: "none" }} />
            {status && <div className="absolute inset-0 flex items-center justify-center bg-[#0e1826] text-[14px] text-[#9fb0c4]">{status}</div>}
            <div className="absolute right-2 top-2 rounded-md bg-[#0e1826ee] p-2 text-[10.5px] text-[#c7d2e0] shadow-soft" style={{ border: "1px solid #26324a" }}>
              <div className="mb-1 font-semibold uppercase tracking-wide text-[#8ea1bb]">Clean leads / {gran === "pc_sectors" ? "sector" : gran === "pc_areas" ? "area" : "district"}</div>
              {["1–2", "3–7", "8–15", "16–29", "30+"].map((lab, i) => (<div key={lab} className="flex items-center gap-1.5"><span style={{ width: 12, height: 10, background: COV[i], display: "inline-block", borderRadius: 2 }} />{lab}</div>))}
              <div className="mt-1 border-t border-[#26324a] pt-1">Points: <b>{mode}</b> — {mode === "clean" ? "halal ● conf ● likely" : mode === "manual" ? "amber = review" : "grey = excluded"}</div>
            </div>
          </div>
          <p className="text-[11.5px] text-muted">Clean file is for sales · Manual review is for management/admin decisioning · Excluded is retained for audit. District/sector polygons are real OS geometry; full-postcode plots points. Context areas UB/HA/W/SW/SL shown but not counted.</p>
        </div>
        <div className="space-y-2">
          {q.trim() && (<div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft"><div className="mb-1 text-[12px] font-semibold text-ink">Search “{q}” ({searchHits.length})</div><div className="max-h-40 overflow-y-auto">{searchHits.map((l) => (<button key={l.id} onClick={() => { setMode(l.kind as Mode); setSel({ lead: l }); if (mapRef.current && l.has_coordinates) mapRef.current.flyTo({ center: [l.lng, l.lat], zoom: 14 }); }} className="flex w-full items-center justify-between border-b border-bordergrey py-1 text-left text-[12.5px] hover:bg-[#f5f7fa]"><span className="truncate text-ink">{l.business_name}</span><span className="ml-2 font-mono text-muted">{l.kind[0].toUpperCase()} · {l.postcode}</span></button>))}</div></div>)}
          {sel?.lead ? <LeadDetail l={sel.lead} onBack={() => setSel(null)} /> : sel?.code && data ? <FeaturePanel code={sel.code} data={data} gran={gran} mode={mode} leads={selLeads} onClose={() => setSel(null)} /> : <div className="rounded-card border border-bordergrey bg-card p-4 text-[13px] text-muted shadow-soft">Click a TW district/sector to see its <b>{mode}</b> rows and clean/review/excluded counts. Switch the Layer control to Clean / Manual review / Excluded audit.</div>}
        </div>
      </div>
    </div>
  );
}

function FeaturePanel({ code, data, gran, mode, leads, onClose }: { code: string; data: ApiData; gran: Gran; mode: Mode; leads: Lead[]; onClose: () => void }) {
  const g = gran === "full" ? "pc_sectors" : gran;
  const cl = data.clean_leads.filter((l) => codeAt(l, g as Gran) === code).length;
  const mr = data.manual_review_leads.filter((l) => codeAt(l, g as Gran) === code).length;
  const ex = data.excluded_leads.filter((l) => codeAt(l, g as Gran) === code).length;
  return (
    <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft">
      <div className="mb-1 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{code}</h3><button onClick={onClose} className="text-[11px] text-actionblue">clear</button></div>
      <div className="mb-2 flex gap-2 text-[11.5px]"><Badge tone="#137a3b">clean {cl}</Badge><Badge tone="#b45309">review {mr}</Badge><Badge tone="#64748b">excluded {ex}</Badge></div>
      <div className="text-[12px] font-semibold text-ink">{mode} rows ({leads.length})</div>
      <div className="mt-1 max-h-80 overflow-y-auto">
        {leads.slice(0, 60).map((l) => (
          <div key={l.id} className="border-b border-bordergrey py-1 text-[12px]">
            <div className="flex justify-between"><span className="truncate font-medium text-ink">{l.business_name}</span><span className="ml-2 shrink-0 font-mono text-muted">{l.postcode}</span></div>
            {mode === "clean" && <div className="text-[11px] text-muted">{l.phone || "no phone"} · {l.category_focus}{l.halal_signal === "confirmed" || l.halal_signal === "likely" ? ` · halal ${l.halal_signal}` : ""}{l.google_rating ? ` · ${l.google_rating}★` : ""}</div>}
            {mode === "manual" && <div className="text-[11px] text-[#b45309]">{l.suggested_decision} · {l.review_reason_codes}</div>}
            {mode === "excluded" && <div className="text-[11px] text-muted">{l.exclusion_reason_codes} · {l.matched_exclusion_term} · {l.suggested_action}</div>}
          </div>
        ))}
        {leads.length > 60 && <div className="py-1 text-[11px] text-muted">+{leads.length - 60} more…</div>}
      </div>
    </div>
  );
}
function LeadDetail({ l, onBack }: { l: Lead; onBack: () => void }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{l.business_name}</h3><button onClick={onBack} className="text-[11px] text-actionblue">back</button></div>
      <dl className="mt-2 text-[12.5px]">
        <KV k="Postcode" v={l.postcode} mono /><KV k="Category" v={l.category_focus || "—"} /><KV k="Cuisine" v={l.cuisine || "—"} /><KV k="Halal" v={l.halal_signal || "—"} />
        {l.kind === "clean" && <>
          <KV k="Address" v={l.address} /><KV k="Phone" v={l.phone || "—"} mono /><KV k="Website" v={l.website || "—"} /><KV k="Platform" v={`${l.platform_primary}`} />
          <KV k="FSA rating" v={l.fsa_matched === "yes" ? `${l.fsa_rating} (${l.fsa_rating_date})` : "no FSA match"} /><KV k="Google" v={l.google_rating ? `${l.google_rating}★ (${l.google_review_count})` : "—"} />
          <KV k="Location proof" v={`${l.location_confidence} · ${l.location_proof_source}`} /><KV k="Suggested action" v={l.suggested_sales_action} /><KV k="Independent confidence" v={l.independent_confidence} />
        </>}
        {l.kind === "manual" && <>
          <KV k="Phone" v={l.phone || "—"} mono /><KV k="Website" v={l.website || "—"} /><KV k="Review status" v={l.review_status} /><KV k="Review reason" v={l.review_reason} />
          <KV k="Reason codes" v={l.review_reason_codes} /><KV k="Suggested decision" v={l.suggested_decision} /><KV k="Independent confidence" v={l.independent_confidence} /><KV k="Reviewer notes" v={l.reviewer_notes || "—"} />
        </>}
        {l.kind === "excluded" && <>
          <KV k="Exclusion reason" v={l.exclusion_reason} /><KV k="Reason codes" v={l.exclusion_reason_codes} /><KV k="Matched term" v={l.matched_exclusion_term} /><KV k="Suggested action" v={l.suggested_action} />
        </>}
      </dl>
      <p className="mt-2 text-[11px] text-muted">Sales-safe view — no internal score, financials, directors or match internals.</p>
    </div>
  );
}
function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) { return (<div className="flex justify-between gap-3 border-b border-bordergrey py-1.5"><dt className="shrink-0 text-muted">{k}</dt><dd className={`break-all text-right ${mono ? "font-mono" : ""} text-ink`}>{v}</dd></div>); }
function Ctrl({ label, children }: { label: string; children: React.ReactNode }) { return (<div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>{children}</div>); }
function Seg({ opts, value, onChange }: { opts: [string, string][]; value: string; onChange: (v: string) => void }) { return (<div className="inline-flex overflow-hidden rounded-btn border border-bordergrey">{opts.map(([id, lab]) => (<button key={id} onClick={() => onChange(id)} className={`px-2.5 py-1 text-[12px] font-medium ${value === id ? "bg-[#26506e] text-white" : "bg-card text-muted hover:text-ink"}`}>{lab}</button>))}</div>); }
function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) { return (<div className="rounded-card border border-bordergrey bg-card p-2.5 shadow-soft"><div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div><div className="mt-0.5 font-mono text-[14px]" style={{ color: good ? "#137a3b" : "#111827" }}>{value}</div></div>); }
function Badge({ tone, children }: { tone: string; children: React.ReactNode }) { return (<span className="rounded-full px-2 py-0.5 font-semibold" style={{ color: tone, background: tone + "18", border: `1px solid ${tone}33` }}>{children}</span>); }
