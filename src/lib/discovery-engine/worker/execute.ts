// Processes ONE claimed Just Eat execution: plans queries, executes them (paced),
// writes an immutable observation per outlet (hash-deduplicated), upserts the normalised
// outlet + rating history + provenance, heartbeats (INCLUDING during the long inner
// outlet loop so the lease never expires mid-query), and writes the data-quality report.
//
// Progress: `completed_queries` counts SUCCESSFUL queries and is written authoritatively
// at finish (not left to heartbeats), so a completed run always shows the correct N/N.
// Failed queries are counted separately (metrics.failed_queries), never as completed.
// Resume skips already-attempted queries, so re-claims never double-count. If the lease
// is lost mid-run (another worker re-claimed), this worker ABORTS without finishing.

import type { DiscoveryRepository } from "../repository/repository";
import type { ExecutionRecord, RunRecord, ParsedOutlet } from "../types";
import type { SourceAdapter, AdapterConfig } from "../adapter";
import type { SourceOutlet } from "../consolidation/types";
import { JustEatAdapter } from "../just-eat/adapter";
import { extractResponseMeta } from "../just-eat/parse";
import { contentHash } from "../hash";
import { PARSER_VERSION, ADAPTER_VERSION, SCHEMA_VERSION, NORMALISATION_VERSION } from "../version";
import { computeQualityReport } from "../quality/data-quality";
import { partitionByGeography } from "../geography/provider-geography-gate";

/** Just Eat's own parsed shape -> the provider-neutral SourceOutlet the geography gate
 *  expects. Only postcode/latitude/longitude actually drive classification (JE has no
 *  provider-country field to read) — the rest are filled honestly (null/empty), never
 *  fabricated, since this object is never persisted itself, only fed through the gate. */
