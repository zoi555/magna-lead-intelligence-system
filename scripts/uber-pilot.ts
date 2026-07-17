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

  const { uberEatsApifyFetcher } = await import("../src/lib/discovery-engine/providers/apify-fetcher");
  const { UberEatsAdapter } = await import("../src/lib/discovery-engine/uber-eats/adapter");
  const { consolidate } = await import("../src/lib/discovery-engine/consolidation/consolidate");
  const { persistConsolidation } = await import("../src/lib/discovery-engine/consolidation/persist");
  const { buildComparisonReport } = await import("../src/lib/discovery-engine/reports/comparison");
  const { contentHash } = await import("../src/lib/discovery-engine/hash");
  const { SCHEMA_VERSION, ADAPTER_VERSION, UBER_PARSER_VERSION } = await import("../src/lib/discovery-engine/version");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");

  console.log(`Uber Eats pilot: actor=${ACTOR} district=${DISTRICT} urls=${JSON.stringify(URLS)} address="${ADDRESS}" maxResults=${MAX_RESULTS} includeReviews=false (cap $0.25)`);
  const fetcher = uberEatsApifyFetcher(ACTOR, token, { maxResults: MAX_RESULTS, includeReviews: false, urls: URLS, address: ADDRESS });
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
  const obsIdBySourceId = new Map<string, string>();
  for (const o of outlets) {
    const rawRec = rawArr.find((r) => String(r?.uuid ?? r?.id ?? r?.storeUuid ?? "") === o.source_outlet_id) ?? o;
    const hash = contentHash(rawRec);
    const dup = await repo.findObservationByHash(tenantId, hash);
    const inserted = await repo.insertRawObservation({
      tenant_id: tenantId, execution_id: exec.id, run_id: run.id, source: "uber_eats", response_type: "search",
      source_record_id: o.source_outlet_id, query_context: { district: DISTRICT, provider: ACTOR },
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
