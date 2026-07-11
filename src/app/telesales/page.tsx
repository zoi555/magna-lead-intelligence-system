import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { loadLatestResult } from "@/lib/pipeline/run-store";

// SAFE telesales queue only. The rows come from the run's telesalesSafe projection,
// which by construction contains no score, no match internals, and no financials.
export const dynamic = "force-dynamic";

export default function TelesalesPage() {
  const result = loadLatestResult();
  const safe = result?.telesalesSafe ?? [];

  return (
    <div>
      <PageHeader
        title="Telesales — Safe Queue"
        subtitle="Safe fields only: no internal score, no matching internals, no financials."
      />
      {!result ? (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No assignments yet" hint="Run the pipeline: npm run leads:first" />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "business_name", label: "Business" },
            { key: "postcode", label: "Postcode" },
            { key: "phone", label: "Phone" },
            { key: "category", label: "Category" },
            { key: "trigger_reason", label: "Trigger" },
            { key: "assigned_rep", label: "Rep" },
            { key: "worked_status", label: "Worked", badge: true },
          ]}
          rows={safe}
          searchKeys={["business_name", "postcode", "assigned_rep"]}
          searchPlaceholder="Search safe queue…"
          filter={{ key: "worked_status", label: "Worked", options: ["Open", "In progress", "Contacted"] }}
          actionLabel="Open"
          emptyTitle="No assignments"
        />
      )}
    </div>
  );
}
