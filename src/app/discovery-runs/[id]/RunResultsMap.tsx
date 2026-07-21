"use client";

// Run-results map for a single discovery run — the same shared AspectLeadMap used by
// Coverage Map and Create New Run's planning step, just in "run-results" mode. Fetches the
// run's own anchors (stored in target_filters, set at creation time) via the existing
// status endpoint — no new query logic duplicated here.

import React from "react";
import { AspectLeadMap, type MapAnchor } from "@/features/geospatial/AspectLeadMap";

export function RunResultsMap({ runId, territoryInput }: { runId: string; territoryInput: string | null }) {
  const [anchors, setAnchors] = React.useState<MapAnchor[]>([]);

  React.useEffect(() => {
    let live = true;
    fetch(`/api/discovery/runs/${runId}/status`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j.ok) setAnchors(Array.isArray(j.run?.target_filters?.anchors) ? j.run.target_filters.anchors : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [runId]);

  return <AspectLeadMap mode="run-results" territoryInput={territoryInput ?? undefined} anchors={anchors} embeddedClassName="h-[420px]" />;
}
