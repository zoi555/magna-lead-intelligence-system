"use client";

import React from "react";
import type { MapPoint, MapLayers, Viewport } from "./types";
import type { Selection } from "./MapSidePanel";

export interface ViewportFeature {
  code: string; pts: string; fill: string; stroke: string; strokeWidth: number; dashed: boolean; labelXY?: [number, number];
}
export interface ViewportRoad { cls: "m" | "a"; pts: string }
export type Sensitivity = "low" | "normal" | "high";

const PAD = 16;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 14;
const STEP: Record<Sensitivity, number> = { low: 1.06, normal: 1.12, high: 1.22 };

export function MapViewport({
  vw, vh, geo, features, roads, points, layers, selection, viewport, onViewport, smooth,
  sensitivity, onSelectFeature, onSelectPoint, onInteract,
}: {
  vw: number; vh: number;
  geo: { lonmin: number; lonmax: number; latmin: number; latmax: number };
  features: ViewportFeature[]; roads: ViewportRoad[]; points: MapPoint[];
  layers: MapLayers; selection: Selection;
  viewport: Viewport; onViewport: (v: Viewport) => void; smooth: boolean;
  sensitivity: Sensitivity;
  onSelectFeature: (code: string) => void; onSelectPoint: (p: MapPoint) => void; onInteract: () => void;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const vpRef = React.useRef(viewport); vpRef.current = viewport;
  const sensRef = React.useRef(sensitivity); sensRef.current = sensitivity;
  const onVPRef = React.useRef(onViewport); onVPRef.current = onViewport;
  const onIntRef = React.useRef(onInteract); onIntRef.current = onInteract;
  const { tx, ty, scale } = viewport;

  const project = React.useCallback(
    (lat: number, lng: number): [number, number] => [
      PAD + ((lng - geo.lonmin) / (geo.lonmax - geo.lonmin)) * (vw - 2 * PAD),
      PAD + ((geo.latmax - lat) / (geo.latmax - geo.latmin)) * (vh - 2 * PAD),
    ],
    [geo, vw, vh]
  );

  // Native non-passive wheel listener so we can preventDefault (no page scroll)
  // and use a fixed, sign-based zoom STEP (immune to trackpad delta spikes).
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      onIntRef.current();
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * vw;
      const py = ((e.clientY - rect.top) / rect.height) * vh;
      const v = vpRef.current;
      const mx = (px - v.tx) / v.scale, my = (py - v.ty) / v.scale;
      const factor = e.deltaY < 0 ? STEP[sensRef.current] : 1 / STEP[sensRef.current];
      onVPRef.current({ scale: v.scale * factor, tx: px - v.scale * factor * mx, ty: py - v.scale * factor * my });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [vw, vh]);

  const onDown = (e: React.PointerEvent) => {
    onInteract();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const dvx = ((e.clientX - drag.current.x) / rect.width) * vw;
    const dvy = ((e.clientY - drag.current.y) / rect.height) * vh;
    onViewport({ scale, tx: drag.current.tx + dvx, ty: drag.current.ty + dvy });
  };
  const onUp = () => { drag.current = null; };

  const base = React.useMemo(
    () => (
      <>
        {layers.roads &&
          roads.map((r, i) => (
            <polyline key={`r${i}`} points={r.pts} fill="none" stroke={r.cls === "m" ? "#123C66" : "#3A9E63"} strokeWidth={r.cls === "m" ? 2.1 : 0.9} opacity={r.cls === "m" ? 0.9 : 0.75} vectorEffect="non-scaling-stroke" />
          ))}
        {features.map((f) => (
          <polygon key={f.code} points={f.pts} fill={f.fill} stroke={f.stroke} strokeWidth={f.strokeWidth} strokeDasharray={f.dashed ? "4 2" : undefined} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} onClick={() => onSelectFeature(f.code)}>
            <title>{f.code}</title>
          </polygon>
        ))}
        {layers.labels && features.filter((f) => f.labelXY).map((f) => (
          <text key={`l${f.code}`} x={f.labelXY![0]} y={f.labelXY![1]} textAnchor="middle" fontSize="9" fontWeight="700" fill="rgba(15,23,42,.62)" fontFamily="ui-monospace,Menlo,monospace" pointerEvents="none">{f.code}</text>
        ))}
        {layers.points && points.map((p) => {
          const [x, y] = project(p.lat, p.lng);
          return (
            <circle key={p.id} cx={x} cy={y} r={3} fill={p.color} stroke="#fff" strokeWidth={0.7} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onSelectPoint(p); }}>
              <title>{p.label} · {p.postcode}</title>
            </circle>
          );
        })}
      </>
    ),
    [features, roads, points, layers, project, onSelectFeature, onSelectPoint]
  );

  const overlay = React.useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "feature") {
      const f = features.find((x) => x.code === selection.code);
      if (!f) return null;
      return <polygon points={f.pts} fill="none" stroke="#C85A00" strokeWidth={2.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
    }
    const [x, y] = project(selection.point.lat, selection.point.lng);
    return (
      <g pointerEvents="none">
        <circle cx={x} cy={y} r={6} fill="none" stroke="#0F172A" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={x} cy={y} r={3} fill={selection.point.color} />
      </g>
    );
  }, [selection, features, project]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vw} ${vh}`}
      width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      style={{ display: "block", background: "#EEF2F5", touchAction: "none", cursor: drag.current ? "grabbing" : "grab", width: "100%", height: "100%" }}
    >
      <defs>
        <pattern id="mgrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0 H0 V32" fill="none" stroke="rgba(15,23,42,.05)" strokeWidth="1" /></pattern>
        <pattern id="gap-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="rgba(232,150,25,.20)" /><line x1="0" y1="0" x2="0" y2="7" stroke="#B06A12" strokeWidth="1.2" opacity=".5" /></pattern>
      </defs>
      <rect x="0" y="0" width={vw} height={vh} fill="url(#mgrid)" />
      <g transform={`translate(${tx} ${ty}) scale(${scale})`} style={{ transition: smooth ? "transform .16s ease-out" : "none" }}>
        {base}
        {overlay}
      </g>
    </svg>
  );
}
