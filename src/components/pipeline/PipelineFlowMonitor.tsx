"use client";

import React from "react";
import type { RunState, StageState, StageStatus, StageId } from "@/lib/pipeline/types";
import { useLiveRunState } from "./useLiveRunState";

// Plain-English copy + rules per stage (client-only presentation metadata).
type Meta = { now: (prefixes: string[]) => string; desc: string; rules: string[]; kind: Kind };
type Kind = "source" | "transform" | "filter" | "enrich" | "gate" | "export";

const META: Record<StageId, Meta> = {
  configure_run: { kind: "source", desc: "Prepare the run configuration and territory scope.", rules: ["Validate territory prefixes", "Set source mode + FSA page size"], now: (p) => `Configuring the run for ${p.join(", ")}…` },
  fetch_fsa: { kind: "source", desc: "Pull food businesses from the FSA FHRS open API for each outward code.", rules: ["Live FSA pull (small, per-prefix)", "Dedupe by FHRS id", "Fall back to mock on failure"], now: (p) => `Fetching FSA establishments for ${p.join(", ")}…` },
  normalise_records: { kind: "transform", desc: "Standardise names and postcode formatting.", rules: ["Trim/collapse whitespace", "Uppercase + space-format postcode"], now: () => "Normalising business names and postcodes…" },
  validate_postcodes: { kind: "filter", desc: "Drop records with a missing or malformed UK postcode.", rules: ["UK postcode regex", "Reject POSTCODE_INVALID"], now: () => "Validating postcode formats and removing invalid records…" },
  territory_filter: { kind: "filter", desc: "Keep only records whose outward code is in the pilot territory.", rules: ["Exact outward-code match", "Reject OUTSIDE_TERRITORY"], now: (p) => `Filtering to the pilot territory (${p.join(", ")})…` },
  category_filter: { kind: "filter", desc: "Keep only relevant food-service business types.", rules: ["Foodservice type match", "Reject CATEGORY_EXCLUDED"], now: () => "Filtering to in-scope food-service businesses…" },
  dedupe_candidates: { kind: "filter", desc: "Remove duplicates by id, name+postcode and normalised address.", rules: ["3-way dedupe keys", "Keep first occurrence"], now: () => "Removing duplicate records…" },
  exclude_existing_customers: { kind: "filter", desc: "Suppress businesses already active in the customer master.", rules: ["Match name+postcode (mock import)", "Reject EXISTING_CUSTOMER_MATCH"], now: () => "Excluding existing customers from the candidate set…" },
  companies_house_enrichment_placeholder: { kind: "enrich", desc: "Attach Companies House status (placeholder — key-ready, disabled).", rules: ["No live call", "No company financials"], now: () => "Attaching Companies House status (placeholder — disabled)…" },
  google_places_enrichment_placeholder: { kind: "enrich", desc: "Attach Google Places details (placeholder — paid, disabled).", rules: ["No live call", "Field-mask + cap required to enable"], now: () => "Attaching Google Places (placeholder — paid, disabled)…" },
  delivery_platform_presence: { kind: "enrich", desc: "Collect public delivery-platform presence (Uber Eats, Deliveroo, Just Eat, Google Business). Configurable, evidence-URL based, risk-labelled. Not a blocker.", rules: ["Manual / import / approved_public_collector", "Public/evidence-based only — no scraping, login, or anti-bot bypass", "Uber/Deliveroo/Just Eat = medium ToS risk", "Unknown still exports (DELIVERY_PLATFORM_NOT_CHECKED)"], now: () => "Collecting delivery-platform presence (Uber Eats, Deliveroo, Just Eat, Google Business)…" },
  score_candidates: { kind: "transform", desc: "Explainable scoring → 0–100, grade A–D, reasons/warnings.", rules: ["Type/territory/rating/new-signal", "Data completeness", "Internal score (never to telesales)"], now: () => "Scoring candidates on fit, rating and signals…" },
  export_review_gate: { kind: "gate", desc: "Decide export-eligibility. CRM push locked until ISS-0003.", rules: ["Exclude disqualified / grade D", "EXPORT_GATE_LOCKED (review only)"], now: () => "Applying the export review gate (CRM push locked — ISS-0003)…" },
  generate_final_exports: { kind: "export", desc: "Write the final CSV/JSON and telesales-safe export.", rules: ["CSV = export-eligible", "Telesales-safe = safe fields only"], now: () => "Writing the final CSV/JSON and telesales-safe export…" },
};

