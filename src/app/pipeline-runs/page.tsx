import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineViews } from "@/components/pipeline/PipelineViews";
import { loadLatestRunState, loadLatestResult } from "@/lib/pipeline/run-store";
import { STAGE_DEFS } from "@/lib/pipeline/stages";
import { PILOT_PREFIXES } from "@/lib/pipeline/run-discovery";
import { summariseRun, errorBreakdown, exportFilesStatus } from "@/lib/pipeline/run-report";
import { SOURCE_REGISTRY } from "@/lib/sources/source-registry";
import type { RunState, StageStatus } from "@/lib/pipeline/types";

// Reads the local run store at request time (resumable pipeline monitor).
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<StageStatus, string> = {
  completed: "Complete",
  running: "Running",
  paused: "Warning",
  failed: "Blocked",
  pending: "Draft",
  skipped: "Draft",
};

// A pending, all-zero run state for when no run has been executed yet.
function pendingState(): RunState {
  return {
    run_id: "—",
    status: "draft",
    current_stage: null,
    started_at: null,
    updated_at: "",
    completed_at: null,
    config: {
      run_id: "—",
      territory_label: "West London pilot",
      postcode_prefixes: PILOT_PREFIXES,
      mode: "live",
      fsa_page_size: 200,
      created_from: "—",
    },
    stages: STAGE_DEFS.map((d) => ({
      stage_id: d.id,
      label: d.label,
      status: "pending" as StageStatus,
      started_at: null,
      completed_at: null,
      input_count: 0,
      output_count: 0,
      rejected_count: 0,
      error_count: 0,
      notes: "",
      errors: [],
    })),
    errors: [],
    counters: {
      fetched: 0, normalised: 0, valid_postcodes: 0, in_territory: 0, food_category: 0,
      deduped: 0, after_existing_exclusion: 0, scored: 0, export_ready: 0, exported: 0, rejected_total: 0,
    },
    output_files: [],
  };
}

const fmtTime = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 19) + "Z" : "—");

