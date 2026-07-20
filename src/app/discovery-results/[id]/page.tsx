import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { fetchOutletDetail } from "@/lib/discovery-engine/reports/outlet-results";

// Real, database-backed single-restaurant detail — full canonical record + field
// provenance + historical rating observations. No placeholder data.
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-bordergrey py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

export default async function OutletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchOutletDetail(id);

  if (!detail.configured) {
    return (
      <div>
        <PageHeader title="Restaurant Detail" />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Supabase not configured" />
        </div>
      </div>
    );
  }
  if (!detail.found || !detail.outlet) {
    return (
      <div>
        <PageHeader title="Restaurant Detail" subtitle={`No canonical outlet found for id ${id}.`} />
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <EmptyState title="Not found" hint="This record may belong to a different tenant, or the id is wrong." />
        </div>
        <p className="mt-3 text-[13px]"><Link href="/discovery-results" className="text-actionblue hover:text-actionhover">← Back to Discovery Results</Link></p>
      </div>
    );
  }

  const o = detail.outlet;
  const hasCore = !!o.trading_name && !!o.postcode && o.latitude != null && o.longitude != null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={String(o.trading_name ?? "Restaurant")}
        subtitle={`Just Eat outlet ${o.je_outlet_id} · canonical (observed ${o.observation_count} time${Number(o.observation_count) === 1 ? "" : "s"}) · ${hasCore ? "Validated" : "Missing core fields"}`}
        actions={<Link href="/discovery-results" className="text-[13px] text-actionblue hover:text-actionhover">← Back to results</Link>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Identity &amp; location</h2>
          <Row label="Restaurant ID" value={String(o.je_outlet_id)} />
          <Row label="Source URL" value={o.source_url ? <a href={String(o.source_url)} target="_blank" rel="noreferrer" className="text-actionblue hover:text-actionhover">{String(o.source_url)}</a> : null} />
          <Row label="Brand" value={o.brand_name as string} />
          <Row label="Address" value={[o.address_first_line, o.city].filter(Boolean).join(", ") || null} />
          <Row label="Postcode" value={o.postcode as string} />
          <Row label="Coordinates" value={o.latitude != null && o.longitude != null ? `${o.latitude}, ${o.longitude}` : null} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Contact &amp; rating</h2>
          <Row label="Phone" value={o.telephone_e164 ? String(o.telephone_e164) : "Not supplied by Just Eat listing (ISS-0016)"} />
          <Row label="Overall rating" value={o.rating_average != null ? String(o.rating_average) : null} />
          <Row label="Total review count" value={o.rating_count != null ? String(o.rating_count) : null} />
          <Row label="Cuisines" value={Array.isArray(o.cuisines) ? (o.cuisines as string[]).join(", ") : null} />
          <Row label="Opening status" value={o.is_open_now == null ? "Unknown" : o.is_open_now ? "Open" : "Closed"} />
          <Row label="Opening hours" value={Array.isArray(o.opening_times) && (o.opening_times as unknown[]).length ? "Present — see raw evidence" : "Not supplied by Just Eat listing"} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Delivery &amp; commercial</h2>
          <Row label="Delivery" value={o.is_delivery == null ? "Unknown" : o.is_delivery ? "Yes" : "No"} />
          <Row label="Collection" value={o.is_collection == null ? "Unknown" : o.is_collection ? "Yes" : "No"} />
          <Row label="Delivery fee" value={o.delivery_cost != null ? `£${o.delivery_cost}` : null} />
          <Row label="Minimum order" value={o.minimum_delivery_value != null ? `£${o.minimum_delivery_value}` : null} />
          <Row label="ETA" value={o.delivery_eta_lower != null || o.delivery_eta_upper != null ? `${o.delivery_eta_lower ?? "?"}–${o.delivery_eta_upper ?? "?"} min` : null} />
          <Row label="Offers" value={Array.isArray(o.offers) && (o.offers as unknown[]).length ? `${(o.offers as unknown[]).length} offer(s)` : "None active this observation"} />
          <Row label="Sponsored" value={o.is_sponsored == null ? "Unknown" : o.is_sponsored ? "Yes" : "No"} />
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Raw / canonical status</h2>
          <Row label="Status" value="Canonical (normalised)" />
          <Row label="Validation" value={hasCore ? "Validated — name, postcode and coordinates present" : "Missing core fields"} />
          <Row label="Normalisation version" value={o.normalisation_version as string} />
          <Row label="First seen" value={o.first_seen_at ? new Date(String(o.first_seen_at)).toLocaleString("en-GB") : null} />
          <Row label="Last observed" value={o.last_seen_at ? new Date(String(o.last_seen_at)).toLocaleString("en-GB") : null} />
          <Row label="Raw evidence reference" value={o.latest_observation_id ? <span className="font-mono text-[12px]">{String(o.latest_observation_id)}</span> : null} />
        </div>
      </div>

      {detail.ratingHistory.length > 0 && (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Rating history <span className="font-normal text-muted">(append-only — never overwritten, {detail.ratingHistory.length} observation{detail.ratingHistory.length === 1 ? "" : "s"})</span></h2>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Observed</th><th className="py-1">Score</th><th className="py-1">Review count</th></tr></thead>
            <tbody>
              {detail.ratingHistory.map((h, i) => (
                <tr key={i} className="border-t border-bordergrey">
                  <td className="py-1">{new Date(h.observed_at).toLocaleString("en-GB")}</td>
                  <td className="py-1">{h.score ?? "—"}</td>
                  <td className="py-1">{h.review_count ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail.provenance.length > 0 && (
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Field provenance <span className="font-normal text-muted">({detail.provenance.length} fields)</span></h2>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Field</th><th className="py-1">Source path</th><th className="py-1">Confidence</th><th className="py-1">Derived</th></tr></thead>
            <tbody>
              {detail.provenance.map((p, i) => (
                <tr key={i} className="border-t border-bordergrey">
                  <td className="py-1 font-mono">{p.field_key}</td>
                  <td className="py-1 text-muted">{p.source_field_path ?? "—"}</td>
                  <td className="py-1">{p.confidence != null ? p.confidence : "—"}</td>
                  <td className="py-1">{p.is_derived ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
