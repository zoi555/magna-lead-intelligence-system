"use client";

import React from "react";
import type { RoadMode } from "./types";

const MODES: { id: RoadMode; label: string }[] = [
  { id: "motorways", label: "Motorways only" },
  { id: "feeder", label: "Feeder routes" },
  { id: "primary", label: "Primary A roads" },
  { id: "all", label: "All A roads" },
  { id: "custom", label: "Custom list" },
  { id: "hide", label: "Hide roads" },
];

export function MapRoadModeToggle({
  value,
  onChange,
  custom,
  onCustomChange,
}: {
  value: RoadMode;
  onChange: (m: RoadMode) => void;
  custom: string;
  onCustomChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Road display</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RoadMode)}
        className="w-full rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] outline-none focus:border-actionblue"
      >
        {MODES.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      {value === "custom" && (
        <input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="e.g. A312, A40, A4020"
          className="mt-1.5 w-full rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] outline-none focus:border-actionblue"
        />
      )}
    </div>
  );
}
