import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { fetchRecentRuns } from "@/lib/discovery-engine/reports/run-detail";

export const dynamic = "force-dynamic";

export default async function DiscoveryRunsPage() {
  const { configured, runs } = await fetchRecentRuns();

  if (!configured) {
    return (
      <div>
        <PageHeader title="Discovery Runs" />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Supabase not configured" />
        </div>
      </div>
    );
  }
  if (!runs.length) {
    return (
      <div>
        <PageHeader title="Discovery Runs" subtitle="Real discovery_runs history." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No runs yet" hint='Run: npm run je:run -- "UB1"' />
        </div>
      </div>
    );
  }

  const rows = runs.map((r) => ({
    name: <Link href={`/discovery-runs/${r.id}`} className="font-medium text-actionblue hover:text-actionhover">{r.name}</Link>,
    name_text: r.name,
    territory: r.territoryInput ?? "—",
    status: r.status,
    created: new Date(r.createdAt).toLocaleString("en-GB"),
  }));

  return (
    <div>
      <PageHeader title="Discovery Runs" subtitle={`${runs.length} real run(s) from discovery_runs.`} />
      <DataTable
        columns={[
          { key: "name", label: "Run" },
          { key: "territory", label: "Territory" },
          { key: "status", label: "Status", badge: true },
          { key: "created", label: "Created" },
        ]}
        rows={rows}
        searchKeys={["name_text", "territory"]}
        searchPlaceholder="Search runs…"
        emptyTitle="No runs"
      />
    </div>
  );
}
