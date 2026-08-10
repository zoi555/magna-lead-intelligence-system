import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { fetchRecentAuditRecords } from "@/lib/discovery-engine/reports/audit-evidence";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { configured, records } = await fetchRecentAuditRecords();

  if (!configured) {
    return <div><PageHeader title="Audit / Evidence" /><div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="Supabase not configured" /></div></div>;
  }
  if (!records.length) {
    return (
      <div>
        <PageHeader title="Audit / Evidence" subtitle="Real raw provider observations." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="No observations yet" hint='Run: npm run je:run -- "<postcode district>"' /></div>
      </div>
    );
  }

  const rows = records.map((r) => ({
    id: <Link href={`/audit/${r.id}`} className="font-mono text-[12px] text-actionblue hover:text-actionhover">{r.id.slice(0, 8)}…</Link>,
    id_text: r.id,
    source: r.source,
    source_record_id: r.sourceRecordId ?? "—",
    response_type: r.responseType,
    parse_status: r.parseStatus,
    duplicate: r.duplicateOf ? "Yes" : "No",
    fetched_at: new Date(r.fetchedAt).toLocaleString("en-GB"),
  }));

  return (
    <div>
      <PageHeader title="Audit / Evidence" subtitle={`${records.length} most recent raw observations. No secrets or raw authentication data are ever shown.`} />
      <DataTable
        columns={[
          { key: "id", label: "Observation" },
          { key: "source", label: "Source" },
          { key: "source_record_id", label: "Source record ID" },
          { key: "response_type", label: "Response type" },
          { key: "parse_status", label: "Parse status", badge: true },
          { key: "duplicate", label: "Duplicate?" },
          { key: "fetched_at", label: "Fetched" },
        ]}
        rows={rows}
        searchKeys={["id_text", "source_record_id"]}
        searchPlaceholder="Search by ID…"
        emptyTitle="No observations"
      />
    </div>
  );
}
