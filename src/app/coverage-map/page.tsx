import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { MockMapPanel } from "@/components/MockMapPanel";
import { coverageProgress } from "@/lib/mock-data";

export default function CoverageMapPage() {
  return (
    <div>
      <PageHeader
        title="Coverage Map"
        subtitle="Cumulative coverage across runs — schematic mock (real map uses OS open data, per POC)."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Targeted districts" value={coverageProgress.targetedDistricts} accent="#2563EB" />
        <StatCard label="In-boundary gaps" value={coverageProgress.inBoundaryGaps} accent="#F59E0B" />
        <StatCard label="Expansion held" value={coverageProgress.expansionHeld} accent="#8B5CF6" />
        <StatCard label="Coverage" value={`${coverageProgress.percent}%`} />
      </div>
      <MockMapPanel />
    </div>
  );
}