export default function PipelineRunsPage() {
  const loaded = loadLatestRunState();
  const state = loaded ?? pendingState();
  const bundle = loadLatestResult();
  const hasRun = state.run_id !== "—";
  const sum = summariseRun(loaded, bundle);
  const eb = errorBreakdown(loaded);
  const files = exportFilesStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Runs — Automation Monitor"
        subtitle={
          hasRun
            ? "Live animated view of the discovery pipeline. Click any stage for rules, counts and sample rejections."
            : "No run yet — start one with `npm run leads:first`. The flow below shows the stage structure."
        }
      />

      <div className="flex items-center justify-between rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <div>
          <div className="text-[14px] font-semibold text-ink">Create a discovery run</div>
          <div className="text-[12px] text-muted">
            Configure territory, target profile, provider and spend, then review and confirm before it starts.
            This is a separate, database-backed system from the local TW/FSA pipeline monitor below.
          </div>
        </div>
        <a href="/pipeline-runs/new" className="rounded-btn bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]">Create New Run</a>
      </div>

      {/* Latest run summary */}
      {hasRun && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
            <Stat label="Run" value={sum.runId} mono />
            <Stat label="Status" badge={sum.status} />
            <Stat label="Final leads" value={String(sum.total)} mono />
            <Stat label="Exportable" value={String(sum.exportable)} mono good />
            <Stat label="Manual review" value={String(sum.manualReview)} mono warn />
            <Stat label="Mapped" value={`${sum.mapped}/${sum.total}`} mono />
            <Stat label="Warnings" value={String(sum.warningCount)} mono warn />
            <Stat label="Errors" value={String(sum.errorCount)} mono danger={sum.errorCount > 0} />
          </div>
          <p className="text-[12px] text-muted">
            Started {fmtTime(sum.started)} · completed {fmtTime(sum.completed)} · rejected total {sum.rejectedTotal}
            {sum.failedStage && <> · <span className="text-[#b91c1c]">failed stage: {sum.failedStage}</span></>}
            {sum.missingCoords > 0 && <> · {sum.missingCoords} leads unmapped (missing coordinates)</>}
          </p>
        </div>
      )}

      {/* Source status per run */}
      <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Source readiness (this run)</div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_REGISTRY.map((s) => (
            <span key={s.id} className="rounded-btn border border-bordergrey px-2 py-1 text-[11.5px]" title={s.pipelineUse}>
              <b className="text-ink">{s.name}</b> <span className="text-muted">· {s.liveEnabled ? "live" : s.status.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      </div>

      {/* HERO: two animated pipeline modes — Operational Status + Flow Network */}
      <PipelineViews state={state} />

      {/* Export files + error breakdown */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card shadow-soft">
          <div className="border-b border-bordergrey px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Local export files</div>
          <div className="p-3 text-[13px]">
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between border-b border-bordergrey py-1.5 last:border-0">
                <span className="font-mono text-ink">{f.path}</span>
                <span className="text-muted">{f.exists ? `generated locally · ${f.sizeKB} KB` : "not generated"}</span>
              </div>
            ))}
            <p className="mt-2 text-[11.5px] text-muted">Files are generated locally by the pipeline (`npm run leads:first`). Browser download is not implemented.</p>
          </div>
        </div>
        <div className="rounded-card border border-bordergrey bg-card shadow-soft">
          <div className="border-b border-bordergrey px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Stage error summary</div>
          <div className="p-3 text-[13px]">
            {eb.failedStage && <p className="mb-2 text-[#b91c1c]">Failed stage: <b>{eb.failedStage}</b></p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-muted">Top warnings</div>
                {eb.warnings.slice(0, 5).map((w) => (
                  <div key={w.code} className="flex justify-between font-mono text-[12px]"><span className="text-ink">{w.code}</span><span className="text-muted">{w.count}</span></div>
                ))}
                {eb.warnings.length === 0 && <div className="text-[12px] text-muted">none</div>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-muted">Errors</div>
                {eb.errors.slice(0, 5).map((w) => (
                  <div key={w.code} className="flex justify-between font-mono text-[12px]"><span className="text-ink">{w.code}</span><span className="text-muted">{w.count}</span></div>
                ))}
                {eb.errors.length === 0 && <div className="text-[12px] text-muted">none</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary: compact detailed stage table */}
      <div className="rounded-card border border-bordergrey bg-card shadow-soft">
        <div className="border-b border-bordergrey px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          Detailed stage table
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Stage", "Status", "In", "Out", "Rejected", "Errors", "Notes"].map((h, i) => (
                  <th
                    key={h}
                    className="border-b border-bordergrey px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted"
                    style={{ textAlign: i >= 2 && i <= 5 ? "right" : "left" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.stages.map((s) => (
                <tr key={s.stage_id} className="hover:bg-[#fafbfc]">
                  <td className="border-b border-bordergrey px-3 py-2 text-ink">{s.label}</td>
                  <td className="border-b border-bordergrey px-3 py-2"><StatusBadge status={STATUS_LABEL[s.status]} /></td>
                  <td className="border-b border-bordergrey px-3 py-2 text-right font-mono text-ink">{s.input_count}</td>
                  <td className="border-b border-bordergrey px-3 py-2 text-right font-mono text-ink">{s.output_count}</td>
                  <td className="border-b border-bordergrey px-3 py-2 text-right font-mono text-ink">{s.rejected_count}</td>
                  <td className="border-b border-bordergrey px-3 py-2 text-right font-mono text-ink">{s.error_count}</td>
                  <td className="border-b border-bordergrey px-3 py-2 text-[12px] text-muted">{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono, good, warn, danger, badge }: { label: string; value?: string; mono?: boolean; good?: boolean; warn?: boolean; danger?: boolean; badge?: string }) {
  const color = danger ? "#b91c1c" : warn ? "#b45309" : good ? "#137a3b" : "#111827";
  return (
    <div className="rounded-card border border-bordergrey bg-card p-2.5 shadow-soft">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[14px]">
        {badge ? <StatusBadge status={STATUS_LABEL[(["completed","running","paused","failed","pending","skipped"].includes(badge) ? badge : "pending") as StageStatus]} /> : <span className={mono ? "font-mono" : ""} style={{ color }}>{value}</span>}
      </div>
    </div>
  );
}
