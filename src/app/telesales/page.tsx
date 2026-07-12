import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { loadLatestResult } from "@/lib/pipeline/run-store";
import { toTelesalesSafeQueue } from "@/lib/pipeline/telesales-safe-view";

// SAFE telesales queue only — built via the safe-view helper (single safe boundary).
// No internal score, matching internals, financials, or enrichment internals reach this page.
export const dynamic = "force-dynamic";

export default function TelesalesPage() {
  const result = loadLatestResult();
  const queue = result ? toTelesalesSafeQueue(result.leads) : [];

  return (
    <div>
      <PageHeader
        title="Telesales — Safe Queue"
        subtitle="Safe fields only: no internal score, matching internals, financials, or enrichment internals."
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
            { key: "source_warning", label: "Source warning" },
          ]}
          rows={queue}
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
