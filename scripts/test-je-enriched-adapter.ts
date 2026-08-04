// Just Eat ENRICHED adapter/parser — deterministic tests (npm run test:je-enriched-adapter).
// ISS-0035 recovery (2026-08-04): the legacy /restaurants/bypostcode/ endpoint is retired
// (confirmed 404 for every postcode). This suite covers the replacement
// /discovery/uk/restaurants/enriched/bypostcode/ adapter + parser against fixtures — no
// network, no DB. Required scenarios: valid response, empty valid response, 400, 401/403,
// 404 route missing, 429, 500, malformed JSON, changed/unrecognised schema, duplicate
// restaurants across query points, same restaurant with slightly different fields, postcode
// outside target district, missing restaurant ID, missing address/postcode, and the
// ISS-0035 error-persistence fix itself.

import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRepository } from "../src/lib/discovery-engine/repository/memory";
import { runWorkerOnce } from "../src/lib/discovery-engine/worker/loop";
import { executeJustEatRun } from "../src/lib/discovery-engine/worker/execute";
import { JustEatEnrichedAdapter } from "../src/lib/discovery-engine/just-eat/adapter-v2";
import { parseEnrichedSearchResponse, parseEnrichedSearchRestaurant, isRecognisedEnrichedResponse } from "../src/lib/discovery-engine/just-eat/parse-v2";
import { saveRun, queueJustEatExecution } from "../src/lib/discovery-engine/run-service";
import { referenceFromEntries } from "../src/lib/discovery-engine/geography/reference";
import type { AdapterConfig } from "../src/lib/discovery-engine/adapter";
import type { JustEatEnrichedFetchResult } from "../src/lib/sources/just-eat";
import type { PostcodeReferenceEntry } from "@zoi555/geospatial-map";

const geoRef = referenceFromEntries([
  { level: "area", code: "CM" },
  ...["CM0", "CM1", "CM2"].map((d) => ({ level: "district" as const, code: d })),
] as PostcodeReferenceEntry[]);

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const FIXTURE = JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/just-eat/enriched-cm1.json"), "utf8"));
const V = "je-enriched-bypostcode-v3-2026-08-04";

function okResult(raw: unknown, requestType: "outcode" | "full_postcode" = "outcode"): JustEatEnrichedFetchResult {
  return { ok: true, httpStatus: 200, headers: {}, raw, attempts: 1, endpointVersion: V, requestType, queryPoint: "CM1" };
}
function failResult(httpStatus: number | null, error: string, attempts = 2): JustEatEnrichedFetchResult {
  return { ok: false, httpStatus, headers: {}, raw: null, error, attempts, endpointVersion: V, requestType: "outcode", queryPoint: "CM1" };
}

