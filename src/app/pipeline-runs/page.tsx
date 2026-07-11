import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineViews } from "@/components/pipeline/PipelineViews";
import { loadLatestRunState } from "@/lib/pipeline/run-store";
import { STAGE_DEFS } from "@/lib/pipeline/stages";
import { PILOT_PREFIXES } from "@/lib/pipeline/run-discovery";
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

export default function PipelineRunsPage() {
  const state = loadLatestRunState() ?? pendingState();
  const hasRun = state.run_id !== "—";

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

      {/* HERO: two animated pipeline modes — Operational Status + Flow Network */}
      <PipelineViews state={state} />

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
