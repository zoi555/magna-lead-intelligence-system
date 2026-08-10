import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { fetchRunDetail } from "@/lib/discovery-engine/reports/run-detail";
import { describeConfigSnapshot, migrateDraft } from "@/lib/discovery/run-draft";
import { RunResultsMap } from "../../discovery-runs/[id]/RunResultsMap";
import { CancelExecutionButton } from "./CancelExecutionButton";

// Canonical run detail/status (P4 control decision, 2026-08-10). Reuses the real
// discovery_runs reporting logic (fetchRunDetail, RunResultsMap) from /discovery-runs rather
// than forking it — that route is left untouched and keeps working as source
// execution/attempt visibility. This route is the "Main Runs" detail screen.
export const dynamic = "force-dynamic";

const CANCELLABLE_STATUSES = new Set(["queued", "running", "cancelling"]);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-bordergrey py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

export default async function CanonicalRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await fetchRunDetail(id);

  if (!d.configured) {
    return <div><PageHeader title="Run Detail" /><div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="Supabase not configured" /></div></div>;
  }
  if (!d.found || !d.run) {
    return (
      <div>
        <PageHeader title="Run Detail" subtitle={`No run found for id ${id}.`} />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="Not found" /></div>
        <p className="mt-3 text-[13px]"><Link href="/pipeline-runs" className="text-actionblue hover:text-actionhover">← Back to Main Runs</Link></p>
      </div>
    );
  }

  const exec = d.executions[0];
  const q = d.qualityReport;
  const isDraftFrozen = d.run.status !== "draft"; // queued/running/completed configuration is immutable
  const snapshotRows = describeConfigSnapshot(d.run.configSnapshot);
  const migratedSnapshot = migrateDraft(d.run.configSnapshot);
  const overlapAcknowledgement = migratedSnapshot?.review.overlapAcknowledgement ?? null;
  const sourceMode = migratedSnapshot?.sourceMode.mode
    ?? (typeof d.run.sourceConfig?.mode === "string" ? (d.run.sourceConfig!.mode as string) : null);

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.run.name}
        subtitle={`Run ${d.run.id} · ${d.run.status}${d.run.reference ? ` · ${d.run.reference}` : ""}`}
        actions={<Link href="/pipeline-runs" className="text-[13px] text-actionblue hover:text-actionhover">← Back to Main Runs</Link>}
      />

      <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft text-[12.5px] text-muted">
        {isDraftFrozen
          ? "This run's configuration is frozen — it left 'draft' status and can no longer be edited from Create New Run."
          : "This run is still a draft — configuration can be edited from Create New Run."}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Run</h2>
          <Row label="Run ID" value={<span className="font-mono text-[12px]">{d.run.id}</span>} />
          <Row label="Status" value={d.run.status} />
          <Row label="Source mode" value={sourceMode === "just_eat_uber_deliveroo" ? "Just Eat + Uber Eats + Deliveroo (multi-platform)" : sourceMode === "just_eat_only" ? "Just Eat only" : (exec?.source ?? "just_eat")} />
          <Row label="Territory / geography" value={d.run.territoryInput} />
          <Row label="Query units (postcode districts)" value={d.run.derivedOutcodes.join(", ") || null} />
          <Row label="Created" value={new Date(d.run.createdAt).toLocaleString("en-GB")} />
          <Row label="Updated" value={new Date(d.run.updatedAt).toLocaleString("en-GB")} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Execution</h2>
          {exec ? (
            <>
              <Row label="Status" value={exec.status} />
              <Row label="Planned / completed queries" value={`${exec.plannedQueries} / ${exec.completedQueries}`} />
              <Row label="Attempts" value={exec.attempts} />
              <Row label="Started" value={exec.startedAt ? new Date(exec.startedAt).toLocaleString("en-GB") : null} />
              <Row label="Completed" value={exec.finishedAt ? new Date(exec.finishedAt).toLocaleString("en-GB") : null} />
              <Row label="Error classification" value={exec.error ? <span className="font-mono text-[12px] text-[#b91c1c]">{JSON.stringify(exec.error)}</span> : "None"} />
              <Row label="Warnings" value={exec.warnings.length ? `${exec.warnings.length} warning(s)` : "None"} />
              <CancelExecutionButton executionId={exec.id} cancellable={CANCELLABLE_STATUSES.has(exec.status)} />
            </>
          ) : <EmptyState title="No execution recorded" />}
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Counts</h2>
          <Row label="Raw observations" value={d.counts.rawObservations} />
          <Row label="Canonical observations" value={d.counts.canonicalObservations} />
          <Row label="Duplicate observations" value={d.counts.duplicateObservations} />
          <Row label="Physically located in target territory" value={d.geographyValidationRan ? d.counts.validGeography : "Not evaluated — geography gate did not run for this run"} />
          <Row label="Delivery-area-only / rejected geography" value={d.geographyValidationRan ? d.counts.outOfScopeGeography : "Not evaluated — geography gate did not run for this run"} />
          <Row label="Consolidated candidates" value={d.counts.consolidatedCandidates} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Territory overlap acknowledgement evidence</h2>
          <p className="text-[11px] text-muted mb-2">Territory overlap is permitted — this is disclosure evidence that the user was shown the overlap and chose to proceed, not authorisation of a restricted action.</p>
          {overlapAcknowledgement?.acknowledged ? (
            <>
              <Row label="Acknowledged by user (claimed intent)" value="Yes" />
              <Row label="Note" value={overlapAcknowledgement.note || null} />
              <Row label="Server-recorded" value={overlapAcknowledgement.acknowledgedBy ? "Yes — evidence stamped by confirm_and_queue_run" : "No — not yet recorded by confirm_and_queue_run"} />
              {overlapAcknowledgement.acknowledgedByEmail && <Row label="Acknowledged by" value={overlapAcknowledgement.acknowledgedByEmail} />}
              {overlapAcknowledgement.acknowledgedAt && <Row label="Acknowledged at" value={new Date(overlapAcknowledgement.acknowledgedAt).toLocaleString("en-GB")} />}
              {overlapAcknowledgement.overlappingRunIds.length > 0 && <Row label="Overlapping run(s)" value={overlapAcknowledgement.overlappingRunIds.join(", ")} />}
            </>
          ) : <p className="text-[13px] text-muted">No overlap acknowledgement recorded on this run — either no material overlap was detected at Review, or none was required.</p>}
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Field coverage</h2>
          {q ? (
            <div className="grid grid-cols-2 gap-1 text-[12.5px]">
              {Object.entries(q).filter(([k]) => k.startsWith("pct_")).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-bordergrey py-1">
                  <span className="text-muted">{k.replace("pct_", "").replace(/_/g, " ")}</span>
                  <span className="text-ink">{typeof v === "number" ? `${Math.round(v * 100)}%` : String(v)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No quality report computed for this run" />}
        </div>

        {d.providerExecutions.length > 0 && (
          <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Provider executions (cost / build)</h2>
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Provider</th><th className="py-1">Actor</th><th className="py-1">Status</th><th className="py-1">Validation</th><th className="py-1">Results</th><th className="py-1">Cost (USD)</th><th className="py-1">Failure</th></tr></thead>
              <tbody>
                {d.providerExecutions.map((p, i) => (
                  <tr key={i} className="border-t border-bordergrey">
                    <td className="py-1">{p.provider}</td>
                    <td className="py-1 font-mono">{p.actorId ?? "—"}</td>
                    <td className="py-1">{p.actorStatus ?? "—"}</td>
                    <td className="py-1">{p.businessValidationStatus ?? "—"}</td>
                    <td className="py-1">{p.resultCount ?? "—"}</td>
                    <td className="py-1">{p.actualCostUsd != null ? `$${p.actualCostUsd}` : "—"}</td>
                    <td className="py-1 text-[#b91c1c]">{p.failureReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Saved immutable configuration snapshot</h2>
          <p className="text-[12px] text-muted mb-2">config_snapshot as saved — the complete source of this run's configuration once queued. Read-only.</p>
          <dl className="text-[12.5px] grid sm:grid-cols-2 gap-x-6">
            {snapshotRows.map((s) => (
              <div key={s.label} className="flex justify-between gap-2 border-b border-bordergrey py-1">
                <dt className="text-muted">{s.label}</dt><dd className="text-ink text-right">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Territory &amp; anchors</h2>
          <RunResultsMap runId={d.run.id} territoryInput={d.run.territoryInput} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Evidence &amp; audit links</h2>
          <p className="text-[13px]">
            <Link href={`/discovery-results?outcode=${encodeURIComponent(d.run.derivedOutcodes[0] ?? d.run.territoryInput ?? "")}`} className="text-actionblue hover:text-actionhover">
              View canonical restaurant records for this run's territory →
            </Link>
          </p>
          <p className="mt-1 text-[13px]"><Link href="/data-quality-exceptions" className="text-actionblue hover:text-actionhover">View data-quality exceptions →</Link></p>
          <p className="mt-1 text-[13px]"><Link href="/audit" className="text-actionblue hover:text-actionhover">View audit log →</Link></p>
          <p className="mt-1 text-[13px]"><Link href={`/discovery-runs/${d.run.id}`} className="text-actionblue hover:text-actionhover">Source execution / attempt visibility (Discovery Runs) →</Link></p>
        </div>
      </div>
    </div>
  );
}
