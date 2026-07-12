"use client";

import React from "react";
import { WEST_LONDON_MAP as M } from "@/lib/map/west-london-map.data";
import { MapViewport, type ViewportFeature, type ViewportRoad, type Sensitivity, MIN_ZOOM, MAX_ZOOM } from "./MapViewport";
import { MapToolbar } from "./MapToolbar";
import { MapHierarchyToggle } from "./MapHierarchyToggle";
import { MapRoadModeToggle } from "./MapRoadModeToggle";
import { MapSidePanel, type Selection } from "./MapSidePanel";
import { DEFAULT_MAP_LAYERS } from "./types";
import type { MapPoint, MapLayers, Granularity, RoadMode, Viewport, RunInfo } from "./types";

const COV = ["rgba(84,120,205,.32)", "rgba(98,96,196,.44)", "rgba(118,74,186,.56)", "rgba(138,58,176,.68)", "rgba(156,42,166,.82)"];
const covIndex = (c: number) => (c >= 21 ? 4 : c >= 11 ? 3 : c >= 6 ? 2 : c >= 3 ? 1 : 0);
const SETTINGS_KEY = "li_map_settings_v1";
type DefaultView = "uk" | "pilot" | "selected";

const [VW, VH] = (() => { const p = M.lensViewBox.split(" ").map(Number); return [p[2], p[3]]; })();
const PILOT_BOX = M.pilotBox as { x0: number; y0: number; x1: number; y1: number };

function codeAt(pc: string, gran: Granularity): string {
  const [outward = "", inward = ""] = (pc || "").toUpperCase().trim().split(/\s+/);
  if (gran === "areas") return outward.match(/^[A-Z]+/)?.[0] ?? outward;
  if (gran === "districts") return outward;
  return inward ? `${outward} ${inward[0]}` : outward;
}
function centroid(pts: string): [number, number] {
  const arr = pts.split(" ").map((p) => p.split(",").map(Number));
  return [arr.reduce((s, p) => s + p[0], 0) / arr.length, arr.reduce((s, p) => s + p[1], 0) / arr.length];
}
function boxOf(pts: string) {
  const arr = pts.split(" ").map((p) => p.split(",").map(Number));
  const xs = arr.map((p) => p[0]), ys = arr.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

type RoadRec = { num: string; cls: "m" | "a"; primary: number; feeder: number; pts: string };
function filterRoads(mode: RoadMode, custom: string): ViewportRoad[] {
  const roads = M.roads as unknown as RoadRec[];
  let out: RoadRec[];
  if (mode === "hide") out = [];
  else if (mode === "motorways") out = roads.filter((r) => r.cls === "m");
  else if (mode === "feeder") out = roads.filter((r) => r.cls === "a" && r.feeder === 1);
  else if (mode === "primary") out = roads.filter((r) => r.cls === "a" && r.primary === 1);
  else if (mode === "all") out = roads.filter((r) => r.cls === "a");
  else {
    const set = new Set(custom.toUpperCase().split(/[,\s]+/).filter(Boolean));
    out = roads.filter((r) => r.cls === "a" && set.has(r.num));
  }
  return out.map((r) => ({ cls: r.cls, pts: r.pts }));
}

function clampVP(v: Viewport): Viewport {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.scale));
  const minTx = VW - s * VW, minTy = VH - s * VH;
  return { scale: s, tx: Math.min(0, Math.max(minTx, v.tx)), ty: Math.min(0, Math.max(minTy, v.ty)) };
}
function fitBox(box: { x0: number; y0: number; x1: number; y1: number }, pad = 0.16): Viewport {
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(VW / (w * (1 + pad)), VH / (h * (1 + pad)))));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return clampVP({ scale: s, tx: VW / 2 - s * cx, ty: VH / 2 - s * cy });
}
const UK_BOX = { x0: 0, y0: 0, x1: VW, y1: VH };

