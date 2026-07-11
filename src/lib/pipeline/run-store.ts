// Local, resumable run store — Vertical Slice 001.
// Persists run state + working records + final result to data/runs/ as JSON so a
// run can pause/resume/retry without starting over. Local-file based (no DB).

import fs from "node:fs";
import path from "node:path";
import type {
  RunState,
  RunConfig,
  StageId,
  StageState,
  RunCounters,
  WorkingRecord,
  RunResultBundle,
} from "./types";
import { STAGE_DEFS } from "./stages";

export const RUNS_DIR = path.join(process.cwd(), "data", "runs");
export const EXPORTS_DIR = path.join(process.cwd(), "exports");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function nowIso(): string {
  return new Date().toISOString();
}

function zeroCounters(): RunCounters {
  return {
    fetched: 0,
    normalised: 0,
    valid_postcodes: 0,
    in_territory: 0,
    food_category: 0,
    deduped: 0,
    after_existing_exclusion: 0,
    scored: 0,
    export_ready: 0,
    exported: 0,
    rejected_total: 0,
  };
}

function emptyStages(): StageState[] {
  return STAGE_DEFS.map((d) => ({
    stage_id: d.id,
    label: d.label,
    status: "pending",
    started_at: null,
    completed_at: null,
    input_count: 0,
    output_count: 0,
    rejected_count: 0,
    error_count: 0,
    notes: "",
    errors: [],
  }));
}

export function createRunState(config: RunConfig): RunState {
  return {
    run_id: config.run_id,
    status: "draft",
    current_stage: null,
    started_at: null,
    updated_at: nowIso(),
    completed_at: null,
    config,
    stages: emptyStages(),
    errors: [],
    counters: zeroCounters(),
    output_files: [],
  };
}

// ---- paths ----
const statePath = (runId: string) => path.join(RUNS_DIR, `${runId}.json`);
const recordsPath = (runId: string) => path.join(RUNS_DIR, `${runId}.records.json`);
const resultPath = (runId: string) => path.join(RUNS_DIR, `${runId}.result.json`);
const pausePath = (runId: string) => path.join(RUNS_DIR, `${runId}.pause`);

// ---- persistence ----
export function saveRunState(state: RunState): void {
  ensureDir(RUNS_DIR);
  state.updated_at = nowIso();
  fs.writeFileSync(statePath(state.run_id), JSON.stringify(state, null, 2));
}

export function saveRecords(runId: string, records: WorkingRecord[]): void {
  ensureDir(RUNS_DIR);
  fs.writeFileSync(recordsPath(runId), JSON.stringify(records));
}

export function saveResult(runId: string, bundle: RunResultBundle): void {
  ensureDir(RUNS_DIR);
  fs.writeFileSync(resultPath(runId), JSON.stringify(bundle, null, 2));
}

export function loadRunState(runId: string): RunState | null {
  try {
    return JSON.parse(fs.readFileSync(statePath(runId), "utf8")) as RunState;
  } catch {
    return null;
  }
}

export function loadRecords(runId: string): WorkingRecord[] {
  try {
    return JSON.parse(fs.readFileSync(recordsPath(runId), "utf8")) as WorkingRecord[];
  } catch {
    return [];
  }
}

export function loadResult(runId: string): RunResultBundle | null {
  try {
    return JSON.parse(fs.readFileSync(resultPath(runId), "utf8")) as RunResultBundle;
  } catch {
    return null;
  }
}

/** Run IDs newest-first (sorted by filename; run IDs embed a timestamp). */
export function listRunIds(): string[] {
  try {
    return fs
      .readdirSync(RUNS_DIR)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".result.json") && !f.endsWith(".records.json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function loadLatestRunState(): RunState | null {
  const ids = listRunIds();
  return ids.length ? loadRunState(ids[0]) : null;
}

export function loadLatestResult(): RunResultBundle | null {
  const ids = listRunIds();
  for (const id of ids) {
    const r = loadResult(id);
    if (r) return r;
  }
  return null;
}

// ---- pause / resume controls (cooperative, file-based) ----
export function requestPause(runId: string): void {
  ensureDir(RUNS_DIR);
  fs.writeFileSync(pausePath(runId), nowIso());
}

export function isPauseRequested(runId: string): boolean {
  return fs.existsSync(pausePath(runId));
}

export function clearPause(runId: string): void {
  try {
    fs.rmSync(pausePath(runId));
  } catch {
    /* no-op */
  }
}

/** The first stage that is not completed/skipped — where a resume continues. */
export function nextStageIndex(state: RunState): number {
  const i = state.stages.findIndex((s) => s.status !== "completed" && s.status !== "skipped");
  return i === -1 ? state.stages.length : i;
}

export function findStage(state: RunState, id: StageId): StageState {
  const s = state.stages.find((x) => x.stage_id === id);
  if (!s) throw new Error(`unknown stage ${id}`);
  return s;
}
