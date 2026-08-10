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
    reference: string | null;
    status: string;
    territoryMode: string | null;
    territoryInput: string | null;
    derivedOutcodes: string[];
    sourceConfig: Record<string, unknown> | null;
    configSnapshot: unknown;
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
  /** True only when the geography-validation gate actually ran for this run (i.e. at
   *  least one provider_geography_validations row exists). When false, validGeography/
   *  outOfScopeGeography are both meaningless zeros — "never checked," not "checked, zero
   *  valid." Callers must show "Not evaluated" rather than "0" when this is false. */
  geographyValidationRan: boolean;
}

export async function fetchRunDetail(runId: string): Promise<RunDetail> {
  const empty: RunDetail = {
    configured: false, found: false, run: null, executions: [], providerExecutions: [],
    qualityReport: null,
    counts: { rawObservations: 0, canonicalObservations: 0, duplicateObservations: 0, validGeography: 0, outOfScopeGeography: 0, consolidatedCandidates: 0 },
    geographyValidationRan: false,
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
    // Operational count: only geography-valid candidates. consolidated_candidates.geography_status
    // is the authoritative gate — never assume every persisted candidate is operational (a
    // production run has shown that stamp can be wrong; see docs/10_BUGS_AND_FIXES.md).
    db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("run_id", runId).eq("geography_status", "valid_geography"),
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
      reference: (r.reference as string) ?? null,
      status: String(r.status ?? ""),
      territoryMode: (r.territory_mode as string) ?? null,
      territoryInput: (r.territory_input as string) ?? null,
      derivedOutcodes: Array.isArray(r.derived_query_units) ? (r.derived_query_units as string[]) : [],
      sourceConfig: (r.source_config as Record<string, unknown>) ?? null,
      configSnapshot: r.config_snapshot ?? null,
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
    geographyValidationRan: geoValidations.length > 0,
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

export interface MainRunOverviewRow {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  territoryInput: string | null;
  sourceMode: string | null;
  ownerLabel: string;
  latestExecutionStatus: string | null;
  plannedQueries: number | null;
  completedQueries: number | null;
  candidateCount: number | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Main Runs (/pipeline-runs) overview — reuses the same service client + tenant resolution
 *  as fetchRecentRuns/fetchRunDetail, extended with the columns the P4 control decision
 *  requires the Main Runs screen to show (owner, source mode, progress, candidate count,
 *  cost). Never fabricates a metric: absent data renders as null through to the UI, which
 *  must show it honestly rather than as a zero. */
export async function fetchMainRunsOverview(limit = 50): Promise<{ configured: boolean; runs: MainRunOverviewRow[] }> {
  if (!hasServiceCredentials()) return { configured: false, runs: [] };
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const runsRes = await db.from("discovery_runs")
    .select("id,name,reference,status,territory_input,source_config,created_by,created_at,updated_at")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
  if (runsRes.error) throw new Error(`fetchMainRunsOverview.runs: ${JSON.stringify(runsRes.error)}`);
  const rows = (runsRes.data ?? []) as Record<string, unknown>[];
  if (!rows.length) return { configured: true, runs: [] };
  const ids = rows.map((r) => String(r.id));

  const [execRes, candRes, provRes] = await Promise.all([
    db.from("je_executions").select("run_id,status,planned_queries,completed_queries,created_at").eq("tenant_id", tenantId).in("run_id", ids).order("created_at", { ascending: false }),
    db.from("consolidated_candidates").select("run_id").eq("tenant_id", tenantId).in("run_id", ids).eq("geography_status", "valid_geography"),
    db.from("provider_executions").select("run_id,estimated_cost_usd,actual_cost_usd").eq("tenant_id", tenantId).in("run_id", ids),
  ]);

  const latestExecByRun = new Map<string, { status: string; planned: number; completed: number }>();
  for (const e of (execRes.data ?? []) as Record<string, unknown>[]) {
    const rid = String(e.run_id);
    if (!latestExecByRun.has(rid)) latestExecByRun.set(rid, { status: String(e.status ?? ""), planned: Number(e.planned_queries ?? 0), completed: Number(e.completed_queries ?? 0) });
  }
  const candCountByRun = new Map<string, number>();
  for (const c of (candRes.data ?? []) as Record<string, unknown>[]) {
    const rid = String(c.run_id);
    candCountByRun.set(rid, (candCountByRun.get(rid) ?? 0) + 1);
  }
  const costByRun = new Map<string, { est: number | null; act: number | null }>();
  for (const pr of (provRes.data ?? []) as Record<string, unknown>[]) {
    const rid = String(pr.run_id);
    const prev = costByRun.get(rid) ?? { est: null, act: null };
    const est = pr.estimated_cost_usd != null ? (prev.est ?? 0) + Number(pr.estimated_cost_usd) : prev.est;
    const act = pr.actual_cost_usd != null ? (prev.act ?? 0) + Number(pr.actual_cost_usd) : prev.act;
    costByRun.set(rid, { est, act });
  }

  // Owner email — best-effort only; falls back to a truncated user id, never fabricated.
  const emailById = new Map<string, string>();
  try {
    const usersRes = await db.auth.admin.listUsers({ perPage: 200 });
    for (const u of usersRes.data?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  } catch { /* best-effort only — owner column still renders via the id fallback below */ }

  return {
    configured: true,
    runs: rows.map((r) => {
      const id = String(r.id);
      const exec = latestExecByRun.get(id);
      const cost = costByRun.get(id);
      const sc = (r.source_config as Record<string, unknown>) ?? {};
      const createdBy = r.created_by ? String(r.created_by) : null;
      return {
        id, name: String(r.name ?? ""), reference: (r.reference as string) ?? null, status: String(r.status ?? ""),
        territoryInput: (r.territory_input as string) ?? null,
        sourceMode: typeof sc.mode === "string" ? sc.mode : (typeof sc.source === "string" ? sc.source : null),
        ownerLabel: createdBy ? (emailById.get(createdBy) ?? `${createdBy.slice(0, 8)}…`) : "—",
        latestExecutionStatus: exec?.status ?? null, plannedQueries: exec?.planned ?? null, completedQueries: exec?.completed ?? null,
        candidateCount: candCountByRun.get(id) ?? null,
        estimatedCostUsd: cost?.est ?? null, actualCostUsd: cost?.act ?? null,
        createdAt: String(r.created_at ?? ""), updatedAt: String(r.updated_at ?? ""),
      };
    }),
  };
}
