// Resumable discovery orchestrator — Vertical Slice 001.
// Drives the 14 stages via the local run store; supports pause/resume/retry.

import type { RunConfig, RunState, StageId, StageState, PipelineError, RunResultBundle } from "./types";
import { STAGE_DEFS, type StageContext, type StageOutput } from "./stages";
import {
  createRunState,
  saveRunState,
  saveRecords,
  loadRecords,
  saveResult,
  loadRunState,
  nowIso,
  isPauseRequested,
  clearPause,
  nextStageIndex,
  findStage,
} from "./run-store";

export const PILOT_PREFIXES = ["UB1", "UB2", "UB6", "HA0", "HA9", "W5"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Timestamped run id (sortable). CLI-time only. */
export function genRunId(): string {
  const d = new Date();
  return `RUN-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function makeRunConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    run_id: overrides.run_id ?? genRunId(),
    territory_label: overrides.territory_label ?? "West London pilot",
    postcode_prefixes: overrides.postcode_prefixes ?? PILOT_PREFIXES,
    mode: overrides.mode ?? "live",
    fsa_page_size: overrides.fsa_page_size ?? 200,
    created_from: overrides.created_from ?? "cli",
  };
}

function applyCounters(state: RunState, id: StageId, st: StageState) {
  const c = state.counters;
  switch (id) {
    case "fetch_fsa": c.fetched = st.output_count; break;
    case "normalise_records": c.normalised = st.output_count; break;
    case "validate_postcodes": c.valid_postcodes = st.output_count; break;
    case "territory_filter": c.in_territory = st.output_count; break;
    case "category_filter": c.food_category = st.output_count; break;
    case "dedupe_candidates": c.deduped = st.output_count; break;
    case "exclude_existing_customers": c.after_existing_exclusion = st.output_count; break;
    case "score_candidates": c.scored = st.output_count; break;
    case "export_review_gate": c.export_ready = st.output_count - st.rejected_count; break;
    case "generate_final_exports": /* exported set from bundle */ break;
    default: break;
  }
}

function writeResultBundle(state: RunState, rows: NonNullable<StageOutput["exportRows"]>) {
  const rejectionsByStage = state.stages
    .filter((s) => s.rejected_count > 0)
    .map((s) => ({ stage_id: s.stage_id, label: s.label, rejected: s.rejected_count }));
  const rejected_total = state.stages.reduce((n, s) => n + s.rejected_count, 0);
  state.counters.exported = rows.eligibleRows.length;
  state.counters.rejected_total = rejected_total;
  const bundle: RunResultBundle = {
    run_id: state.run_id,
    generated_at: nowIso(),
    summary: {
      fetched: state.counters.fetched,
      final_leads: rows.finalRows.length,
      export_eligible: rows.eligibleRows.length,
      rejected_total,
    },
    leads: rows.finalRows,
    exportEligible: rows.eligibleRows,
    telesalesSafe: rows.telesalesSafe,
    rejectionsByStage,
  };
  saveResult(state.run_id, bundle);
}

/** Execute stages from `startIndex` to the end. Persists after each stage. */
export async function executeRun(state: RunState, startIndex: number): Promise<RunState> {
  const ctx: StageContext = { config: state.config, referenceDateMs: Date.now(), checkedAt: nowIso() };
  let records = startIndex > 0 ? loadRecords(state.run_id) : [];

  state.status = "running";
  state.started_at = state.started_at ?? nowIso();
  saveRunState(state);

  for (let i = startIndex; i < STAGE_DEFS.length; i++) {
    if (isPauseRequested(state.run_id)) {
      state.status = "paused";
      state.current_stage = STAGE_DEFS[i].id;
      saveRunState(state);
      return state;
    }

    const def = STAGE_DEFS[i];
    const st = findStage(state, def.id);
    st.status = "running";
    st.started_at = nowIso();
    st.input_count = records.length;
    state.current_stage = def.id;
    saveRunState(state);

    let out: StageOutput;
    try {
      out = await def.handler(records, ctx);
    } catch (e) {
      const pe: PipelineError = {
        error_code: def.id === "fetch_fsa" ? "FSA_FETCH_FAILED" : "SCORING_FAILED",
        stage_id: def.id,
        severity: "fatal",
        message: `Unhandled error in ${def.id}: ${e instanceof Error ? e.message : String(e)}`,
        retryable: true,
        suggested_fix: "Inspect logs and retry with `npm run leads:resume`.",
      };
      st.status = "failed";
      st.errors.push(pe);
      st.error_count = st.errors.length;
      st.completed_at = nowIso();
      state.errors.push(pe);
      state.status = "failed";
      saveRunState(state);
      return state;
    }

    records = out.records;
    st.output_count = records.length;
    st.rejected_count = out.rejected;
    if (out.metrics) st.metrics = out.metrics;
    st.errors.push(...out.errors);
    st.error_count = st.errors.length;
    st.notes = out.notes;
    state.errors.push(...out.errors.filter((e) => e.severity === "error" || e.severity === "fatal"));

    const fatal = out.errors.find((e) => e.severity === "fatal");
    st.status = fatal ? "failed" : "completed";
    st.completed_at = nowIso();
    applyCounters(state, def.id, st);
    if (out.outputFiles) state.output_files = out.outputFiles;

    saveRecords(state.run_id, records);
    saveRunState(state);

    if (fatal) {
      state.status = "failed";
      saveRunState(state);
      return state;
    }
    if (def.id === "generate_final_exports" && out.exportRows) writeResultBundle(state, out.exportRows);
  }

  state.status = "completed";
  state.completed_at = nowIso();
  state.current_stage = null;
  state.counters.rejected_total = state.stages.reduce((n, s) => n + s.rejected_count, 0);
  saveRunState(state);
  return state;
}

/** Start a fresh run. */
export async function startRun(config: RunConfig): Promise<RunState> {
  clearPause(config.run_id);
  const state = createRunState(config);
  saveRunState(state);
  return executeRun(state, 0);
}

/** Resume the given run (or latest) from its first non-completed stage. */
export async function resumeRun(runId: string): Promise<RunState | null> {
  const state = loadRunState(runId);
  if (!state) return null;
  clearPause(runId);
  if (state.status === "completed") return state;
  return executeRun(state, nextStageIndex(state));
}
