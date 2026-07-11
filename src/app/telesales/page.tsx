import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { telesalesAssignments } from "@/lib/mock-data";

export default function TelesalesPage() {
  return (
    <div>
      <PageHeader
        title="Telesales"
        subtitle="Assigned, exported leads — safe contact fields only (no financials, scores, or match data)."
      />
      <DataTable
        columns={[
          { key: "id", label: "Assignment" },
          { key: "brand", label: "Business" },
          { key: "postcode", label: "Postcode" },
          { key: "phone", label: "Contact" },
          { key: "tier", label: "Tier" },
          { key: "trigger", label: "Trigger" },
          { key: "worked", label: "Worked", badge: true },
        ]}
        rows={telesalesAssignments}
        searchKeys={["brand", "postcode"]}
        searchPlaceholder="Search assignments…"
        filter={{ key: "worked", label: "Worked", options: ["Open", "In progress", "Contacted"] }}
        actionLabel="Open"
        emptyTitle="No assignments"
        emptyHint="Assignments appear when an export batch is approved and assigned to a rep."
      />
    </div>
  );
}
