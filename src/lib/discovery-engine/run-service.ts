// Discovery run service — canonical persistence of a run and the queuing of its Just
// Eat execution. Uses the Geography Standard planner: geography selections are expanded to
// source-compatible query units (areas → districts) with full provenance. localStorage in
// the browser is recovery only; THIS writes the canonical rows via the repository.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostcodeReference } from "@zoi555/geospatial-map";
import type { DiscoveryRepository } from "./repository/repository";
import type { RunInput, RunRecord, ExecutionRecord } from "./types";
import { planTerritory, JUST_EAT_GEOGRAPHY_SUPPORT, type TerritoryPlan } from "./geography/planner";

export const DEFAULT_TENANT_SLUG = "magna";

export interface CreateRunParams {
  tenant_id: string;
  created_by?: string | null;
  name: string;
  reference?: string | null;
  objective?: string | null;
  territory_mode?: string | null;
  territory_input: string;
  exclusions?: string[];         // geography exclusions (codes to drop before execution)
  search_terms?: string[];
  target_filters?: Record<string, unknown>;
  requested_fields?: string[];
  source_config?: Record<string, unknown>;
  config_snapshot?: Record<string, unknown>;
}

export function buildRunInput(p: CreateRunParams, plan: TerritoryPlan): RunInput {
  return {
    tenant_id: p.tenant_id,
    created_by: p.created_by ?? null,
    name: p.name,
    reference: p.reference ?? null,
    objective: p.objective ?? null,
    territory_mode: p.territory_mode ?? null,
    territory_input: p.territory_input,
    derived_query_units: plan.queryUnits,
    search_terms: p.search_terms ?? [],
    target_filters: p.target_filters ?? {},
    requested_fields: p.requested_fields ?? [],
    source_config: { source: "just_eat", ...(p.source_config ?? {}) },
    config_snapshot: p.config_snapshot ?? {},
  };
}

/** Plan + save a run. Reference is injected (from the seeded table at runtime, or a fixture
 *  in tests) so the planner stays deterministic and testable. Returns the run + full plan
 *  (including unresolved selections to surface honestly in the UI). */
export async function saveRun(
  repo: DiscoveryRepository, p: CreateRunParams, ref: PostcodeReference
): Promise<{ run: RunRecord; plan: TerritoryPlan }> {
  const plan = planTerritory(p.territory_input, ref, JUST_EAT_GEOGRAPHY_SUPPORT, p.exclusions ?? []);
  const run = await repo.createRun(buildRunInput(p, plan));
  return { run, plan };
}

/** Save a run from a precomputed plan (e.g. the place-aware plan). */
export async function saveRunFromPlan(repo: DiscoveryRepository, p: CreateRunParams, plan: TerritoryPlan): Promise<{ run: RunRecord; plan: TerritoryPlan }> {
  const run = await repo.createRun(buildRunInput(p, plan));
  return { run, plan };
}

/** Persist geography provenance (objective 7): one discovery_selection per original
 *  selection + the query units actually planned. Server-side (service client). */
export async function persistGeographyProvenance(db: SupabaseClient, run: RunRecord, plan: TerritoryPlan, source = "just_eat"): Promise<void> {
  const selectionRows = plan.resolved.map((r) => ({
    tenant_id: run.tenant_id, run_id: run.id,
    original_kind: r.original.kind, original_value: r.original.value,
    resolved_kind: r.resolvedKind, resolved_code: r.resolvedCode ?? null,
    status: r.status, method: r.method, expansion_count: r.expansionCount,
    source: r.source ?? null, source_version: r.sourceVersion ?? null, reason: r.reason ?? null,
  }));
  if (selectionRows.length) {
    const ins = await db.from("discovery_selection").insert(selectionRows).select("id, resolved_code");
    if (ins.error) throw new Error(`persist selections: ${JSON.stringify(ins.error)}`);
  }
  const unitRows = plan.queryUnits.map((code) => ({
    tenant_id: run.tenant_id, run_id: run.id, code, level: "postcode_district", source,
  }));
  if (unitRows.length) {
    const ins = await db.from("query_unit").upsert(unitRows, { onConflict: "run_id,source,code" });
    if (ins.error) throw new Error(`persist query units: ${JSON.stringify(ins.error)}`);
  }
}

export async function queueJustEatExecution(repo: DiscoveryRepository, runId: string): Promise<ExecutionRecord> {
  const run = await repo.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const execution = await repo.createExecution(run.id, run.tenant_id, run.derived_query_units.length);
  await repo.setRunStatus(run.id, "queued");
  return execution;
}

export interface RunStatusView {
  run: RunRecord;
  executions: ExecutionRecord[];
  quality: Awaited<ReturnType<DiscoveryRepository["getQualityReport"]>> | null;
}

export async function getRunStatus(repo: DiscoveryRepository, runId: string): Promise<RunStatusView | null> {
  const run = await repo.getRun(runId);
  if (!run) return null;
  const executions = await repo.listExecutionsForRun(runId);
  const latest = executions[executions.length - 1];
  const quality = latest ? await repo.getQualityReport(latest.id) : null;
  return { run, executions, quality };
}
