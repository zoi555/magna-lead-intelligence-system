"use client";

import React from "react";
import type { RunState } from "@/lib/pipeline/types";

// Shared live-polling hook: refreshes from /api/run-state every 3s ONLY while the
// run is running/paused. Stops on completed/failed/cancelled. Avoids flicker by
// only updating when updated_at changes. Used by both pipeline visual modes.
export function useLiveRunState(initial: RunState) {
  const [run, setRun] = React.useState<RunState>(initial);
  const [lastRefreshed, setLastRefreshed] = React.useState<string | null>(null);
  const isLive = run.status === "running" || run.status === "paused";

  React.useEffect(() => {
    if (!isLive) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/run-state", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as RunState | null;
        if (!alive || !next) return;
        setLastRefreshed(new Date().toLocaleTimeString("en-GB"));
        setRun((prev) => (next.updated_at !== prev.updated_at ? next : prev));
      } catch {
        /* transient — ignore */
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [isLive]);

  return { run, lastRefreshed, isLive };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}
