"use client";

import React from "react";
import type { SourceEntry, SourceStatus, MarketplaceSourceStatus, RegistrySummary } from "@/lib/sources/source-registry";

const MARKETPLACE_STATUS_STYLE: Record<MarketplaceSourceStatus, { color: string; background: string; border: string }> = {
  ACTIVE: { color: "#137a3b", background: "#E7F5EC", border: "1px solid #137a3b33" },
  PENDING_AUTHORISATION: { color: "#b45309", background: "#FDF3E1", border: "1px solid #b4530933" },
  CREDENTIALS_MISSING: { color: "#b45309", background: "#FDF3E1", border: "1px solid #b4530933" },
  PROVIDER_UNAVAILABLE: { color: "#b91c1c", background: "#FBE9E9", border: "1px solid #b91c1c33" },
  SCHEMA_MISMATCH: { color: "#b91c1c", background: "#FBE9E9", border: "1px solid #b91c1c33" },
  DISABLED_BY_POLICY: { color: "#475569", background: "#EEF1F5", border: "1px solid #47556933" },
};

const STATUS_STYLE: Record<SourceStatus, { fg: string; bg: string; label: string }> = {
  live_ready: { fg: "#137a3b", bg: "#E7F5EC", label: "Live ready" },
  not_configured: { fg: "#475569", bg: "#EEF1F5", label: "Not configured" },
  disabled: { fg: "#b91c1c", bg: "#FBE9E9", label: "Disabled" },
  manual_import: { fg: "#92600b", bg: "#FDF3E1", label: "Manual import" },
  placeholder: { fg: "#475569", bg: "#EEF1F5", label: "Placeholder" },
  blocked_pending_approval: { fg: "#b91c1c", bg: "#FBE9E9", label: "Blocked — approval" },
  disabled_cost_control_required: { fg: "#b45309", bg: "#FDF3E1", label: "Disabled — cost control" },
  manual_import_placeholder: { fg: "#92600b", bg: "#FDF3E1", label: "Manual import (placeholder)" },
  poc_derived_local_static: { fg: "#6b21d6", bg: "#F1EAFC", label: "POC-derived (static)" },
  pending_authorised_source: { fg: "#b45309", bg: "#FDF3E1", label: "Pending authorised source" },
};

const RISK_FG: Record<string, string> = { none: "#64748b", low: "#137a3b", medium: "#b45309", high: "#b91c1c" };

type TabId = "all" | "live" | "needs_setup" | "manual" | "disabled" | "risk";
const TABS: { id: TabId; label: string; test: (s: SourceEntry, present: Record<string, boolean>) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "live", label: "Live", test: (s) => s.liveEnabled },
  { id: "needs_setup", label: "Needs setup", test: (s) => ["not_configured", "disabled_cost_control_required", "blocked_pending_approval"].includes(s.status) },
  { id: "manual", label: "Manual import", test: (s) => ["manual_import", "manual_import_placeholder", "placeholder"].includes(s.status) },
  { id: "disabled", label: "Disabled", test: (s) => !s.liveEnabled && !["manual_import", "manual_import_placeholder", "placeholder"].includes(s.status) },
  { id: "risk", label: "Legal/cost risk", test: (s) => ["medium", "high"].includes(s.costRisk) || ["medium", "high"].includes(s.legalRisk) },
];

