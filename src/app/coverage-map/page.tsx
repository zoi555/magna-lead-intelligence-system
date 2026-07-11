import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MapEngine } from "@/components/map/MapEngine";
import { loadLatestResult, loadLatestRunState } from "@/lib/pipeline/run-store";
import type { MapPoint, RunInfo } from "@/components/map/types";

const GRADE_COLOR: Record<string, string> = { A: "#16A34A", B: "#2563EB", C: "#F59E0B", D: "#94A3B8" };

// POC-derived coverage map connected to the latest run's real lead coordinates.
export const dynamic = "force-dynamic";

export default function CoverageMapPage() {
  const result = loadLatestResult();
  const state = loadLatestRunState();

  if (!result) {
    return (
      <div>
        <PageHeader title="Coverage Map" subtitle="POC-derived territory map connected to the latest run." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No run to map yet" hint="Run the pipeline: npm run leads:first" />
        </div>
      </div>
    );
  }

  const points: MapPoint[] = result.leads
    .map((l) => {
      const lat = parseFloat(l.latitude);
      const lng = parseFloat(l.longitude);
      return {
        id: l.lead_id,
        lat,
        lng,
        postcode: l.postcode,
        color: GRADE_COLOR[l.grade] ?? "#94A3B8",
        label: l.business_name,
        meta: {
          grade: l.grade,
          score: l.score,
          territory: l.territory_code,
          trigger: l.trigger_reason,
          delivery: `${l.platform_presence_status} (${l.delivery_risk_flag} risk)`,
          export_status: l.export_status,
        },
      } as MapPoint;
    })
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));

  const c = state?.counters;
  const run: RunInfo = {
    run_id: result.run_id,
    fetched: c?.fetched ?? result.summary.fetched,
    in_territory: c?.in_territory ?? 0,
    final_leads: result.summary.final_leads,
    rejected_total: c?.rejected_total ?? result.summary.rejected_total,
  };

  return (
    <div>
      <PageHeader
        title="Coverage Map"
        subtitle="Reusable POC-derived map engine plotting real lead coordinates. Switch granularity (area/district/sector) and road mode; scroll to zoom, drag to pan."
      />
      <MapEngine points={points} runInfo={run} />
    </div>
  );
}
