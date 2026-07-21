import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { fetchAuditRecordDetail } from "@/lib/discovery-engine/reports/audit-evidence";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-bordergrey py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await fetchAuditRecordDetail(id);

  if (!d.configured) return <div><PageHeader title="Audit / Evidence" /><div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="Supabase not configured" /></div></div>;
  if (!d.found || !d.observation) {
    return (
      <div>
        <PageHeader title="Audit / Evidence" subtitle={`No observation found for id ${id}.`} />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft"><EmptyState title="Not found" /></div>
        <p className="mt-3 text-[13px]"><Link href="/audit" className="text-actionblue hover:text-actionhover">← Back to Audit / Evidence</Link></p>
      </div>
    );
  }

  const o = d.observation;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Observation ${o.id.slice(0, 8)}…`}
        subtitle={`${o.source} · ${o.responseType} · fetched ${new Date(o.fetchedAt).toLocaleString("en-GB")}`}
        actions={<Link href="/audit" className="text-[13px] text-actionblue hover:text-actionhover">← Back to Audit / Evidence</Link>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Source observation</h2>
          <Row label="Observation ID" value={<span className="font-mono text-[12px]">{o.id}</span>} />
          <Row label="Source" value={o.source} />
          <Row label="Source record ID" value={o.sourceRecordId} />
          <Row label="Response type" value={o.responseType} />
          <Row label="HTTP status" value={o.httpStatus} />
          <Row label="Pipeline run" value={<Link href={`/discovery-runs/${o.runId}`} className="text-actionblue hover:text-actionhover font-mono text-[12px]">{o.runId.slice(0, 8)}…</Link>} />
          <Row label="Content hash" value={<span className="font-mono text-[11px]">{o.contentHash}</span>} />
          <Row label="Duplicate of" value={o.duplicateOf ? <span className="font-mono text-[12px]">{o.duplicateOf.slice(0, 8)}…</span> : "No — canonical"} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Canonical transformation</h2>
          <Row label="Parser version" value={o.parserVersion} />
          <Row label="Provider/adapter version" value={o.adapterVersion} />
          <Row label="Schema version" value={o.schemaVersion} />
          <Row label="Validation outcome" value={o.parseStatus === "parsed" ? "Parsed cleanly" : `${o.parseStatus} — see warnings`} />
          <Row label="Parse warnings" value={o.parseWarnings.length ? o.parseWarnings.join("; ") : "None"} />
          <Row label="Raw payload fields" value={`${o.rawPayloadKeys.length} top-level keys (payload not rendered in full — no secrets, but kept scannable)`} />
          {d.canonicalOutlet && (
            <Row label="Canonical outlet" value={<Link href={`/discovery-results/${d.canonicalOutlet.id}`} className="text-actionblue hover:text-actionhover">{d.canonicalOutlet.name} →</Link>} />
          )}
        </div>

        {d.fieldProvenance.length > 0 && (
          <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Field provenance ({d.fieldProvenance.length} fields, source: {o.source})</h2>
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Field</th><th className="py-1">Confidence</th><th className="py-1">Derived</th><th className="py-1">Collected</th></tr></thead>
              <tbody>
                {d.fieldProvenance.map((p, i) => (
                  <tr key={i} className="border-t border-bordergrey">
                    <td className="py-1 font-mono">{p.fieldKey}</td>
                    <td className="py-1">{p.confidence ?? "—"}</td>
                    <td className="py-1">{p.isDerived ? "Yes" : "No"}</td>
                    <td className="py-1">{new Date(p.collectedAt).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {d.enrichmentProvenance.length > 0 && (
          <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft lg:col-span-2">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Enrichment provenance ({d.enrichmentProvenance.length} fields, non-{o.source} sources)</h2>
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Field</th><th className="py-1">Source</th><th className="py-1">Confidence</th><th className="py-1">Collected</th></tr></thead>
              <tbody>
                {d.enrichmentProvenance.map((p, i) => (
                  <tr key={i} className="border-t border-bordergrey">
                    <td className="py-1 font-mono">{p.fieldKey}</td>
                    <td className="py-1">{p.source}</td>
                    <td className="py-1">{p.confidence ?? "—"}</td>
                    <td className="py-1">{new Date(p.collectedAt).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