function parsedOutletToSourceOutlet(o: ParsedOutlet, observedAt: string): SourceOutlet {
  return {
    source: "just_eat", source_outlet_id: o.je_outlet_id, source_url: null,
    name: o.trading_name, brand: o.brand_name, address: o.address_first_line, postcode: o.postcode,
    latitude: o.latitude, longitude: o.longitude, phone: o.telephone_e164,
    rating: o.rating_average, review_count: o.rating_count, cuisines: o.cuisines,
    is_delivery: o.open_for_delivery, is_collection: o.open_for_collection,
    delivery_cost: null, minimum_order: null, eta_minutes: null, is_sponsored: null,
    halal_flag: null, logo_url: null, observed_at: observedAt,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HEARTBEAT_EVERY = 25;   // heartbeat every N outlets within a query (lease keep-alive)

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
  abortedNotOwned?: boolean;   // lease lost mid-run; another worker owns it now
}

export async function executeJustEatRun(
  repo: DiscoveryRepository, run: RunRecord, execution: ExecutionRecord, opts: ExecuteOptions
): Promise<ExecuteResult> {
  const adapter = opts.adapter ?? new JustEatAdapter();
  const lease = opts.leaseSeconds ?? 60;
  const cfg = opts.config;

  const queries = adapter.planQueries(cfg);
  const planned = queries.length;
  await repo.setExecutionPlan(execution.id, planned);

  const outletsByJeId = new Map<string, ParsedOutlet>();
  const latestObservationIdByJeId = new Map<string, string>();
  let totalObservations = 0, duplicateObservations = 0, parseWarnings = 0;
  // continue counters from any prior attempt (resume), so nothing is double-counted
  let succeeded = execution.completed_queries || 0;
  let failed = Number((execution.metrics as Record<string, unknown> | undefined)?.failed_queries ?? 0);
  let cancelled = false;
  let lostOwnership = false;
  let responseMeta: Record<string, unknown> = {};   // response-level metadata (RestaurantSets/CuisineSets/Dishes/…)

  const metricsSnapshot = () => ({
    unique_outlets: outletsByJeId.size, total_observations: totalObservations,
    duplicate_observations: duplicateObservations, parse_warnings: parseWarnings,
    failed_queries: failed, planned_queries: planned, completed_queries: succeeded,
    canonical_observations: totalObservations - duplicateObservations,   // operational count excludes duplicates
    response_meta: responseMeta,
    normalisation_version: NORMALISATION_VERSION,
  });
  // heartbeat helper: returns false if the worker should stop (lost lease or cancelled)
  const beat = async (): Promise<boolean> => {
    const hb = await repo.heartbeat(execution.id, opts.workerId, succeeded, metricsSnapshot(), lease);
    if (!hb.owned) { lostOwnership = true; return false; }
    if (hb.cancelRequested) { cancelled = true; return false; }
    return true;
  };

  // resume: skip queries already ATTEMPTED (succeeded + failed) on a prior attempt
  const startIndex = Math.min(succeeded + failed, planned);

  for (let i = startIndex; i < queries.length; i++) {
    if (!(await beat())) break;                     // lease/cancel check before each query
    const q = queries[i];

    const result = await adapter.executeQuery(q, cfg);
    if (!result.ok) {
      failed++;                                      // fail-safe: not fatal, not "completed"
      await repo.heartbeat(execution.id, opts.workerId, succeeded, metricsSnapshot(), lease);
      await pace(cfg, i, queries.length);
      continue;
    }

    responseMeta = { ...responseMeta, ...extractResponseMeta(result.raw) };   // capture response-level fields
    let n = 0;
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
      latestObservationIdByJeId.set(rec.outlet.je_outlet_id, obs.id);

      await repo.insertRatingHistory({
        tenant_id: run.tenant_id, outlet_id: outlet.id, je_outlet_id: rec.outlet.je_outlet_id, raw_observation_id: obs.id,
        score: rec.rating.score, max_scale: rec.rating.max_scale, review_count: rec.rating.review_count, source_label: rec.rating.source_label,
      });
      await repo.replaceProvenance(outlet.id, rec.provenance.map((p) => ({ ...p, tenant_id: run.tenant_id, outlet_id: outlet.id, raw_observation_id: obs.id })));

      // keep the lease alive during a long single-query outlet loop
      if (++n % HEARTBEAT_EVERY === 0 && !(await beat())) break;
    }
    if (lostOwnership || cancelled) break;           // stop before counting this query complete

    succeeded++;                                     // exactly one increment per successful query
    opts.onProgress?.({ completed: succeeded, planned, outlets: outletsByJeId.size });
    await repo.heartbeat(execution.id, opts.workerId, succeeded, metricsSnapshot(), lease);
    await pace(cfg, i, queries.length);
  }

  // Lost the lease → another worker owns this execution. Do NOT finish or overwrite it.
  if (lostOwnership) {
    return { status: execution.status, completedQueries: succeeded, plannedQueries: planned, uniqueOutlets: outletsByJeId.size, totalObservations, duplicateObservations, parseWarnings, failedQueries: failed, cancelled: false, abortedNotOwned: true };
  }

  // Geography validation gate — the same provider-neutral gate already used by the Uber
  // pilot scripts, now wired into a real execution path for the first time (never
  // backfilled onto historical runs — see docs/09_DECISIONS.md / docs/16_METRIC_DEFINITIONS.md).
  // Classifies every captured outlet against the run's own requested territory so
  // "physically in target" vs "delivery-area-only" vs "rejected" become real, not "Not evaluated."
  if (outletsByJeId.size > 0) {
    const observedAt = new Date().toISOString();
    const sourceOutlets = [...outletsByJeId.values()].map((o) => parsedOutletToSourceOutlet(o, observedAt));
    const partition = partitionByGeography(sourceOutlets, {
      requestedCountry: "GB",
      geographySelection: run.territory_input ?? null,
      resolvedQueryUnits: run.derived_query_units ?? [],
    });
    await repo.persistGeographyValidations({
      tenantId: run.tenant_id, runId: run.id, executionId: execution.id, source: "just_eat",
      ctx: { requestedCountry: "GB", geographySelection: run.territory_input ?? null, resolvedQueryUnits: run.derived_query_units ?? [] },
      verdicts: partition.verdicts,
      observationIdBySourceId: latestObservationIdByJeId,
    });
  }

  const completedQueries = succeeded;
  const report = computeQualityReport({
    outlets: [...outletsByJeId.values()],
    totalObservations, duplicateObservations, parseWarnings,
    plannedQueries: planned, completedQueries, failedQueries: failed,
  });
  await repo.saveQualityReport(run.tenant_id, execution.id, run.id, report);

  const status: ExecutionRecord["status"] = cancelled ? "cancelled"
    : (parseWarnings > 0 || failed > 0) ? "completed_with_warnings" : "completed";
  await repo.finishExecution(execution.id, status, {
    completedQueries, plannedQueries: planned, claimedBy: opts.workerId,   // authoritative + ownership-guarded
    metrics: metricsSnapshot(),
    warnings: failed ? [`${failed} outcode query/queries failed (fail-safe, kept going)`] : [],
    error: null,
  });
  await repo.setRunStatus(run.id, status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "completed_with_warnings");

  return { status, completedQueries, plannedQueries: planned, uniqueOutlets: outletsByJeId.size, totalObservations, duplicateObservations, parseWarnings, failedQueries: failed, cancelled };
}

async function pace(cfg: AdapterConfig, i: number, total: number) {
  if (i < total - 1 && cfg.requestDelayMs > 0) await sleep(cfg.requestDelayMs);
}
