// In-memory DiscoveryRepository for tests. Emulates the same invariants the Postgres
// schema enforces: append-only raw observations, hash de-duplication, outlet upsert by
// (tenant, je_outlet_id), and the atomic claim/heartbeat/cancel contract. Tenant-scoped
// reads mirror RLS. NOT for production — Supabase is the canonical store.

import { randomUUID } from "node:crypto";
import type { DiscoveryRepository, HeartbeatResult, FinishExecutionPatch, FailRunResult } from "./repository";
import type {
  RunInput, RunRecord, RunStatus, ExecutionRecord, ExecutionStatus,
  RawObservationInput, RawObservationRecord, OutletUpsert, OutletRecord,
  RatingHistoryInput, ProvenanceInput, QualityReport,
} from "../types";
import { NORMALISATION_VERSION } from "../version";

const now = () => new Date().toISOString();

export class MemoryRepository implements DiscoveryRepository {
  runs = new Map<string, RunRecord>();
  executions = new Map<string, ExecutionRecord>();
  observations = new Map<string, RawObservationRecord>();
  outlets = new Map<string, OutletRecord>();
  ratingHistory: RatingHistoryInput[] = [];
  provenance = new Map<string, ProvenanceInput[]>();
  quality = new Map<string, QualityReport>();

  async createRun(input: RunInput): Promise<RunRecord> {
    const rec: RunRecord = { ...input, id: randomUUID(), status: "draft", schema_version: 1, created_at: now(), updated_at: now() };
    this.runs.set(rec.id, rec);
    return rec;
  }
  async getRun(id: string) { return this.runs.get(id) ?? null; }
  async listRuns(tenantId: string) { return [...this.runs.values()].filter((r) => r.tenant_id === tenantId); }
  async setRunStatus(id: string, status: RunStatus) { const r = this.runs.get(id); if (r) { r.status = status; r.updated_at = now(); } }
  async updateRunDraft(id: string, patch: Partial<RunInput>): Promise<RunRecord> {
    const r = this.runs.get(id);
    if (!r) throw new Error(`updateRunDraft: run ${id} not found`);
    const next = { ...r, ...patch, updated_at: now() };
    this.runs.set(id, next);
    return next;
  }
  /** Test-only hook: when set, the NEXT call to failRun() throws this error instead of
   *  succeeding, then clears itself — lets tests simulate the exact ISS-0031 scenario (the
   *  run-level status write itself failing) without touching real network code. */
  failRunShouldThrowOnce: Error | null = null;
  async failRun(id: string, reason: string): Promise<FailRunResult> {
    if (this.failRunShouldThrowOnce) {
      const err = this.failRunShouldThrowOnce;
      this.failRunShouldThrowOnce = null;
      throw err;
    }
    const r = this.runs.get(id);
    if (!r) return { downgraded: false };
    if (r.status === "completed" || r.status === "completed_with_warnings") return { downgraded: false };
    const stamp = now();
    const failureNote = `failed_transient: ${reason.slice(0, 400)} (at ${stamp})`;
    r.reference = r.reference ? `${r.reference} | ${failureNote}` : failureNote;
    r.status = "failed";
    r.updated_at = stamp;
    return { downgraded: true };
  }

