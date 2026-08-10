import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { fetchMainRunsOverview } from "@/lib/discovery-engine/reports/run-detail";

// Main Runs (P4 control decision, 2026-08-10): the canonical, database-backed
// discovery_runs list — the sole /pipeline-runs UI. AspectLead is a national Great
// Britain product; the old local TW/FSA pilot-territory file monitor that previously
// used this URL is no longer part of the application's routing (removed 2026-08-10,
// same day, per P4 control addendum "remove TW/pilot UI from product") — its
// underlying logic (src/lib/pipeline/*) is untouched for historical/test reference,
// only its UI page and route were removed.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "Draft", queued: "Draft", running: "Running", completed: "Complete",
  completed_with_warnings: "Warning", failed: "Blocked", cancelling: "Warning", cancelled: "Blocked",
};

function actionFor(run: { id: string; status: string }) {
  if (run.status === "draft") return { href: `/pipeline-runs/new?draftId=${run.id}`, label: "Continue editing" };
  return { href: `/pipeline-runs/${run.id}`, label: "View status" };
}

export default async function MainRunsPage() {
  const { configured, runs } = await fetchMainRunsOverview();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Main Runs"
        subtitle="Configured discovery runs and their status — database-backed (discovery_runs)."
        actions={<a href="/pipeline-runs/new" className="rounded-btn bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]">Create New Run</a>}
      />

      {!configured && (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Supabase not configured" hint="Set SUPABASE_SERVICE_ROLE_KEY to see Main Runs." />
        </div>
      )}

      {configured && runs.length === 0 && (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No runs yet" hint="Create a run to get started." />
        </div>
      )}

      {configured && runs.length > 0 && (
        <div className="rounded-card border border-bordergrey bg-card shadow-soft overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Run", "Owner", "Territory", "Source mode", "Status", "Progress", "Candidates", "Cost (USD)", "Updated", "Actions"].map((h) => (
                  <th key={h} className="border-b border-bordergrey px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const action = actionFor(r);
                const progress = r.plannedQueries != null && r.completedQueries != null ? `${r.completedQueries}/${r.plannedQueries}` : "—";
                const cost = r.actualCostUsd != null ? `$${r.actualCostUsd.toFixed(2)} actual` : r.estimatedCostUsd != null ? `$${r.estimatedCostUsd.toFixed(2)} est.` : "—";
                return (
                  <tr key={r.id} className="hover:bg-[#fafbfc]">
                    <td className="border-b border-bordergrey px-3 py-2">
                      <Link href={`/pipeline-runs/${r.id}`} className="font-medium text-actionblue hover:text-actionhover">{r.name}</Link>
                      {r.reference && <div className="text-[11px] text-muted">{r.reference}</div>}
                    </td>
                    <td className="border-b border-bordergrey px-3 py-2 text-muted">{r.ownerLabel}</td>
                    <td className="border-b border-bordergrey px-3 py-2 text-ink">{r.territoryInput ?? "—"}</td>
                    <td className="border-b border-bordergrey px-3 py-2 text-ink">{r.sourceMode ?? "—"}</td>
                    <td className="border-b border-bordergrey px-3 py-2"><StatusBadge status={STATUS_BADGE[r.status] ?? r.status} /></td>
                    <td className="border-b border-bordergrey px-3 py-2 font-mono text-ink">{progress}{r.latestExecutionStatus ? <span className="text-[11px] text-muted"> ({r.latestExecutionStatus})</span> : null}</td>
                    <td className="border-b border-bordergrey px-3 py-2 font-mono text-ink">{r.candidateCount ?? "—"}</td>
                    <td className="border-b border-bordergrey px-3 py-2 font-mono text-ink">{cost}</td>
                    <td className="border-b border-bordergrey px-3 py-2 text-muted">{new Date(r.updatedAt).toLocaleString("en-GB")}</td>
                    <td className="border-b border-bordergrey px-3 py-2"><Link href={action.href} className="text-actionblue hover:text-actionhover">{action.label}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
