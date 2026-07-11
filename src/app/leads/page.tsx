import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { loadLatestResult, loadLatestRunState } from "@/lib/pipeline/run-store";

// Final scored candidates from the latest run (full internal view).
export const dynamic = "force-dynamic";

export default function LeadsPage() {
  const result = loadLatestResult();
  const state = loadLatestRunState();

  if (!result) {
    return (
      <div>
        <PageHeader title="Leads" subtitle="Final scored candidates (full internal view)." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No leads yet" hint="Run the pipeline: npm run leads:first" />
        </div>
      </div>
    );
  }

  const rows = result.leads.map((l) => ({
    lead_id: l.lead_id,
    business_name: l.business_name,
    postcode: l.postcode,
    territory: l.territory_code,
    type: l.business_type,
    fsa: l.fsa_rating,
    grade: l.grade,
    score: l.score,
    trigger: l.trigger_reason,
    delivery: `${l.platform_presence_status} (${l.delivery_risk_flag} risk)`,
    status: l.export_status === "ready_for_review" ? "Review" : "Draft",
  }));

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`Final scored candidates from ${state?.run_id ?? result.run_id} — ${result.leads.length} leads (full internal view).`}
      />
      <DataTable
        columns={[
          { key: "lead_id", label: "Lead" },
          { key: "business_name", label: "Business" },
          { key: "postcode", label: "Postcode" },
          { key: "territory", label: "Territory" },
          { key: "type", label: "Type" },
          { key: "fsa", label: "FSA" },
          { key: "grade", label: "Grade" },
          { key: "score", label: "Score", align: "right" },
          { key: "trigger", label: "Trigger" },
          { key: "delivery", label: "Delivery" },
          { key: "status", label: "Status", badge: true },
        ]}
        rows={rows}
        searchKeys={["lead_id", "business_name", "postcode", "trigger"]}
        searchPlaceholder="Search leads…"
        filter={{ key: "grade", label: "Grade", options: ["A", "B", "C", "D"] }}
        emptyTitle="No leads"
      />
    </div>
  );
}
