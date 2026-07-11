"use client";

import React from "react";
import type { MapLayers } from "./types";

const LAYER_LABELS: { key: keyof MapLayers; label: string }[] = [
  { key: "coverage", label: "Coverage" },
  { key: "gaps", label: "Gaps" },
  { key: "expansion", label: "Expansion" },
  { key: "roads", label: "Roads" },
  { key: "points", label: "Points" },
  { key: "labels", label: "Labels" },
];

export function MapToolbar({
  layers,
  onToggleLayer,
  onZoom,
  onReset,
  expanded,
  onToggleExpand,
}: {
  layers: MapLayers;
  onToggleLayer: (k: keyof MapLayers) => void;
  onZoom: (delta: number) => void;
  onReset: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex overflow-hidden rounded-btn border border-bordergrey">
        <TBtn onClick={() => onZoom(1)} title="Zoom in">＋</TBtn>
        <TBtn onClick={() => onZoom(-1)} title="Zoom out">－</TBtn>
        <TBtn onClick={onReset} title="Reset view">⟲</TBtn>
        <TBtn onClick={onToggleExpand} title={expanded ? "Collapse" : "Expand"}>{expanded ? "⤢" : "⤢"}</TBtn>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {LAYER_LABELS.map((l) => (
          <button
            key={l.key}
            onClick={() => onToggleLayer(l.key)}
            className={`rounded-btn border px-2 py-1 text-[12px] ${
              layers[l.key] ? "border-actionblue bg-[#e8efff] text-[#1d4ed8]" : "border-bordergrey bg-card text-muted"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="border-r border-bordergrey bg-card px-2.5 py-1 text-[14px] text-ink last:border-r-0 hover:bg-[#f2f5f8]">
      {children}
    </button>
  );
}
