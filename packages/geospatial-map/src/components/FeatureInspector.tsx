"use client";

// Generic feature inspector — shows identity + source + generic properties only.
// Applications may render their own richer inspector using onFeatureSelect instead.

import React from "react";
import type { MapFeatureSelection } from "../types";

export function FeatureInspector({ selection }: { selection: MapFeatureSelection | null }) {
  if (!selection) return null;
  const props = Object.entries(selection.properties || {}).filter(([, v]) => v != null && v !== "").slice(0, 8);
  return (
    <div style={{ position: "absolute", top: 48, right: 10, zIndex: 5, width: 240, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", padding: "10px 12px", font: "12px system-ui, sans-serif" }}>
      <div style={{ fontWeight: 700 }}>{selection.displayName || "Feature"}</div>
      <div style={{ color: "#6b7280", fontSize: 11 }}>{selection.featureType} · {selection.sourceId}</div>
      {selection.sourceMetadata?.dataset && <div style={{ color: "#9ca3af", fontSize: 10 }}>{selection.sourceMetadata.dataset}{selection.sourceMetadata.version ? ` v${selection.sourceMetadata.version}` : ""}</div>}
      <dl style={{ marginTop: 6 }}>
        {props.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "1px 0" }}>
            <dt style={{ color: "#6b7280" }}>{k}</dt><dd style={{ textAlign: "right", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
