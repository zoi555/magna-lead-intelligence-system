"use client";

// Configurable control drawer. Sections (Roads, Places & labels, Postcodes, Transport,
// Environment) come from the registry; the host can hide/lock sections via capabilities.
// Includes the generic feeder-road panel. No application data.

import React from "react";
import type { MapProfile, MapControlCapabilities, FeederRoadEntry, FeederPriority } from "../types";
import { CONTROL_SECTIONS } from "../config/layerRegistry";
import { addManualFeeder, addFeederByName, suggestFeeders, setFeederStatus, setFeederPriority, removeFeeder } from "../feeder/feederEngine";

interface Props {
  profile: MapProfile;
  onChange: (p: MapProfile) => void;
  capabilities: MapControlCapabilities;
  feederRoads: FeederRoadEntry[];
  onFeederChange?: (f: FeederRoadEntry[]) => void;
  getMap: () => any;
  onUpdateFeeders: () => void;
}

export function MapControlDrawer({ profile, onChange, capabilities, feederRoads, onFeederChange, getMap, onUpdateFeeders }: Props) {
  const [open, setOpen] = React.useState(true);
  const [manual, setManual] = React.useState("");

  const patch = (fn: (p: MapProfile) => void) => { const next = structuredClone(profile); fn(next); onChange(next); };
  const emit = (f: FeederRoadEntry[]) => { onFeederChange?.(f); setTimeout(onUpdateFeeders, 0); };
  const sections = CONTROL_SECTIONS.filter((s) => capabilities[s.id] !== false);
  const showFeeders = capabilities.feederRoads !== false;

  const suggestFromView = () => {
    const map = getMap(); if (!map) return;
    const layers = ["road-a-primary", "road-a-other", "road-motorway"].filter((l) => map.getLayer(l));
    const fs = map.queryRenderedFeatures({ layers }).map((f: any) => f.properties);
    emit([...feederRoads, ...suggestFeeders(fs, feederRoads)]);
  };

  if (!open) return <button onClick={() => setOpen(true)} style={{ ...chip, position: "absolute", top: 10, left: 10, zIndex: 6, fontWeight: 700 }}>☰ Layers</button>;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 300, zIndex: 6, background: "rgba(255,255,255,0.97)", boxShadow: "2px 0 8px rgba(0,0,0,0.08)", overflowY: "auto", padding: "10px 12px", font: "13px/1.4 system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 14 }}>Map layers</b>
        <button onClick={() => setOpen(false)} style={chip}>‹</button>
      </div>
      {sections.map((sec) => (
        <div key={String(sec.id)} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#374151", fontWeight: 700 }}>{sec.title}</div>
          {sec.controls.map((c) => (
            <label key={c.id} title={c.note || ""} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", opacity: c.availability === "unavailable" ? 0.5 : 1, cursor: c.availability === "unavailable" || c.locked ? "default" : "pointer" }}>
              <input type="checkbox" checked={c.locked ? true : c.get(profile)} disabled={c.availability === "unavailable" || c.locked} onChange={(e) => patch((p) => c.set(p, e.target.checked))} />
              <span style={{ fontSize: 12 }}>{c.label}{c.locked ? " 🔒" : ""}{c.availability === "unavailable" ? " — unavailable" : ""}</span>
            </label>
          ))}
        </div>
      ))}

      {showFeeders && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#374151", fontWeight: 700 }}>Feeder roads</div>
          <div style={{ fontSize: 11, color: "#6b7280", margin: "3px 0 6px" }}>Curated strategic connectors — not every A road.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Road no. (A316) or name" style={inp} />
            <button style={chip} onClick={() => { const v = manual.trim(); if (!v) return; emit(/^[A-Za-z]?\d/.test(v) ? addManualFeeder(feederRoads, v, "Manually added") : addFeederByName(feederRoads, v, "Manually added")); setManual(""); }}>Add</button>
          </div>
          <button style={{ ...chip, marginTop: 6 }} onClick={suggestFromView}>Suggest from current view</button>
          <div style={{ marginTop: 8 }}>
            {feederRoads.length === 0 && <div style={{ fontSize: 11, color: "#9ca3af" }}>No feeder roads yet.</div>}
            {feederRoads.map((f) => (
              <div key={f.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 7px", marginTop: 5, fontSize: 12, background: f.status === "suggested" ? "#fffbeb" : f.status === "excluded" ? "#f9fafb" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>{f.displayName}</b><span style={{ fontSize: 10, color: "#6b7280" }}>{f.source} · {f.status}</span></div>
                <div style={{ color: "#6b7280", fontSize: 11 }}>{f.reason}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  <select value={f.priority} onChange={(e) => emit(setFeederPriority(feederRoads, f.id, e.target.value as FeederPriority))} style={{ fontSize: 11 }}>
                    <option value="primary">primary</option><option value="secondary">secondary</option><option value="context">context</option>
                  </select>
                  {f.status === "suggested" && <button style={mini} onClick={() => emit(setFeederStatus(feederRoads, f.id, "included"))}>Accept</button>}
                  {f.status !== "excluded" && <button style={mini} onClick={() => emit(setFeederStatus(feederRoads, f.id, "excluded"))}>Exclude</button>}
                  {f.status === "excluded" && <button style={mini} onClick={() => emit(setFeederStatus(feederRoads, f.id, "included"))}>Include</button>}
                  <button style={mini} onClick={() => emit(removeFeeder(feederRoads, f.id))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const chip: React.CSSProperties = { background: "#fff", border: "1px solid #d1d5db", borderRadius: 7, padding: "4px 9px", fontSize: 12, cursor: "pointer" };
const inp: React.CSSProperties = { flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 6px", fontSize: 12 };
const mini: React.CSSProperties = { fontSize: 11, border: "1px solid #d1d5db", borderRadius: 5, padding: "1px 6px", background: "#fff", cursor: "pointer" };
