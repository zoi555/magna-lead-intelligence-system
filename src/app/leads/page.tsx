import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { discoveredLeads, ignoredSummary } from "@/lib/mock-data";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Leads" subtitle="Discovered, verified, scored leads (full internal view)." />
        <DataTable
          columns={[
            { key: "id", label: "Lead" },
            { key: "brand", label: "Brand" },
            { key: "postcode", label: "Postcode" },
            { key: "tier", label: "Tier" },
            { key: "score", label: "Score", align: "right" },
            { key: "verify", label: "Verify" },
            { key: "status", label: "Status", badge: true },
          ]}
          rows={discoveredLeads}
          searchKeys={["id", "brand", "postcode"]}
          searchPlaceholder="Search leads…"
          filter={{ key: "tier", label: "Tier", options: ["A", "B", "Low"] }}
          emptyTitle="No leads yet"
          emptyHint="Leads appear after a pipeline run completes discovery and scoring."
        />
      </div>

      <div>
        <h2 className="mb-2 text-[18px] font-semibold text-headertext">Ignored leads (audit)</h2>
        <DataTable
          columns={[
            { key: "reason", label: "Reason" },
            { key: "count", label: "Count", align: "right" },
            { key: "note", label: "Detail" },
          ]}
          rows={ignoredSummary}
          searchKeys={["reason", "note"]}
          searchPlaceholder="Search reasons…"
          emptyTitle="No ignored leads"
        />
      </div>
    </div>
  );
}
