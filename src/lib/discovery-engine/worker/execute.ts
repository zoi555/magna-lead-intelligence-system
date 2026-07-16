// Processes ONE claimed Just Eat execution: plans queries, executes them (paced),
// writes an immutable observation per outlet (hash-deduplicated), upserts the normalised
// outlet + rating history + provenance, heartbeats for lease + cancellation, and writes
// the data-quality report. Resumable: it skips queries already counted as completed.

import type { DiscoveryRepository } from "../repository/repository";
import type { ExecutionRecord, RunRecord, ParsedOutlet } from "../types";
import type { SourceAdapter, AdapterConfig } from "../adapter";
import { JustEatAdapter } from "../just-eat/adapter";
import { contentHash } from "../hash";
import { PARSER_VERSION, ADAPTER_VERSION, SCHEMA_VERSION, NORMALISATION_VERSION } from "../version";
import { computeQualityReport } from "../quality/data-quality";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ExecuteOptions {
  adapter?: SourceAdapter;
  config: AdapterConfig;
  workerId: string;
  leaseSeconds?: number;
  onProgress?: (p: { completed: number; planned: number; outlets: number }) => void;
}

export interface ExecuteResult {
  status: ExecutionRecord["status"];
  completedQueries: number;
  plannedQueries: number;
  uniqueOutlets: number;
  totalObservations: number;
  duplicateObservations: number;
  parseWarnings: number;
  failedQueries: number;
  cancelled: boolean;
}

export async function executeJustEatRun(
  repo: DiscoveryRepository, run: RunRecord, execution: ExecutionRecord, opts: ExecuteOptions
): Promise<ExecuteResult> {
  const adapter = opts.adapter ?? new JustEatAdapter();
  const lease = opts.leaseSeconds ?? 60;
  const cfg = opts.config;

  const queries = adapter.planQueries(cfg);
  const planned = queries.length;
  // record the plan on the execution row
  await repo.setExecutionPlan(execution.id, planned);

  const outletsByJeId = new Map<string, ParsedOutlet>();
  let totalObservations = 0, duplicateObservations = 0, parseWarnings = 0, failedQueries = 0;
  let cancelled = false;

  // resume: skip queries already counted complete on a prior (crashed) attempt
  const startIndex = Math.min(execution.completed_queries, planned);

  for (let i = startIndex; i < queries.length; i++) {
    const q = queries[i];

    // cooperative cancellation via the heartbeat return value
    const cancel = await repo.heartbeat(execution.id, opts.workerId, i, { outlets: outletsByJeId.size, totalObservations }, lease);
    if (cancel) { cancelled = true; break; }

    const result = await adapter.executeQuery(q, cfg);
    if (!result.ok) {
      failedQueries++;
      // fail-safe: a blocked/failed outcode does not sink the run
      await pace(cfg, i, queries.length);
      continue;
    }

    for (const rec of result.parsed) {
      if (!rec.outlet.je_outlet_id) continue;
      parseWarnings += rec.warnings.length;

      const hash = contentHash(rec.raw);
      const dup = await repo.findObservationByHash(run.tenant_id, hash);
      const obs = await repo.insertRawObservation({
        tenant_id: run.tenant_id, execution_id: execution.id, run_id: run.id, source: "just_eat",
        response_type: result.responseType, source_record_id: rec.outlet.je_outlet_id,
        query_context: { outcode: q.outcode, index: q.index },
        http_status: result.httpStatus, response_headers: result.headers,
        raw_payload: rec.raw, content_hash: hash,
        parser_version: PARSER_VERSION, adapter_version: ADAPTER_VERSION, schema_version: SCHEMA_VERSION,
        parse_status: rec.warnings.length ? "partial" : "parsed", parse_warnings: rec.warnings, attempt: execution.attempts,
        duplicate_of: dup?.id ?? null,
      });
      totalObservations++;
      if (dup) duplicateObservations++;

      const outlet = await repo.upsertOutlet({ tenant_id: run.tenant_id, parsed: rec.outlet, latest_observation_id: obs.id });
      outletsByJeId.set(rec.outlet.je_outlet_id, rec.outlet);

      await repo.insertRatingHistory({
        tenant_id: run.tenant_id, outlet_id: outlet.id, je_outlet_id: rec.outlet.je_outlet_id, raw_observation_id: obs.id,
        score: rec.rating.score, max_scale: rec.rating.max_scale, review_count: rec.rating.review_count, source_label: rec.rating.source_label,
      });
      await repo.replaceProvenance(outlet.id, rec.provenance.map((p) => ({ ...p, tenant_id: run.tenant_id, outlet_id: outlet.id, raw_observation_id: obs.id })));
    }

    opts.onProgress?.({ completed: i + 1, planned, outlets: outletsByJeId.size });
    await repo.heartbeat(execution.id, opts.workerId, i + 1, { outlets: outletsByJeId.size, totalObservations }, lease);
    await pace(cfg, i, queries.length);
  }

  const completedQueries = cancelled ? execution.completed_queries : planned;
  const report = computeQualityReport({
    outlets: [...outletsByJeId.values()],
    totalObservations, duplicateObservations, parseWarnings,
    plannedQueries: planned, completedQueries, failedQueries,
  });
  await repo.saveQualityReport(run.tenant_id, execution.id, run.id, report);

  const status: ExecutionRecord["status"] = cancelled ? "cancelled"
    : (parseWarnings > 0 || failedQueries > 0) ? "completed_with_warnings" : "completed";
  await repo.finishExecution(execution.id, status, {
    metrics: {
      planned_queries: planned, completed_queries: completedQueries, unique_outlets: outletsByJeId.size,
      total_observations: totalObservations, duplicate_observations: duplicateObservations,
      parse_warnings: parseWarnings, failed_queries: failedQueries,
      normalisation_version: NORMALISATION_VERSION,
    },
    warnings: failedQueries ? [`${failedQueries} outcode query/queries failed (fail-safe, kept going)`] : [],
    error: null,
  });
  await repo.setRunStatus(run.id, status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "completed_with_warnings");

  return { status, completedQueries, plannedQueries: planned, uniqueOutlets: outletsByJeId.size, totalObservations, duplicateObservations, parseWarnings, failedQueries, cancelled };
}

async function pace(cfg: AdapterConfig, i: number, total: number) {
  if (i < total - 1 && cfg.requestDelayMs > 0) await sleep(cfg.requestDelayMs);
}
