import React from "react";
import { SOURCE_REGISTRY } from "@/lib/sources/source-registry";

// Honest internal-beta status banner — replaces the old global "Prototype using mock data. No
// real customer data. No integrations connected." banner, which was false for 8 of 10 live
// routes (see docs/75_LIVE_DATA_AUDIT.md). Per-source status is read from the same
// SOURCE_REGISTRY the /settings screen uses — one source of truth, not a second hand-authored
// copy that could drift.

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#137a3b",
  PENDING_AUTHORISATION: "#b45309",
  CREDENTIALS_MISSING: "#b45309",
  PROVIDER_UNAVAILABLE: "#b91c1c",
  SCHEMA_MISMATCH: "#b91c1c",
  DISABLED_BY_POLICY: "#475569",
};

function Chip({ label, status, color }: { label: string; status: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px]">
      <span className="font-semibold text-ink">{label}:</span>
      <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ color, background: `${color}1a`, border: `1px solid ${color}55` }}>
        {status}
      </span>
    </span>
  );
}

export function StatusBanner() {
  const je = SOURCE_REGISTRY.find((s) => s.id === "just_eat");
  const uber = SOURCE_REGISTRY.find((s) => s.id === "uber_eats");
  const deliveroo = SOURCE_REGISTRY.find((s) => s.id === "deliveroo");

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-bordergrey px-6 py-2"
      style={{ background: "#F5F7FA" }}
      role="status"
    >
      <span
        style={{ fontSize: 11, fontWeight: 700, border: "1px solid #2563EB", color: "#2563EB", borderRadius: 4, padding: "0 6px" }}
      >
        AspectLead Internal Beta
      </span>
      {je && <Chip label="Just Eat" status={je.marketplaceStatus ?? "UNKNOWN"} color={STATUS_COLOR[je.marketplaceStatus ?? ""] ?? "#475569"} />}
      {uber && <Chip label="Uber Eats" status="PENDING AUTHORISED SOURCE" color={STATUS_COLOR.PENDING_AUTHORISATION} />}
      {deliveroo && <Chip label="Deliveroo" status="PUBLIC SOURCE VALIDATED — PIPELINE INTEGRATION IN PROGRESS" color={STATUS_COLOR.PENDING_AUTHORISATION} />}
      <Chip label="Manual import" status="AVAILABLE" color={STATUS_COLOR.ACTIVE} />
      <Chip label="Customer comparison" status="NOT STARTED" color="#475569" />
      <span className="text-[11.5px] text-muted">
        Dashboard (<code>/</code>) still shows illustrative demo numbers — see{" "}
        <a href="/discovery-results" className="text-actionblue hover:text-actionhover">Discovery Results</a> for real, database-backed records.
      </span>
    </div>
  );
}
