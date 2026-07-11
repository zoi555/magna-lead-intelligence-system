import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { pipelineRuns } from "@/lib/mock-data";

export default function PipelineRunsPage() {
  return (
    <div>
      <PageHeader title="Pipeline Runs" subtitle="Discovery / scoring runs and their telemetry." />
      <DataTable
        columns={[
          { key: "id", label: "Run" },
          { key: "territory", label: "Territory set" },
          { key: "date", label: "Date" },
          { key: "discovered", label: "Discovered", align: "right" },
          { key: "dedup", label: "After dedup", align: "right" },
          { key: "cost", label: "Cost", align: "right" },
          { key: "status", label: "Status", badge: true },
        ]}
        rows={pipelineRuns}
        searchKeys={["id", "territory"]}
        searchPlaceholder="Search runs…"
        filter={{ key: "status", label: "Status", options: ["Running", "Complete", "Warning", "Blocked"] }}
        emptyTitle="No pipeline runs"
        emptyHint="Start a run from a territory set once setup blockers are cleared."
      />
    </div>
  );
}
