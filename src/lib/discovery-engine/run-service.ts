// Discovery run service — canonical persistence of a run and the queuing of its Just
// Eat execution. Called by the API routes (server-side). localStorage in the browser is
// recovery only; THIS writes the canonical rows via the repository.

import type { DiscoveryRepository } from "./repository/repository";
import type { RunInput, RunRecord, ExecutionRecord } from "./types";
import { deriveQueryOutcodes } from "./config";

export const DEFAULT_TENANT_SLUG = "magna";

export interface CreateRunParams {
  tenant_id: string;
  created_by?: string | null;
  name: string;
  reference?: string | null;
  objective?: string | null;
  territory_mode?: string | null;
  territory_input: string;
  search_terms?: string[];
  target_filters?: Record<string, unknown>;
  requested_fields?: string[];
  source_config?: Record<string, unknown>;
  config_snapshot?: Record<string, unknown>;
}

export function buildRunInput(p: CreateRunParams): { input: RunInput; unexpandableAreas: string[] } {
  const { outcodes, unexpandableAreas } = deriveQueryOutcodes(p.territory_input);
  const input: RunInput = {
    tenant_id: p.tenant_id,
    created_by: p.created_by ?? null,
    name: p.name,
    reference: p.reference ?? null,
    objective: p.objective ?? null,
    territory_mode: p.territory_mode ?? null,
    territory_input: p.territory_input,
    derived_outcodes: outcodes,
    search_terms: p.search_terms ?? [],
    target_filters: p.target_filters ?? {},
    requested_fields: p.requested_fields ?? [],
    source_config: { source: "just_eat", ...(p.source_config ?? {}) },
    config_snapshot: p.config_snapshot ?? {},
  };
  return { input, unexpandableAreas };
}

export async function saveRun(repo: DiscoveryRepository, p: CreateRunParams): Promise<{ run: RunRecord; unexpandableAreas: string[] }> {
  const { input, unexpandableAreas } = buildRunInput(p);
  const run = await repo.createRun(input);
  return { run, unexpandableAreas };
}

/** Queue a Just Eat execution for a saved run. The worker will claim it. */
export async function queueJustEatExecution(repo: DiscoveryRepository, runId: string): Promise<ExecutionRecord> {
  const run = await repo.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const execution = await repo.createExecution(run.id, run.tenant_id, run.derived_outcodes.length);
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
