"use client";

import React from "react";
import type { RunState } from "@/lib/pipeline/types";
import { PipelineFlowMonitor } from "./PipelineFlowMonitor";
import { PipelineFlowNetwork } from "./PipelineFlowNetwork";

// Two visual modes over the same real run-state. Only the active mode is mounted,
// so only one polls at a time.
export function PipelineViews({ state }: { state: RunState }) {
  const [mode, setMode] = React.useState<"status" | "network">("status");
  const TABS = [
    { id: "status", label: "Operational Status" },
    { id: "network", label: "Flow Network" },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-bordergrey bg-card p-0.5 shadow-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              mode === t.id ? "bg-[#111827] text-white" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {mode === "status" ? <PipelineFlowMonitor state={state} /> : <PipelineFlowNetwork state={state} />}
    </div>
  );
}
