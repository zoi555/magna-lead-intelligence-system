import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { APP_FULL_NAME, TENANT_NAME } from "@/lib/app-config";

// Source configuration status (status only — no secrets shown, none read).
export const dynamic = "force-dynamic";

// Adapter status for Vertical Slice 001. Derived from env presence only (never the value).
function sourceStatus() {
  const has = (k: string) => (process.env[k] ? "set" : "not set");
  return [
    { source: "FSA (FHRS)", live: "Live-ready (enabled)", auth: "None (open, OGL)", cost: "Free", key: "—" },
    { source: "Companies House", live: "Key-ready (disabled)", auth: "API key", cost: "Free", key: `COMPANIES_HOUSE_API_KEY: ${has("COMPANIES_HOUSE_API_KEY")}` },
    { source: "Google Places", live: "Key-ready (disabled)", auth: "API key", cost: "Paid — field-mask + cap", key: `GOOGLE_PLACES_API_KEY: ${has("GOOGLE_PLACES_API_KEY")}` },
    { source: "Delivery platforms", live: "Manual / import (no scraping)", auth: "None", cost: "Free", key: "—" },
    { source: "Existing customers", live: "Mock import", auth: "None", cost: "Free", key: "—" },
  ];
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Source configuration and tenant status (status only — no secrets)." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Product &amp; tenant</h2>
          <dl className="text-[13px]">
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Product</dt><dd className="text-ink">{APP_FULL_NAME}</dd></div>
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Tenant (configurable)</dt><dd className="text-ink">{TENANT_NAME}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-muted">Environment</dt><dd className="text-ink">UAT — Vertical Slice 001</dd></div>
          </dl>
        </div>
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Secrets</h2>
          <p className="text-[13px] text-muted">
            API keys live in a server environment / managed store — never in the database, the browser, or the
            repo. This page reports only whether an env var is present, never its value.
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-[18px] font-semibold text-headertext">Source configuration</h2>
        <DataTable
          columns={[
            { key: "source", label: "Source" },
            { key: "live", label: "Build status" },
            { key: "auth", label: "Auth" },
            { key: "cost", label: "Cost" },
            { key: "key", label: "Env (presence only)" },
          ]}
          rows={sourceStatus()}
          searchKeys={["source"]}
          searchPlaceholder="Search sources…"
          emptyTitle="No sources"
        />
      </div>
    </div>
  );
}
