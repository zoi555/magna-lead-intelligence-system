// Just Eat Stage 1 — deterministic tests (npm run test:je-stage1).
// Runs against the in-memory repository + sanitised fixtures — no network, no DB.
// Covers: field catalogue, search parsing, missing/malformed fields, phone normalisation,
// review score/count, rating history, address/postcode, cuisine, service availability,
// opening hours, halal evidence (no false inference), immutable/append-only observations,
// content-hash duplicates, outlet upsert, provenance, execution progress, cancellation,
// bounded retry, data-quality calculations, and tenant scoping.

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryRepository } from "../src/lib/discovery-engine/repository/memory";
import { isUuid, normaliseClaimedRow } from "../src/lib/discovery-engine/repository/supabase";
import { runWorkerOnce } from "../src/lib/discovery-engine/worker/loop";
import { JustEatAdapter } from "../src/lib/discovery-engine/just-eat/adapter";
import { executeJustEatRun } from "../src/lib/discovery-engine/worker/execute";
import { parseSearchResponse, parseSearchRestaurant } from "../src/lib/discovery-engine/just-eat/parse";
import { normaliseUkPhone } from "../src/lib/discovery-engine/just-eat/phone";
import { JUST_EAT_FIELD_CATALOGUE, COLLECTED_FIELD_KEYS } from "../src/lib/discovery-engine/just-eat/field-catalogue";
import { saveRun, queueJustEatExecution } from "../src/lib/discovery-engine/run-service";
import { referenceFromEntries } from "../src/lib/discovery-engine/geography/reference";
import type { AdapterConfig } from "../src/lib/discovery-engine/adapter";
import type { PostcodeReferenceEntry } from "@zoi555/geospatial-map";

// deterministic reference (mirrors the real national enumeration for UB + HA0)
const geoRef = referenceFromEntries([
  { level: "area", code: "UB" },
  ...["UB1", "UB2", "UB3", "UB4", "UB5", "UB6"].map((d) => ({ level: "district" as const, code: d })),
  ...["UB1 1", "UB1 2"].map((s) => ({ level: "sector" as const, code: s })),
  { level: "district", code: "HA0" },
] as PostcodeReferenceEntry[]);

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const FIXTURE = JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/just-eat/search-ub1.json"), "utf8"));
const OUTCODES = ["UB1", "UB2"];

// fixture-driven fetcher: UB1 returns data; UB2 simulates a blocked/failed outcode.
const fetcher = async (outcode: string): Promise<{ ok: boolean; httpStatus: number | null; headers: Record<string, string>; raw: unknown; error?: string }> => {
  if (outcode === "UB1") return { ok: true, httpStatus: 200, headers: { date: "x" }, raw: FIXTURE };
  return { ok: false, httpStatus: 429, headers: {}, raw: null, error: "HTTP 429" };
};
const cfg = (): AdapterConfig => ({ enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: OUTCODES });
const adapter = () => new JustEatAdapter(fetcher);   // fixture-backed — never hits the network

