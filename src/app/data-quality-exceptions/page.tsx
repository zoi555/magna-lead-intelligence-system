import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { fetchDataQualityExceptions } from "@/lib/discovery-engine/reports/data-quality-exceptions";

// Real, database-backed data-quality exceptions — no placeholder data.
export const dynamic = "force-dynamic";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <h2 className="mb-2 flex items-center justify-between text-[15px] font-semibold text-ink">
        <span>{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${count > 0 ? "bg-[#FBE9E9] text-[#b91c1c]" : "bg-[#E7F5EC] text-[#137a3b]"}`}>{count}</span>
      </h2>
      {count === 0 ? <p className="text-[12.5px] text-muted">None found.</p> : children}
    </div>
  );
}

function OutletList({ items }: { items: { id: string; name: string; postcode: string | null }[] }) {
  return (
    <ul className="space-y-1 text-[12.5px]">
      {items.map((o) => (
        <li key={o.id} className="flex justify-between border-b border-bordergrey py-1 last:border-0">
          <Link href={`/discovery-results/${o.id}`} className="text-actionblue hover:text-actionhover">{o.name || "(unnamed)"}</Link>
          <span className="text-muted">{o.postcode ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DataQualityExceptionsPage() {
  const x = await fetchDataQualityExceptions();

  if (!x.configured) {
    return (
      <div>
        <PageHeader title="Data-Quality Exceptions" />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Supabase not configured" />
        </div>
      </div>
    );
  }
  if (!x.totalOutlets) {
    return (
      <div>
        <PageHeader title="Data-Quality Exceptions" subtitle="No outlets in the database yet." />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="No data" hint='Run a discovery pass first, e.g. npm run je:run -- "UB1"' />
        </div>
      </div>
    );
  }

  const totalExceptions =
    x.missingPhone.count + x.missingAddress.count + x.missingPostcode.count + x.missingCoordinates.count +
    x.missingRating.count + x.duplicatePhoneConflicts.length +
    x.geographyMismatches.reduce((s, g) => s + g.count, 0) + x.duplicateObservations.totalDuplicates + x.schemaFailures.count;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data-Quality Exceptions"
        subtitle={`${x.totalOutlets} canonical outlets audited — ${totalExceptions} exception(s) found across all categories. Resolution state: all open (no resolution-workflow tooling built yet — flag only).`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Missing phone" count={x.missingPhone.count}><OutletList items={x.missingPhone.sample} /></Section>
        <Section title="Missing address" count={x.missingAddress.count}><OutletList items={x.missingAddress.sample} /></Section>
        <Section title="Missing postcode" count={x.missingPostcode.count}><OutletList items={x.missingPostcode.sample} /></Section>
        <Section title="Missing coordinates" count={x.missingCoordinates.count}><OutletList items={x.missingCoordinates.sample} /></Section>
        <Section title="Missing rating" count={x.missingRating.count}><OutletList items={x.missingRating.sample} /></Section>

        <Section title="Duplicate-phone conflicts (source conflicts)" count={x.duplicatePhoneConflicts.length}>
          <ul className="space-y-2 text-[12.5px]">
            {x.duplicatePhoneConflicts.map((c) => (
              <li key={c.phone} className="border-b border-bordergrey pb-1.5 last:border-0">
                <div className="font-mono text-ink">{c.phone}</div>
                <OutletList items={c.outlets} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Geography mismatches" count={x.geographyMismatches.reduce((s, g) => s + g.count, 0)}>
          <ul className="space-y-2 text-[12.5px]">
            {x.geographyMismatches.map((g) => (
              <li key={`${g.source}-${g.status}`} className="border-b border-bordergrey pb-1.5 last:border-0">
                <div className="text-ink"><span className="font-semibold">{g.source}</span> — {g.status.replace(/_/g, " ")} × {g.count}</div>
                {g.sample.map((s, i) => (
                  <div key={i} className="text-muted">{s.sourceRecordId} · country={s.providerCountry ?? "?"} · postcode={s.providerPostcode ?? "?"}</div>
                ))}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Duplicate candidates (raw observations)" count={x.duplicateObservations.totalDuplicates}>
          <p className="mb-1 text-[12.5px] text-muted">{x.duplicateObservations.totalCanonical} canonical observations retained.</p>
          <ul className="space-y-1 text-[12px] font-mono text-muted">
            {x.duplicateObservations.sample.map((d, i) => <li key={i}>{d.sourceRecordId} → duplicate of {d.duplicateOfId.slice(0, 8)}…</li>)}
          </ul>
        </Section>

        <Section title="Schema failures (parse not clean)" count={x.schemaFailures.count}>
          <ul className="space-y-1 text-[12.5px]">
            {x.schemaFailures.sample.map((f, i) => (
              <li key={i} className="flex justify-between border-b border-bordergrey py-1 last:border-0">
                <span className="text-ink">{f.sourceRecordId} ({f.source})</span>
                <span className="text-muted">{f.parseStatus}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
