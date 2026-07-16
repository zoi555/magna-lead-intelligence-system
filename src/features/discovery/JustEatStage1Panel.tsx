"use client";

// Just Eat — Stage 1 operational panel. Saves the run canonically (Supabase), queues a
// Just Eat execution, then polls status + the data-quality report. Only Just Eat — no
// Deliveroo/Uber Eats. The heavy lifting happens in a locally-runnable worker
// (`npm run je:worker`); this panel just queues and observes.

import React from "react";
import { GeographySelector } from "./GeographySelector";

export interface JeRunPayload {
  name: string;
  reference?: string | null;
  objective?: string | null;
  territory_mode?: string | null;
  territory_input: string;
  search_terms?: string[];
  target_filters?: Record<string, unknown>;
  requested_fields?: string[];
  config_snapshot?: Record<string, unknown>;
}

type Exec = { id: string; status: string; planned_queries: number; completed_queries: number; cancel_requested: boolean; metrics?: Record<string, unknown> };
type Quality = Record<string, number | Record<string, unknown>> | null;

const ACTIVE = new Set(["queued", "running", "cancelling"]);

export function JustEatStage1Panel({ payload, canQueue }: { payload: JeRunPayload; canQueue: boolean }) {
  const [runId, setRunId] = React.useState<string | null>(null);
  const [exec, setExec] = React.useState<Exec | null>(null);
  const [quality, setQuality] = React.useState<Quality>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [exclusions, setExclusions] = React.useState<string[]>([]);

  // poll status while an execution is active
  React.useEffect(() => {
    if (!runId) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/discovery/runs/${runId}/status`, { cache: "no-store" });
        const j = await r.json();
        if (!live || !j.ok) return;
        const latest: Exec | undefined = j.executions?.[j.executions.length - 1];
        setExec(latest ?? null);
        setQuality(j.quality ?? null);
      } catch { /* transient */ }
    };
    tick();
    const iv = setInterval(() => { if (exec && !ACTIVE.has(exec.status)) return; tick(); }, 3000);
    return () => { live = false; clearInterval(iv); };
  }, [runId, exec?.status]);

  async function saveAndQueue() {
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/discovery/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, exclusions }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to save run");
      setRunId(j.run.id);
      const bits: string[] = [];
      if (typeof j.expansionCount === "number") bits.push(`${j.expansionCount} postcode district${j.expansionCount === 1 ? "" : "s"} planned`);
      if (Array.isArray(j.unresolved) && j.unresolved.length) bits.push(`unresolved (no guess): ${j.unresolved.map((u: { value: string }) => u.value).join(", ")}`);
      if (bits.length) setNote(bits.join(" · "));
      const q = await fetch(`/api/discovery/runs/${j.run.id}/queue`, { method: "POST" });
      const qj = await q.json();
      if (!qj.ok) throw new Error(qj.error || "Failed to queue execution");
      setExec(qj.execution);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!exec) return;
    setBusy(true);
    try { await fetch(`/api/discovery/executions/${exec.id}/cancel`, { method: "POST" }); } finally { setBusy(false); }
  }

  const active = exec ? ACTIVE.has(exec.status) : false;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">Just Eat — Stage 1</span>
          <p className="text-xs text-gray-500 mt-1">Saves the run to the database and queues Just Eat discovery. Run the worker locally with <code className="text-[11px]">npm run je:worker</code>.</p>
        </div>
        {!runId && (
          <button disabled={!canQueue || busy} onClick={saveAndQueue}
            className={`px-3 py-1.5 rounded-md text-sm ${canQueue && !busy ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
            {busy ? "Saving…" : "Save & queue Just Eat"}
          </button>
        )}
      </div>

      {!runId && <GeographySelector input={payload.territory_input} onExclusionsChange={setExclusions} />}

      {note && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">{note}</p>}
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">{error}</p>}

      {exec && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <span className="text-gray-500">Execution</span>{" "}
              <span className={`font-semibold ${statusColour(exec.status)}`}>{exec.status.replace(/_/g, " ")}</span>
              <span className="text-gray-400"> · {exec.completed_queries}/{exec.planned_queries} postcode districts</span>
            </div>
            {active && <button onClick={cancel} disabled={busy} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>}
          </div>
          {exec.metrics && typeof exec.metrics.total_observations === "number" && (
            <p className="text-[11px] text-gray-500 mt-1">{String(exec.metrics.unique_outlets ?? 0)} outlets · {String(exec.metrics.total_observations ?? 0)} observations · {String(exec.metrics.duplicate_observations ?? 0)} duplicates · {String(exec.metrics.failed_queries ?? 0)} failed queries</p>
          )}
          {active && <p className="text-[11px] text-gray-400 mt-1">Waiting for the worker… start it with <code>npm run je:worker</code> if nothing progresses.</p>}
        </div>
      )}

      {quality && <QualityGrid q={quality as Record<string, number>} />}
    </div>
  );
}

const COVERAGE: { key: string; label: string }[] = [
  { key: "pct_full_postcode", label: "Full postcode" },
  { key: "pct_coordinates", label: "Coordinates" },
  { key: "pct_review_score", label: "Review score" },
  { key: "pct_review_count", label: "Review count" },
  { key: "pct_cuisine", label: "Cuisine" },
  { key: "pct_delivery", label: "Delivery" },
  { key: "pct_collection", label: "Collection" },
  { key: "pct_opening_hours", label: "Opening hours" },
  { key: "pct_halal_evidence", label: "Halal evidence" },
  { key: "pct_phone", label: "Phone" },
  { key: "pct_menu_data", label: "Menu data" },
];

function QualityGrid({ q }: { q: Record<string, number> }) {
  const pct = (v: unknown) => `${Math.round(((typeof v === "number" ? v : 0)) * 100)}%`;
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">Data-quality summary <span className="font-normal text-gray-400">({String(q.unique_outlets ?? 0)} outlets, {String(q.total_raw_observations ?? 0)} observations)</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {COVERAGE.map((c) => (
          <div key={c.key} className="flex items-center justify-between text-xs border border-gray-100 rounded px-2 py-1">
            <span className="text-gray-500">{c.label}</span>
            <span className={`font-semibold ${(q[c.key] ?? 0) > 0 ? "text-gray-900" : "text-gray-400"}`}>{pct(q[c.key])}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Duplicate rate {pct(q.duplicate_rate)} · parse-warning rate {pct(q.parse_warning_rate)} · query-failure rate {pct(q.query_failure_rate)}.
        Phone &amp; menu are 0% because the Just Eat listing endpoint does not supply them (see the field catalogue).
      </p>
    </div>
  );
}

function statusColour(s: string): string {
  if (s === "completed") return "text-green-700";
  if (s === "completed_with_warnings") return "text-amber-700";
  if (s === "failed") return "text-red-700";
  if (s === "cancelled") return "text-gray-600";
  return "text-blue-700";
}
