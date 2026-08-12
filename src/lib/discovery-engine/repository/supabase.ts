// Supabase-backed DiscoveryRepository (canonical persistence). Uses the service-role
// client (server-side only). RLS is enforced for the browser client; the worker
// legitimately bypasses it via the service role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase-client";
import { NORMALISATION_VERSION } from "../version";
import type { DiscoveryRepository, HeartbeatResult, FinishExecutionPatch, FailRunResult } from "./repository";
import type {
  RunInput, RunRecord, RunStatus, ExecutionRecord, ExecutionStatus,
  RawObservationInput, RawObservationRecord, OutletUpsert, OutletRecord,
  RatingHistoryInput, ProvenanceInput, QualityReport,
} from "../types";

function must<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) throw new Error(`${what}: ${JSON.stringify(res.error)}`);
  if (res.data == null) throw new Error(`${what}: no data returned`);
  return res.data;
}

/** Bounded retry (ISS-0031) for writes that must not be silently lost to a transient
 *  connection blip — specifically the run-level terminal-status write, which the
 *  duplicate-run guard and every downstream lead-production stage depend on. 3 attempts,
 *  short exponential-ish backoff (300ms/900ms/2700ms). Never used for the high-volume
 *  per-outlet writes (insertRawObservation etc.) — only for the low-frequency, high-stakes
 *  status transition itself. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * 3 ** i));
    }
  }
  throw lastErr;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string { return typeof v === "string" && UUID_RE.test(v); }

/**
 * Normalise a `claim_je_execution()` RPC result into a valid execution or null.
 * A function that RETURNS a composite and returns NULL is materialised by PostgREST as a
 * single all-NULL row; this rejects that phantom row (and any row missing a valid
 * id/run_id) so the worker never claims a bogus execution. Exported for tests.
 */
export function normaliseClaimedRow(data: unknown): ExecutionRecord | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<ExecutionRecord>;
  if (!isUuid(r.id) || !isUuid(r.run_id)) return null;   // reject all-NULL / malformed rows
  return r as ExecutionRecord;
}

export class SupabaseRepository implements DiscoveryRepository {
  private db: SupabaseClient;
  constructor(client?: SupabaseClient) { this.db = client ?? createServiceClient(); }

