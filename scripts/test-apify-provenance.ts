// Apify execution-provenance + idempotency tests (npm run test:apify-provenance).
// Pure: fake ApifyClient + in-memory provenance store + injected fetch. No network, no DB, no spend.

import {
  runApifyProvider, ResumableTimeoutError,
  type ProviderExecutionStore, type ProviderExecutionRow,
} from "../src/lib/discovery-engine/providers/apify-orchestrator";
import { createHttpApifyClient, mapApifyRun, apifyRunRef, type ApifyClient, type ApifyRunObject } from "../src/lib/discovery-engine/providers/apify-run";
import { contentHash } from "../src/lib/discovery-engine/hash";
import { partitionByGeography } from "../src/lib/discovery-engine/geography/provider-geography-gate";
import { parseUberEatsSearch } from "../src/lib/discovery-engine/uber-eats/parse";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

// ---- in-memory provenance store ----
class MemStore implements ProviderExecutionStore {
  rows: Record<string, any>[] = [];
  private _inflight: ProviderExecutionRow | null = null;
  get inflight() { return this._inflight; }
  set inflight(v: ProviderExecutionRow | null) {   // seed the persisted row so update() can find it
    this._inflight = v;
    if (v && !this.rows.some((r) => r.id === v.id)) this.rows.push({ id: v.id, actor_run_id: v.actorRunId, dataset_id: v.datasetId, actor_status: v.actorStatus });
  }
  async findInFlight() { return this._inflight; }
  async insertRunning(row: any) {   // mirror the real store's camelCase → snake_case mapping
    const id = `pe-${this.rows.length + 1}`;
    this.rows.push({ id, actor_id: row.actorId, actor_run_id: row.actorRunId, dataset_id: row.datasetId, build_id: row.buildId,
      build_tag: row.buildTag, origin: row.origin, input_fingerprint: row.inputFingerprint, max_requested_results: row.maxRequestedResults,
      estimated_cost_usd: row.estimatedCostUsd, pricing_model: row.pricingModel, actor_status: row.actorStatus, provider_run_ref: row.providerRunRef });
    return { id };
  }
  async update(id: string, patch: Record<string, unknown>) { Object.assign(this.rows.find((r) => r.id === id)!, patch); }
}

// ---- configurable fake Apify client ----
function makeFake(opts: { statusSequence?: string[]; run?: Partial<ApifyRunObject>; items?: unknown[] } = {}) {
  const seq = opts.statusSequence ?? ["SUCCEEDED"];
  let i = 0;
  const base: ApifyRunObject = {
    runId: "run-123", actorId: "act-1", datasetId: "ds-777", buildId: "bld-1", buildTag: "0.1.2",
    status: seq[0], statusMessage: null, startedAt: "T0", finishedAt: null, origin: "API",
    usageTotalUsd: null, chargedResultCount: null, pricingModel: "PAY_PER_RESULT", ...opts.run,
  };
  const state = { createCalls: 0, getCalls: 0, datasetCalls: 0, requestedDatasetId: null as string | null };
  const client: ApifyClient = {
    async createRun() { state.createCalls++; return { ...base, status: seq[0], finishedAt: null }; },
    async getRun(runId) { const s = seq[Math.min(i, seq.length - 1)]; i++; state.getCalls++; const done = /SUCCEEDED|FAILED|ABORTED|TIMED/.test(s); return { ...base, runId, status: s, finishedAt: done ? "T1" : null }; },
    async getDatasetItems(dsId) { state.datasetCalls++; state.requestedDatasetId = dsId; return opts.items ?? []; },
  };
  return { client, state, base };
}
const noSleep = async () => {};

