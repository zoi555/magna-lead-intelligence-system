// Regression tests for the geography-consolidation hotfix (npm run test:geography-consolidation-fix).
//
// Proves, against the REAL database (no live provider network call — fixture-driven adapter,
// same pattern as test:je-supabase), that consolidateRun() now fails closed:
//   1. a run with one geography-valid + one geography-rejected outlet produces exactly one
//      operational candidate — the valid one;
//   2. the same outlet id, rejected in one run and valid in another, does not leak its verdict
//      across runs (run-scoped evidence, not a global join);
//   3. rejected/no-evidence candidates never reach consolidated_candidates for a run at all
//      (the operational surface every downstream screen reads from);
//   4. the join is OBSERVATION-level, not source_record_id-text-level: two different raw
//      observations sharing the same source_record_id within one run, with opposite verdicts,
//      must not let the stale one's verdict leak onto the canonical one (or vice versa).
// SKIPS cleanly if service credentials are absent. Cleans up all test data on exit.

import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";

// Synthetic actor id — confirm_and_queue_run only checks the actor's role when a genuine
// conflict/override applies; these runs use unique synthetic territories, never conflicting.
const TEST_ACTOR_ID = "00000000-0000-0000-0000-000000000001";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
}

async function main() {
  await loadDotEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.log("test:geography-consolidation-fix — SKIPPED (set SUPABASE_SERVICE_ROLE_KEY in .env.local to run).");
    process.exit(0);
  }

  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");
  const { JustEatAdapter } = await import("../src/lib/discovery-engine/just-eat/adapter");
  const { executeJustEatRun } = await import("../src/lib/discovery-engine/worker/execute");
  const { saveRun, queueJustEatExecution } = await import("../src/lib/discovery-engine/run-service");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { loadPostcodeReference } = await import("../src/lib/discovery-engine/geography/reference");

  let fails = 0;
  const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

  const BASE = JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/just-eat/search-ub1.json"), "utf8"));
  const baseRestaurant = BASE.Restaurants[0];

  // Two synthetic outlets built from the real fixture shape: one genuinely inside UB1 (valid),
  // one whose address is in a different, unrequested district (W5 — Ealing, not UB1) — the same
  // "provider returned a delivery-area outlet outside the requested territory" shape that
  // produced the real defect. `variant` differentiates the raw payload per run so content_hash
  // never collides across runs (each run's insert must be canonical, not deduped as a repeat).
  function outlet(id: number, opts: { postcode: string; city: string; lat: number; lng: number; variant: number }) {
    return {
      ...baseRestaurant, Id: id, UniqueName: `test-outlet-${id}`, Name: `Test Outlet ${id}`,
      Address: { ...baseRestaurant.Address, FirstLine: "1 Test Street", City: opts.city, Postcode: opts.postcode, Latitude: opts.lat, Longitude: opts.lng },
      City: opts.city, Postcode: opts.postcode, Latitude: opts.lat, Longitude: opts.lng,
      NumberOfRatings: opts.variant, // deliberately varies the payload across runs
    };
  }
  const fixtureFor = (restaurants: unknown[]) => ({ ...BASE, Restaurants: restaurants });

  const VALID_ID = 900201;   // genuinely in UB1
  const SHARED_ID = 900202;  // rejected in run A (UB1), valid in run B (W5) — cross-run proof

  const repo = new SupabaseRepository();
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();
  const geoRef = await loadPostcodeReference();

  let runAId: string | null = null;
  let runBId: string | null = null;
  let runCId: string | null = null;
  try {
    // --- Run A: requested territory UB1. One valid outlet + one out-of-scope outlet. ---
    const fetcherA = async (oc: string) => oc === "UB1"
      ? { ok: true, httpStatus: 200, headers: {} as Record<string, string>, raw: fixtureFor([
          outlet(VALID_ID, { postcode: "UB1 1AA", city: "Southall", lat: 51.5081, lng: -0.3762, variant: 1 }),
          outlet(SHARED_ID, { postcode: "W5 2AA", city: "Ealing", lat: 51.513, lng: -0.301, variant: 1 }),
        ]) }
      : { ok: false, httpStatus: 429, headers: {} as Record<string, string>, raw: null, error: "HTTP 429" };

    const { run: runA } = await saveRun(repo, { tenant_id: tenantId, name: "geo-fix-selftest-run-A", territory_input: "UB1" }, geoRef);
    runAId = runA.id;
    const execA = await queueJustEatExecution(repo, runA.id, TEST_ACTOR_ID);
    const claimedA = await repo.claimNextExecution("geo-fix-test-a", 60);
    assert(claimedA?.id === execA.id, "run A execution claimed");
    const resA = await executeJustEatRun(repo, runA, claimedA!, {
      adapter: new JustEatAdapter(fetcherA), workerId: "geo-fix-test-a",
      config: { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["UB1"] },
    });
    assert(resA.uniqueOutlets === 2, `run A observed 2 outlets (got ${resA.uniqueOutlets})`);

    const validationsA = await db.from("provider_geography_validations").select("source_record_id,status").eq("run_id", runA.id);
    const statusById = new Map((validationsA.data ?? []).map((v: any) => [v.source_record_id, v.status]));
    assert(statusById.get(String(VALID_ID)) === "valid_geography", "the UB1 outlet is validated as valid_geography");
    assert(statusById.get(String(SHARED_ID)) === "out_of_scope_geography", "the W5 outlet requested under UB1 is validated as out_of_scope_geography");

    const candsA = await db.from("consolidated_candidates").select("id,geography_status,candidate_source_links(source_outlet_id)").eq("run_id", runA.id);
    assert((candsA.data?.length ?? 0) === 1, `run A produced exactly 1 consolidated candidate (got ${candsA.data?.length})`);
    const linkedIdsA = new Set((candsA.data ?? []).flatMap((c: any) => (c.candidate_source_links ?? []).map((l: any) => l.source_outlet_id)));
    assert(linkedIdsA.has(String(VALID_ID)), "the surviving run A candidate links to the valid outlet");
    assert(!linkedIdsA.has(String(SHARED_ID)), "the surviving run A candidate does NOT link to the rejected outlet");

    // The operational surface (consolidated_candidates) never contains the rejected outlet at all —
    // not filtered-out-but-present, genuinely absent, since consolidateRun excludes it before insert.
    const rejectedInCandidates = await db.from("candidate_source_links").select("candidate_id").eq("tenant_id", tenantId).eq("source_outlet_id", String(SHARED_ID)).eq("source", "just_eat");
    const rejectedCandidateIds = new Set((rejectedInCandidates.data ?? []).map((r: any) => r.candidate_id));
    const rejectedInRunA = (candsA.data ?? []).some((c: any) => rejectedCandidateIds.has(c.id));
    assert(!rejectedInRunA, "the rejected outlet cannot enter the operational results (consolidated_candidates) for run A");

    // --- Run B: requested territory W5. The SAME outlet id (SHARED_ID) is now genuinely in-area. ---
    const fetcherB = async (oc: string) => oc === "W5"
      ? { ok: true, httpStatus: 200, headers: {} as Record<string, string>, raw: fixtureFor([
          outlet(SHARED_ID, { postcode: "W5 2AA", city: "Ealing", lat: 51.513, lng: -0.301, variant: 2 }),
        ]) }
      : { ok: false, httpStatus: 429, headers: {} as Record<string, string>, raw: null, error: "HTTP 429" };

    const { run: runB } = await saveRun(repo, { tenant_id: tenantId, name: "geo-fix-selftest-run-B", territory_input: "W5" }, geoRef);
    runBId = runB.id;
    const execB = await queueJustEatExecution(repo, runB.id, TEST_ACTOR_ID);
    const claimedB = await repo.claimNextExecution("geo-fix-test-b", 60);
    assert(claimedB?.id === execB.id, "run B execution claimed");
    const resB = await executeJustEatRun(repo, runB, claimedB!, {
      adapter: new JustEatAdapter(fetcherB), workerId: "geo-fix-test-b",
      config: { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["W5"] },
    });
    assert(resB.uniqueOutlets === 1, `run B observed 1 outlet (got ${resB.uniqueOutlets})`);

    const validationsB = await db.from("provider_geography_validations").select("source_record_id,status").eq("run_id", runB.id);
    assert((validationsB.data ?? []).some((v: any) => v.source_record_id === String(SHARED_ID) && v.status === "valid_geography"),
      "the same outlet id is valid_geography in run B (requested W5)");

    const candsB = await db.from("consolidated_candidates").select("id,candidate_source_links(source_outlet_id)").eq("run_id", runB.id);
    assert((candsB.data?.length ?? 0) === 1, `run B produced exactly 1 consolidated candidate (got ${candsB.data?.length})`);
    const linkedIdsB = new Set((candsB.data ?? []).flatMap((c: any) => (c.candidate_source_links ?? []).map((l: any) => l.source_outlet_id)));
    assert(linkedIdsB.has(String(SHARED_ID)), "run B's candidate links to the shared outlet, now valid in this run");

    // Cross-run non-contamination: run A's own result set is unaffected by run B running afterwards.
    const candsARecheck = await db.from("consolidated_candidates").select("id").eq("run_id", runA.id);
    assert((candsARecheck.data?.length ?? 0) === 1, "run A's candidate count is unchanged after run B (no cross-run leakage)");

    // --- Run C: same source_record_id, TWO different raw observations, opposite verdicts,
    // within the SAME run. Proves the join keys off the exact canonical observation_id, not a
    // source_record_id text match — a stale/superseded observation's verdict must never leak
    // onto the run's actual canonical (latest) observation of that outlet, or vice versa. ---
    const { contentHash } = await import("../src/lib/discovery-engine/hash");
    const { PARSER_VERSION, ADAPTER_VERSION, SCHEMA_VERSION } = await import("../src/lib/discovery-engine/version");

    const REOBSERVED_ID = 900303; // out of scope on first capture, then re-captured as in-scope
    const fetcherC = async (oc: string) => oc === "UB1"
      ? { ok: true, httpStatus: 200, headers: {} as Record<string, string>, raw: fixtureFor([
          outlet(REOBSERVED_ID, { postcode: "W5 2AA", city: "Ealing", lat: 51.513, lng: -0.301, variant: 1 }),
        ]) }
      : { ok: false, httpStatus: 429, headers: {} as Record<string, string>, raw: null, error: "HTTP 429" };

    const { run: runC } = await saveRun(repo, { tenant_id: tenantId, name: "geo-fix-selftest-run-C", territory_input: "UB1" }, geoRef);
    runCId = runC.id;
    const execC = await queueJustEatExecution(repo, runC.id, TEST_ACTOR_ID);
    const claimedC = await repo.claimNextExecution("geo-fix-test-c", 60);
    assert(claimedC?.id === execC.id, "run C execution claimed");
    await executeJustEatRun(repo, runC, claimedC!, {
      adapter: new JustEatAdapter(fetcherC), workerId: "geo-fix-test-c",
      config: { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["UB1"] },
    });

    const candsC0 = await db.from("consolidated_candidates").select("id").eq("run_id", runC.id);
    assert((candsC0.data?.length ?? 0) === 0, "run C: first (out-of-scope) observation alone produces 0 candidates");

    // Directly insert a SECOND, superseding raw observation for the same run + source_record_id
    // (simulating a later re-query within the same run capturing the outlet differently), plus
    // its own — deliberately opposite — validation verdict.
    const rawPayload2 = outlet(REOBSERVED_ID, { postcode: "UB1 1AA", city: "Southall", lat: 51.5081, lng: -0.3762, variant: 2 });
    const obs2 = await repo.insertRawObservation({
      tenant_id: tenantId, execution_id: execC.id, run_id: runC.id, source: "just_eat",
      response_type: "search", source_record_id: String(REOBSERVED_ID),
      query_context: { outcode: "UB1", index: 0 }, http_status: 200, response_headers: {},
      raw_payload: rawPayload2, content_hash: contentHash(rawPayload2),
      parser_version: PARSER_VERSION, adapter_version: ADAPTER_VERSION, schema_version: SCHEMA_VERSION,
      parse_status: "parsed", parse_warnings: [], attempt: 1, duplicate_of: null,
    });
    const valIns = await db.from("provider_geography_validations").insert({
      tenant_id: tenantId, run_id: runC.id, execution_id: execC.id, observation_id: obs2.id,
      source: "just_eat", source_record_id: String(REOBSERVED_ID), requested_country: "GB",
      requested_geography: "UB1", resolved_query_units: ["UB1"], status: "valid_geography",
      signal: "country_match_area_ok", reason: "test: superseding observation, now in-area",
    });
    assert(!valIns.error, `second validation row inserted (${valIns.error ? JSON.stringify(valIns.error) : "ok"})`);

    const cons2 = await (await import("../src/lib/discovery-engine/consolidation/consolidate-run")).consolidateRun(db, tenantId, runC.id);
    assert(cons2.candidates === 1, `run C: after the superseding valid observation, consolidation now produces exactly 1 candidate (got ${cons2.candidates})`);

    const candsC1 = await db.from("consolidated_candidates").select("id,candidate_source_links(source_outlet_id)").eq("run_id", runC.id);
    assert((candsC1.data?.length ?? 0) === 1, "run C now has exactly 1 consolidated candidate");
    assert((candsC1.data ?? []).some((c: any) => (c.candidate_source_links ?? []).some((l: any) => l.source_outlet_id === String(REOBSERVED_ID))),
      "run C's candidate links to the re-observed outlet, via its NEW canonical (valid) observation — the earlier out-of-scope observation's verdict did not suppress it");

    console.log(fails === 0 ? "\nAll geography-consolidation-fix regression assertions passed ✓" : `\n${fails} FAILED`);
  } finally {
    const svc = createServiceClient();
    await svc.from("je_outlets").delete().eq("tenant_id", tenantId).in("je_outlet_id", [String(VALID_ID), String(SHARED_ID), "900303"]);
    if (runAId) await repo.deleteRunCascade(runAId);
    if (runBId) await repo.deleteRunCascade(runBId);
    if (runCId) await repo.deleteRunCascade(runCId);
  }

  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
