import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { TENANT_NAME } from "@/lib/app-config";
import { fetchHomepageOverview } from "@/lib/discovery-engine/reports/homepage-overview";
import { MANUAL_IMPORT_STATUS } from "@/lib/sources/source-registry";

export const dynamic = "force-dynamic";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function NA() {
  return <span className="text-muted">Not available</span>;
}

export default async function OverviewPage() {
  const overview = await fetchHomepageOverview();

  if (!overview.configured) {
    return (
      <div>
        <PageHeader title="Overview" subtitle={`${TENANT_NAME} · internal beta`} />
        <div role="status" className="rounded-card border px-4 py-3 text-[13px]" style={{ background: "#FBE9E9", borderColor: "#f1b8b8", color: "#b91c1c" }}>
          Database is not configured for this deployment (no service credentials). No figures can be shown.
        </div>
      </div>
    );
  }

  const { latestRun, justEatOutletCount, dataQualityExceptionsTotal, newCandidatesLast24h, latestImport, sourceHealth } = overview;

  // Real, derived blockers — never fabricated. A source is a blocker while it isn't ACTIVE;
  // outstanding data-quality exceptions are a blocker while the count is above zero.
  const blockers: { id: string; label: string }[] = [];
  for (const s of sourceHealth) {
    if (s.marketplaceStatus && s.marketplaceStatus !== "ACTIVE") {
      blockers.push({ id: s.id, label: `${s.name}: ${(s.statusLabel ?? s.marketplaceStatus.replace(/_/g, " ")).toLowerCase()}` });
    }
  }
  if (typeof dataQualityExceptionsTotal === "number" && dataQualityExceptionsTotal > 0) {
    blockers.push({ id: "dq_exceptions", label: `${dataQualityExceptionsTotal} open data-quality exceptions` });
  }

  return (
    <div>
      <PageHeader title="Overview" subtitle={`${TENANT_NAME} · internal beta`} />

      <div role="status" className="mb-4 rounded-card border px-4 py-2 text-[12.5px]" style={{ background: "#E7F5EC", borderColor: "#bfe5cd", color: "#137a3b" }}>
        <b>Internal beta:</b> every figure below is a live database query. Metrics not yet implemented show
        &ldquo;Not available&rdquo; rather than an invented number.
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <a href="/pipeline-runs/new" className="rounded-btn bg-[#2563EB] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]">Create New Run</a>
        <a href="/discovery-results" className="rounded-btn border border-bordergrey bg-card px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-[#fafbfc]">Review Results</a>
        <a href="/data-quality-exceptions" className="rounded-btn border border-bordergrey bg-card px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-[#fafbfc]">Resolve Exceptions</a>
        <a href="/coverage-map" className="rounded-btn border border-bordergrey bg-card px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-[#fafbfc]">Open Coverage Map</a>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Raw observations" value={latestRun ? latestRun.counts.rawObservations : <NA />} trend={latestRun ? "latest run" : undefined} />
        <StatCard label="Canonical" value={latestRun ? latestRun.counts.canonicalObservations : <NA />} />
        <StatCard label="Geography-valid" value={latestRun ? latestRun.counts.validGeography : <NA />} />
        <StatCard label="Duplicates" value={latestRun ? latestRun.counts.duplicateObservations : <NA />} accent="#F59E0B" />
        <StatCard label="Data-quality exceptions" value={dataQualityExceptionsTotal} accent="#b91c1c" />
        <StatCard label="New candidates (24h)" value={newCandidatesLast24h} accent="#2563EB" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel title="Latest pipeline run">
            {latestRun ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-medium text-ink">
                    {latestRun.run?.name ?? latestRun.runId} · {latestRun.run?.territoryInput ?? <NA />}
                  </div>
                  <div className="text-[12px] text-muted">
                    {latestRun.run?.createdAt ? new Date(latestRun.run.createdAt).toLocaleString("en-GB") : <NA />}
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    Consolidated candidates: {latestRun.counts.consolidatedCandidates}
                  </div>
                </div>
                <StatusBadge status={latestRun.run?.status ?? "unknown"} />
              </div>
            ) : (
              <p className="text-[13px] text-muted">No discovery run has been created yet.</p>
            )}
            <div className="mt-3 text-[12px]">
              <a href="/discovery-runs" className="underline text-muted">All discovery runs</a>
              {" · "}
              <a href="/pipeline-runs/new" className="underline text-muted">Start a new run</a>
            </div>
          </Panel>

          <Panel title="Source health">
            <ul className="space-y-1.5 text-[13px] text-ink">
              {sourceHealth.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span>{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-muted">
                      {s.recordsAvailable != null ? `${s.recordsAvailable} records` : <NA />}
                    </span>
                    <StatusBadge status={s.statusLabel ?? s.marketplaceStatus ?? "unknown"} />
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-bordergrey pt-1.5">
                <span>Manual import</span>
                <StatusBadge status={MANUAL_IMPORT_STATUS} />
              </li>
              <li className="flex items-center justify-between">
                <span>Just Eat outlets (live count)</span>
                <span className="font-semibold text-ink">{justEatOutletCount}</span>
              </li>
            </ul>
            <div className="mt-3 text-[12px]"><a href="/settings" className="underline text-muted">Full source registry</a></div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Latest import">
            {latestImport ? (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-medium text-ink">
                    {latestImport.source} · {latestImport.originalFilename ?? "(no filename recorded)"}
                  </div>
                  <StatusBadge status={latestImport.status} />
                </div>
                <div className="mt-1 text-[12px] text-muted">
                  {latestImport.acceptedCount} accepted · {new Date(latestImport.importedAt).toLocaleString("en-GB")}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-muted">No import has been recorded yet.</p>
            )}
            <div className="mt-3 text-[12px]"><a href="/import" className="underline text-muted">Import screen</a></div>
          </Panel>

          <Panel title="Territory coverage">
            <p className="text-[13px] text-muted">
              Coverage percentage and covered/uncovered districts: <NA /> — no canonical delivery-area
              boundary source has been imported yet (Coverage Map currently uses an illustrative overlay).
            </p>
            <div className="mt-3 text-[12px]"><a href="/coverage-map" className="underline text-muted">Open Coverage Map</a></div>
          </Panel>

          <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Active blockers</h2>
              <span className="text-[12px] text-muted">Derived from live source &amp; data-quality state</span>
            </div>
            {blockers.length === 0 ? (
              <p className="text-[13px] text-muted">No blockers detected from current source health or data-quality signals.</p>
            ) : (
              <ul className="divide-y divide-bordergrey">
                {blockers.map((b) => (
                  <li key={b.id} className="py-2 text-[13px] text-ink">{b.label}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-[12px]"><a href="/data-quality-exceptions" className="underline text-muted">Data-quality exceptions</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