async function main() {
  console.log("Apify execution provenance + idempotency:");

  // (1) run id + dataset id persisted.
  {
    const store = new MemStore(); const { client } = makeFake({ items: [{ uuid: "x" }] });
    const r = await runApifyProvider({ client, store, actorId: "act-1", input: { a: 1 }, inputFingerprint: "fp1", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    assert(store.rows[0].actor_run_id === "run-123" && store.rows[0].dataset_id === "ds-777", "provider run id + dataset id persisted");
    assert(r.ingested === true && r.resumed === false, "successful run ingests, not resumed");
  }

  // (2) dataset retrieval uses the dataset id returned by that exact run.
  {
    const store = new MemStore(); const f = makeFake({ run: { datasetId: "ds-exact-999" }, items: [{ uuid: "y" }] });
    await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp2", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    assert(f.state.requestedDatasetId === "ds-exact-999", "dataset retrieval uses the exact dataset id from this run");
  }

  // (3) token in Authorization header only — never in URL/logs; ref has no token.
  {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init: any) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} });
      return { ok: true, json: async () => ({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "SUCCEEDED" } }) } as any;
    }) as unknown as typeof fetch;
    const http = createHttpApifyClient("SECRET_TOKEN_123", { fetchImpl: fakeFetch });
    await http.getRun("run-1");
    assert(calls.every((c) => !c.url.includes("SECRET_TOKEN_123") && !c.url.toLowerCase().includes("token=")), "token NEVER appears in the request URL");
    assert(calls.every((c) => (c.headers as any).Authorization === "Bearer SECRET_TOKEN_123"), "token sent as Authorization: Bearer header");
    assert(!apifyRunRef("run-1").includes("SECRET_TOKEN_123") && !apifyRunRef("run-1").includes("token"), "console run ref contains no credentials");
  }

  // (4)+(5) resume: an in-flight run is polled, NOT re-created (timeout/restart safe).
  {
    const store = new MemStore(); store.inflight = { id: "pe-existing", actorRunId: "run-RESUME", datasetId: "ds-r", actorStatus: "RUNNING" };
    const f = makeFake({ statusSequence: ["SUCCEEDED"], items: [{ uuid: "z" }] });
    const r = await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp3", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    assert(f.state.createCalls === 0 && r.resumed === true, "in-flight run is RESUMED — no new actor run created");
    assert(r.run.runId === "run-RESUME", "resume polls the STORED provider run id");
  }

  // (5b) poll timeout → ResumableTimeoutError, run recorded, NO second run.
  {
    const store = new MemStore(); const f = makeFake({ statusSequence: ["RUNNING"] });
    let t = 0; const nowMs = () => (t += 1000);   // each call advances 1s
    let threw: unknown = null;
    try {
      await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp4", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep, nowMs, timeoutMs: 2_000, pollIntervalMs: 1 });
    } catch (e) { threw = e; }
    assert(threw instanceof ResumableTimeoutError && (threw as ResumableTimeoutError).actorRunId === "run-123", "poll timeout → ResumableTimeoutError with the run id");
    assert(f.state.createCalls === 1 && f.state.datasetCalls === 0, "timeout does NOT start a second run and does NOT ingest");
    assert(String(store.rows[0].failure_reason).includes("timeout"), "timeout recorded on the provenance row (resumable)");
  }

  // (6) re-reading the same dataset does not create duplicate canonical observations (content-hash).
  {
    const items = [{ uuid: "a", title: "A" }, { uuid: "b", title: "B" }];
    const canon = new Map<string, number>();
    const ingest = () => { for (const it of items) { const h = contentHash(it); canon.set(h, (canon.get(h) ?? 0) + 1); } };
    ingest(); const afterFirst = canon.size; ingest();
    assert(afterFirst === 2 && canon.size === 2, "identical dataset re-read yields the SAME canonical hashes (dedup, no duplicates)");
    assert([...canon.values()].every((v) => v === 2), "each record seen twice ⇒ second pass are duplicates, not new canonicals");
  }

  // (7) actor technical success is SEPARATE from geography business-validation status.
  {
    const store = new MemStore(); const usItems = [{ uuid: "us1", title: "US Store", address: { country: "US", postalCode: "94103" } }];
    const f = makeFake({ items: usItems });
    const r = await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp5", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    const outlets = parseUberEatsSearch({ stores: usItems }, "T");
    const part = partitionByGeography(outlets, { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] });
    await store.update(r.provenanceId, { business_validation_status: part.runStatus.status });
    assert(store.rows[0].actor_status === "SUCCEEDED", "actor technical status = SUCCEEDED");
    assert(store.rows[0].business_validation_status === "provider_succeeded_validation_failed", "geography business status = provider_succeeded_validation_failed (kept separate)");
  }

  // (8) actual charge/result metadata retained when supplied.
  {
    const store = new MemStore();
    const f = makeFake({ run: { usageTotalUsd: 0.018, chargedResultCount: 9 }, items: [{ uuid: "q" }] });
    await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp6", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    assert(store.rows[0].actual_cost_usd === 0.018 && store.rows[0].charged_result_count === 9 && store.rows[0].result_count === 1, "actual cost + charged count + result count retained");
  }

  // (9) missing optional provider metadata is NOT fabricated.
  {
    const run = mapApifyRun({ id: "run-9", defaultDatasetId: "ds-9", status: "SUCCEEDED" });  // no build/usage/message
    assert(run.buildTag === null && run.usageTotalUsd === null && run.statusMessage === null && run.chargedResultCount === null, "missing metadata → null (never fabricated)");
    assert(run.runId === "run-9" && run.datasetId === "ds-9", "present metadata mapped");
  }

  // (10) actor failure prevents dataset ingestion + further paid continuation.
  {
    const store = new MemStore(); const f = makeFake({ statusSequence: ["FAILED"], run: { statusMessage: "actor error" } });
    const r = await runApifyProvider({ client: f.client, store, actorId: "a", input: {}, inputFingerprint: "fp7", maxRequestedResults: 10, estimatedCostUsd: 0.02, sleep: noSleep });
    assert(r.ingested === false && r.items.length === 0, "actor failure → NOT ingested, no items");
    assert(f.state.datasetCalls === 0, "actor failure → dataset is NEVER retrieved");
    assert(String(store.rows[0].failure_reason).length > 0 && store.rows[0].actor_status === "FAILED", "failure reason + actor status recorded (HALT before further paid source)");
  }

  console.log(fails === 0 ? "\nAll Apify provenance assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
