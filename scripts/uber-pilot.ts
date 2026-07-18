// Uber Eats CONTROLLED VALIDATION PILOT (Part 7). Tiny, capped, lawful via an authorised
// Apify actor. DOES NOT RUN unless APIFY_TOKEN is present in the local server environment.
//
//   npm run uber:pilot            # UB1, 10 results, ~$0.02 (well under the $0.25 cap)
//
// Config (product-owner approved):
//   actor    = sourabhbgp/ubereats-scraper (override: UBER_EATS_APIFY_ACTOR)
//   country  = GB   address = "UB1, United Kingdom"   mode = discover
//   maxResults = 10 (HARD cap → cost)   includeReviews = false
// Raw provider payloads are written to the scratchpad (OUTSIDE git). Server-side only —
// APIFY_TOKEN is never printed, committed, or exposed to browser code.

import { promises as fs } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ACTOR = process.env.UBER_EATS_APIFY_ACTOR ?? "sourabhbgp/ubereats-scraper";
const DISTRICT = "UB1";
const MAX_RESULTS = 10;
// Supported-input diagnostic (ISS-0018): the actor's `urls` field is REQUIRED — omitting it makes
// the actor fall back to its US near-me default. Anchor with a cuisine keyword + a full public UB1
// address so the search resolves to GB. Verified dry via `npm run uber:diagnostic-plan`.
const URLS = (process.env.UBER_EATS_URLS ?? "pizza").split(",").map((s) => s.trim()).filter(Boolean);
const ADDRESS = process.env.UBER_EATS_ADDRESS ?? "Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom";
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
  if (!token) {
    console.error("APIFY_TOKEN is not present in the local server environment — NOT executing the pilot (as instructed).");
    console.error("Add APIFY_TOKEN=<server-side token> to .env.local (never NEXT_PUBLIC_, never commit), then re-run `npm run uber:pilot`.");
    process.exit(2);
  }
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing Supabase service credentials."); process.exit(1); }

  const { buildUberEatsInput } = await import("../src/lib/discovery-engine/providers/apify-fetcher");
  const { createHttpApifyClient } = await import("../src/lib/discovery-engine/providers/apify-run");
  const { runApifyProvider, ResumableTimeoutError } = await import("../src/lib/discovery-engine/providers/apify-orchestrator");
  const { createProviderExecutionStore } = await import("../src/lib/discovery-engine/providers/provider-execution-store");
  const { parseUberEatsSearch } = await import("../src/lib/discovery-engine/uber-eats/parse");
  const { consolidate } = await import("../src/lib/discovery-engine/consolidation/consolidate");
  const { persistConsolidation } = await import("../src/lib/discovery-engine/consolidation/persist");
  const { buildComparisonReport } = await import("../src/lib/discovery-engine/reports/comparison");
  const { contentHash } = await import("../src/lib/discovery-engine/hash");
  const { SCHEMA_VERSION, ADAPTER_VERSION, UBER_PARSER_VERSION } = await import("../src/lib/discovery-engine/version");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");

  const input = buildUberEatsInput(DISTRICT, { maxResults: MAX_RESULTS, includeReviews: false, urls: URLS, address: ADDRESS });
  const inputFingerprint = contentHash(input);
  const estCost = MAX_RESULTS * 2 / 1000;
  console.log(`Uber Eats pilot: actor=${ACTOR} district=${DISTRICT}`);
  console.log("Sanitised execution plan (exact actor input):"); console.log(JSON.stringify(input, null, 2));
  console.log(`input_fingerprint=${inputFingerprint} estimated_max_cost=~$${estCost.toFixed(3)} (cap $0.25)`);

  const db = createServiceClient();
  const repo = new SupabaseRepository();
  const tenantId = await resolveDefaultTenantId();

  // Internal run + execution FIRST, so provenance links to them.
  const run = await repo.createRun({ tenant_id: tenantId, name: `uber-pilot: ${DISTRICT}`, territory_input: DISTRICT, derived_query_units: [DISTRICT], search_terms: [], target_filters: {}, requested_fields: [], source_config: { source: "uber_eats", provider: ACTOR, pilot: true }, config_snapshot: { input } });
  const exec = await repo.createExecution(run.id, tenantId, 1);

  // --- Provider execution with permanent provenance (idempotent; run id stored the instant it exists). ---
  const store = createProviderExecutionStore(db, { tenantId, runId: run.id, executionId: exec.id, provider: "apify" });
  const client = createHttpApifyClient(token, { timeoutMs: 90_000 });
  let provider: Awaited<ReturnType<typeof runApifyProvider>>;
  try {
    provider = await runApifyProvider({ client, store, actorId: ACTOR, input, inputFingerprint, maxRequestedResults: MAX_RESULTS, estimatedCostUsd: estCost, pricingModel: "PAY_PER_RESULT", timeoutMs: 180_000, pollIntervalMs: 3_000 });
  } catch (e) {
    if (e instanceof ResumableTimeoutError) {
      console.error(`⏳ Poll timeout. Apify run RECORDED and resumable — NO second run started. actor_run_id=${e.actorRunId}`);
      console.error(`   Re-run \`npm run uber:pilot\` to resume polling the SAME run (idempotent). Not marking success.`);
      await repo.finishExecution(exec.id, "failed", { metrics: { source: "uber_eats", business_status: "provider_poll_timeout", provider_run_id: e.actorRunId } });
      process.exit(4);
    }
    throw e;   // create/network error BEFORE a run id ⇒ no paid run created; safe to surface & retry
  }

  const runObj = provider.run;
  console.log(`Provider run: id=${runObj.runId} dataset=${runObj.datasetId} status=${runObj.status} resumed=${provider.resumed} usageUsd=${runObj.usageTotalUsd ?? "n/a"}`);

  if (!provider.ingested) {
    // Actor FAILED/ABORTED/TIMED-OUT → do NOT ingest, do NOT continue to any further paid source.
    console.error(`⛔ Actor did not succeed (status=${runObj.status}, ${runObj.statusMessage ?? "no message"}). No dataset ingested. HALT.`);
    await store.update(provider.provenanceId, { business_validation_status: "no_observations" });
    await repo.finishExecution(exec.id, "failed", { metrics: { source: "uber_eats", business_status: "actor_failed", actor_status: runObj.status, provider_run_id: runObj.runId } });
    process.exit(5);
  }

  const items = provider.items as Record<string, unknown>[];
  // retain raw provider payload OUTSIDE git (immutable audit evidence)
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(`${SCRATCH}/uber-${DISTRICT}.json`, JSON.stringify({ stores: items, provider_run_id: runObj.runId, dataset_id: runObj.datasetId }, null, 2));
  const outlets = parseUberEatsSearch({ stores: items }, new Date().toISOString());
  console.log(`Fetched ${items.length} dataset items → ${outlets.length} parsed outlets (raw saved to scratchpad, not git).`);
  const observedFields = [...new Set(items.flatMap((r) => Object.keys(r ?? {})))].sort();
  console.log("Actor fields observed:", observedFields.join(", "));
  if (!outlets.length) {
    await store.update(provider.provenanceId, { business_validation_status: "no_observations" });
    await repo.finishExecution(exec.id, "completed", { completedQueries: 1, plannedQueries: 1, metrics: { source: "uber_eats", outlets: 0, business_status: "no_observations", provider_run_id: runObj.runId } });
    console.log("No parseable outlets returned."); process.exit(0);
  }

  // persist immutable observations (source=uber_eats); content-hash dedup ⇒ re-reading the same
  // dataset never creates duplicate canonical observations.
  let obsCount = 0;
  const obsIdBySourceId = new Map<string, string>();
  for (const o of outlets) {
    const rawRec = items.find((r) => String(r?.uuid ?? r?.id ?? r?.storeUuid ?? "") === o.source_outlet_id) ?? (o as unknown as Record<string, unknown>);
    const hash = contentHash(rawRec);
    const dup = await repo.findObservationByHash(tenantId, hash);
    const inserted = await repo.insertRawObservation({
      tenant_id: tenantId, execution_id: exec.id, run_id: run.id, source: "uber_eats", response_type: "search",
      source_record_id: o.source_outlet_id, query_context: { district: DISTRICT, provider: ACTOR, provider_run_id: runObj.runId, dataset_id: runObj.datasetId },
      http_status: 200, raw_payload: rawRec, content_hash: hash, parser_version: UBER_PARSER_VERSION,
      adapter_version: ADAPTER_VERSION, schema_version: SCHEMA_VERSION, parse_status: "parsed", parse_warnings: [], attempt: 1,
      duplicate_of: dup?.id ?? null,
    });
    if (inserted?.id) obsIdBySourceId.set(o.source_outlet_id, inserted.id);
    obsCount++;
  }

  // --- Geography validation gate: quarantine wrong-geography records BEFORE consolidation. ---
  const { partitionByGeography } = await import("../src/lib/discovery-engine/geography/provider-geography-gate");
  const { persistGeographyValidations } = await import("../src/lib/discovery-engine/geography/persist-geography");
  const geoCtx = { requestedCountry: "GB", geographySelection: DISTRICT, resolvedQueryUnits: [DISTRICT] };
  const part = partitionByGeography(outlets, geoCtx);
  await persistGeographyValidations(db, { tenantId, runId: run.id, executionId: exec.id, source: "uber_eats", ctx: geoCtx, verdicts: part.verdicts, observationIdBySourceId: obsIdBySourceId });

  // Record the business-validation verdict on the provider execution (SEPARATE from actor status).
  await store.update(provider.provenanceId, { business_validation_status: part.runStatus.status });

  // Business-validation status is kept SEPARATE from the actor/execution technical status.
  await repo.finishExecution(exec.id, "completed", { completedQueries: 1, plannedQueries: 1, metrics: {
    source: "uber_eats", outlets: outlets.length,
    geography_validation: { requested_country: "GB", requested_units: [DISTRICT], valid: part.runStatus.valid, out_of_scope: part.runStatus.outOfScope, unverifiable: part.runStatus.unverifiable, hard_country_mismatch: part.runStatus.hardCountryMismatch },
    business_status: part.runStatus.status,   // geography_validated | provider_succeeded_validation_failed | no_observations
  } });

  // ONLY geography-valid outlets proceed to consolidation / coverage / exports.
  const candidates = consolidate(part.valid);
  const report = buildComparisonReport({ just_eat: [], uber_eats: part.valid, deliveroo: [] } as any, candidates);
  if (candidates.length) await persistConsolidation(db, tenantId, run.id, candidates, report);

  const cov = report.sources.find((s) => s.source === "uber_eats")!.coverage;
  const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;

  // Geography audit: the actor's `discover` mode has been observed to resolve a UK address to a
  // US default location — surface the actual country/postcode distribution so a wrong-geography
  // run is never mistaken for UK UB1 coverage.
  const countries: Record<string, number> = {};
  let ukPostcodes = 0, sourcePostcodes = 0;
  for (const o of outlets) {
    const c = String((o.source_extra as any)?.address_country ?? "?"); countries[c] = (countries[c] ?? 0) + 1;
    if ((o.source_extra as any)?.source_postcode) sourcePostcodes++;
    if (o.postcode) ukPostcodes++;
  }
  const scrapedFrom = [...new Set(outlets.map((o) => String((o.source_extra as any)?.scraped_from ?? "?")))];

  console.log(`\n--- Uber pilot result (UB1) — parser ${UBER_PARSER_VERSION} ---`);
  console.log(`provider execution: internal_run=${run.id} execution=${exec.id} provenance=${provider.provenanceId}`);
  console.log(`  actor_run_id=${runObj.runId} dataset_id=${runObj.datasetId} actor_id=${runObj.actorId ?? ACTOR} build=${runObj.buildTag ?? runObj.buildId ?? "n/a"}`);
  console.log(`  actor_status=${runObj.status} started=${runObj.startedAt ?? "n/a"} finished=${runObj.finishedAt ?? "n/a"} usageUsd=${runObj.usageTotalUsd ?? "n/a"} charged=${runObj.chargedResultCount ?? "n/a"} ref=${provider.run.runId ? "https://console.apify.com/actors/runs/" + runObj.runId : "n/a"}`);
  console.log(`observations=${obsCount} outlets=${outlets.length} (raw evidence retained, immutable)`);
  console.log(`geography validation: valid=${part.runStatus.valid} out_of_scope=${part.runStatus.outOfScope} unverifiable=${part.runStatus.unverifiable} → business_status=${part.runStatus.status}`);
  console.log(`geography: country distribution=${JSON.stringify(countries)} scrapedFrom=${JSON.stringify(scrapedFrom)}`);
  console.log(`postcodes: raw supplied=${sourcePostcodes}/${outlets.length}, valid UK=${ukPostcodes}/${outlets.length}`);
  console.log(`OPERATIONAL (geography-valid only): candidates=${candidates.length} — wrong-geography records EXCLUDED from consolidation/coverage/exports.`);
  console.log(`coverage(valid only): postcode(UK)=${pct(cov.full_postcode)} coords=${pct(cov.coordinates)} rating=${pct(cov.review_score)} ratingCount=${pct(cov.review_count)} cuisine=${pct(cov.cuisine)}`);
  console.log(`          delivery=${pct(cov.delivery)} deliveryFee=${pct(cov.delivery_fee)} eta=${pct(cov.eta)} phone(UK)=${pct(cov.phone)} hours=${pct(cov.opening_hours)} menu=${pct(cov.menu)} promotion=${pct(cov.promotion)} media=${pct(cov.media)}`);
  console.log(`Estimated cost: ~$${(outlets.length * 2 / 1000).toFixed(3)} (${outlets.length} × $2/1k) — cap $0.25.`);

  if (part.runStatus.status === "provider_succeeded_validation_failed") {
    console.log(`\n⛔ GEOGRAPHY VALIDATION FAILED: the actor returned records but ${part.runStatus.hardCountryMismatch ? "from the WRONG COUNTRY" : "none within the requested UK geography"}.`);
    console.log(`   The actor technically succeeded; business validation did NOT. Records are quarantined as immutable evidence and excluded from operational use.`);
    console.log(`   HALT: not continuing to any further paid source. See ISS-0018 / docs/65 and the supported-input diagnostic (npm run uber:diagnostic-plan).`);
    process.exit(3);   // distinct non-zero code: provider succeeded, business validation failed
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