  /** Non-atomic in-memory approximation of migration 0031's confirm_and_queue_run.
   *  Territory overlap between DIFFERENT runs is PERMITTED (P4 control correction,
   *  2026-08-10) — detected and disclosed, never blocked; only a missing acknowledgement
   *  when overlap is material (shares query units with an ACTIVE run) is rejected, and
   *  only duplicate EXECUTION of the SAME run/source is a hard block. No role check — the
   *  acknowledgement is disclosure evidence, not authorisation of a restricted action.
   *  The authoritative, concurrency-proof version is tested against the real local
   *  Postgres stack — see scripts/test-confirm-and-queue-run-local.ts. */
  async confirmAndQueueRun(runId: string, actorUserId: string, source = "just_eat"): Promise<ExecutionRecord> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`CONFIRM_QUEUE_RUN_NOT_FOUND: run ${runId} does not exist`);
    if (run.status !== "draft") throw new Error(`CONFIRM_QUEUE_NOT_DRAFT: run ${runId} is '${run.status}', not 'draft'`);
    if (source !== "just_eat") throw new Error(`CONFIRM_QUEUE_SOURCE_NOT_PERMITTED: source '${source}' has no authorised operational execution path`);
    const selected = ((run.source_config as Record<string, unknown> | undefined)?.source === source)
      || Array.isArray((run.target_filters as Record<string, unknown> | undefined)?.selectedProviders)
        && ((run.target_filters as Record<string, unknown>).selectedProviders as string[]).includes(source);
    if (!selected) throw new Error(`CONFIRM_QUEUE_SOURCE_NOT_SELECTED: source '${source}' is not selected in run ${runId}'s configuration`);
    if ([...this.executions.values()].some((e) => e.run_id === runId && e.source === source && ["queued", "running", "cancelling"].includes(e.status))) {
      throw new Error(`CONFIRM_QUEUE_DUPLICATE_EXECUTION: run ${runId} already has an active ${source} execution`);
    }

    const units = [...new Set((run.derived_query_units ?? []).map((u) => u.toUpperCase()))];
    const overlappingRunIds = units.length
      ? [...this.runs.values()].filter((r) =>
          r.id !== runId && r.tenant_id === run.tenant_id && ["queued", "running", "cancelling"].includes(r.status)
          && (r.derived_query_units ?? []).some((u) => units.includes(u.toUpperCase())))
        .map((r) => r.id)
      : [];
    if (overlappingRunIds.length) {
      const ack = (run.target_filters as Record<string, unknown> | undefined)?.overlapAcknowledgement as Record<string, unknown> | undefined;
      if (!ack?.acknowledged) throw new Error(`CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED: run ${runId} overlaps ${overlappingRunIds.length} currently active run(s) on source '${source}' — acknowledge the disclosed overlap to proceed`);
      run.target_filters = { ...run.target_filters, overlapAcknowledgement: { ...ack, acknowledgedBy: actorUserId, acknowledgedByEmail: actorUserId, acknowledgedAt: now(), overlappingRunIds } };
      run.config_snapshot = { ...(run.config_snapshot as Record<string, unknown>) };
    }

    run.status = "queued";
    run.updated_at = now();
    return this.createExecution(runId, run.tenant_id, run.derived_query_units?.length ?? 0);
  }

  async createExecution(runId: string, tenantId: string, plannedQueries: number): Promise<ExecutionRecord> {
    const rec: ExecutionRecord = {
      id: randomUUID(), tenant_id: tenantId, run_id: runId, source: "just_eat", status: "queued",
      claimed_by: null, claimed_at: null, heartbeat_at: null, lease_expires_at: null,
      cancel_requested: false, attempts: 0, max_attempts: 3,
      planned_queries: plannedQueries, completed_queries: 0, metrics: {}, warnings: [], error: null,
      queued_at: now(), started_at: null, finished_at: null,
    };
    this.executions.set(rec.id, rec);
    return rec;
  }
  async setExecutionPlan(id: string, plannedQueries: number) { const e = this.executions.get(id); if (e) e.planned_queries = plannedQueries; }
  async getExecution(id: string) { return this.executions.get(id) ?? null; }
  async listExecutionsForRun(runId: string) { return [...this.executions.values()].filter((e) => e.run_id === runId); }

  async claimNextExecution(worker: string, leaseSeconds: number): Promise<ExecutionRecord | null> {
    const staleBefore = Date.now() - leaseSeconds * 1000;
    const claimable = [...this.executions.values()]
      .filter((e) => e.status === "queued" ||
        ((e.status === "running" || e.status === "cancelling") && (!e.heartbeat_at || Date.parse(e.heartbeat_at) < staleBefore)))
      .sort((a, b) => a.queued_at.localeCompare(b.queued_at));
    const e = claimable[0];
    if (!e) return null;
    if (e.status === "queued") e.status = "running";
    e.claimed_by = worker;
    e.claimed_at = now();
    e.heartbeat_at = now();
    e.lease_expires_at = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    e.started_at = e.started_at ?? now();
    e.attempts += 1;
    return { ...e };
  }

  async heartbeat(executionId: string, worker: string, completedQueries: number, metrics: Record<string, unknown>, leaseSeconds: number): Promise<HeartbeatResult> {
    const e = this.executions.get(executionId);
    if (!e || e.claimed_by !== worker) return { owned: false, cancelRequested: false };  // lost the lease
    e.heartbeat_at = now();
    e.lease_expires_at = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    e.completed_queries = completedQueries;
    e.metrics = metrics;
    return { owned: true, cancelRequested: e.cancel_requested };
  }
  async requestCancel(executionId: string) {
    const e = this.executions.get(executionId);
    if (e) { e.cancel_requested = true; if (e.status === "running" || e.status === "queued") e.status = "cancelling"; }
  }
  /** Test-only hook: when set, the NEXT call to finishExecution() throws this error instead
   *  of succeeding, then clears itself — mirrors failRunShouldThrowOnce for the execution-level
   *  write, so tests can simulate either write (or both) failing independently. */
  finishExecutionShouldThrowOnce: Error | null = null;
  async finishExecution(id: string, status: ExecutionStatus, patch: FinishExecutionPatch) {
    if (this.finishExecutionShouldThrowOnce) {
      const err = this.finishExecutionShouldThrowOnce;
      this.finishExecutionShouldThrowOnce = null;
      throw err;
    }
    const e = this.executions.get(id);
    if (!e) return;
    if (patch.claimedBy && e.claimed_by !== patch.claimedBy) return;   // ownership guard
    e.status = status; e.finished_at = now();
    if (patch.metrics) e.metrics = patch.metrics;
    if (patch.warnings) e.warnings = patch.warnings;
    if (patch.error !== undefined) e.error = patch.error;
    if (patch.completedQueries !== undefined) e.completed_queries = patch.completedQueries;  // authoritative
    if (patch.plannedQueries !== undefined) e.planned_queries = patch.plannedQueries;
  }

  async findObservationByHash(tenantId: string, contentHash: string) {
    for (const o of this.observations.values()) if (o.tenant_id === tenantId && o.content_hash === contentHash) return { id: o.id };
    return null;
  }
  async insertRawObservation(obs: RawObservationInput & { duplicate_of?: string | null }): Promise<RawObservationRecord> {
    const rec: RawObservationRecord = { ...obs, id: randomUUID(), duplicate_of: obs.duplicate_of ?? null, fetched_at: obs.fetched_at ?? now(), created_at: now() };
    this.observations.set(rec.id, rec);
    return rec;
  }
  async countObservations(executionId: string) { return [...this.observations.values()].filter((o) => o.execution_id === executionId).length; }
  async listCanonicalRawObservationsForRun(runId: string): Promise<RawObservationRecord[]> {
    return [...this.observations.values()]
      .filter((o) => o.run_id === runId && o.duplicate_of == null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async countGeographyValidationsForRun(runId: string): Promise<number> {
    return this.geographyValidations.filter((v) => v.runId === runId).length;
  }

  async upsertOutlet(u: OutletUpsert): Promise<OutletRecord> {
    const key = `${u.tenant_id}:${u.parsed.je_outlet_id}`;
    const existing = [...this.outlets.values()].find((o) => o.tenant_id === u.tenant_id && o.je_outlet_id === u.parsed.je_outlet_id);
    if (existing) {
      Object.assign(existing, u.parsed);   // refresh latest fields
      existing.latest_observation_id = u.latest_observation_id;
      existing.last_seen_at = now();
      existing.observation_count += 1;
      return { ...existing };
    }
    const rec: OutletRecord = {
      ...u.parsed, id: randomUUID(), tenant_id: u.tenant_id, latest_observation_id: u.latest_observation_id,
      first_seen_at: now(), last_seen_at: now(), observation_count: 1,
      normalisation_version: NORMALISATION_VERSION, processing_state: "normalised", confidence: u.parsed.territory_confidence ?? null,
    };
    this.outlets.set(key, rec);
    return { ...rec };
  }
  async insertRatingHistory(r: RatingHistoryInput) { this.ratingHistory.push(r); }
  async replaceProvenance(outletId: string, rows: ProvenanceInput[]) { this.provenance.set(outletId, rows); }

  async saveQualityReport(_tenantId: string, executionId: string, _runId: string, report: QualityReport) { this.quality.set(executionId, report); }
  async getQualityReport(executionId: string) { return this.quality.get(executionId) ?? null; }

  async deleteRunCascade(runId: string) {
    this.runs.delete(runId);
    for (const [id, e] of this.executions) if (e.run_id === runId) this.executions.delete(id);
    for (const [id, o] of this.observations) if (o.run_id === runId) this.observations.delete(id);
    // outlets/history/provenance are keyed differently; tests using cascade recreate as needed
  }

  geographyValidations: { tenantId: string; runId: string | null; verdict: unknown }[] = [];
  /** Test-only hook: simulates the geography-validation write itself failing after raw
   *  observations have already been persisted — the exact "raw retained, geography
   *  incomplete" scenario (NW2/NW7's real failure shape). */
  persistGeographyValidationsShouldThrowOnce: Error | null = null;
  async persistGeographyValidations(args: { tenantId: string; runId: string | null; verdicts: { verdict: unknown }[] }) {
    if (this.persistGeographyValidationsShouldThrowOnce) {
      const err = this.persistGeographyValidationsShouldThrowOnce;
      this.persistGeographyValidationsShouldThrowOnce = null;
      throw err;
    }
    for (const v of args.verdicts) this.geographyValidations.push({ tenantId: args.tenantId, runId: args.runId, verdict: v.verdict });
    return { inserted: args.verdicts.length };
  }

  async consolidateRun(_tenantId: string, _runId: string) {
    return { outlets: 0, candidates: 0 }; // in-memory tests don't exercise real consolidation SQL
  }
}
