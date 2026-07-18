// Replacement-provider (borderline/uber-eats-scraper-ppr) tests (npm run test:borderline-provider).
// Pure: fakes + sanitised fixture. No network, no DB, no spend. Proves the 12 required behaviours.

import { readFileSync } from "node:fs";
import path from "node:path";
import { runApifyProvider, type ProviderExecutionStore, type ProviderExecutionRow } from "../src/lib/discovery-engine/providers/apify-orchestrator";
import type { ApifyClient, ApifyRunObject } from "../src/lib/discovery-engine/providers/apify-run";
import { buildBorderlineInput, BORDERLINE_MAX_ROWS_CAP } from "../src/lib/discovery-engine/providers/borderline-input";
import { PROVIDER_REGISTRY, getProvider, selectDiscoveryProviders, ensurePayPerResult, assertPayPerResult, type ProviderCapability } from "../src/lib/discovery-engine/providers/provider-registry";
import { parseBorderlineSearch } from "../src/lib/discovery-engine/uber-eats/parse-borderline";
import { partitionByGeography, deriveRunGeographyStatus } from "../src/lib/discovery-engine/geography/provider-geography-gate";
import { classifyLocationFidelity } from "../src/lib/discovery-engine/geography/location-fidelity";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));
const AT = "2026-07-18T12:00:00Z";
const GEO = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };
const ADDRESS = "Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom";

class MemStore implements ProviderExecutionStore {
  rows: Record<string, any>[] = [];
  private _in: ProviderExecutionRow | null = null;
  get inflight() { return this._in; }
  set inflight(v: ProviderExecutionRow | null) { this._in = v; if (v && !this.rows.some((r) => r.id === v.id)) this.rows.push({ id: v.id, actor_run_id: v.actorRunId, dataset_id: v.datasetId, actor_status: v.actorStatus }); }
  async findInFlight() { return this._in; }
  async insertRunning(row: any) { const id = `pe-${this.rows.length + 1}`; this.rows.push({ id, actor_id: row.actorId, actor_run_id: row.actorRunId, dataset_id: row.datasetId }); return { id }; }
  async update(id: string, patch: Record<string, unknown>) { Object.assign(this.rows.find((r) => r.id === id)!, patch); }
}
function makeFake(opts: { statusSequence?: string[]; run?: Partial<ApifyRunObject>; items?: unknown[] } = {}) {
  const seq = opts.statusSequence ?? ["SUCCEEDED"]; let i = 0;
  const base: ApifyRunObject = { runId: "run-BL", actorId: "act-bl", datasetId: "ds-BL", buildId: "b1", buildTag: "0.1.0", status: seq[0], statusMessage: null, startedAt: "T0", finishedAt: null, origin: "API", usageTotalUsd: 0.05, chargedResultCount: 10, pricingModel: "PAY_PER_RESULT", ...opts.run };
  const state = { createCalls: 0, getCalls: 0, datasetCalls: 0 };
  const client: ApifyClient = {
    async createRun() { state.createCalls++; return { ...base, status: seq[0], finishedAt: null }; },
    async getRun(runId) { const st = seq[Math.min(i, seq.length - 1)]; i++; state.getCalls++; const done = /SUCCEEDED|FAILED|ABORTED|TIMED/.test(st); return { ...base, runId, status: st, finishedAt: done ? "T1" : null }; },
    async getDatasetItems() { state.datasetCalls++; return opts.items ?? []; },
  };
  return { client, state };
}
const noSleep = async () => {};

