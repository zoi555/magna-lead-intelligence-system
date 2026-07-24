// The data-access abstraction. The worker, run-service and APIs depend ONLY on this
// interface, so tests can run against an in-memory implementation (predictable, no
// network) while production uses Supabase. Canonical persistence is Supabase — the
// in-memory repo is for tests only.

import type {
  RunInput, RunRecord, RunStatus, ExecutionRecord, ExecutionStatus,
  RawObservationInput, RawObservationRecord, OutletUpsert, OutletRecord,
  RatingHistoryInput, ProvenanceInput, QualityReport,
} from "../types";
import type { SourceOutlet } from "../consolidation/types";
import type { GeographyRunContext, GeographyVerdict } from "../geography/provider-geography-gate";

export interface ClaimResult { execution: ExecutionRecord | null }

/** Outcome of `failRun()`: `downgraded` is false when the run was already in a terminal
 *  accepted state (`completed`/`completed_with_warnings`) and was therefore left untouched —
 *  no successful/accepted run may ever be overwritten by a later failure signal (ISS-0031,
 *  ISS-0031 requirement 8). */
export interface FailRunResult { downgraded: boolean; }

/** Heartbeat outcome: `owned` is false if this worker no longer holds the execution
 *  (its lease expired and another worker re-claimed it) — the caller must then abort. */
export interface HeartbeatResult { owned: boolean; cancelRequested: boolean }

export interface FinishExecutionPatch {
  metrics?: Record<string, unknown>;
  warnings?: unknown[];
  error?: unknown | null;
  completedQueries?: number;   // authoritative final count written to the column
  plannedQueries?: number;
  claimedBy?: string;          // ownership guard — only finish if still owned
}

export interface DiscoveryRepository {
  // runs
  createRun(input: RunInput): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  listRuns(tenantId: string): Promise<RunRecord[]>;
  setRunStatus(id: string, status: RunStatus): Promise<void>;
  /** Update a run's own config columns in place. Only meaningful while status is still
   *  'draft' — callers must enforce that precondition; the repository itself does not
   *  restrict which rows can be updated. */
  updateRunDraft(id: string, patch: Partial<RunInput>): Promise<RunRecord>;
  /** Mark a run 'failed' with a preserved reason (ISS-0031). Distinct from `setRunStatus`
   *  because it (a) is safe to call from a failure-handling path that may itself be racing a
   *  flaky connection — implementations retry this specific write with bounded backoff, since
   *  a lost failure-status write is exactly the bug this method exists to prevent — and (b)
   *  never downgrades a run already in a terminal accepted state (`completed`/
   *  `completed_with_warnings`); see `FailRunResult`. The reason is appended (not overwritten)
   *  to the run's existing `reference` annotation, so an explicit replacement-run linkage
   *  written by `--replaces=` is never clobbered by a later failure on the same run. */
  failRun(id: string, reason: string): Promise<FailRunResult>;

  // executions
  createExecution(runId: string, tenantId: string, plannedQueries: number): Promise<ExecutionRecord>;
  setExecutionPlan(id: string, plannedQueries: number): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | null>;
  listExecutionsForRun(runId: string): Promise<ExecutionRecord[]>;
  claimNextExecution(worker: string, leaseSeconds: number): Promise<ExecutionRecord | null>;
  heartbeat(executionId: string, worker: string, completedQueries: number, metrics: Record<string, unknown>, leaseSeconds: number): Promise<HeartbeatResult>;
  requestCancel(executionId: string): Promise<void>;
  finishExecution(id: string, status: ExecutionStatus, patch: FinishExecutionPatch): Promise<void>;

  // raw observations (append-only)
  findObservationByHash(tenantId: string, contentHash: string): Promise<{ id: string } | null>;
  insertRawObservation(obs: RawObservationInput & { duplicate_of?: string | null }): Promise<RawObservationRecord>;
  countObservations(executionId: string): Promise<number>;
  /** All canonical (duplicate_of IS NULL) raw observations for a run, oldest first — used by
   *  resume-geography.ts (ISS-0031 requirement 7) to reconstruct a run's outlet set from
   *  RETAINED evidence without a new discovery call. Never returns duplicate rows. */
  listCanonicalRawObservationsForRun(runId: string): Promise<RawObservationRecord[]>;
  /** Count of provider_geography_validations rows already recorded for a run — used to detect
   *  "raw retained, geography incomplete" (resumable) vs. "already processed" (refuse to
   *  duplicate validation records) in resume-geography.ts. */
  countGeographyValidationsForRun(runId: string): Promise<number>;

  // normalised outlets + history + provenance
  upsertOutlet(u: OutletUpsert): Promise<OutletRecord>;
  insertRatingHistory(r: RatingHistoryInput): Promise<void>;
  replaceProvenance(outletId: string, rows: ProvenanceInput[]): Promise<void>;

  // data quality
  saveQualityReport(tenantId: string, executionId: string, runId: string, report: QualityReport): Promise<void>;
  getQualityReport(executionId: string): Promise<QualityReport | null>;

  // test/maintenance
  deleteRunCascade(runId: string): Promise<void>;

  // geography validation (the provider-neutral gate, wired into a real execution path —
  // never backfilled onto historical data, see docs/09_DECISIONS.md)
  persistGeographyValidations(args: {
    tenantId: string; runId: string | null; executionId: string | null; source: string;
    ctx: GeographyRunContext; verdicts: { outlet: SourceOutlet; verdict: GeographyVerdict }[];
    observationIdBySourceId?: Map<string, string>;
  }): Promise<{ inserted: number }>;

  /** Turns a run's canonical raw observations into consolidated_candidates rows (so they
   *  appear in Discovery Results / Data-Quality Exceptions). Previously only ever called
   *  from the ad-hoc scripts/je-run.ts CLI script, never automatically after a UI-driven
   *  run finished — wired into the real execution-completion path in worker/execute.ts. */
  consolidateRun(tenantId: string, runId: string): Promise<{ outlets: number; candidates: number }>;
}
