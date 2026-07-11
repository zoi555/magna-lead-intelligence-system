import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { exportBatches } from "@/lib/mock-data";

export default function ExportReviewPage() {
  return (
    <div>
      <PageHeader
        title="Export Review"
        subtitle="Manual review gate — export to CRM stays disabled until CTO field validation (ISS-0003)."
        actions={
          <button
            disabled
            title="Disabled until CRM field mappings are verified (ISS-0003)."
            className="cursor-not-allowed rounded-btn px-3 py-1.5 text-[13px] font-medium"
            style={{ background: "#EEF1F5", color: "#94a0ae", border: "1px solid #E5E7EB" }}
          >
            Export to CRM (blocked)
          </button>
        }
      />
      <div
        className="mb-4 rounded-card border px-4 py-3 text-[13px]"
        style={{ background: "#FDF3E1", borderColor: "#f2d9a6", color: "#92600b" }}
      >
        Export is held until CRM field mappings are verified (ISS-0003). Review is allowed; nothing is sent.
      </div>
      <DataTable
        columns={[
          { key: "id", label: "Batch" },
          { key: "run", label: "Run" },
          { key: "leads", label: "Leads", align: "right" },
          { key: "approvedBy", label: "Approved by" },
          { key: "date", label: "Date" },
          { key: "status", label: "Status", badge: true },
        ]}
        rows={exportBatches}
        searchKeys={["id", "run"]}
        searchPlaceholder="Search batches…"
        filter={{ key: "status", label: "Status", options: ["Draft", "Blocked", "Exported"] }}
        actionLabel="Review"
        emptyTitle="No export batches"
        emptyHint="Create a batch from reviewed leads once field mappings are verified."
      />
    </div>
  );
}
