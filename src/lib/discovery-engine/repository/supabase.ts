// Supabase-backed DiscoveryRepository (canonical persistence). Uses the service-role
// client (server-side only). RLS is enforced for the browser client; the worker
// legitimately bypasses it via the service role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase-client";
import { NORMALISATION_VERSION } from "../version";
import type { DiscoveryRepository } from "./repository";
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
    const r = await this.db.from("discovery_runs").update({ status }).eq("id", id);
    if (r.error) throw new Error(`setRunStatus: ${JSON.stringify(r.error)}`);
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
  async heartbeat(executionId: string, worker: string, completedQueries: number, metrics: Record<string, unknown>, leaseSeconds: number): Promise<boolean> {
    const r = await this.db.rpc("heartbeat_je_execution", {
      p_id: executionId, p_worker: worker, p_completed: completedQueries, p_metrics: metrics, p_lease_seconds: leaseSeconds,
    });
    if (r.error) throw new Error(`heartbeat: ${JSON.stringify(r.error)}`);
    return Boolean(r.data);
  }
  async requestCancel(executionId: string) {
    const r = await this.db.from("je_executions").update({ cancel_requested: true, status: "cancelling" }).eq("id", executionId);
    if (r.error) throw new Error(`requestCancel: ${JSON.stringify(r.error)}`);
  }
  async finishExecution(id: string, status: ExecutionStatus, patch: { metrics?: Record<string, unknown>; warnings?: unknown[]; error?: unknown | null }) {
    const update: Record<string, unknown> = { status, finished_at: new Date().toISOString() };
    if (patch.metrics) update.metrics = patch.metrics;
    if (patch.warnings) update.warnings = patch.warnings;
    if (patch.error !== undefined) update.error = patch.error;
    const r = await this.db.from("je_executions").update(update).eq("id", id);
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
}
