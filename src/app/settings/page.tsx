import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { SourceRegistryPanel } from "@/components/settings/SourceRegistryPanel";
import { SOURCE_REGISTRY, summariseRegistry } from "@/lib/sources/source-registry";
import { getCompaniesHouseConfig } from "@/lib/sources/companies-house";
import { getGooglePlacesConfig } from "@/lib/sources/google-places";
import { getDeliveryPlatformConfig } from "@/lib/sources/delivery-platforms";
import { APP_FULL_NAME, TENANT_NAME, ENVIRONMENT_LABEL } from "@/lib/app-config";
import { EditableSettingsPanel } from "@/components/settings/EditableSettingsPanel";

// Source-control / readiness dashboard. Env var presence only — never values.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Presence-only (boolean), computed server-side. Values are never sent to the client.
  const envPresent: Record<string, boolean> = {};
  for (const s of SOURCE_REGISTRY) {
    if (s.envVar) envPresent[s.envVar] = Boolean(process.env[s.envVar]);
  }
  const summary = summariseRegistry(envPresent);

  // Adapter config (server-side; booleans/limits only — no key values).
  const ch = getCompaniesHouseConfig();
  const gp = getGooglePlacesConfig();
  const dp = getDeliveryPlatformConfig();
  const yn = (b: boolean) => (b ? "yes" : "no");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings — Source Control"
        subtitle="Every external system the engine can use, with status, auth, cost/legal risk and next action. FSA is the only fully live source."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Product &amp; tenant</h2>
          <dl className="text-[13px]">
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Product</dt><dd className="text-ink">{APP_FULL_NAME}</dd></div>
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Tenant (configurable)</dt><dd className="text-ink">{TENANT_NAME}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-muted">Environment</dt><dd className="text-ink">{ENVIRONMENT_LABEL} — Vertical Slice 001 (VERCEL_ENV-derived, never hardcoded)</dd></div>
          </dl>
        </div>
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Secrets</h2>
          <p className="text-[13px] text-muted">
            API keys live in a server environment / managed store — never in the database, the browser, or the
            repo. This page reports only whether an env var is <b>present</b>, never its value.
          </p>
        </div>
      </div>

      <SourceRegistryPanel sources={SOURCE_REGISTRY} summary={summary} envPresent={envPresent} />

      <EditableSettingsPanel />

      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Adapter configuration <span className="text-[12px] font-normal text-muted">(server-side — values never shown)</span></h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[13px] md:grid-cols-3">
          <p className="text-ink"><span className="text-muted">Companies House: </span>key {yn(ch.apiKeyPresent)} · enabled {yn(ch.enabled)} · max/run {ch.maxCallsPerRun}</p>
          <p className="text-ink"><span className="text-muted">Google Places: </span>key {yn(gp.apiKeyPresent)} · enabled {yn(gp.enabled)} · max/run {gp.maxCallsPerRun} · field-mask yes</p>
          <p className="text-ink"><span className="text-muted">Delivery presence: </span>mode {dp.mode} · scraping disabled {yn(dp.scrapingDisabled)} · live {yn(dp.liveEnabled)}</p>
        </div>
      </div>
    </div>
  );
}
