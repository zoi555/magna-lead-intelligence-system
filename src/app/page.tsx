import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { SetupChecklist } from "@/components/SetupChecklist";
import { StatusBadge } from "@/components/StatusBadge";
import { TENANT_NAME } from "@/lib/app-config";
import { kpis, latestRun, coverageProgress, setupBlockers } from "@/lib/mock-data";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div>
      <PageHeader title="Overview" subtitle={`${TENANT_NAME} · West London operations`} />

      <div role="status" className="mb-4 rounded-card border px-4 py-2 text-[12.5px]" style={{ background: "#FDF3E1", borderColor: "#f2d9a6", color: "#92600b" }}>
        <b>DEMO DATA:</b> every number on this dashboard is illustrative, not database-backed. For
        real, live records see <a href="/discovery-results" className="underline">Discovery Results</a>,{" "}
        <a href="/discovery-runs" className="underline">Discovery Runs</a>, or{" "}
        <a href="/data-quality-exceptions" className="underline">Data-Quality Exceptions</a>.
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="New leads" value={kpis.newLeads} trend="this run" />
        <StatCard label="Ready for review" value={kpis.readyForReview} />
        <StatCard label="Export-ready" value={kpis.exportReady} accent="#7C3AED" />
        <StatCard label="Telesales open" value={kpis.telesalesOpen} />
        <StatCard label="Delivery gaps" value={kpis.deliveryGaps} accent="#F59E0B" />
        <StatCard label="Ignored (auto)" value={kpis.ignoredAuto} />
      </div>

      {/* The three questions every page must answer */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Panel title="What is happening?">
          <ul className="space-y-1.5 text-[13px] text-ink">
            <li>• Run <strong>{latestRun.id}</strong> is <StatusBadge status={latestRun.status} /> — {latestRun.stage}.</li>
            <li>• {latestRun.discovered} discovered → {latestRun.afterDedup} after dedup.</li>
            <li>• Coverage at {coverageProgress.percent}% of the delivery area.</li>
          </ul>
        </Panel>
        <Panel title="What needs attention?">
          <ul className="space-y-1.5 text-[13px] text-ink">
            <li>• <strong>{coverageProgress.inBoundaryGaps}</strong> in-boundary delivery gaps.</li>
            <li>• Export blocked until CTO field validation (ISS-0003).</li>
            <li>• Customer + delivery files missing (ISS-0001 / ISS-0002).</li>
          </ul>
        </Panel>
        <Panel title="What should you do next?">
          <ul className="space-y-1.5 text-[13px] text-ink">
            <li>• Resolve the blocked setup items (right).</li>
            <li>• Review scored leads before export.</li>
            <li>• Work same-day trigger leads first.</li>
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel title="Latest pipeline run">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-medium text-ink">{latestRun.id} · {latestRun.territory}</div>
                <div className="text-[12px] text-muted">{latestRun.date} · cost {latestRun.cost}</div>
              </div>
              <StatusBadge status={latestRun.status} />
            </div>
          </Panel>

          <Panel title="Coverage progress">
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-muted">
                {coverageProgress.targetedDistricts} of {coverageProgress.totalInBoundary} in-boundary districts targeted
              </span>
              <span className="font-semibold text-ink">{coverageProgress.percent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "#EEF1F5" }}>
              <div className="h-full rounded-full" style={{ width: `${coverageProgress.percent}%`, background: "#2563EB" }} />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {coverageProgress.inBoundaryGaps} gaps · {coverageProgress.expansionHeld} expansion areas held
            </div>
          </Panel>
        </div>

        <SetupChecklist items={setupBlockers} />
      </div>
    </div>
  );
}
