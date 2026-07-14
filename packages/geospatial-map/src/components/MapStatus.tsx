"use client";
import React from "react";

export function MapStatus({ status }: { status: string }) {
  if (!status) return null;
  return <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 7, background: "rgba(17,24,39,0.9)", color: "#fff", padding: "6px 12px", borderRadius: 8, font: "12px system-ui", maxWidth: 420 }}>{status}</div>;
}
