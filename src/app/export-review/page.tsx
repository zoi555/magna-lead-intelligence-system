import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { loadLatestResult } from "@/lib/pipeline/run-store";

// Export gate + final export status from the latest run.
export const dynamic = "force-dynamic";

export default function ExportReviewPage() {
  const result = loadLatestResult();
  const eligible = result?.exportEligible ?? [];

  return (
    <div>
      <PageHeader
        title="Export Review"
        subtitle="Manual review gate — CRM push stays disabled until CRM field mapping is verified (ISS-0003)."
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
        <b>EXPORT GATE — ISS-0003:</b> CRM push is locked until field mappings are verified. The review CSV/JSON
        are generated locally ({result ? `${eligible.length} export-eligible leads` : "no run yet"}); nothing is
        sent to a CRM.
      </div>

      {!result ? (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No export batch yet" hint="Run the pipeline: npm run leads:first" />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "lead_id", label: "Lead" },
            { key: "business_name", label: "Business" },
            { key: "postcode", label: "Postcode" },
            { key: "territory_code", label: "Territory" },
            { key: "grade", label: "Grade" },
            { key: "score", label: "Score", align: "right" },
            { key: "delivery", label: "Delivery presence" },
            { key: "export_status", label: "Export status", badge: true },
          ]}
          rows={eligible.map((r) => ({
            lead_id: r.lead_id,
            business_name: r.business_name,
            postcode: r.postcode,
            territory_code: r.territory_code,
            grade: r.grade,
            score: r.score,
            delivery: `${r.platform_presence_status} · ${r.delivery_risk_flag} risk`,
            export_status: r.export_status === "ready_for_review" ? "Review" : r.export_status,
          }))}
          searchKeys={["lead_id", "business_name", "postcode"]}
          searchPlaceholder="Search export-eligible leads…"
          filter={{ key: "grade", label: "Grade", options: ["A", "B", "C"] }}
          actionLabel="Review"
          emptyTitle="No export-eligible leads"
        />
      )}
    </div>
  );
}