export function MapEngine({ points, runInfo }: { points: MapPoint[]; runInfo?: RunInfo }) {
  const [gran, setGran] = React.useState<Granularity>("districts");
  const [roadMode, setRoadMode] = React.useState<RoadMode>("primary");
  const [custom, setCustom] = React.useState("");
  const [layers, setLayers] = React.useState<MapLayers>(DEFAULT_MAP_LAYERS);
  const [sensitivity, setSensitivity] = React.useState<Sensitivity>("normal");
  const [defaultView, setDefaultView] = React.useState<DefaultView>("pilot");
  const [viewport, setViewport] = React.useState<Viewport>(() => fitBox(PILOT_BOX));
  const [smooth, setSmooth] = React.useState(true);
  const [selection, setSelection] = React.useState<Selection>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);

  // load persisted settings
  React.useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s) {
        if (s.gran) setGran(s.gran);
        if (s.roadMode) setRoadMode(s.roadMode);
        if (typeof s.custom === "string") setCustom(s.custom);
        if (s.layers) setLayers(s.layers);
        if (s.sensitivity) setSensitivity(s.sensitivity);
        if (s.defaultView) setDefaultView(s.defaultView);
      }
    } catch { /* ignore */ }
  }, []);
  React.useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ gran, roadMode, custom, layers, sensitivity, defaultView })); } catch { /* ignore */ }
  }, [gran, roadMode, custom, layers, sensitivity, defaultView]);

  const applyVP = React.useCallback((v: Viewport, isSmooth: boolean) => { setSmooth(isSmooth); setViewport(clampVP(v)); }, []);
  const onViewport = React.useCallback((v: Viewport) => applyVP(v, false), [applyVP]);
  const onInteract = React.useCallback(() => setSmooth(false), []);

  const goView = React.useCallback((v: DefaultView) => {
    setDefaultView(v);
    if (v === "uk") applyVP(fitBox(UK_BOX), true);
    else if (v === "pilot") applyVP(fitBox(PILOT_BOX), true);
    else {
      const box = selection?.kind === "feature" ? boxOf((M.layers as any)[gran].find((f: any) => f.code === selection.code)?.pts ?? "") : null;
      applyVP(box ? fitBox(box, 0.4) : fitBox(PILOT_BOX), true);
    }
  }, [applyVP, selection, gran]);

  const zoomStep = (delta: number) => {
    const factor = delta > 0 ? 1.4 : 1 / 1.4;
    const cx = VW / 2, cy = VH / 2;
    const mx = (cx - viewport.tx) / viewport.scale, my = (cy - viewport.ty) / viewport.scale;
    applyVP({ scale: viewport.scale * factor, tx: cx - viewport.scale * factor * mx, ty: cy - viewport.scale * factor * my }, true);
  };
  const reset = () => applyVP(fitBox(PILOT_BOX), true);
  const toggleLayer = (k: keyof MapLayers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of points) { const c = codeAt(p.postcode, gran); m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  }, [points, gran]);

  const features: ViewportFeature[] = React.useMemo(() => {
    const list = (M.layers as any)[gran] as { code: string; pts: string; pilot?: boolean; cat?: string }[];
    const out: ViewportFeature[] = [];
    for (const f of list) {
      const isExp = f.cat === "expansion";
      if (isExp && !layers.expansion) continue;
      const count = counts.get(f.code) ?? 0;
      let fill = "rgba(38,96,180,.05)";
      if (isExp) fill = "transparent";
      else if (count > 0 && layers.coverage) fill = COV[covIndex(count)];
      else if (count === 0 && f.pilot && layers.gaps) fill = "url(#gap-hatch)";
      out.push({ code: f.code, pts: f.pts, fill, stroke: isExp ? "#6A4A9A" : "#9AA4AD", strokeWidth: isExp ? 1.2 : 0.6, dashed: isExp, labelXY: layers.labels && (f.pilot || gran === "areas") ? centroid(f.pts) : undefined });
    }
    return out;
  }, [gran, counts, layers]);

  const roads = React.useMemo(() => (layers.roads ? filterRoads(roadMode, custom) : []), [roadMode, custom, layers.roads]);

  const onSelectFeature = React.useCallback((code: string) => { setSelection({ kind: "feature", code, points: points.filter((p) => codeAt(p.postcode, gran) === code) }); setPanelOpen(true); }, [points, gran]);
  const onSelectPoint = React.useCallback((p: MapPoint) => { setSelection({ kind: "point", point: p }); setPanelOpen(true); }, []);

  const settingsCard = (
    <div className="w-[228px] rounded-card border border-bordergrey bg-white/92 p-3 shadow-soft backdrop-blur">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Map settings</div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Granularity</label>
      <MapHierarchyToggle value={gran} onChange={(g) => { setGran(g); setSelection(null); }} />
      <div className="mt-2.5"><MapRoadModeToggle value={roadMode} onChange={setRoadMode} custom={custom} onCustomChange={setCustom} /></div>
      <div className="mt-1.5 font-mono text-[11px] text-muted">Roads shown: {roads.length.toLocaleString("en-GB")}{roadMode === "all" && <span className="text-[#b45309]"> ⚠ heavy</span>}</div>
      <label className="mb-1 mt-2.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Zoom sensitivity</label>
      <Segmented options={[["low", "Low"], ["normal", "Normal"], ["high", "High"]]} value={sensitivity} onChange={(v) => setSensitivity(v as Sensitivity)} />
      <label className="mb-1 mt-2.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Default view</label>
      <Segmented options={[["uk", "UK"], ["pilot", "Pilot"], ["selected", "Selected"]]} value={defaultView} onChange={(v) => goView(v as DefaultView)} />
    </div>
  );

  const mapArea = (
    <div className={`relative w-full overflow-hidden ${expanded ? "h-screen" : "rounded-card border border-bordergrey shadow-soft"}`} style={expanded ? undefined : { height: "min(calc(100vh - 200px), 900px)", minHeight: 520 }}>
      <MapViewport
        vw={VW} vh={VH} geo={M.geo as any}
        features={features} roads={roads} points={layers.points ? points : []}
        layers={layers} selection={selection} viewport={viewport} onViewport={onViewport} smooth={smooth}
        sensitivity={sensitivity} onSelectFeature={onSelectFeature} onSelectPoint={onSelectPoint} onInteract={onInteract}
      />

      {/* floating: settings (top-left) */}
      <div className="absolute left-3 top-3 z-10">{settingsCard}</div>

      {/* floating: toolbar (top-right) */}
      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
        <div className="rounded-card border border-bordergrey bg-white/92 p-2 shadow-soft backdrop-blur">
          <MapToolbar layers={layers} onToggleLayer={toggleLayer} onZoom={zoomStep} onReset={reset} expanded={expanded} onToggleExpand={() => setExpanded((e) => !e)} />
        </div>
      </div>

      {/* floating: legend (top-right, under toolbar) */}
      <div className="absolute right-3 top-[68px] z-10 rounded-card border border-bordergrey bg-white/92 p-2.5 text-[11px] shadow-soft backdrop-blur">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Legend</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <LegRow sw={{ background: "rgba(84,120,205,.4)" }}>coverage</LegRow>
          <LegRow sw={{ background: "url(#gap-hatch)", backgroundColor: "rgba(232,150,25,.35)" }}>gap</LegRow>
          <LegRow sw={{ border: "2px dashed #6A4A9A" }}>expansion</LegRow>
          <LegRow sw={{ border: "2px solid #C85A00" }}>selected</LegRow>
          <LegRow sw={{ background: "#123C66" }}>motorway</LegRow>
          <LegRow sw={{ background: "#3A9E63" }}>A road</LegRow>
          <LegDot c="#16A34A">grade A</LegDot>
          <LegDot c="#2563EB">grade B</LegDot>
          <LegDot c="#F59E0B">grade C</LegDot>
          <LegDot c="#94A3B8">grade D</LegDot>
        </div>
        <div className="mt-1.5 border-t border-bordergrey pt-1.5 text-[10px] text-muted">Presence: present / absent / unknown / manual review (dot ring = selected)</div>
      </div>

      {/* floating: GB inset (bottom-right) */}
      <div className="absolute bottom-3 right-3 z-10 rounded-md border border-bordergrey bg-white/85 p-1.5 backdrop-blur">
        <svg viewBox={M.gbViewBox} width="76" height="108" style={{ display: "block" }}>
          <path d={M.gbPath} fill="#E3E9F1" stroke="#B7C4D8" strokeWidth="1" />
          <path d={M.niPath} fill="#EEF2F5" stroke="#B7C4D8" strokeWidth="1" strokeDasharray="3 2" />
          <text x="30" y="150" fontSize="8" fontFamily="ui-monospace,Menlo,monospace" fill="#94A3B8">NI · TBC</text>
          <rect x={M.gbFocus.x} y={M.gbFocus.y} width={M.gbFocus.w} height={M.gbFocus.h} fill="none" stroke="#C85A00" strokeWidth="2" />
          <text x="8" y="14" fontSize="9" fontFamily="ui-monospace,Menlo,monospace" fill="#64748B">GB · pilot lens</text>
        </svg>
      </div>

      {/* floating: selected panel (bottom-left, collapsible overlay) */}
      {selection && panelOpen && (
        <div className="absolute bottom-3 left-3 z-10 w-[300px] max-w-[calc(100%-24px)]">
          <div className="relative">
            <button onClick={() => setPanelOpen(false)} className="absolute -right-1 -top-1 z-10 rounded-full border border-bordergrey bg-white px-1.5 text-[12px] text-muted shadow-soft" title="Collapse">✕</button>
            <div className="max-h-[46vh] overflow-y-auto"><MapSidePanel selection={selection} /></div>
          </div>
        </div>
      )}
      {selection && !panelOpen && (
        <button onClick={() => setPanelOpen(true)} className="absolute bottom-3 left-3 z-10 rounded-card border border-bordergrey bg-white/92 px-3 py-1.5 text-[13px] shadow-soft backdrop-blur">
          Show details
        </button>
      )}
    </div>
  );

  return (
    <div className={expanded ? "fixed inset-0 z-50 bg-white" : "space-y-3"}>
      {!expanded && runInfo && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <Info label="Run" value={runInfo.run_id} />
            <Info label="Final leads" value={n(runInfo.final_leads)} good />
            <Info label="Mapped" value={n(points.length)} />
            <Info label="Unmapped" value={n(Math.max(0, runInfo.final_leads - points.length))} danger />
            <Info label="In territory" value={n(runInfo.in_territory)} />
            <Info label="Rejected" value={n(runInfo.rejected_total)} />
          </div>
          <p className="text-[12px] text-muted">
            Granularity: <b className="text-ink">{gran}</b> · Road mode: <b className="text-ink">{roadMode}</b> · Roads shown:{" "}
            <b className="text-ink">{roads.length.toLocaleString("en-GB")}</b> · Mapped {points.length} of {runInfo.final_leads}.
            {runInfo.final_leads - points.length > 0 && (
              <span className="text-[#b45309]"> Some leads are not shown on the map because coordinates are missing ({runInfo.final_leads - points.length}).</span>
            )}
          </p>
        </>
      )}
      {mapArea}
      {!expanded && (
        <p className="text-[12px] text-muted">
          Reusable POC-derived map engine (OS Code-Point Open + OS Open Roads via the accepted map POC). Scroll to
          zoom (sensitivity adjustable), drag to pan. GB-only data — GB frame + West London pilot lens; NI flagged
          (hatched), not faked. Point coordinates are real from the latest run.
        </p>
      )}
    </div>
  );
}

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-btn border border-bordergrey">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`px-2.5 py-1 text-[12px] font-medium ${value === id ? "bg-[#26506e] text-white" : "bg-card text-muted hover:text-ink"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
function LegRow({ sw, children }: { sw: React.CSSProperties; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-ink"><span style={{ width: 14, height: 10, borderRadius: 2, border: "1px solid #9AA4AD", display: "inline-block", ...sw }} />{children}</div>;
}
function LegDot({ c, children }: { c: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-ink"><span style={{ width: 9, height: 9, borderRadius: "50%", background: c, display: "inline-block" }} />{children}</div>;
}
function n(v: number) { return v.toLocaleString("en-GB"); }
function Info({ label, value, good, danger }: { label: string; value: string; good?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-2.5 shadow-soft">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[14px]" style={{ color: danger ? "#b45309" : good ? "#137a3b" : "#111827" }}>{value}</div>
    </div>
  );
}
