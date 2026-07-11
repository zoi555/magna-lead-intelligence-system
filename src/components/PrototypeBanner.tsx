import React from "react";
import { PROTOTYPE_NOTICE } from "@/lib/app-config";

export function PrototypeBanner() {
  return (
    <div
      className="flex items-center gap-2 border-b border-bordergrey px-6 py-2 text-[13px]"
      style={{ background: "#EEF1F5", color: "#475569" }}
      role="status"
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          border: "1px solid #64748B",
          color: "#475569",
          borderRadius: 4,
          padding: "0 6px",
        }}
      >
        MOCK
      </span>
      <span>{PROTOTYPE_NOTICE}</span>
    </div>
  );
}
