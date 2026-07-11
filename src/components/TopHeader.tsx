import React from "react";
import { TENANT_NAME } from "@/lib/app-config";

export function TopHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-bordergrey bg-card px-6">
      {/* Tenant identity is DATA (configurable), not the product brand. */}
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted">Tenant</span>
        <span className="rounded-btn border border-bordergrey px-2 py-1 text-[13px] font-medium text-headertext">
          {TENANT_NAME}
        </span>
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#EEF1F5", color: "#475569" }}>
          UAT
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-muted">Owner / Admin</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white"
          style={{ background: "#111827" }}
        >
          OA
        </span>
      </div>
    </header>
  );
}