  async createRun(input: RunInput): Promise<RunRecord> {
    const r = await this.db.from("discovery_runs").insert(input).select().single();
    return must(r, "createRun") as RunRecord;
  }
  async getRun(id: string) {
    if (!isUuid(id)) return null;   // never send a non-UUID (e.g. "null") to a uuid column
    const r = await this.db.from("discovery_runs").select("*").eq("id", id).maybeSingle();
    if (r.error) throw new Error(`getRun: ${JSON.stringify(r.error)}`);
    return (r.data as RunRecord) ?? null;
  }
  async listRuns(tenantId: string) {
    const r = await this.db.from("discovery_runs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    return must(r, "listRuns") as RunRecord[];
  }
  async setRunStatus(id: string, status: RunStatus) {
    await withRetry(async () => {
      const r = await this.db.from("discovery_runs").update({ status }).eq("id", id);
      if (r.error) throw new Error(`setRunStatus: ${JSON.stringify(r.error)}`);
    });
  }
  async updateRunDraft(id: string, patch: Partial<RunInput>): Promise<RunRecord> {
    const r = await this.db.from("discovery_runs").update(patch).eq("id", id).select().single();
    return must(r, "updateRunDraft") as RunRecord;
  }
  async failRun(id: string, reason: string): Promise<FailRunResult> {
    return withRetry(async () => {
      const existing = await this.db.from("discovery_runs").select("reference").eq("id", id).maybeSingle();
      if (existing.error) throw new Error(`failRun.readReference: ${JSON.stringify(existing.error)}`);
      const priorReference = (existing.data as { reference: string | null } | null)?.reference ?? null;
      const stamp = new Date().toISOString();
      const failureNote = `failed_transient: ${reason.slice(0, 400)} (at ${stamp})`;
      const reference = priorReference ? `${priorReference} | ${failureNote}` : failureNote;
      // Guarded UPDATE: only transitions rows NOT already in a terminal accepted state — a
      // 0-row result here means the run had already completed/completed_with_warnings and was
      // correctly left untouched (requirement 8 — no successful run may be overwritten).
      const r = await this.db.from("discovery_runs")
        .update({ status: "failed", reference })
        .eq("id", id)
        .not("status", "in", "(completed,completed_with_warnings)")
        .select("id");
      if (r.error) throw new Error(`failRun: ${JSON.stringify(r.error)}`);
      return { downgraded: (r.data ?? []).length > 0 };
    });
  }

  async confirmAndQueueRun(runId: string, actorUserId: string, source = "just_eat"): Promise<ExecutionRecord> {
    const r = await this.db.rpc("confirm_and_queue_run", { p_run_id: runId, p_actor_user_id: actorUserId, p_source: source });
    if (r.error) throw new Error(`confirmAndQueueRun: ${JSON.stringify(r.error)}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row) throw new Error("confirmAndQueueRun: no execution returned");
    return row as ExecutionRecord;
  }
  async getQueryUnitsForRun(runId: string, source = "just_eat"): Promise<string[]> {
    if (!isUuid(runId)) return [];
    const r = await this.db.from("query_unit").select("code").eq("run_id", runId).eq("source", source);
    if (r.error) throw new Error(`getQueryUnitsForRun: ${JSON.stringify(r.error)}`);
    return [...new Set(((r.data ?? []) as { code: string }[]).map((row) => row.code.toUpperCase()))];
  }
  async createExecution(runId: string, tenantId: string, plannedQueries: number): Promise<ExecutionRecord> {
    const r = await this.db.from("je_executions")
      .insert({ run_id: runId, tenant_id: tenantId, planned_queries: plannedQueries, status: "queued" })
      .select().single();
    return must(r, "createExecution") as ExecutionRecord;
  }
  async setExecutionPlan(id: string, plannedQueries: number) {
    const r = await this.db.from("je_executions").update({ planned_queries: plannedQueries }).eq("id", id);
    if (r.error) throw new Error(`setExecutionPlan: ${JSON.stringify(r.error)}`);
  }
  async getExecution(id: string) {
    if (!isUuid(id)) return null;
    const r = await this.db.from("je_executions").select("*").eq("id", id).maybeSingle();
    if (r.error) throw new Error(`getExecution: ${JSON.stringify(r.error)}`);
    return (r.data as ExecutionRecord) ?? null;
  }
  async listExecutionsForRun(runId: string) {
    const r = await this.db.from("je_executions").select("*").eq("run_id", runId).order("queued_at", { ascending: true });
    return must(r, "listExecutionsForRun") as ExecutionRecord[];
  }
  async claimNextExecution(worker: string, leaseSeconds: number): Promise<ExecutionRecord | null> {
    const r = await this.db.rpc("claim_je_execution", { p_worker: worker, p_lease_seconds: leaseSeconds });
    if (r.error) throw new Error(`claimNextExecution: ${JSON.stringify(r.error)}`);
    return normaliseClaimedRow(r.data);   // rejects the phantom all-NULL composite row
  }
  async heartbeat(executionId: string, worker: string, completedQueries: number, metrics: Record<string, unknown>, leaseSeconds: number): Promise<HeartbeatResult> {
    const r = await this.db.rpc("heartbeat_je_execution", {
      p_id: executionId, p_worker: worker, p_completed: completedQueries, p_metrics: metrics, p_lease_seconds: leaseSeconds,
    });
    if (r.error) throw new Error(`heartbeat: ${JSON.stringify(r.error)}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    return { owned: !!row?.owned, cancelRequested: !!row?.cancel_requested };
  }
  async requestCancel(executionId: string) {
    const r = await this.db.from("je_executions").update({ cancel_requested: true, status: "cancelling" }).eq("id", executionId);
    if (r.error) throw new Error(`requestCancel: ${JSON.stringify(r.error)}`);
  }
  async finishExecution(id: string, status: ExecutionStatus, patch: FinishExecutionPatch) {
    const update: Record<string, unknown> = { status, finished_at: new Date().toISOString() };
    if (patch.metrics) update.metrics = patch.metrics;
    if (patch.warnings) update.warnings = patch.warnings;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.completedQueries !== undefined) update.completed_queries = patch.completedQueries;  // authoritative
    if (patch.plannedQueries !== undefined) update.planned_queries = patch.plannedQueries;
    let q = this.db.from("je_executions").update(update).eq("id", id);
    if (patch.claimedBy) q = q.eq("claimed_by", patch.claimedBy);   // ownership guard
    const r = await q;
    if (r.error) throw new Error(`finishExecution: ${JSON.stringify(r.error)}`);
  }

  async findObservationByHash(tenantId: string, contentHash: string) {
    const r = await this.db.from("je_raw_observations").select("id").eq("tenant_id", tenantId).eq("content_hash", contentHash).limit(1).maybeSingle();
    if (r.error) throw new Error(`findObservationByHash: ${JSON.stringify(r.error)}`);
    return (r.data as { id: string }) ?? null;
  }
  async insertRawObservation(obs: RawObservationInput & { duplicate_of?: string | null }): Promise<RawObservationRecord> {
    const r = await this.db.from("je_raw_observations").insert(obs).select().single();
    return must(r, "insertRawObservation") as RawObservationRecord;
  }
  async countObservations(executionId: string) {
    const r = await this.db.from("je_raw_observations").select("id", { count: "exact", head: true }).eq("execution_id", executionId);
    if (r.error) throw new Error(`countObservations: ${JSON.stringify(r.error)}`);
    return r.count ?? 0;
  }
  async listCanonicalRawObservationsForRun(runId: string): Promise<RawObservationRecord[]> {
    const r = await this.db.from("je_raw_observations").select("*").eq("run_id", runId).is("duplicate_of", null).order("created_at", { ascending: true });
    return must(r, "listCanonicalRawObservationsForRun") as RawObservationRecord[];
  }
  async countGeographyValidationsForRun(runId: string): Promise<number> {
    const r = await this.db.from("provider_geography_validations").select("id", { count: "exact", head: true }).eq("run_id", runId);
    if (r.error) throw new Error(`countGeographyValidationsForRun: ${JSON.stringify(r.error)}`);
    return r.count ?? 0;
  }

  async upsertOutlet(u: OutletUpsert): Promise<OutletRecord> {
    const existing = await this.db.from("je_outlets").select("id, observation_count, first_seen_at")
      .eq("tenant_id", u.tenant_id).eq("je_outlet_id", u.parsed.je_outlet_id).maybeSingle();
    if (existing.error) throw new Error(`upsertOutlet.select: ${JSON.stringify(existing.error)}`);
    const nowIso = new Date().toISOString();
    if (existing.data) {
      const prev = existing.data as { id: string; observation_count: number };
      const r = await this.db.from("je_outlets").update({
        ...u.parsed, latest_observation_id: u.latest_observation_id, last_seen_at: nowIso,
        observation_count: (prev.observation_count ?? 1) + 1, normalisation_version: NORMALISATION_VERSION,
      }).eq("id", prev.id).select().single();
      return must(r, "upsertOutlet.update") as OutletRecord;
    }
    const r = await this.db.from("je_outlets").insert({
      ...u.parsed, tenant_id: u.tenant_id, latest_observation_id: u.latest_observation_id,
      normalisation_version: NORMALISATION_VERSION, processing_state: "normalised", confidence: u.parsed.territory_confidence ?? null,
    }).select().single();
    return must(r, "upsertOutlet.insert") as OutletRecord;
  }
  async insertRatingHistory(r: RatingHistoryInput) {
    const res = await this.db.from("je_rating_history").insert(r);
    if (res.error) throw new Error(`insertRatingHistory: ${JSON.stringify(res.error)}`);
  }
  async replaceProvenance(outletId: string, rows: ProvenanceInput[]) {
    const del = await this.db.from("je_field_provenance").delete().eq("outlet_id", outletId);
    if (del.error) throw new Error(`replaceProvenance.delete: ${JSON.stringify(del.error)}`);
    if (rows.length) {
      const ins = await this.db.from("je_field_provenance").insert(rows);
      if (ins.error) throw new Error(`replaceProvenance.insert: ${JSON.stringify(ins.error)}`);
    }
  }

  async saveQualityReport(tenantId: string, executionId: string, runId: string, report: QualityReport) {
    const r = await this.db.from("je_execution_quality").insert({ tenant_id: tenantId, execution_id: executionId, run_id: runId, report });
    if (r.error) throw new Error(`saveQualityReport: ${JSON.stringify(r.error)}`);
  }
  async getQualityReport(executionId: string) {
    const r = await this.db.from("je_execution_quality").select("report").eq("execution_id", executionId).order("computed_at", { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw new Error(`getQualityReport: ${JSON.stringify(r.error)}`);
    return (r.data?.report as QualityReport) ?? null;
  }

  async deleteRunCascade(runId: string) {
    const r = await this.db.from("discovery_runs").delete().eq("id", runId);
    if (r.error) throw new Error(`deleteRunCascade: ${JSON.stringify(r.error)}`);
  }

  async persistGeographyValidations(args: Parameters<DiscoveryRepository["persistGeographyValidations"]>[0]) {
    const { persistGeographyValidations } = await import("../geography/persist-geography");
    return persistGeographyValidations(this.db, args);
  }

  async consolidateRun(tenantId: string, runId: string) {
    const { consolidateRun } = await import("../consolidation/consolidate-run");
    return consolidateRun(this.db, tenantId, runId);
  }
}
