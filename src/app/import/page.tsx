import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { ImportPanel } from "@/features/discovery/ImportPanel";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div>
      <PageHeader
        title="Import"
        subtitle="Controlled Uber Eats / Deliveroo CSV or JSON import — dry-run validated before confirming. Uses the existing provider-neutral adapters; no live scraping."
      />
      <ImportPanel />
    </div>
  );
}