const FALLBACK_META: Meta = { kind: "transform", desc: "Pipeline stage.", rules: [], now: () => "Processing…" };
function metaFor(id: StageId): Meta {
  return META[id] ?? FALLBACK_META;
}

const KIND_COLOR: Record<Kind, string> = {
  source: "#2563EB", transform: "#0891B2", filter: "#7C3AED", enrich: "#64748B", gate: "#F59E0B", export: "#16A34A",
};

const STATUS_LABEL: Record<StageStatus, string> = {
  completed: "Complete", running: "Running", paused: "Paused", failed: "Failed", pending: "Queued", skipped: "Skipped",
};
const STATUS_COLOR: Record<StageStatus, string> = {
  completed: "#16A34A", running: "#2563EB", paused: "#B45309", failed: "#DC2626", pending: "#94A3B8", skipped: "#94A3B8",
};

function usePrefersReducedMotion(): boolean {
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

function fmtElapsed(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function realFrontier(state: RunState): number {
  if (state.status === "running" && state.current_stage) {
    const i = state.stages.findIndex((s) => s.stage_id === state.current_stage);
    if (i >= 0) return i;
  }
  let last = -1;
  state.stages.forEach((s, i) => {
    if (s.status === "completed" || s.status === "failed") last = i;
  });
  return last;
}

export function PipelineFlowMonitor({ state: initialState }: { state: RunState }) {
  const reduced = usePrefersReducedMotion();
  const { run, lastRefreshed, isLive } = useLiveRunState(initialState);
  const state = run; // alias — everything below reads the live run state
  const isRunning = state.status === "running";
  const stages = state.stages;
  const base = Math.max(state.counters.fetched, ...stages.map((s) => s.input_count), 1);

  // Replay animation playhead (visual). Auto-plays once when motion is allowed.
  const [playing, setPlaying] = React.useState(false);
  const [head, setHead] = React.useState<number>(realFrontier(state));
  const [open, setOpen] = React.useState<StageId | null>(null);

  React.useEffect(() => {
    if (reduced) return; // reduced-motion: no autoplay
    setHead(0);
    setPlaying(true);
  }, [reduced, state.run_id]);

  React.useEffect(() => {
    if (!playing || reduced) return;
    const id = setInterval(() => {
      setHead((h) => {
        if (h >= stages.length - 1) {
          setPlaying(false);
          return stages.length - 1;
        }
        return h + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, reduced, stages.length]);

  // Live elapsed only while running; otherwise fixed duration.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const frontier = reduced || !playing ? realFrontier(state) : head;
  const activeStage = stages[Math.max(0, Math.min(frontier, stages.length - 1))];
  const nowText = activeStage ? metaFor(activeStage.stage_id).now(state.config.postcode_prefixes) : "Idle.";

  const startedMs = state.started_at ? Date.parse(state.started_at) : NaN;
  const endMs = state.completed_at ? Date.parse(state.completed_at) : Date.now();
  const elapsed = fmtElapsed((state.completed_at ? endMs : Date.now()) - startedMs);

  const surviving = state.counters.scored || activeStage?.output_count || 0;
  const finalExport = state.counters.exported;
  const rejected = state.counters.rejected_total || stages.reduce((n, s) => n + s.rejected_count, 0);

  return (
    <div className="flowmon">
      {/* now-line */}
      <div className="nowline" role="status" aria-live="polite">
        <span className={`livedot ${isRunning || (playing && !reduced) ? "on" : ""}`} aria-hidden />
        <span className="nowtext">{nowText}</span>
        <span className="nowmeta">
          {state.run_id} · <b style={{ color: STATUS_COLOR[normStatus(state.status)] }}>{state.status}</b>
        </span>
      </div>

      {/* summary panel */}
      <div className="summary">
        <Metric label="Run" value={state.run_id} mono />
        <Metric label="Current stage" value={activeStage ? activeStage.label : "—"} />
        <Metric label="Elapsed" value={elapsed} mono />
        <Metric label="Records in" value={n(state.counters.fetched)} mono />
        <Metric label="Surviving" value={n(surviving)} mono />
        <Metric label="Rejected" value={n(rejected)} mono danger />
        <Metric label="Final export" value={n(finalExport)} mono good />
        <div className="controls">
          <button className="ctl" onClick={() => { setHead(0); setPlaying(true); }} disabled={reduced} title={reduced ? "Reduced-motion: animation disabled" : "Replay the flow animation"}>
            {playing ? "❚❚ Pause" : "▷ Replay"}
          </button>
          <button className="ctl ghost" disabled title="Drive via CLI: npm run leads:resume">Resume</button>
          <button className="ctl ghost" disabled title="Drive via CLI: npm run leads:resume (retries failed stage)">Retry</button>
          {isLive && (
            <span className="refreshed" title="Polling the run store every 3s while the run is live">
              ⟳ live · last refreshed {lastRefreshed ?? "…"}
            </span>
          )}
        </div>
      </div>

      {/* graphic pipeline */}
      <div className="pipe" aria-label="Pipeline flow">
        <div className="inflow" aria-hidden>
          <span className="drop" /><span className="drop d2" /><span className="drop d3" />
          <span className="inflow-label">records in · {n(state.counters.fetched)}</span>
        </div>

        {stages.map((s, i) => {
          const reached = i <= frontier;
          const pipeState = i > frontier ? "empty" : i < frontier ? "filled" : "front";
          const isActive = !reduced && playing && i === frontier;
          const kind = metaFor(s.stage_id).kind;
          const survFrac = Math.min(1, s.output_count / base);
          const rejFrac = Math.min(1, s.rejected_count / base);
          return (
            <React.Fragment key={s.stage_id}>
              <div className={`node ${reached ? "reached" : "dim"} ${isActive ? "active" : ""} ${s.status}`} style={{ ["--kc" as any]: KIND_COLOR[kind] }}>
                <button className="node-head" onClick={() => setOpen(open === s.stage_id ? null : s.stage_id)} aria-expanded={open === s.stage_id}>
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="tank" aria-hidden>
                    <span className="tank-fill" style={{ height: `${Math.round(survFrac * 100)}%` }} />
                    {s.rejected_count > 0 && <span className="tank-rej" style={{ height: `${Math.round(rejFrac * 100)}%` }} />}
                  </span>
                  <span className="node-main">
                    <span className="node-label">{s.label}</span>
                    <span className="counts">
                      <em>in</em> {n(s.input_count)} <em>out</em> {n(s.output_count)}
                      {s.rejected_count > 0 && <> <em className="rej">rej</em> <b className="rej">{n(s.rejected_count)}</b></>}
                      {s.error_count > 0 && <> <em>err</em> {n(s.error_count)}</>}
                    </span>
                  </span>
                  <span className="badge" style={{ color: STATUS_COLOR[s.status], borderColor: STATUS_COLOR[s.status] + "55", background: STATUS_COLOR[s.status] + "14" }}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  <span className="chev">{open === s.stage_id ? "▲" : "▼"}</span>
                </button>

                {open === s.stage_id && (
                  <div className="detail">
                    <p className="detail-desc">{metaFor(s.stage_id).desc}</p>
                    <div className="detail-grid">
                      <div><span className="k">Rules applied</span>
                        <ul>{metaFor(s.stage_id).rules.map((r) => <li key={r}>{r}</li>)}</ul>
                      </div>
                      <div><span className="k">Counts</span>
                        <ul className="mono">
                          <li>input: {n(s.input_count)}</li>
                          <li>output: {n(s.output_count)}</li>
                          <li>rejected: {n(s.rejected_count)}</li>
                          <li>errors: {n(s.error_count)}</li>
                        </ul>
                      </div>
                    </div>
                    {s.metrics && (
                      <div className="detail-metrics">
                        <span className="k">Stage metrics</span>
                        <div className="chips">
                          {Object.entries(s.metrics).map(([k, v]) => (
                            <span key={k} className="chip"><em>{k.replace(/_/g, " ")}</em> {n(v)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.notes && <p className="detail-notes">{s.notes}</p>}
                    {s.errors.length > 0 && (
                      <div className="detail-errs">
                        <span className="k">Sample rejected / notices</span>
                        <ul>
                          {s.errors.slice(0, 8).map((e, j) => (
                            <li key={j}><code>{e.error_code}</code> {e.message}</li>
                          ))}
                          {s.errors.length > 8 && <li className="more">…and {s.errors.length - 8} more</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {i < stages.length - 1 && (
                <div className={`connector ${pipeState}`} aria-hidden>
                  <span className="flow" />
                </div>
              )}
            </React.Fragment>
          );
        })}

        <div className="outflow" aria-hidden>
          <span className="outflow-label">export · {n(finalExport)}</span>
        </div>
      </div>

      <StyleTag />
    </div>
  );
}

function normStatus(s: RunState["status"]): StageStatus {
  return s === "cancelled" || s === "draft" ? "pending" : (s as StageStatus);
}
function n(v: number): string {
  return v.toLocaleString("en-GB");
}

function Metric({ label, value, mono, danger, good }: { label: string; value: string; mono?: boolean; danger?: boolean; good?: boolean }) {
  return (
    <div className="metric">
      <div className="metric-l">{label}</div>
      <div className={`metric-v ${mono ? "mono" : ""}`} style={{ color: danger ? "#b45309" : good ? "#137a3b" : undefined }}>{value}</div>
    </div>
  );
}

function StyleTag() {
  return (
    <style jsx>{`
      .flowmon { --line:#E5E7EB; --dim:#94A3B8; }
      .nowline { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid var(--line); border-radius:12px; background:#0B1220; color:#E2E8F0; }
      .nowtext { font-size:14px; font-weight:600; }
      .nowmeta { margin-left:auto; font-family:ui-monospace,Menlo,monospace; font-size:12px; color:#94A3B8; }
      .livedot { width:9px; height:9px; border-radius:50%; background:#334155; flex:none; }
      .livedot.on { background:#22D3EE; box-shadow:0 0 0 0 rgba(34,211,238,.6); animation:pulse 1.6s infinite; }
      @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(34,211,238,.6)} 70%{box-shadow:0 0 0 8px rgba(34,211,238,0)} 100%{box-shadow:0 0 0 0 rgba(34,211,238,0)} }

      .summary { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin:12px 0; }
      @media(min-width:720px){ .summary { grid-template-columns:repeat(4,1fr) } }
      .metric { border:1px solid var(--line); border-radius:10px; background:#fff; padding:8px 11px; }
      .metric-l { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:#64748B; }
      .metric-v { margin-top:2px; font-size:15px; color:#111827; }
      .mono { font-family:ui-monospace,Menlo,monospace; }
      .controls { grid-column:1 / -1; display:flex; gap:8px; flex-wrap:wrap; }
      @media(min-width:720px){ .controls { grid-column:auto; align-items:center; } }
      .ctl { font-size:13px; font-weight:600; padding:7px 12px; border-radius:8px; border:1px solid #2563EB; background:#2563EB; color:#fff; cursor:pointer; }
      .ctl.ghost { background:#fff; color:#94a0ae; border-color:#E5E7EB; cursor:not-allowed; }
      .ctl:disabled { opacity:.7; cursor:not-allowed; }
      .refreshed { display:inline-flex; align-items:center; font-size:12px; color:#0e7490; font-family:ui-monospace,Menlo,monospace; }

      .detail-metrics { margin-top:8px; }
      .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:5px; }
      .chip { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#334155; border:1px solid #E5E7EB; border-radius:6px; padding:2px 8px; background:#fff; }
      .chip em { font-style:normal; color:#94A3B8; }

      .pipe { position:relative; padding-left:6px; }
      .inflow, .outflow { display:flex; align-items:center; gap:8px; padding:6px 0 6px 10px; font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#64748B; }
      .inflow-label, .outflow-label { }
      .drop { width:7px; height:7px; border-radius:50%; background:#2563EB; display:inline-block; animation:fall 1.1s infinite ease-in; }
      .drop.d2 { animation-delay:.35s; opacity:.7 } .drop.d3 { animation-delay:.7s; opacity:.5 }
      @keyframes fall { 0%{transform:translateY(-6px);opacity:0} 40%{opacity:1} 100%{transform:translateY(6px);opacity:0} }

      .node { border:1px solid var(--line); border-left:3px solid var(--kc); border-radius:12px; background:#fff; overflow:hidden; transition:opacity .3s; }
      .node.dim { opacity:.5; }
      .node.reached { opacity:1; }
      .node.active { box-shadow:0 0 0 3px color-mix(in srgb, var(--kc) 22%, transparent); }
      .node.failed { border-left-color:#DC2626; background:#FEF2F2; }
      .node.running { box-shadow:0 0 0 3px rgba(37,99,235,.18); }
      .node-head { width:100%; display:flex; align-items:center; gap:11px; padding:9px 12px; background:transparent; border:0; cursor:pointer; text-align:left; }
      .idx { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#94A3B8; width:20px; flex:none; }
      .tank { position:relative; width:16px; height:34px; border:1px solid #CBD5E1; border-radius:3px; background:#F1F5F9; overflow:hidden; flex:none; }
      .tank-fill { position:absolute; left:0; right:0; bottom:0; background:var(--kc); opacity:.55; transition:height .5s ease; }
      .node.active .tank-fill { animation:shimmer 1.1s infinite; }
      @keyframes shimmer { 0%,100%{opacity:.45} 50%{opacity:.8} }
      .tank-rej { position:absolute; left:0; right:0; top:0; background:#DC2626; opacity:.45; }
      .node-main { flex:1; min-width:0; }
      .node-label { display:block; font-size:13.5px; font-weight:600; color:#111827; }
      .counts { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#475569; }
      .counts em { font-style:normal; color:#94A3B8; }
      .counts .rej { color:#b45309; }
      .badge { font-size:11px; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid; white-space:nowrap; flex:none; }
      .chev { color:#94A3B8; font-size:10px; flex:none; }

      .detail { border-top:1px solid var(--line); padding:11px 12px 13px 43px; background:#FAFBFC; }
      .detail-desc { margin:0 0 8px; font-size:13px; color:#334155; }
      .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .detail .k { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:#64748B; }
      .detail ul { margin:4px 0 0; padding-left:16px; font-size:12.5px; color:#334155; }
      .detail-notes { margin:8px 0 0; font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#64748B; }
      .detail-errs { margin-top:8px; }
      .detail-errs ul { list-style:none; padding:0; margin:4px 0 0; }
      .detail-errs li { font-size:12px; color:#334155; padding:2px 0; border-bottom:1px dashed #E5E7EB; }
      .detail-errs code { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#b45309; background:#FDF3E1; padding:0 4px; border-radius:3px; }
      .detail-errs .more { color:#94A3B8; }

      .connector { height:20px; margin-left:31px; width:3px; background:var(--line); position:relative; border-radius:2px; }
      .connector.filled { background:var(--kc, #2563EB); }
      .connector.filled { background:#93C5FD; }
      .connector.empty { background:#EEF1F5; }
      .connector .flow { position:absolute; inset:0; border-radius:2px; }
      .connector.front .flow { background:linear-gradient(#2563EB, #22D3EE); background-size:100% 200%; animation:flowdown 1s linear infinite; }
      @keyframes flowdown { 0%{background-position:0 -20px} 100%{background-position:0 20px} }

      @media (prefers-reduced-motion: reduce) {
        .livedot.on, .drop, .node.active .tank-fill, .connector.front .flow { animation:none !important; }
        .connector.front .flow { background:#93C5FD; }
      }
    `}</style>
  );
}
