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

  const { uberEatsApifyFetcher } = await import("../src/lib/discovery-engine/providers/apify-fetcher");
  const { UberEatsAdapter } = await import("../src/lib/discovery-engine/uber-eats/adapter");
  const { consolidate } = await import("../src/lib/discovery-engine/consolidation/consolidate");
  const { persistConsolidation } = await import("../src/lib/discovery-engine/consolidation/persist");
  const { buildComparisonReport } = await import("../src/lib/discovery-engine/reports/comparison");
  const { contentHash } = await import("../src/lib/discovery-engine/hash");
  const { SCHEMA_VERSION, ADAPTER_VERSION } = await import("../src/lib/discovery-engine/version");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");

  console.log(`Uber Eats pilot: actor=${ACTOR} district=${DISTRICT} maxResults=${MAX_RESULTS} includeReviews=false (cap $0.25)`);
  const fetcher = uberEatsApifyFetcher(ACTOR, token, { maxResults: MAX_RESULTS, includeReviews: false });
  const adapter = new UberEatsAdapter(fetcher);
  const res = await adapter.executeQuery({ code: DISTRICT, index: 0 }, { enabled: true, maxCallsPerRun: 1, requestDelayMs: 0, queryUnits: [DISTRICT] });
  if (!res.ok) { console.error("Provider run failed:", res.error); process.exit(1); }

  // retain raw provider payload OUTSIDE git (immutable audit evidence)
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(`${SCRATCH}/uber-${DISTRICT}.json`, JSON.stringify(res.raw, null, 2));
  const outlets = res.outlets.map((o) => ({ ...o, observed_at: new Date().toISOString() }));
  console.log(`Fetched ${outlets.length} Uber Eats outlets (raw saved to scratchpad, not git).`);
  if (!outlets.length) { console.log("No outlets returned — check the actor's field mapping (calibration)."); process.exit(0); }

  // observed field names across the raw records (which fields the actor supplies)
  const rawArr = ((res.raw as { stores?: unknown[] })?.stores ?? []) as Record<string, unknown>[];
  const observedFields = [...new Set(rawArr.flatMap((r) => Object.keys(r ?? {})))].sort();
  console.log("Actor fields observed:", observedFields.join(", "));

  const db = createServiceClient();
  const repo = new SupabaseRepository();
  const tenantId = await resolveDefaultTenantId();

  // persist as immutable observations (source=uber_eats) under a pilot run/execution
  const run = await repo.createRun({ tenant_id: tenantId, name: `uber-pilot: ${DISTRICT}`, territory_input: DISTRICT, derived_query_units: [DISTRICT], search_terms: [], target_filters: {}, requested_fields: [], source_config: { source: "uber_eats", provider: ACTOR, pilot: true }, config_snapshot: {} });
  const exec = await repo.createExecution(run.id, tenantId, 1);
  let obsCount = 0;
  for (const o of outlets) {
    const rawRec = rawArr.find((r) => String(r?.uuid ?? r?.id ?? r?.storeUuid ?? "") === o.source_outlet_id) ?? o;
    const hash = contentHash(rawRec);
    const dup = await repo.findObservationByHash(tenantId, hash);
    await repo.insertRawObservation({
      tenant_id: tenantId, execution_id: exec.id, run_id: run.id, source: "uber_eats", response_type: "search",
      source_record_id: o.source_outlet_id, query_context: { district: DISTRICT, provider: ACTOR },
      http_status: 200, raw_payload: rawRec, content_hash: hash, parser_version: "uber-eats-parse-1.0.0",
      adapter_version: ADAPTER_VERSION, schema_version: SCHEMA_VERSION, parse_status: "parsed", parse_warnings: [], attempt: 1,
      duplicate_of: dup?.id ?? null,
    });
    obsCount++;
  }
  await repo.finishExecution(exec.id, "completed", { completedQueries: 1, plannedQueries: 1, metrics: { source: "uber_eats", outlets: outlets.length } });

  const candidates = consolidate(outlets);
  const report = buildComparisonReport({ just_eat: [], uber_eats: outlets, deliveroo: [] } as any, candidates);
  await persistConsolidation(db, tenantId, run.id, candidates, report);

  const cov = report.sources.find((s) => s.source === "uber_eats")!.coverage;
  console.log(`\n--- Uber pilot result (UB1) ---`);
  console.log(`observations=${obsCount} outlets=${outlets.length} candidates=${candidates.length}`);
  console.log(`coverage: postcode=${cov.full_postcode} coords=${cov.coordinates} rating=${cov.review_score} cuisine=${cov.cuisine} delivery=${cov.delivery} phone=${cov.phone}`);
  console.log(`Estimated cost: ~$${(outlets.length * 2 / 1000).toFixed(3)} (${outlets.length} × $2/1k).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
