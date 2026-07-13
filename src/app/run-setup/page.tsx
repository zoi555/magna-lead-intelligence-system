import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { PILOT_OUTCODES } from "@/config/territory-config";
import {
  SCOPE_TYPES,
  SCOPE_TYPE_LABELS,
  SCOPE_TYPE_DESCRIPTIONS,
} from "@/lib/pipeline/run-config";

// Informational only. This page explains how a run is scoped — it does NOT trigger a
// run, submit a form, or import any server-only pipeline code that hits the network.
// (run-config / postcode-hierarchy are pure, no-network modules.)
export const dynamic = "force-dynamic";

export default function RunSetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Run setup — territory scope"
        subtitle="How a run is scoped. Reference only: nothing on this page starts a run."
      />

      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Every run needs an explicit scope</h2>
        <p className="text-[13px] text-muted">
          A run only ever searches the territory you select. There is no default territory and no silent
          fall-back to the pilot set — if no scope is chosen, the run is refused with{" "}
          <span className="text-ink">&ldquo;No territory selected&rdquo;</span>. A full-UK national scan is
          guarded separately and requires the environment flag{" "}
          <code className="rounded bg-page px-1 text-ink">FULL_UK_SCAN_CONFIRMED=true</code> before it will run.
        </p>
      </div>

      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">The seven scope types</h2>
        <div className="space-y-3">
          {SCOPE_TYPES.map((t) => (
            <div key={t} className="border-b border-bordergrey pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-ink">{SCOPE_TYPE_LABELS[t]}</h3>
                <code className="shrink-0 rounded bg-page px-1 text-[12px] text-muted">{t}</code>
              </div>
              <p className="mt-1 text-[13px] text-muted">{SCOPE_TYPE_DESCRIPTIONS[t]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Postcode hierarchy</h2>
          <p className="text-[13px] text-muted">
            UK postcodes nest into four levels. A selection can mix them; each is resolved to the outcodes the
            pipeline actually searches.
          </p>
          <dl className="mt-2 text-[13px]">
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Area</dt><dd className="text-ink">UB</dd></div>
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">District / outcode</dt><dd className="text-ink">UB1</dd></div>
            <div className="flex justify-between border-b border-bordergrey py-1.5"><dt className="text-muted">Sector</dt><dd className="text-ink">UB1 1</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-muted">Unit / full</dt><dd className="text-ink">UB1 1AA</dd></div>
          </dl>
          <p className="mt-2 text-[12px] text-muted">
            An area (e.g. UB) cannot be searched directly — it must be expanded into its districts using the geo
            postcode index, so it is flagged as <code className="rounded bg-page px-1 text-ink">UB*</code> until
            expanded.
          </p>
        </div>

        <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Pilot outcodes</h2>
          <p className="text-[13px] text-muted">
            The temporary West London pilot set (MVP test only — not national, not VP coverage):
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PILOT_OUTCODES.map((o) => (
              <span key={o} className="rounded border border-bordergrey bg-page px-2 py-0.5 text-[12px] text-ink">
                {o}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            The pilot set is never applied automatically. A run uses it only if it is explicitly selected as the
            scope.
          </p>
        </div>
      </div>
    </div>
  );
}
