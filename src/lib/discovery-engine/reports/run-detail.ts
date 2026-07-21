// Real, database-backed single-run detail — no placeholder data. Server-only.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";

export interface ExecutionSummary {
  id: string;
  source: string;
  status: string;
  plannedQueries: number;
  completedQueries: number;
  attempts: number;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: unknown | null;
  warnings: unknown[];
}

export interface ProviderExecutionSummary {
  provider: string;
  actorId: string | null;
  actorStatus: string | null;
  businessValidationStatus: string | null;
  resultCount: number | null;
  actualCostUsd: number | null;
  failureReason: string | null;
  providerRunRef: string | null;
}

export interface RunDetail {
  configured: boolean;
  found: boolean;
  run: {
    id: string;
    name: string;
    status: string;
    territoryMode: string | null;
    territoryInput: string | null;
    derivedOutcodes: string[];
    createdAt: string;
    updatedAt: string;
  } | null;
  executions: ExecutionSummary[];
  providerExecutions: ProviderExecutionSummary[];
  qualityReport: Record<string, unknown> | null;
  counts: {
    rawObservations: number;
    canonicalObservations: number;
    duplicateObservations: number;
    validGeography: number;
    outOfScopeGeography: number;
    consolidatedCandidates: number;
  };
}

export async function fetchRunDetail(runId: string): Promise<RunDetail> {
  const empty: RunDetail = {
    configured: false, found: false, run: null, executions: [], providerExecutions: [],
    qualityReport: null,
    counts: { rawObservations: 0, canonicalObservations: 0, duplicateObservations: 0, validGeography: 0, outOfScopeGeography: 0, consolidatedCandidates: 0 },
  };
  if (!hasServiceCredentials()) return empty;

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const runRes = await db.from("discovery_runs").select("*").eq("tenant_id", tenantId).eq("id", runId).maybeSingle();
  if (runRes.error) throw new Error(`fetchRunDetail.run: ${JSON.stringify(runRes.error)}`);
  if (!runRes.data) return { ...empty, configured: true };
  const r = runRes.data as Record<string, unknown>;

  const [execRes, provExecRes, obsRes, dupRes, geoValidRes, candRes] = await Promise.all([
    db.from("je_executions").select("id,source,status,planned_queries,completed_queries,attempts,queued_at,started_at,finished_at,error,warnings").eq("tenant_id", tenantId).eq("run_id", runId).order("created_at", { ascending: false }),
    db.from("provider_executions").select("provider,actor_id,actor_status,business_validation_status,result_count,actual_cost_usd,failure_reason,provider_run_ref").eq("tenant_id", tenantId).eq("run_id", runId),
    db.from("je_raw_observations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("run_id", runId),
    db.from("je_raw_observations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("run_id", runId).not("duplicate_of", "is", null),
    db.from("provider_geography_validations").select("status").eq("tenant_id", tenantId).eq("run_id", runId),
    db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("run_id", runId),
  ]);

  const executions = (execRes.data ?? []) as Record<string, unknown>[];
  let qualityReport: Record<string, unknown> | null = null;
  if (executions[0]) {
    const qRes = await db.from("je_execution_quality").select("report").eq("tenant_id", tenantId).eq("execution_id", executions[0].id).order("computed_at", { ascending: false }).limit(1).maybeSingle();
    qualityReport = (qRes.data?.report as Record<string, unknown>) ?? null;
  }

  const geoValidations = (geoValidRes.data ?? []) as { status: string }[];
  const validGeography = geoValidations.filter((v) => v.status === "valid_geography").length;
  const outOfScopeGeography = geoValidations.filter((v) => v.status !== "valid_geography").length;

  const raw = obsRes.count ?? 0;
  const duplicates = dupRes.count ?? 0;

  return {
    configured: true,
    found: true,
    run: {
      id: String(r.id),
      name: String(r.name ?? ""),
      status: String(r.status ?? ""),
      territoryMode: (r.territory_mode as string) ?? null,
      territoryInput: (r.territory_input as string) ?? null,
      derivedOutcodes: Array.isArray(r.derived_outcodes) ? (r.derived_outcodes as string[]) : [],
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
    },
    executions: executions.map((e) => ({
      id: String(e.id), source: String(e.source ?? ""), status: String(e.status ?? ""),
      plannedQueries: Number(e.planned_queries ?? 0), completedQueries: Number(e.completed_queries ?? 0),
      attempts: Number(e.attempts ?? 0),
      queuedAt: (e.queued_at as string) ?? null, startedAt: (e.started_at as string) ?? null, finishedAt: (e.finished_at as string) ?? null,
      error: e.error ?? null, warnings: Array.isArray(e.warnings) ? (e.warnings as unknown[]) : [],
    })),
    providerExecutions: ((provExecRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
      provider: String(p.provider ?? ""), actorId: (p.actor_id as string) ?? null,
      actorStatus: (p.actor_status as string) ?? null, businessValidationStatus: (p.business_validation_status as string) ?? null,
      resultCount: (p.result_count as number) ?? null, actualCostUsd: (p.actual_cost_usd as number) ?? null,
      failureReason: (p.failure_reason as string) ?? null, providerRunRef: (p.provider_run_ref as string) ?? null,
    })),
    qualityReport,
    counts: {
      rawObservations: raw,
      canonicalObservations: raw - duplicates,
      duplicateObservations: duplicates,
      validGeography,
      outOfScopeGeography,
      consolidatedCandidates: candRes.count ?? 0,
    },
  };
}

/** Recent runs — for the run-detail landing/index list. */
export async function fetchRecentRuns(limit = 30): Promise<{ configured: boolean; runs: { id: string; name: string; status: string; territoryInput: string | null; createdAt: string }[] }> {
  if (!hasServiceCredentials()) return { configured: false, runs: [] };
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();
  const res = await db.from("discovery_runs").select("id,name,status,territory_input,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
  if (res.error) throw new Error(`fetchRecentRuns: ${JSON.stringify(res.error)}`);
  return {
    configured: true,
    runs: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), name: String(r.name ?? ""), status: String(r.status ?? ""),
      territoryInput: (r.territory_input as string) ?? null, createdAt: String(r.created_at ?? ""),
    })),
  };
}
