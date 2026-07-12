import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { SourceRegistryPanel } from "@/components/settings/SourceRegistryPanel";
import { SOURCE_REGISTRY, summariseRegistry } from "@/lib/sources/source-registry";
import { APP_FULL_NAME, TENANT_NAME } from "@/lib/app-config";

// Source-control / readiness dashboard. Env var presence only — never values.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Presence-only (boolean), computed server-side. Values are never sent to the client.
  const envPresent: Record<string, boolean> = {};
  for (const s of SOURCE_REGISTRY) {
    if (s.envVar) envPresent[s.envVar] = Boolean(process.env[s.envVar]);
  }
  const summary = summariseRegistry(envPresent);

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
            <div className="flex justify-between py-1.5"><dt className="text-muted">Environment</dt><dd className="text-ink">UAT — Vertical Slice 001</dd></div>
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
    </div>
  );
}
