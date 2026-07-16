// The data-access abstraction. The worker, run-service and APIs depend ONLY on this
// interface, so tests can run against an in-memory implementation (predictable, no
// network) while production uses Supabase. Canonical persistence is Supabase — the
// in-memory repo is for tests only.

import type {
  RunInput, RunRecord, RunStatus, ExecutionRecord, ExecutionStatus,
  RawObservationInput, RawObservationRecord, OutletUpsert, OutletRecord,
  RatingHistoryInput, ProvenanceInput, QualityReport,
} from "../types";

export interface ClaimResult { execution: ExecutionRecord | null }

export interface DiscoveryRepository {
  // runs
  createRun(input: RunInput): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  listRuns(tenantId: string): Promise<RunRecord[]>;
  setRunStatus(id: string, status: RunStatus): Promise<void>;

  // executions
  createExecution(runId: string, tenantId: string, plannedQueries: number): Promise<ExecutionRecord>;
  setExecutionPlan(id: string, plannedQueries: number): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | null>;
  listExecutionsForRun(runId: string): Promise<ExecutionRecord[]>;
  claimNextExecution(worker: string, leaseSeconds: number): Promise<ExecutionRecord | null>;
  heartbeat(executionId: string, worker: string, completedQueries: number, metrics: Record<string, unknown>, leaseSeconds: number): Promise<boolean>; // returns cancelRequested
  requestCancel(executionId: string): Promise<void>;
  finishExecution(id: string, status: ExecutionStatus, patch: { metrics?: Record<string, unknown>; warnings?: unknown[]; error?: unknown | null }): Promise<void>;

  // raw observations (append-only)
  findObservationByHash(tenantId: string, contentHash: string): Promise<{ id: string } | null>;
  insertRawObservation(obs: RawObservationInput & { duplicate_of?: string | null }): Promise<RawObservationRecord>;
  countObservations(executionId: string): Promise<number>;

  // normalised outlets + history + provenance
  upsertOutlet(u: OutletUpsert): Promise<OutletRecord>;
  insertRatingHistory(r: RatingHistoryInput): Promise<void>;
  replaceProvenance(outletId: string, rows: ProvenanceInput[]): Promise<void>;

  // data quality
  saveQualityReport(tenantId: string, executionId: string, runId: string, report: QualityReport): Promise<void>;
  getQualityReport(executionId: string): Promise<QualityReport | null>;

  // test/maintenance
  deleteRunCascade(runId: string): Promise<void>;
}
