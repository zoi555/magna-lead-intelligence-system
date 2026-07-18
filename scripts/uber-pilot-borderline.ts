// Uber Eats REPLACEMENT-provider bounded diagnostic — borderline/uber-eats-scraper-ppr.
// ONE paid run (10 rows, ~$0.05, cap $0.25). Reuses the generic Apify provenance/orchestrator seam,
// the geography-validation gate and consolidation. Resume-safe (no duplicate charge). DOES NOT RUN
// without APIFY_TOKEN. Server-side only — token never printed/committed.

import { promises as fs } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const PROVIDER_ID = "uber_eats_borderline_ppr";
const DISTRICT = "UB1";
const ADDRESS = process.env.UBER_EATS_ADDRESS ?? "Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom";
const QUERY = process.env.UBER_EATS_QUERY ?? "pizza";
const MAX_ROWS = 10;
const SCRATCH = "/private/tmp/claude-501/-Users-homemac-Projects-magna-lead-intelligence-system/ecfebd28-c44e-4d10-850a-4175d6a0fad6/scratchpad/uber-pilot-raw";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try { const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
    } catch { /* absent */ }
  }
}

async function main() {
  await loadDotEnv();
  const token = process.env.APIFY_TOKEN;
  if (!token) { console.error("APIFY_TOKEN not present — NOT executing (as instructed)."); process.exit(2); }

  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing Supabase service credentials."); process.exit(1); }

  const { PROVIDER_REGISTRY, assertPayPerResult } = await import("../src/lib/discovery-engine/providers/provider-registry");
  const { buildBorderlineInput } = await import("../src/lib/discovery-engine/providers/borderline-input");
  const { createHttpApifyClient } = await import("../src/lib/discovery-engine/providers/apify-run");
  const { runApifyProvider, ResumableTimeoutError } = await import("../src/lib/discovery-engine/providers/apify-orchestrator");
  const { createProviderExecutionStore } = await import("../src/lib/discovery-engine/providers/provider-execution-store");
  const { parseBorderlineSearch } = await import("../src/lib/discovery-engine/uber-eats/parse-borderline");
  const { partitionByGeography } = await import("../src/lib/discovery-engine/geography/provider-geography-gate");
  const { persistGeographyValidations } = await import("../src/lib/discovery-engine/geography/persist-geography");
  const { analyseBorderline, printBorderlineReport } = await import("../src/lib/discovery-engine/providers/borderline-diagnostic");
  const { consolidate } = await import("../src/lib/discovery-engine/consolidation/consolidate");
  const { persistConsolidation } = await import("../src/lib/discovery-engine/consolidation/persist");
  const { buildComparisonReport } = await import("../src/lib/discovery-engine/reports/comparison");
  const { contentHash } = await import("../src/lib/discovery-engine/hash");
  const { SCHEMA_VERSION, ADAPTER_VERSION, UBER_BORDERLINE_PARSER_VERSION } = await import("../src/lib/discovery-engine/version");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");

  // Guard: pay-per-result actor only (never a rental actor), resolved from the registry.
  const provider = assertPayPerResult(PROVIDER_ID);
  const ACTOR = provider.actorId;

  const input = buildBorderlineInput({ address: ADDRESS, query: QUERY, maxRows: MAX_ROWS });
  const inputFingerprint = contentHash(input);
  const estCost = MAX_ROWS * 5 / 1000;   // $5 / 1,000 restaurants

  // Pre-flight assertions on the EXACT input.
  const fail = (m: string) => { console.error(`ABORT: ${m}`); process.exit(6); };
  if (ACTOR !== "borderline/uber-eats-scraper-ppr") fail(`actor is ${ACTOR}`);
  if (provider.pricingModel !== "PAY_PER_RESULT") fail("not a pay-per-result actor");
  if (input.locale !== "en-GB") fail("locale");
  if (input.address !== ADDRESS) fail("address changed");
  if (input.addressCountry !== "GB") fail("addressCountry");
  if (input.storeType !== "RESTAURANTS") fail("storeType");
  if (input.maxRows !== 10) fail("maxRows");
  if ((input as any).urls) fail("store urls must not be supplied");
  if (input.getMenuCustomizations !== false) fail("menu customisations must be off");
  if (estCost >= 0.25) fail(`estimated cost $${estCost} not below cap`);

  console.log(`Borderline diagnostic: provider=${PROVIDER_ID} actor=${ACTOR} (${provider.pricingModel})`);
  console.log("Sanitised execution plan (exact actor input):"); console.log(JSON.stringify(input, null, 2));
  console.log(`input_fingerprint=${inputFingerprint} estimated_max_cost=~$${estCost.toFixed(3)} (cap $0.25)`);

  const db = createServiceClient();
  const repo = new SupabaseRepository();
  const tenantId = await resolveDefaultTenantId();

  // Resume-safe internal run/exec (reuse if a paid run for this input is already in flight).
  const inflight = await db.from("provider_executions").select("run_id, execution_id, actor_run_id")
    .eq("tenant_id", tenantId).eq("actor_id", ACTOR).eq("input_fingerprint", inputFingerprint)
    .in("actor_status", ["READY", "RUNNING", "UNKNOWN"]).not("actor_run_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let run: { id: string }, exec: { id: string };
  if (inflight.data?.run_id && inflight.data?.execution_id) {
    run = { id: inflight.data.run_id as string }; exec = { id: inflight.data.execution_id as string };
    console.log(`↻ Resuming in-flight run ${inflight.data.actor_run_id} — reusing internal run ${run.id}/exec ${exec.id} (NO new paid run).`);
  } else {
    const created = await repo.createRun({ tenant_id: tenantId, name: `uber-borderline-pilot: ${DISTRICT}`, territory_input: DISTRICT, derived_query_units: [DISTRICT], search_terms: [QUERY], target_filters: {}, requested_fields: [], source_config: { source: "uber_eats", provider: PROVIDER_ID, actor: ACTOR, pilot: true }, config_snapshot: { input } });
    const execRec = await repo.createExecution(created.id, tenantId, 1);
    run = { id: created.id }; exec = { id: execRec.id };
  }

  const store = createProviderExecutionStore(db, { tenantId, runId: run.id, executionId: exec.id, provider: "apify" });
  const client = createHttpApifyClient(token, { timeoutMs: 90_000 });
  let providerRes: Awaited<ReturnType<typeof runApifyProvider>>;
  try {
    providerRes = await runApifyProvider({ client, store, actorId: ACTOR, input, inputFingerprint, maxRequestedResults: MAX_ROWS, estimatedCostUsd: estCost, pricingModel: "PAY_PER_RESULT", timeoutMs: 180_000, pollIntervalMs: 3_000 });
  } catch (e) {
    if (e instanceof ResumableTimeoutError) {
      console.error(`⏳ Poll timeout. Run RECORDED and resumable — NO second run. actor_run_id=${e.actorRunId}. Re-run to resume.`);
      await repo.finishExecution(exec.id, "failed", { metrics: { source: "uber_eats", provider: PROVIDER_ID, business_status: "provider_poll_timeout", provider_run_id: e.actorRunId } });
      process.exit(4);
    }
    throw e;
  }

  const runObj = providerRes.run;
  console.log(`Provider run: id=${runObj.runId} dataset=${runObj.datasetId} status=${runObj.status} resumed=${providerRes.resumed} usageUsd=${runObj.usageTotalUsd ?? "n/a"} charged=${runObj.chargedResultCount ?? "n/a"}`);

  if (!providerRes.ingested) {
    console.error(`⛔ Actor did not succeed (status=${runObj.status}). No ingestion. HALT.`);
    await store.update(providerRes.provenanceId, { business_validation_status: "no_observations" });
    await repo.finishExecution(exec.id, "failed", { metrics: { source: "uber_eats", provider: PROVIDER_ID, business_status: "actor_failed", actor_status: runObj.status, provider_run_id: runObj.runId } });
    process.exit(5);
  }

  const items = providerRes.items as Record<string, unknown>[];
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(`${SCRATCH}/uber-borderline-${DISTRICT}.json`, JSON.stringify({ stores: items, provider_run_id: runObj.runId, dataset_id: runObj.datasetId }, null, 2));
  const outlets = parseBorderlineSearch({ stores: items }, new Date().toISOString());
  console.log(`Fetched ${items.length} dataset items → ${outlets.length} parsed outlets (raw saved to scratchpad, not git).`);
  console.log("Actor fields observed:", [...new Set(items.flatMap((r) => Object.keys(r ?? {})))].sort().join(", "));

  // immutable observations (content-hash dedup ⇒ re-read never duplicates canonical)
  let obsCount = 0;
  const obsIdBySourceId = new Map<string, string>();
  for (const o of outlets) {
    const rawRec = items.find((r) => String(r?.uuid ?? r?.id ?? "") === o.source_outlet_id) ?? (o as unknown as Record<string, unknown>);
    const hash = contentHash(rawRec);
    const dup = await repo.findObservationByHash(tenantId, hash);
    const inserted = await repo.insertRawObservation({
      tenant_id: tenantId, execution_id: exec.id, run_id: run.id, source: "uber_eats", response_type: "search",
      source_record_id: o.source_outlet_id, query_context: { district: DISTRICT, provider: PROVIDER_ID, actor: ACTOR, provider_run_id: runObj.runId, dataset_id: runObj.datasetId },
      http_status: 200, raw_payload: rawRec, content_hash: hash, parser_version: UBER_BORDERLINE_PARSER_VERSION,
      adapter_version: ADAPTER_VERSION, schema_version: SCHEMA_VERSION, parse_status: "parsed", parse_warnings: [], attempt: 1,
      duplicate_of: dup?.id ?? null,
    });
    if (inserted?.id) obsIdBySourceId.set(o.source_outlet_id, inserted.id);
    obsCount++;
  }

  const geoCtx = { requestedCountry: "GB", geographySelection: DISTRICT, resolvedQueryUnits: [DISTRICT] };
  const fidelityCtx = { targetDistrict: DISTRICT };
  const analysis = analyseBorderline(outlets, geoCtx, fidelityCtx);
  const part = analysis.part;

  await persistGeographyValidations(db, { tenantId, runId: run.id, executionId: exec.id, source: "uber_eats", ctx: geoCtx, verdicts: part.verdicts, observationIdBySourceId: obsIdBySourceId });
  await store.update(providerRes.provenanceId, { business_validation_status: part.runStatus.status });
  await repo.finishExecution(exec.id, "completed", { completedQueries: 1, plannedQueries: 1, metrics: {
    source: "uber_eats", provider: PROVIDER_ID, provider_run_id: runObj.runId, outlets: outlets.length,
    geography_validation: { valid: part.runStatus.valid, out_of_scope: part.runStatus.outOfScope, unverifiable: part.runStatus.unverifiable },
    location_fidelity: analysis.fidelity.summary, business_status: part.runStatus.status,
  } });

  // ONLY business-valid (in-UB1) outlets proceed to consolidation. near_target NEVER enters.
  const candidates = consolidate(part.valid);
  const report = buildComparisonReport({ just_eat: [], uber_eats: part.valid, deliveroo: [] } as any, candidates);
  if (candidates.length) await persistConsolidation(db, tenantId, run.id, candidates, report);

  console.log(`\n--- Borderline diagnostic (UB1) — parser ${UBER_BORDERLINE_PARSER_VERSION} ---`);
  console.log(`provider execution: internal_run=${run.id} execution=${exec.id} provenance=${providerRes.provenanceId}`);
  console.log(`  actor_run_id=${runObj.runId} dataset_id=${runObj.datasetId} actor_id=${runObj.actorId ?? ACTOR} build=${runObj.buildTag ?? runObj.buildId ?? "n/a"} status=${runObj.status} usageUsd=${runObj.usageTotalUsd ?? "n/a"} charged=${runObj.chargedResultCount ?? "n/a"}`);
  console.log(`observations=${obsCount} (immutable). OPERATIONAL candidates (business-valid only)=${candidates.length}.`);
  printBorderlineReport(analysis, geoCtx);
  console.log(`Estimated cost: ~$${estCost.toFixed(3)} (${MAX_ROWS} × $5/1k) — cap $0.25.`);

  if (part.runStatus.status === "provider_succeeded_validation_failed") {
    console.log(`\n⛔ BUSINESS GEOGRAPHY VALIDATION FAILED: no records within ${DISTRICT}. Actor technically succeeded; quarantined as immutable evidence. HALT — no further paid source.`);
    process.exit(3);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
