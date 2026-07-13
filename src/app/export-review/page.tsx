import React from "react";
import fs from "node:fs";
import path from "node:path";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { loadLatestResult, loadLatestRunState } from "@/lib/pipeline/run-store";
import { summariseRun, exportFilesStatus, countWarning } from "@/lib/pipeline/run-report";

// Export gate + honest export status from the latest run.
export const dynamic = "force-dynamic";

// Read the TW independent review-workflow summary if present (sales-safe counts only).
function loadTwWorkflow(): Record<string, number> | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "exports/tw-independent-review-workflow-summary.json"), "utf8")); } catch { return null; }
}

export default function ExportReviewPage() {
  const tw = loadTwWorkflow();
  const result = loadLatestResult();
  const state = loadLatestRunState();
  const eligible = result?.exportEligible ?? [];
  const sum = summariseRun(state, result);
  const files = exportFilesStatus();

  const platformUnknown = countWarning(result, "PLATFORM_NOT_CHECKED");
  const chWarn = countWarning(result, "COMPANY_NOT_ENRICHED");
  const gWarn = countWarning(result, "GOOGLE_NOT_ENRICHED");
  const missingPhone = countWarning(result, "MISSING_PHONE");
  const excluded = sum.rejectedTotal;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Export Review"
        subtitle="Manual review gate — CRM push stays locked until CRM field mapping is verified (ISS-0003)."
        actions={
          <button disabled title="Approval workflow not implemented." className="cursor-not-allowed rounded-btn px-3 py-1.5 text-[13px] font-medium" style={{ background: "#EEF1F5", color: "#94a0ae", border: "1px solid #E5E7EB" }}>
            Export to CRM (locked)
          </button>
        }
      />

      <div className="rounded-card border px-4 py-3 text-[13px]" style={{ background: "#FDF3E1", borderColor: "#f2d9a6", color: "#92600b" }}>
        <b>EXPORT GATE: LOCKED</b> — reason: CRM field mappings not verified (ISS-0003). The review CSV/JSON are
        generated locally; nothing is sent to a CRM. <b>Approval workflow is not yet implemented</b> — local
        exports are produced by the pipeline (`npm run leads:first`).
      </div>

      {tw && (
        <div className="rounded-card border border-bordergrey bg-card p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-[14px] text-ink">TW independent review workflow</b>
            <a href="/coverage-map" className="text-[12px] text-actionblue">open coverage map →</a>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="Clean ready-to-call" value={tw.clean_independent_count} good />
            <Stat label="Manual review" value={tw.manual_review_master_count} warn />
            <Stat label="Excluded (audit)" value={tw.excluded_count} />
            <Stat label="Research-phone" value={tw.review_research_phone_count} />
            <Stat label="Company-status review" value={tw.review_company_status_count} warn />
            <Stat label="Chain/category review" value={tw.review_chain_category_ambiguity_count} />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Clean → <code>exports/tw-independent-ready-to-call.csv</code> (sales) · Manual review → <code>exports/tw-independent-manual-review-master.csv</code> (management/admin) · Excluded → <code>exports/tw-independent-excluded-brands-and-non-targets.csv</code> (audit). Files are local, gitignored.
          </p>
        </div>
      )}

      {!result ? (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No export batch yet" hint="Run the pipeline: npm run leads:first" />
        </div>
      ) : (
        <>
          {/* counts */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="Final leads" value={sum.total} />
            <Stat label="Exportable" value={sum.exportable} good />
            <Stat label="Manual review" value={sum.manualReview} warn />
            <Stat label="Held / gated" value={sum.held} warn />
            <Stat label="Excluded (funnel)" value={excluded} />
            <Stat label="Missing coordinates" value={sum.missingCoords} danger />
          </div>

          {/* source warnings */}
          <div className="rounded-card border border-bordergrey bg-card p-3 text-[13px] shadow-soft">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Source warnings (leads affected)</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
              <KV k="Missing phone" v={missingPhone} />
              <KV k="Platform presence unknown" v={platformUnknown} />
              <KV k="Companies House not configured" v={chWarn} />
              <KV k="Google Places disabled" v={gWarn} />
              <KV k="Delivery presence" v="manual/import only" text />
            </div>
          </div>

          {/* export files */}
          <div className="rounded-card border border-bordergrey bg-card p-3 text-[13px] shadow-soft">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Local export files</div>
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between border-b border-bordergrey py-1.5 last:border-0">
                <span className="font-mono text-ink">{f.path}</span>
                <span className="text-muted">{f.exists ? `generated locally · ${f.sizeKB} KB` : "not generated"}</span>
              </div>
            ))}
          </div>

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
        </>
      )}
    </div>
  );
}

function Stat({ label, value, good, warn, danger }: { label: string; value: number; good?: boolean; warn?: boolean; danger?: boolean }) {
  const color = danger ? "#b91c1c" : warn ? "#b45309" : good ? "#137a3b" : "#111827";
  return (
    <div className="rounded-card border border-bordergrey bg-card p-2.5 shadow-soft">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[16px] font-bold" style={{ color }}>{value.toLocaleString("en-GB")}</div>
    </div>
  );
}
function KV({ k, v, text }: { k: string; v: number | string; text?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={text ? "text-ink" : "font-mono text-ink"}>{v}</span>
    </div>
  );
}