async function main() {
  console.log("Just Eat ENRICHED adapter/parser (ISS-0035 recovery):");

  // ---- 1. valid response ----
  const { records, restaurantCount, recognisedByProvider } = parseEnrichedSearchResponse(FIXTURE, "CM1", ["CM1"]);
  assert(restaurantCount === 4, "valid response: 4 restaurant objects parsed");
  assert(records.length === 4, "valid response: no test restaurants filtered out of this fixture (none marked)");
  assert(recognisedByProvider === true, "valid response: provider recognised the postcode (canonicalName/location present)");
  const fav = records.find((r) => r.outlet.je_outlet_id === "245775")!;
  assert(fav.outlet.trading_name === "Favourite chicken Ms", "trading name parsed");
  assert(fav.outlet.postcode?.startsWith("CM1") ?? false, "postcode parsed");
  assert(fav.outlet.latitude != null && fav.outlet.longitude != null, "coordinates parsed");
  assert(fav.outlet.latitude! > 51 && fav.outlet.latitude! < 52, "GeoJSON [lng,lat] correctly reordered to lat/lng (Essex latitude ~51.7, not the raw first coordinate)");
  assert(fav.outlet.rating_average === 5 && fav.outlet.rating_stars === 5, "single starRating figure reused for both rating_average and rating_stars (documented schema simplification)");
  assert(fav.outlet.cuisines.includes("Chicken"), "cuisines parsed");
  assert(fav.outlet.brand_name === null && fav.outlet.is_brand === false, "brand fields honestly null/false (genuine schema gap, never inferred)");

  // ---- halal evidence: cuisine/tag match only (no flag/description field in this schema) ----
  const halalRec = records.find((r) => r.outlet.je_outlet_id === "218229")!;
  assert(halalRec.outlet.halal_evidence.length === 1 && halalRec.outlet.halal_evidence[0].type === "cuisine_or_tag", "halal evidence found via cuisine tag match");
  const nonHalal = records.find((r) => r.outlet.je_outlet_id === "245775")!;
  assert(nonHalal.outlet.halal_evidence.length === 0, "no halal evidence fabricated for a restaurant without the Halal cuisine tag");

  // ---- temporarily offline ----
  const offline = records.find((r) => r.outlet.je_outlet_id === "254370")!;
  assert(offline.outlet.is_temporarily_offline === true, "temporarily-offline flag parsed");

  // ---- 2. empty valid response (recognised postcode, genuinely 0 restaurants) ----
  const emptyValid = { metaData: { canonicalName: "cm0-southminster", district: "CM0", postalCode: "CM0", area: "South minster", location: { type: "Point", coordinates: [0.8, 51.6] }, resultCount: 0 }, restaurants: [] };
  const emptyParsed = parseEnrichedSearchResponse(emptyValid, "CM0", ["CM0"]);
  assert(emptyParsed.records.length === 0 && emptyParsed.recognisedByProvider === true, "empty valid response: 0 restaurants, but provider DID recognise the postcode — legitimate empty district, not a failure");

  // ---- unrecognised postcode (provider returns HTTP 200, canonicalName/location null) ----
  const unrecognised = { metaData: { canonicalName: null, district: "ZZ999ZZ", postalCode: "ZZ999ZZ", area: "ZZ999ZZ", location: null, resultCount: 0 }, restaurants: [] };
  const unrecognisedParsed = parseEnrichedSearchResponse(unrecognised, "ZZ999ZZ", ["ZZ999ZZ"]);
  assert(unrecognisedParsed.recognisedByProvider === false, "unrecognised postcode correctly flagged (canonicalName/location both null) — distinguishable from a genuine empty district");

  // ---- 9. changed/unrecognised top-level schema — fail closed, never treated as empty ----
  assert(isRecognisedEnrichedResponse(FIXTURE) === true, "valid fixture recognised as a valid schema shape");
  assert(isRecognisedEnrichedResponse({ restaurants: [] }) === false, "missing metaData -> unrecognised schema");
  assert(isRecognisedEnrichedResponse({ metaData: {} }) === false, "missing restaurants array -> unrecognised schema");
  assert(isRecognisedEnrichedResponse({ metaData: {}, restaurants: "not-an-array" }) === false, "restaurants not an array -> unrecognised schema");
  assert(isRecognisedEnrichedResponse(null) === false, "null body -> unrecognised schema (no throw)");
  assert(isRecognisedEnrichedResponse("just a string") === false, "non-object body -> unrecognised schema (no throw)");

  // ---- 13. missing restaurant ID / 14. missing address/postcode — warn, never throw ----
  const empty = parseEnrichedSearchRestaurant({}, "CM1", ["CM1"]);
  assert(empty.outlet.je_outlet_id === "" && empty.warnings.includes("missing id/uniqueName"), "missing id -> warning, no throw");
  assert(empty.warnings.includes("missing name") && empty.warnings.includes("missing postcode"), "missing name/postcode -> warnings, no throw");
  const malformed = parseEnrichedSearchRestaurant({ id: 5, name: "X", rating: "oops", cuisines: "nope", address: null }, "CM1", ["CM1"]);
  assert(malformed.outlet.rating_average === null && malformed.outlet.cuisines.length === 0, "malformed rating/cuisines degrade to null/empty, no throw");

  // ---- 11. same restaurant, slightly different fields (rating updated) — reparses cleanly, same identity ----
  const v1 = parseEnrichedSearchRestaurant(FIXTURE.restaurants[0], "CM1", ["CM1"]);
  const updated = { ...FIXTURE.restaurants[0], rating: { ...FIXTURE.restaurants[0].rating, count: FIXTURE.restaurants[0].rating.count + 1 } };
  const v2 = parseEnrichedSearchRestaurant(updated, "CM1", ["CM1"]);
  assert(v1.outlet.je_outlet_id === v2.outlet.je_outlet_id, "same restaurant ID preserved across a field update");
  assert(v2.outlet.rating_count === v1.outlet.rating_count! + 1, "updated field reflected in the new parse");

  // ---- 12. postcode outside target district — classified honestly, not discarded, never
  // silently relabelled as "located in" a district it does not actually sit in ----
  const outside = parseEnrichedSearchRestaurant(FIXTURE.restaurants[0], "CM9", ["CM9"]);
  assert(outside.outlet.postcode?.startsWith("CM1") ?? false, "the restaurant's own postcode (CM1) is preserved unchanged regardless of which district it was queried under (CM9)");
  assert(outside.outlet.territory_class !== "located_in_target_territory", "a CM1 restaurant is never classified as 'located in' CM9 merely because CM9 was the queried pilot outcode — retained, honestly classified as outside/serving, not discarded");
  const inside = parseEnrichedSearchRestaurant(FIXTURE.restaurants[0], "CM1", ["CM1"]);
  assert(inside.outlet.territory_class === "located_in_target_territory", "the same restaurant IS correctly classified as located-in when its own postcode district is actually in the pilot set");

  // ---- adapter-level: 400 / 401 / 403 / 404 / 429 / 500 / malformed JSON / network error ----
  const scenarios: Array<[string, JustEatEnrichedFetchResult]> = [
    ["400", failResult(400, "HTTP 400")],
    ["401", failResult(401, "HTTP 401")],
    ["403", failResult(403, "HTTP 403 Forbidden", 2)],
    ["404 route missing", failResult(404, "HTTP 404")],
    ["429", failResult(429, "HTTP 429 Too Many Requests", 2)],
    ["500", failResult(500, "HTTP 500 Internal Server Error", 2)],
    ["malformed JSON", failResult(200, "malformed JSON: Unexpected token")],
    ["network error", failResult(null, "fetch failed: ECONNRESET")],
  ];
  for (const [label, fr] of scenarios) {
    const adapter = new JustEatEnrichedAdapter(async () => fr);
    const cfg: AdapterConfig = { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1"] };
    const [q] = adapter.planQueries(cfg);
    const res = await adapter.executeQuery(q, cfg);
    assert(res.ok === false && res.error === fr.error && res.httpStatus === fr.httpStatus, `${label}: adapter surfaces ok=false with the real status/error, not a fabricated empty success`);
  }

  // ---- unrecognised schema surfaced as a failure by the adapter, not as "0 restaurants" ----
  const schemaAdapter = new JustEatEnrichedAdapter(async () => okResult({ totally: "different shape" }));
  const cfg1: AdapterConfig = { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1"] };
  const [qs] = schemaAdapter.planQueries(cfg1);
  const schemaRes = await schemaAdapter.executeQuery(qs, cfg1);
  assert(schemaRes.ok === false && schemaRes.providerErrorCode === "unknown_schema", "unrecognised schema fails closed at the adapter (never silently parsed as empty)");

  // ---- one-query-per-district planning still holds (no multi-full-postcode expansion needed) ----
  const planAdapter = new JustEatEnrichedAdapter(async () => okResult(FIXTURE));
  const planCfg: AdapterConfig = { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1", "CM1", "CM2"] };
  const planned = planAdapter.planQueries(planCfg);
  assert(planned.length === 2 && planned[0].outcode === "CM1" && planned[1].outcode === "CM2", "one query per distinct district, duplicates deduped (unchanged from the legacy adapter's planning strategy)");

  // ---- end-to-end via executeJustEatRun: 10. duplicate restaurants across query points dedup ----
  const repo = new MemoryRepository();
  const { run } = await saveRun(repo, { tenant_id: "tenant-A", name: "CM dedup test", territory_input: "CM1, CM2" }, geoRef);
  const exec = await queueJustEatExecution(repo, run.id);
  const claimed = await repo.claimNextExecution("worker-1", 60);
  // CM1 and CM2 both return the SAME fixture (simulating an overlapping delivery-area duplicate)
  const dedupAdapter = new JustEatEnrichedAdapter(async () => okResult(FIXTURE));
  const dedupCfg: AdapterConfig = { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1", "CM2"] };
  const dedupRes = await executeJustEatRun(repo, run, claimed!, { adapter: dedupAdapter, config: dedupCfg, workerId: "worker-1" });
  assert(dedupRes.status === "completed", "both districts complete cleanly");
  assert(dedupRes.uniqueOutlets === 4, "4 unique outlets across 2 query points (same 4 restaurants returned twice, deduped by je_outlet_id — not double-counted as 8)");
  assert(dedupRes.duplicateObservations === 4, "second query point's observations correctly linked as content-hash duplicates");

  // ---- 15. ISS-0035: sanitised provider error retained in the execution record ----
  const repo2 = new MemoryRepository();
  const { run: run2 } = await saveRun(repo2, { tenant_id: "tenant-A", name: "CM failure test", territory_input: "CM1" }, geoRef);
  await queueJustEatExecution(repo2, run2.id);
  const claimed2 = await repo2.claimNextExecution("worker-1", 60);
  const failAdapter = new JustEatEnrichedAdapter(async () => failResult(429, "HTTP 429 Too Many Requests", 2));
  const failCfg: AdapterConfig = { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1"] };
  await executeJustEatRun(repo2, run2, claimed2!, { adapter: failAdapter, config: failCfg, workerId: "worker-1" });
  const execAfter = await repo2.getExecution(claimed2!.id);
  const err = execAfter!.error as Record<string, unknown> | null;
  assert(err !== null, "ISS-0035 FIXED: execution.error is no longer always null on a real failure");
  assert(err?.http_status === 429 && err?.message === "HTTP 429 Too Many Requests", "ISS-0035: real HTTP status + provider message persisted (previously discarded — only a generic count survived)");
  assert(err?.endpoint_version === V && err?.request_type === "outcode", "ISS-0035: endpoint version + request type persisted per requirement");
  assert(err?.query_point === "CM1" && err?.retry_count === 2, "ISS-0035: query point + retry count persisted");
  assert(typeof err?.failed_at === "string", "ISS-0035: failure timestamp persisted");
  assert(!("headers" in (err ?? {})) && !JSON.stringify(err).toLowerCase().includes("cookie") && !JSON.stringify(err).toLowerCase().includes("authorization"), "ISS-0035: no headers/cookies/auth tokens persisted — status/code/message/context only");
  const metrics = execAfter!.metrics as Record<string, unknown>;
  assert(metrics.last_failure !== undefined, "ISS-0035: last_failure also surfaced in metrics for the data-quality/report layer");

  // ---- owner-required run-manifest fields (2026-08-04 approval): provider/adapter/endpoint/
  // schema versions + per-query provenance, recorded on EVERY run, not only on failure ----
  const runManifest = metrics.run_manifest as Record<string, unknown>;
  assert(runManifest?.provider === "just_eat" && runManifest?.adapter_version === failAdapter.adapterVersion, "run manifest: provider + adapter version recorded");
  const queryLog = metrics.query_log as Array<Record<string, unknown>>;
  assert(Array.isArray(queryLog) && queryLog.length === 1 && queryLog[0].outcome === "failed", "run manifest: query log records the failed query point too, not only successes");
  assert(queryLog[0].query_point === "CM1" && queryLog[0].request_type === "outcode" && queryLog[0].endpoint_version === V, "run manifest: query point, request type, endpoint version recorded");
  assert(typeof queryLog[0].retrieved_at === "string", "run manifest: retrieval timestamp recorded");

  const repo3 = new MemoryRepository();
  const { run: run3 } = await saveRun(repo3, { tenant_id: "tenant-A", name: "CM manifest test", territory_input: "CM1" }, geoRef);
  await queueJustEatExecution(repo3, run3.id);
  const claimed3 = await repo3.claimNextExecution("worker-1", 60);
  const okAdapter = new JustEatEnrichedAdapter(async () => okResult(FIXTURE));
  await executeJustEatRun(repo3, run3, claimed3!, { adapter: okAdapter, config: { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["CM1"] }, workerId: "worker-1" });
  const execOk3 = await repo3.getExecution(claimed3!.id);
  const okMetrics = execOk3!.metrics as Record<string, unknown>;
  const okManifest = okMetrics.run_manifest as Record<string, unknown>;
  assert(okManifest?.response_schema_version === "je-search-enriched-2.0.0", "run manifest: response schema version recorded on a SUCCESSFUL run, not only on failure");
  const okLog = okMetrics.query_log as Array<Record<string, unknown>>;
  assert(okLog?.[0]?.outcome === "ok" && okLog[0].query_point === "CM1", "run manifest: successful query point also logged");

  // ---- worker loop still drains cleanly with the new adapter as the default ----
  const emptyRepo = new MemoryRepository();
  const drained = await runWorkerOnce(emptyRepo, { workerId: "w", onLog: () => {} });
  assert(Array.isArray(drained) && drained.length === 0, "worker on an empty queue exits cleanly with the new default adapter wired in");

  console.log(fails === 0 ? "\nAll Just Eat ENRICHED adapter/parser assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
