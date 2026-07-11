"use client";

import React from "react";
import type { MapPoint } from "./types";

export type Selection =
  | { kind: "feature"; code: string; points: MapPoint[] }
  | { kind: "point"; point: MapPoint }
  | null;

export function MapSidePanel({ selection }: { selection: Selection }) {
  if (!selection) {
    return (
      <div className="rounded-card border border-bordergrey bg-card p-4 text-[13px] text-muted shadow-soft">
        Click a territory or a point on the map to see details. Scroll to zoom, drag to pan.
      </div>
    );
  }
  if (selection.kind === "point") return <PointDetail point={selection.point} />;
  return <FeatureDetail code={selection.code} points={selection.points} />;
}

function FeatureDetail({ code, points }: { code: string; points: MapPoint[] }) {
  // Aggregate by a "grade"-style meta if present, else just count.
  const byBand: Record<string, number> = {};
  points.forEach((p) => {
    const b = String(p.meta?.grade ?? p.label ?? "•");
    byBand[b] = (byBand[b] ?? 0) + 1;
  });
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{code}</h3>
        <span className="font-mono text-[13px] text-muted">{points.length} points</span>
      </div>
      {Object.keys(byBand).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          {Object.entries(byBand).sort().map(([b, n]) => (
            <span key={b} className="rounded border border-bordergrey px-1.5 py-0.5 font-mono">{b}: {n}</span>
          ))}
        </div>
      )}
      <div className="mt-3 max-h-56 overflow-y-auto">
        {points.slice(0, 30).map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-bordergrey py-1 text-[12.5px]">
            <span className="truncate text-ink">{p.label}</span>
            <span className="ml-2 shrink-0 font-mono text-muted">{p.postcode}</span>
          </div>
        ))}
        {points.length === 0 && <div className="py-2 text-[12.5px] text-muted">No points — coverage gap.</div>}
      </div>
    </div>
  );
}

function PointDetail({ point }: { point: MapPoint }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{point.label}</h3>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: point.color, display: "inline-block" }} />
      </div>
      <dl className="mt-3 text-[13px]">
        <KV k="Postcode" v={point.postcode} mono />
        {point.meta &&
          Object.entries(point.meta).map(([k, v]) => <KV key={k} k={k.replace(/_/g, " ")} v={String(v)} />)}
        <KV k="Coordinates" v={`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`} mono />
      </dl>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-bordergrey py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${mono ? "font-mono" : ""} text-ink`}>{v}</dd>
    </div>
  );
}
