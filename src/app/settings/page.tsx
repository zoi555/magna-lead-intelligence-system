import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { integrations } from "@/lib/mock-data";
import { APP_FULL_NAME, TENANT_NAME } from "@/lib/app-config";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Integration status and tenant configuration (status only — no secrets)." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Product & tenant</h2>
          <dl className="text-[13px]">
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Product</dt><dd className="text-ink">{APP_FULL_NAME}</dd></div>
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Tenant (configurable)</dt><dd className="text-ink">{TENANT_NAME}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-muted">Environment</dt><dd className="text-ink">UAT</dd></div>
          </dl>
        </div>
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Secrets</h2>
          <p className="text-[13px] text-muted">
            API keys and the service-role key live in a managed store / server environment — never in the
            database or the browser. None are shown here.
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-[18px] font-semibold text-headertext">Integrations</h2>
        <DataTable
          columns={[
            { key: "service", label: "Service" },
            { key: "status", label: "Status", badge: true },
          ]}
          rows={integrations}
          searchKeys={["service"]}
          searchPlaceholder="Search integrations…"
          emptyTitle="No integrations"
        />
      </div>
    </div>
  );
}