export function SourceRegistryPanel({
  sources, summary, envPresent,
}: {
  sources: SourceEntry[]; summary: RegistrySummary; envPresent: Record<string, boolean>;
}) {
  const [tab, setTab] = React.useState<TabId>("all");
  const active = TABS.find((t) => t.id === tab)!;
  const shown = sources.filter((s) => active.test(s, envPresent));

  return (
    <div className="space-y-4">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Live sources" value={summary.live} accent="#137a3b" />
        <SummaryCard label="Disabled" value={summary.disabled} accent="#b91c1c" />
        <SummaryCard label="Manual import" value={summary.manualImport} accent="#92600b" />
        <SummaryCard label="Needing keys" value={summary.needsKeys} accent="#b45309" />
        <SummaryCard label="Cost risk" value={summary.costRisk} accent="#b45309" />
        <SummaryCard label="Legal review" value={summary.legalRisk} accent="#b91c1c" />
      </div>

      {/* delivery warning */}
      <div className="rounded-card border px-4 py-3 text-[13px]" style={{ background: "#FDF3E1", borderColor: "#f2d9a6", color: "#92600b" }}>
        <b>Delivery-platform presence collection must use approved public/business-level methods only.</b> No
        login, captcha bypass, proxy evasion, protected data extraction, or bulk copying of menus, prices or reviews.
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const count = sources.filter((s) => t.test(s, envPresent)).length;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`rounded-btn border px-3 py-1.5 text-[13px] font-medium ${tab === t.id ? "border-[#111827] bg-[#111827] text-white" : "border-bordergrey bg-card text-muted hover:text-ink"}`}>
              {t.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* source cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {shown.map((s) => {
          const st = STATUS_STYLE[s.status];
          const keyMissing = s.envVar ? !envPresent[s.envVar] : false;
          return (
            <div key={s.id} className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{s.name}</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">{s.purpose}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: st.fg, background: st.bg, border: `1px solid ${st.fg}33` }}>{st.label}</span>
                  {s.marketplaceStatus && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ ...MARKETPLACE_STATUS_STYLE[s.marketplaceStatus] }} title={s.marketplaceStatus}>
                      {s.statusLabel ?? s.marketplaceStatus}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                <KV k="Live enabled" v={s.liveEnabled ? "Yes" : "No"} vColor={s.liveEnabled ? "#137a3b" : "#64748b"} />
                <KV k="Safe to run tonight?" v={s.safeTonight ? "Yes" : "No"} vColor={s.safeTonight ? "#137a3b" : "#b45309"} />
                <KV k="Blocks export?" v={s.blocksExport ? "Yes" : "No"} vColor={s.blocksExport ? "#b91c1c" : "#137a3b"} />
                <KV k="Auth needed" v={s.authNeeded} />
                <KV k="Cost risk" v={s.costRisk} vColor={RISK_FG[s.costRisk]} />
                <KV k="Legal risk" v={s.legalRisk} vColor={RISK_FG[s.legalRisk]} />
                <div className="col-span-2">
                  <KV k="Env var" v={s.envVar ? `${s.envVar} — ${keyMissing ? "not set" : "set"}` : "—"} mono vColor={keyMissing ? "#b45309" : undefined} />
                </div>
              </div>

              {s.adapterImplemented !== undefined && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-bordergrey pt-2 text-[12.5px]">
                  <KV k="Adapter implemented" v={s.adapterImplemented ? "Yes" : "No"} vColor={s.adapterImplemented ? "#137a3b" : "#b91c1c"} />
                  <KV k="Source authorised" v={s.sourceAuthorised ? "Yes" : "No"} vColor={s.sourceAuthorised ? "#137a3b" : "#b91c1c"} />
                  <KV k="Credentials available" v={s.credentialsAvailable ? "Yes" : "No"} vColor={s.credentialsAvailable ? "#137a3b" : "#64748b"} />
                  <KV k="Records available" v={s.recordsAvailable != null ? String(s.recordsAvailable) : "—"} vColor={s.recordsAvailable ? "#137a3b" : "#b45309"} />
                  <div className="col-span-2"><KV k="Latest successful import" v={s.latestSuccessfulImport ?? "None"} vColor={s.latestSuccessfulImport ? "#137a3b" : "#64748b"} /></div>
                  {s.latestSourceFailure && (
                    <div className="col-span-2 mt-1 rounded border px-2 py-1.5" style={{ background: "#FBE9E9", borderColor: "#f2c1c1" }}>
                      <span className="text-[11px] font-semibold" style={{ color: "#b91c1c" }}>Latest source failure: </span>
                      <span className="text-[11.5px]" style={{ color: "#7a1f1f" }}>{s.latestSourceFailure}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 border-t border-bordergrey pt-2 text-[12.5px]">
                <p className="text-ink"><span className="text-muted">Pipeline use: </span>{s.pipelineUse}</p>
                <p className="mt-1 text-ink"><span className="text-muted">Next action: </span>{s.nextAction}</p>
                <p className="mt-1 text-[12px] text-muted">{s.notes}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[22px] font-bold text-ink">{value}</div>
    </div>
  );
}
function KV({ k, v, vColor, mono }: { k: string; v: string; vColor?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={mono ? "font-mono text-[12px]" : ""} style={{ color: vColor ?? "#111827" }}>{v}</span>
    </div>
  );
}
