import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { fetchRunDetail } from "@/lib/discovery-engine/reports/run-detail";
import { RunResultsMap } from "./RunResultsMap";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-bordergrey py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
        <p className="mt-3 text-[13px]"><Link href="/discovery-runs" className="text-actionblue hover:text-actionhover">← Back to Discovery Runs</Link></p>
      </div>
    );
  }

  const exec = d.executions[0];
  const q = d.qualityReport;

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.run.name}
        subtitle={`Run ${d.run.id} · ${d.run.status}`}
        actions={<Link href="/discovery-runs" className="text-[13px] text-actionblue hover:text-actionhover">← Back to runs</Link>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Run</h2>
          <Row label="Run ID" value={<span className="font-mono text-[12px]">{d.run.id}</span>} />
          <Row label="Status" value={d.run.status} />
          <Row label="Provider" value={exec?.source ?? "just_eat"} />
          <Row label="Territory / geography" value={d.run.territoryInput} />
          <Row label="Anchors (derived outcodes)" value={d.run.derivedOutcodes.join(", ") || null} />
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
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Territory &amp; anchors</h2>
          <RunResultsMap runId={d.run.id} territoryInput={d.run.territoryInput} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Evidence links</h2>
          <p className="text-[13px]">
            <Link href={`/discovery-results?outcode=${encodeURIComponent(d.run.derivedOutcodes[0] ?? d.run.territoryInput ?? "")}`} className="text-actionblue hover:text-actionhover">
              View canonical restaurant records for this run's territory →
            </Link>
          </p>
          <p className="mt-1 text-[13px]"><Link href="/data-quality-exceptions" className="text-actionblue hover:text-actionhover">View data-quality exceptions →</Link></p>
        </div>
      </div>
    </div>
  );
}
