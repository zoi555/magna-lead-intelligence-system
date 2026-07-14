"use client";

// Generic map search box — delegates to a pluggable MapSearchAdapter.

import React from "react";
import type { MapSearchResult } from "../types";
import type { MapSearchAdapter } from "../adapters/adapters";

export function MapSearch({ adapter, onGo }: { adapter: MapSearchAdapter; onGo: (r: MapSearchResult) => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<MapSearchResult[]>([]);
  const run = async (v: string) => { setQ(v); if (!v.trim()) return setResults([]); setResults(await adapter.search(v)); };
  return (
    <div style={{ position: "absolute", top: 10, left: 316, zIndex: 6, width: 240 }}>
      <input value={q} onChange={(e) => run(e.target.value)} placeholder="Search postcode / place…" style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "6px 9px", fontSize: 12, background: "#fff" }} />
      {results.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, marginTop: 3, maxHeight: 220, overflowY: "auto" }}>
          {results.map((r) => (
            <button key={r.id} onClick={() => { onGo(r); setResults([]); setQ(r.label); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 9px", fontSize: 12, border: "none", background: "none", cursor: "pointer" }}>
              {r.label} <span style={{ color: "#9ca3af", fontSize: 10 }}>{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