async function main() {
  console.log("Just Eat Stage 1:");

  // ---- field catalogue ----
  assert(JUST_EAT_FIELD_CATALOGUE.length > 30, "field catalogue is populated");
  const phone = JUST_EAT_FIELD_CATALOGUE.find((f) => f.key === "telephone")!;
  assert(phone.availability === "unavailable" && phone.collectionStatus === "not_collected", "phone honestly catalogued as unavailable/not collected");
  const menu = JUST_EAT_FIELD_CATALOGUE.find((f) => f.key === "menu_items")!;
  assert(menu.availability === "menu_only", "menu items catalogued as menu-only (not collected in Stage 1)");
  assert(COLLECTED_FIELD_KEYS.includes("halal_flag") && COLLECTED_FIELD_KEYS.includes("rating_average"), "halal flag + rating are collected fields");

  // ---- search parsing + test-restaurant filtering ----
  const { records, restaurantCount } = parseSearchResponse(FIXTURE, "UB1", OUTCODES);
  assert(restaurantCount === 6, "raw response had 6 restaurant objects");
  assert(records.length === 5, "JE test restaurant filtered out (5 real records)");

  const spice = records.find((r) => r.outlet.je_outlet_id === "900001")!;
  assert(spice.outlet.trading_name === "Test Spice House", "trading name parsed");
  assert(spice.outlet.postcode === "UB1 1AA", "postcode normalised with space");
  assert(spice.outlet.outcode === "UB1", "outcode derived");
  assert(near(spice.outlet.latitude!, 51.5081) && spice.outlet.longitude != null, "coordinates parsed");
  assert(spice.outlet.rating_average === 4.6 && spice.outlet.rating_count === 342, "review score + count extracted");
  assert(spice.outlet.primary_cuisine === "Indian", "primary cuisine derived from top cuisine");
  assert(spice.outlet.service_models.includes("delivery") && spice.outlet.service_models.includes("collection"), "service models derived from flags");
  assert(Array.isArray(spice.outlet.opening_times) && spice.outlet.opening_times.length === 1, "opening hours retained where present");

  // ---- halal evidence (no false inference) ----
  assert(spice.outlet.halal_flag === true && spice.outlet.halal_evidence.length >= 1, "explicit halal flag captured as evidence");
  const fried = records.find((r) => r.outlet.je_outlet_id === "900002")!;
  assert(fried.outlet.halal_flag === false && fried.outlet.halal_evidence.length === 0, "non-halal outlet has no halal evidence (no inference from cuisine)");
  const bakery = records.find((r) => r.outlet.je_outlet_id === "900005")!;
  assert(bakery.outlet.is_delivery === false && bakery.outlet.is_collection === true, "collection-only availability parsed");
  const closed = records.find((r) => r.outlet.je_outlet_id === "900003")!;
  assert(closed.outlet.is_temporarily_offline === true && closed.outlet.offline_reason === "Closed for a private event", "temporarily-offline + reason parsed");

  // ---- missing / malformed fields ----
  const empty = parseSearchRestaurant({}, "UB1", OUTCODES);
  assert(empty.outlet.je_outlet_id === "" && empty.warnings.length >= 2, "empty object parses with warnings, no throw");
  const malformed = parseSearchRestaurant({ Id: 5, Name: "X", Rating: "oops", Cuisines: "nope", Address: null }, "UB1", OUTCODES);
  assert(malformed.outlet.rating_average === null && malformed.outlet.cuisines.length === 0, "malformed rating/cuisines degrade to null/empty");

  // ---- phone normalisation ----
  assert(normaliseUkPhone("020 7946 0000").e164 === "+442079460000", "UK landline → E.164");
  assert(normaliseUkPhone("+44 7700 900123").national === "07700900123", "international mobile → national");
  const ext = normaliseUkPhone("0161 496 0000 ext 42");
  assert(ext.extension === "42" && ext.valid, "extension parsed");
  const bad = normaliseUkPhone("12");
  assert(!bad.valid && bad.raw === "12" && bad.invalidReason != null, "invalid number kept with reason, not discarded");
  assert(spice.outlet.telephone_raw === null, "no phone fabricated (listing supplies none)");

  // ---- run persistence + queue ----
  const repo = new MemoryRepository();
  const { run } = await saveRun(repo, { tenant_id: "tenant-A", name: "TW test run", territory_input: "UB1, UB2" }, geoRef);
  assert(run.derived_query_units.length === 2, "run derived 2 postcode districts from territory text");
  const exec = await queueJustEatExecution(repo, run.id);
  assert(exec.status === "queued" && (await repo.getRun(run.id))!.status === "queued", "execution queued + run status queued");

  // ---- claim + execute ----
  const claimed = await repo.claimNextExecution("worker-1", 60);
  assert(claimed !== null && claimed!.status === "running" && claimed!.attempts === 1, "execution claimed atomically (attempts=1)");
  const res = await executeJustEatRun(repo, run, claimed!, { adapter: adapter(), config: cfg(), workerId: "worker-1" });
  assert(res.status === "completed_with_warnings", "run completes with warnings (one outcode failed, fail-safe)");
  assert(res.uniqueOutlets === 5, "5 unique outlets");
  assert(res.totalObservations === 5 && res.duplicateObservations === 0, "5 immutable observations, no duplicates first pass");
  assert(res.failedQueries === 1, "failed outcode counted, not fatal");

  // ---- rating history + provenance ----
  assert(repo.ratingHistory.length === 5, "rating history: one observation per outlet");
  const outletRec = [...repo.outlets.values()].find((o) => o.je_outlet_id === "900001")!;
  const prov = repo.provenance.get(outletRec.id)!;
  assert(prov.some((p) => p.field_key === "postcode") && prov.some((p) => p.field_key === "halal_evidence") && prov.some((p) => p.field_key === "review_score"), "provenance recorded for key fields");
  assert(prov.find((p) => p.field_key === "telephone")!.value === null, "telephone provenance honest (null, unavailable)");

  // ---- content-hash duplicate on a second pass ----
  const exec2 = await queueJustEatExecution(repo, run.id);
  const claimed2 = await repo.claimNextExecution("worker-1", 60);
  const res2 = await executeJustEatRun(repo, run, claimed2!, { adapter: adapter(), config: cfg(), workerId: "worker-1" });
  assert(res2.duplicateObservations === 5, "second pass links 5 duplicate observations by content hash");
  assert([...repo.outlets.values()].length === 5, "outlet upsert: still 5 unique outlets after re-run");
  assert(outletRec.observation_count >= 2, "outlet observation_count incremented on re-observation");

  // ---- data-quality report ----
  const q = repo.quality.get(claimed!.id)!;
  assert(q.total_raw_observations === 5 && q.canonical_observations === 5 && q.duplicate_observations === 0, "clean first pass: canonical == total (no duplicates)");
  const q2 = repo.quality.get(claimed2!.id)!;
  assert(q2.duplicate_observations === 5 && q2.canonical_observations === q2.total_raw_observations - q2.duplicate_observations, "re-run: canonical observations = total − duplicates (historical duplicates excluded from operational count)");
  assert(near(q.pct_phone, 0), "phone coverage honestly 0%");
  assert(near(q.pct_menu_data, 0), "menu coverage honestly 0%");
  assert(near(q.pct_coordinates, 1), "coordinate coverage 100%");
  assert(near(q.pct_full_postcode, 1), "full-postcode coverage 100%");
  assert(near(q.pct_halal_evidence, 0.4), "halal-evidence coverage 40% (2 of 5)");
  assert(near(q.pct_review_score, 0.8), "review-score coverage 80% (new outlet has none)");
  assert(near(q.query_failure_rate, 0.5), "query failure rate 50% (1 of 2 outcodes)");
  assert(q.field_availability_by_response_type.search !== undefined, "field availability reported by response type");

  // ---- cancellation ----
  const { run: run2 } = await saveRun(repo, { tenant_id: "tenant-A", name: "cancel run", territory_input: "UB1" }, geoRef);
  await queueJustEatExecution(repo, run2.id);
  const c = await repo.claimNextExecution("worker-1", 60);
  await repo.requestCancel(c!.id);
  const rc = await executeJustEatRun(repo, run2, c!, { adapter: adapter(), config: { ...cfg(), outcodes: ["UB1"] }, workerId: "worker-1" });
  assert(rc.cancelled && rc.status === "cancelled", "cancellation stops the run and marks it cancelled");

  // ---- bounded retry / stale re-claim ----
  const { run: run3 } = await saveRun(repo, { tenant_id: "tenant-A", name: "retry run", territory_input: "UB1" }, geoRef);
  const e3 = await queueJustEatExecution(repo, run3.id);
  const first = await repo.claimNextExecution("worker-1", 60);
  const noneWhileFresh = await repo.claimNextExecution("worker-2", 60);
  assert(first!.id === e3.id && (noneWhileFresh === null || noneWhileFresh.id !== e3.id), "fresh lease is not re-claimed by another worker");
  // force a stale lease
  repo.executions.get(e3.id)!.heartbeat_at = new Date(Date.now() - 120000).toISOString();
  const reclaim = await repo.claimNextExecution("worker-2", 60);
  assert(reclaim!.id === e3.id && reclaim!.attempts === 2, "stale execution re-claimed (attempts=2, bounded retry)");

  // ---- tenant scoping ----
  assert((await repo.listRuns("tenant-A")).length >= 3 && (await repo.listRuns("tenant-B")).length === 0, "runs are tenant-scoped (tenant-B sees none)");

  // ---- claim-result normalisation (root-cause guard for the worker UUID bug) ----
  const U = randomUUID();
  assert(isUuid(U) && !isUuid("null") && !isUuid(null) && !isUuid(undefined), "isUuid accepts real UUIDs, rejects 'null'/nullish");
  assert(normaliseClaimedRow(null) === null, "empty RPC result (null) → null");
  assert(normaliseClaimedRow([]) === null, "empty RPC result ([]) → null");
  // the PostgREST phantom all-NULL composite row must be rejected
  assert(normaliseClaimedRow({ id: null, run_id: null, status: null }) === null, "phantom all-NULL composite row → null (root cause)");
  assert(normaliseClaimedRow([{ id: null, run_id: null }]) === null, "phantom all-NULL row in array → null");
  assert(normaliseClaimedRow({ id: U, run_id: null }) === null, "valid id but null run_id → rejected");
  assert(normaliseClaimedRow({ id: "not-a-uuid", run_id: U }) === null, "non-UUID id → rejected");
  const good = normaliseClaimedRow({ id: U, run_id: randomUUID(), status: "running" });
  assert(good !== null && isUuid(good!.run_id), "valid claimed row → returned with a UUID run_id");

  // ---- queue creation always writes a valid run_id; worker drains empty queue cleanly ----
  const { run: run4 } = await saveRun(repo, { tenant_id: "tenant-A", name: "queue run", territory_input: "UB1" }, geoRef);
  const e4 = await queueJustEatExecution(repo, run4.id);
  assert(isUuid(e4.run_id) && e4.run_id === run4.id, "queue creation writes a valid run_id (= run.id)");
  const emptyRepo = new MemoryRepository();
  const drained = await runWorkerOnce(emptyRepo, { workerId: "w", onLog: () => {} });
  assert(Array.isArray(drained) && drained.length === 0, "worker on an empty queue exits cleanly (no crash, nothing claimed)");

  // ---- execution progress counter (the 0/1 defect) ----
  const cfg1 = (outcodes: string[]): AdapterConfig => ({ enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes });
  const rep = new MemoryRepository();

  // 1/1: a successful single query ends with completed_queries === 1 (was showing 0/1)
  const { run: rOk } = await saveRun(rep, { tenant_id: "t", name: "ok", territory_input: "UB1" }, geoRef);
  const eOk = await queueJustEatExecution(rep, rOk.id);
  const cOk = await rep.claimNextExecution("w1", 60);
  const rOkRes = await executeJustEatRun(rep, rOk, cOk!, { adapter: adapter(), config: cfg1(["UB1"]), workerId: "w1" });
  const execOk = await rep.getExecution(eOk.id);
  assert(rOkRes.status === "completed" && rOkRes.completedQueries === 1, "successful query → completedQueries 1");
  assert(execOk!.completed_queries === 1 && execOk!.planned_queries === 1, "completed execution row shows 1/1 (0/1 defect fixed)");

  // 0/1: a failed query is NOT counted completed; failure represented; completed_with_warnings
  const { run: rFail } = await saveRun(rep, { tenant_id: "t", name: "fail", territory_input: "UB2" }, geoRef);
  await queueJustEatExecution(rep, rFail.id);
  const cFail = await rep.claimNextExecution("w1", 60);
  const rFailRes = await executeJustEatRun(rep, rFail, cFail!, { adapter: adapter(), config: cfg1(["UB2"]), workerId: "w1" });
  const execFail = await rep.getExecution(cFail!.id);
  assert(rFailRes.failedQueries === 1 && rFailRes.completedQueries === 0, "failed query → 0 completed, 1 failed");
  assert(execFail!.completed_queries === 0 && execFail!.status === "completed_with_warnings", "failed single query row shows 0/1 with warnings status");

  // cancellation: completed reflects work done before cancel; status cancelled
  const { run: rCan } = await saveRun(rep, { tenant_id: "t", name: "cancel", territory_input: "UB1" }, geoRef);
  const eCan = await queueJustEatExecution(rep, rCan.id);
  const cCan = await rep.claimNextExecution("w1", 60);
  await rep.requestCancel(eCan.id);
  const rCanRes = await executeJustEatRun(rep, rCan, cCan!, { adapter: adapter(), config: cfg1(["UB1"]), workerId: "w1" });
  assert(rCanRes.cancelled && rCanRes.status === "cancelled" && rCanRes.completedQueries === 0, "cancel before the query → cancelled, 0 completed");

  // retry/idempotency: a resumed attempt skips the already-completed query (no double increment)
  const { run: rRetry } = await saveRun(rep, { tenant_id: "t", name: "retry", territory_input: "UB1" }, geoRef);
  const eRetry = await queueJustEatExecution(rep, rRetry.id);
  const cRetry = await rep.claimNextExecution("w1", 60);
  const rRetryRes = await executeJustEatRun(rep, rRetry, { ...cRetry!, completed_queries: 1 }, { adapter: adapter(), config: cfg1(["UB1"]), workerId: "w1" });
  assert(rRetryRes.completedQueries === 1 && (await rep.getExecution(eRetry.id))!.completed_queries === 1, "resume skips the completed query — completedQueries stays 1 (no double increment)");

  // lease loss / ownership guard
  const hbLost = await rep.heartbeat(eRetry.id, "not-the-owner", 5, {}, 60);
  assert(hbLost.owned === false, "heartbeat by a non-owner reports lease lost (owned=false)");
  const statusBefore = (await rep.getExecution(eRetry.id))!.status;
  await rep.finishExecution(eRetry.id, "failed", { claimedBy: "not-the-owner", completedQueries: 99 });
  const afterGuard = await rep.getExecution(eRetry.id);
  assert(afterGuard!.status === statusBefore && afterGuard!.completed_queries !== 99, "finishExecution ownership guard blocks a non-owner");

  console.log(fails === 0 ? "\nAll Just Eat Stage 1 assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
