import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { fetchOutletResults } from "@/lib/discovery-engine/reports/outlet-results";

// Real, database-backed Just Eat discovery results — no placeholder/mock records.
// Reads je_outlets at request time via the service-role client (server-only).
export const dynamic = "force-dynamic";

export default async function DiscoveryResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcode?: string }>;
}) {
  const sp = await searchParams;
  const outcode = (sp.outcode ?? "UB1").toUpperCase();
  const page = await fetchOutletResults(outcode);

  if (!page.configured) {
    return (
      <div>
        <PageHeader title="Discovery Results" subtitle="Real Just Eat records from the canonical database." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Supabase not configured" hint="SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not set in this environment." />
        </div>
      </div>
    );
  }

  if (!page.rows.length) {
    return (
      <div>
        <PageHeader title="Discovery Results" subtitle={`Real Just Eat records for outcode ${page.outcode}.`} />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No records" hint={`No persisted Just Eat outlets for ${page.outcode} yet. Run: npm run je:run -- "${page.outcode}"`} />
        </div>
      </div>
    );
  }

  const rows = page.rows.map((r) => ({
    name: <Link href={`/discovery-results/${r.id}`} className="font-medium text-actionblue hover:text-actionhover">{r.name}</Link>,
    name_text: r.name, // plain-text mirror of `name` for search matching (the cell itself is a JSX link)
    source: r.source,
    address: r.address ?? "—",
    postcode: r.postcode ?? "—",
    phone: r.phone ?? "Not supplied",
    rating: r.rating != null ? `${r.rating} (${r.review_count ?? 0})` : "—",
    cuisine: r.cuisines.slice(0, 2).join(", ") || "—",
    open: r.is_open_now == null ? "Unknown" : r.is_open_now ? "Open" : "Closed",
    delivery: [r.is_delivery ? "Delivery" : null, r.is_collection ? "Collection" : null].filter(Boolean).join(" + ") || "—",
    source_url: r.source_url ?? "—",
    last_observed: r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("en-GB") : "—",
    status: r.observation_count > 1 ? "Canonical (re-observed)" : "Canonical",
    validation: r.validation === "validated" ? "Validated" : "Missing core fields",
  }));

  return (
    <div>
      <PageHeader
        title="Discovery Results"
        subtitle={`${page.total} real record${page.total === 1 ? "" : "s"} for outcode ${page.outcode} — Just Eat (je_outlets, live discovery) + any imported Uber Eats/Deliveroo records (consolidated_candidates). Not a placeholder.`}
      />
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "source", label: "Source", badge: true },
          { key: "address", label: "Address" },
          { key: "postcode", label: "Postcode" },
          { key: "phone", label: "Phone" },
          { key: "rating", label: "Rating (reviews)" },
          { key: "cuisine", label: "Cuisine" },
          { key: "open", label: "Open", badge: true },
          { key: "delivery", label: "Delivery" },
          { key: "source_url", label: "Source URL" },
          { key: "last_observed", label: "Last observed" },
          { key: "status", label: "Status", badge: true },
          { key: "validation", label: "Validation", badge: true },
        ]}
        rows={rows}
        searchKeys={["name_text", "address", "postcode", "cuisine"]}
        searchPlaceholder="Search results…"
        emptyTitle="No records"
      />
    </div>
  );
}