async function main() {
  console.log("Replacement provider (borderline/uber-eats-scraper-ppr):");
  const outlets = parseBorderlineSearch(fx("tests/fixtures/uber-eats/borderline-search.json"), AT);
  const ub1 = outlets.find((o) => o.source_outlet_id === "bl-ub1-001")!;
  const near = outlets.find((o) => o.source_outlet_id === "bl-near-002")!;
  const far = outlets.find((o) => o.source_outlet_id === "bl-far-003")!;

  // (1)+(2) new actor uses the existing provenance workflow; run + dataset ids retained.
  {
    const store = new MemStore(); const f = makeFake({ items: [{ uuid: "x" }] });
    const r = await runApifyProvider({ client: f.client, store, actorId: getProvider("uber_eats_borderline_ppr")!.actorId, input: buildBorderlineInput({ address: ADDRESS }), inputFingerprint: "fp", maxRequestedResults: 10, estimatedCostUsd: 0.05, sleep: noSleep });
    assert(r.ingested === true && f.state.createCalls === 1, "new actor uses the existing Apify provenance/orchestrator workflow");
    assert(store.rows[0].actor_run_id === "run-BL" && store.rows[0].dataset_id === "ds-BL", "exact actor run id + dataset id retained");
  }

  // (3) addressCountry GB + locale en-GB are sent.
  {
    const input = buildBorderlineInput({ address: ADDRESS, query: "pizza" });
    assert(input.addressCountry === "GB" && input.locale === "en-GB", "addressCountry=GB and locale=en-GB sent");
    assert(input.storeType === "RESTAURANTS" && input.address === ADDRESS && (input as any).urls === undefined, "storeType RESTAURANTS, address unchanged, no store urls");
  }

  // (4) maxRows cannot exceed the approved value.
  assert(buildBorderlineInput({ address: ADDRESS, maxRows: 1000 }).maxRows === BORDERLINE_MAX_ROWS_CAP, "maxRows is HARD-capped at the approved value (10)");

  // (5) rental actors cannot be selected accidentally.
  {
    const rental: ProviderCapability = { ...getProvider("uber_eats_borderline_ppr")!, id: "fake_rental", pricingModel: "RENTAL" };
    let threw = false; try { ensurePayPerResult(rental); } catch { threw = true; }
    assert(threw, "RENTAL actor is rejected by the pay-per-result guard");
    assert(assertPayPerResult("uber_eats_borderline_ppr").pricingModel === "PAY_PER_RESULT", "borderline actor passes the pay-per-result guard");
    assert(!selectDiscoveryProviders().some((p) => p.id === "uber_eats_sourabhbgp"), "rejected sourabhbgp actor is NOT auto-selected for discovery");
    assert(!selectDiscoveryProviders().some((p) => p.id === "uber_eats_borderline_ppr"), "unvalidated borderline actor is NOT auto-selected (only via the explicit diagnostic)");
  }

  // (6) raw results immutable — the gate discards nothing (evidence retained).
  {
    const part = partitionByGeography(outlets, GEO);
    assert(part.verdicts.length === outlets.length && part.valid.length + part.outOfScope.length + part.unverifiable.length === outlets.length, "gate partitions without discarding any record (raw evidence retained)");
  }

  // (7) UB1 records may proceed.
  assert(partitionByGeography([ub1], GEO).valid.length === 1, "in-UB1 record is business-valid and may proceed");

  // (8) non-UB1 records excluded from UB1 operational consolidation.
  {
    const part = partitionByGeography([near, far], GEO);
    assert(part.valid.length === 0 && part.outOfScope.length === 2, "near_target (UB3) and unrelated (WC1) are excluded from operational consolidation");
  }

  // (9) nearby non-UB1 distinguishable from unrelated-location.
  {
    const vNear = classifyLocationFidelity(near, { targetDistrict: "UB1" });
    const vFar = classifyLocationFidelity(far, { targetDistrict: "UB1" });
    const vUb1 = classifyLocationFidelity(ub1, { targetDistrict: "UB1" });
    assert(vUb1.fidelity === "target_district", "in-UB1 record → target_district");
    assert(vNear.fidelity === "near_target", "Hayes (UB3, ~near Southall) → near_target (distinct from unrelated)");
    assert(vFar.fidelity === "unrelated_location", "Holborn (central London) → unrelated_location");
    assert(vNear.fidelity !== vFar.fidelity, "near_target and unrelated_location are distinguishable");
  }

  // (10) parser calibration can replay a saved dataset with NO paid execution.
  {
    const replayed = parseBorderlineSearch(fx("tests/fixtures/uber-eats/borderline-search.json"), AT);
    assert(replayed.length === 3 && replayed[0].postcode === "UB1 1JR" && replayed[0].latitude === 51.5089, "saved dataset replays offline (parse + geography) with no Apify call");
    assert((replayed[0].source_extra as any)?.address_country === "GB" && !!(replayed[0].source_extra as any)?.raw_record, "replay retains country + complete raw record in source_extra");
  }

  // (11) a process restart resumes the SAME provider run (no new charge).
  {
    const store = new MemStore(); store.inflight = { id: "pe-x", actorRunId: "run-RESUME-BL", datasetId: "ds-x", actorStatus: "RUNNING" };
    const f = makeFake({ items: [{ uuid: "z" }] });
    const r = await runApifyProvider({ client: f.client, store, actorId: "act-bl", input: {}, inputFingerprint: "fp2", maxRequestedResults: 10, estimatedCostUsd: 0.05, sleep: noSleep });
    assert(f.state.createCalls === 0 && r.resumed === true && r.run.runId === "run-RESUME-BL", "restart resumes the stored provider run — no new paid run");
  }

  // (12) a geography-validation failure prevents automatic paid continuation.
  {
    const part = partitionByGeography([near, far], GEO);   // no UB1 records
    const status = deriveRunGeographyStatus(part.verdicts.map((v) => v.verdict));
    assert(status.status === "provider_succeeded_validation_failed", "zero UB1 records → provider_succeeded_validation_failed (CLI halts before further paid source)");
  }

  // registry sanity: source platform separate from acquisition identity.
  assert(getProvider("uber_eats_borderline_ppr")!.sourcePlatform === "uber_eats" && getProvider("uber_eats_sourabhbgp")!.discovery === "rejected", "platform identity separate from acquisition identity; sourabhbgp discovery=rejected");

  console.log(fails === 0 ? "\nAll replacement-provider assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
