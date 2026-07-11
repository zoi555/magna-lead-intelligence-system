"use client";

import React from "react";
import type { Granularity } from "./types";

const OPTS: { id: Granularity; label: string }[] = [
  { id: "areas", label: "Area" },
  { id: "districts", label: "District" },
  { id: "sectors", label: "Sector" },
];

export function MapHierarchyToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-btn border border-bordergrey">
      {OPTS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 text-[12px] font-medium ${value === o.id ? "bg-[#26506e] text-white" : "bg-card text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
