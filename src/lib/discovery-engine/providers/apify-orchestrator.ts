// Idempotent, crash-reconcilable Apify execution orchestration.
//
// Guarantees:
//  - Exactly ONE paid actor run per (actor, input) in flight: an in-flight run is RESUMED, never
//    re-created (prevents duplicate charges on timeout/restart/re-invocation).
//  - The provider run ID is persisted the instant it is received (before polling), so a crash can
//    be reconciled by polling the stored run ID.
//  - Dataset items are retrieved from the EXACT dataset id returned by that run.
//  - A poll timeout does NOT start a second run — it throws a resumable error, leaving the run
//    recorded for later reconciliation.
//  - Actor failure/abort prevents dataset ingestion.

import { apifyRunRef, isSuccess, isTerminal, type ApifyClient, type ApifyRunObject } from "./apify-run";

export interface ProviderExecutionRow {
  id: string;
  actorRunId: string | null;
  datasetId: string | null;
  actorStatus: string | null;
}

export interface ProviderExecutionStore {
  /** Find an in-flight (non-terminal) provider execution for the same actor+input to RESUME. */
  findInFlight(actorId: string, inputFingerprint: string): Promise<ProviderExecutionRow | null>;
  /** Persist a new provider execution the moment a run id exists. Returns its row id. */
  insertRunning(row: {
    actorId: string; actorRunId: string; datasetId: string | null; buildId: string | null; buildTag: string | null;
    origin: string | null; inputFingerprint: string; maxRequestedResults: number; estimatedCostUsd: number;
    pricingModel: string | null; actorStatus: string; providerRunRef: string;
  }): Promise<{ id: string }>;
  /** Update provenance (status transitions, costs, counts, failure reason). */
  update(id: string, patch: Record<string, unknown>): Promise<void>;
}

export class ResumableTimeoutError extends Error {
  constructor(public actorRunId: string, public provenanceId: string) {
    super(`Apify run ${actorRunId} did not finish before the poll timeout — recorded and resumable (no second run started).`);
    this.name = "ResumableTimeoutError";
  }
}

export interface RunApifyArgs {
  client: ApifyClient;
  store: ProviderExecutionStore;
  actorId: string;
  input: Record<string, unknown>;
  inputFingerprint: string;
  maxRequestedResults: number;
  estimatedCostUsd: number;
  pricingModel?: string | null;
  timeoutMs?: number;
  pollIntervalMs?: number;
  allowResume?: boolean;                      // default true
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
}

export interface RunApifyResult {
  items: unknown[];
  run: ApifyRunObject;
  provenanceId: string;
  ingested: boolean;                          // true ONLY when the actor SUCCEEDED and items were read
  resumed: boolean;                           // true when an existing run was polled (no new run created)
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runApifyProvider(args: RunApifyArgs): Promise<RunApifyResult> {
  const { client, store, actorId, input, inputFingerprint } = args;
  const timeoutMs = args.timeoutMs ?? 180_000;
  const pollIntervalMs = args.pollIntervalMs ?? 3_000;
  const sleep = args.sleep ?? defaultSleep;
  const nowMs = args.nowMs ?? Date.now;

  // 1. Resume any in-flight run for the same actor+input rather than paying for a duplicate.
  let provenanceId: string;
  let runId: string;
  let resumed = false;
  const inFlight = args.allowResume === false ? null : await store.findInFlight(actorId, inputFingerprint);
  if (inFlight?.actorRunId) {
    provenanceId = inFlight.id; runId = inFlight.actorRunId; resumed = true;
  } else {
    // 2. Create exactly one run and persist its id IMMEDIATELY (before any polling).
    const created = await client.createRun(actorId, input);
    if (!created.runId) throw new Error("Apify create run returned no run id");
    const ins = await store.insertRunning({
      actorId, actorRunId: created.runId, datasetId: created.datasetId, buildId: created.buildId, buildTag: created.buildTag,
      origin: created.origin, inputFingerprint, maxRequestedResults: args.maxRequestedResults, estimatedCostUsd: args.estimatedCostUsd,
      pricingModel: args.pricingModel ?? created.pricingModel ?? null, actorStatus: created.status, providerRunRef: apifyRunRef(created.runId),
    });
    provenanceId = ins.id; runId = created.runId;
  }

  // 3. Poll the run by its stored id until terminal or timeout. Never creates another run.
  const start = nowMs();
  let run = await client.getRun(runId);
  while (!isTerminal(run.status)) {
    if (nowMs() - start > timeoutMs) {
      await store.update(provenanceId, { actor_status: run.status, failure_reason: "poll timeout — run left running; resumable via stored actor_run_id" });
      throw new ResumableTimeoutError(runId, provenanceId);
    }
    await sleep(pollIntervalMs);
    run = await client.getRun(runId);
  }

  // 4. Record terminal provenance (technical status + cost). Business status is set by the caller.
  await store.update(provenanceId, {
    actor_status: run.status, actor_status_message: run.statusMessage, dataset_id: run.datasetId,
    build_id: run.buildId, build_tag: run.buildTag, finished_at: run.finishedAt,
    actual_cost_usd: run.usageTotalUsd, charged_result_count: run.chargedResultCount,
  });

  if (!isSuccess(run.status)) {
    await store.update(provenanceId, { failure_reason: run.statusMessage ?? `actor ${run.status}` });
    return { items: [], run, provenanceId, ingested: false, resumed };   // actor failed → NO ingestion
  }

  // 5. Success → retrieve items from the EXACT dataset id this run produced.
  if (!run.datasetId) throw new Error("Apify run SUCCEEDED but returned no dataset id");
  const items = await client.getDatasetItems(run.datasetId);
  await store.update(provenanceId, { result_count: items.length });
  return { items, run, provenanceId, ingested: true, resumed };
}
