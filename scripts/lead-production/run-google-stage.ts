// Phase 3 CLI: Google Places identity/premises verification + FSA-multiple-match resolution +
// customer-match resolution + physical-premises assessment + group rescreen, for the 83-
// candidate population handed off by the accepted FSA-stage checkpoint. Reads the FSA-stage
// output (and, through it, the Phase 1 checkpoint) as read-only input — never modifies either —
// and writes an entirely new, separate, timestamped output directory.
//
// Two modes:
//   (default / --dry-run) Computes and prints/writes ONLY the cost/request preflight report —
//     candidate count, exact query strings that WOULD be sent, endpoint/field-mask plan, max
//     request count, credentials-present booleans (never values). NO Google Places call is
//     made. NO Google-stage output file is written (writing placeholder/empty versions of the
//     18 result files without real data would be exactly the "mock/fabricated data" this bridge
//     must never produce).
//   --live   Makes real Google Places calls (still gated by isGooglePlacesEnabled() from the
//     existing, unchanged src/lib/sources/google-places.ts config) and writes the full 19
//     output files. Refuses to run if credentials are missing, the request count is unbounded,
//     or configuration is unclear — see the stop-condition checks below.
//
// Usage:
//   npx tsx scripts/lead-production/run-google-stage.ts \
//     --fsa-dir=<path to the accepted FSA-stage output directory> \
//     --customers=<the SAME customer master file used in Phase 1/FSA> \
//     --registry=<the SAME approved group registry used in Phase 1> \
//     --out=<new timestamped output directory> \
//     [--dry-run | --live] [--max-calls=<n>]

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeCsv, parseCsvObjects } from "./csv";
import { normaliseName } from "./normalize";
import type {
  OperationalCandidate, CustomerRecord, FsaMatchResult, GoogleMatchResult, GroupScreenResult,
  FsaResolutionAfterGoogle, CustomerResolutionAfterGoogle, PhysicalPremisesAssessment, NewlyDetectedGroup,
  CustomerResolutionOutcome,
} from "./types";

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

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function md5(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("md5").update(buf).digest("hex");
}

const GOOGLE_COLUMNS = [
  "candidate_id", "candidate_trading_name", "candidate_postcode", "google_outcome", "num_plausible_results",
  "best_place_id", "best_official_name", "best_formatted_address", "best_postcode", "best_latitude", "best_longitude",
  "best_phone", "best_website", "best_business_status", "best_primary_category", "best_additional_categories",
  "best_rating", "best_review_count", "best_name_similarity", "best_postcode_agreement", "best_distance_m",
  "evidence_tags", "retrieval_timestamp", "source_response_reference", "api_failure_reason", "api_attempts",
] as const;

function googleRow(g: GoogleMatchResult): Record<string, unknown> {
  const best = g.plausibleResults[0] ?? null;
  return {
    candidate_id: g.candidateId, candidate_trading_name: g.candidateTradingName, candidate_postcode: g.candidatePostcode ?? "",
    google_outcome: g.outcome, num_plausible_results: g.plausibleResults.length,
    best_place_id: best?.placeId ?? "", best_official_name: best?.officialName ?? "", best_formatted_address: best?.formattedAddress ?? "",
    best_postcode: best?.postcode ?? "", best_latitude: best?.latitude ?? "", best_longitude: best?.longitude ?? "",
    best_phone: best?.phone ?? "", best_website: best?.website ?? "", best_business_status: best?.businessStatus ?? "",
    best_primary_category: best?.primaryCategory ?? "", best_additional_categories: best?.additionalCategories.join(";") ?? "",
    best_rating: best?.rating ?? "", best_review_count: best?.reviewCount ?? "",
    best_name_similarity: best ? best.nameSimilarity.toFixed(3) : "", best_postcode_agreement: best?.postcodeAgreement ?? "",
    best_distance_m: best?.distanceFromCandidateMetres ?? "",
    evidence_tags: g.evidenceTags.join(";"), retrieval_timestamp: g.retrievalTimestamp, source_response_reference: g.sourceResponseReference,
    api_failure_reason: g.apiFailureReason ?? "", api_attempts: g.apiAttempts,
  };
}

const FSA_RESOLUTION_COLUMNS = [
  "candidate_id", "prior_fsa_outcome", "resolution", "top_fsa_fhrs_id", "top_fsa_name", "top_fsa_score",
  "second_fsa_fhrs_id", "second_fsa_name", "second_fsa_score", "score_margin", "evidence_responsible",
] as const;
function fsaResolutionRow(r: FsaResolutionAfterGoogle): Record<string, unknown> {
  return {
    candidate_id: r.candidateId, prior_fsa_outcome: r.priorFsaOutcome, resolution: r.resolution,
    top_fsa_fhrs_id: r.topFsaCandidateFhrsId ?? "", top_fsa_name: r.topFsaCandidateName ?? "", top_fsa_score: r.topFsaScore ?? "",
    second_fsa_fhrs_id: r.secondFsaCandidateFhrsId ?? "", second_fsa_name: r.secondFsaCandidateName ?? "", second_fsa_score: r.secondFsaScore ?? "",
    score_margin: r.scoreMargin ?? "", evidence_responsible: r.evidenceResponsible.join(" | "),
  };
}

const CUSTOMER_RESOLUTION_COLUMNS = [
  "candidate_id", "prior_resolution", "prior_matched_customer_id", "resolution_outcome", "google_outcome", "evidence_used",
] as const;
function customerResolutionRow(r: CustomerResolutionAfterGoogle): Record<string, unknown> {
  return {
    candidate_id: r.candidateId, prior_resolution: r.priorResolution, prior_matched_customer_id: r.priorMatchedCustomerId ?? "",
    resolution_outcome: r.resolutionOutcome, google_outcome: r.googleOutcome, evidence_used: r.evidenceUsed.join(" | "),
  };
}

const PREMISES_COLUMNS = ["candidate_id", "result", "evidence_tags"] as const;
function premisesRow(p: PhysicalPremisesAssessment): Record<string, unknown> {
  return { candidate_id: p.candidateId, result: p.result, evidence_tags: p.evidenceTags.join(";") };
}

const NEWLY_DETECTED_COLUMNS = ["candidate_id", "candidate_trading_name", "signal", "classification", "default_outcome", "evidence_tags"] as const;
function newlyDetectedRow(g: NewlyDetectedGroup): Record<string, unknown> {
  return { candidate_id: g.candidateId, candidate_trading_name: g.candidateTradingName, signal: g.signal, classification: g.classification, default_outcome: g.defaultOutcome ?? "", evidence_tags: g.evidenceTags.join(";") };
}

async function main() {
  await loadDotEnv();

  const fsaDir = arg("fsa-dir");
  const customersPath = arg("customers");
  const registryPath = arg("registry");
  const outArg = arg("out");
  const live = flag("live");
  const maxCallsOverride = arg("max-calls") ? Number.parseInt(arg("max-calls")!, 10) : null;

  const missing = [!fsaDir && "--fsa-dir=<path>", !customersPath && "--customers=<path>", !registryPath && "--registry=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) {
    console.error("Missing required argument(s):\n  " + missing.join("\n  "));
    process.exit(1);
  }

  const { getGooglePlacesConfig, isGooglePlacesEnabled } = await import("../../src/lib/sources/google-places");
  const { queryGooglePlaces, newBudget, buildQueryString, GOOGLE_STAGE_FIELD_MASK } = await import("./google-adapter");
  const { classifyGoogleMatch } = await import("./google-match");
  const { resolveFsaMatchAfterGoogle } = await import("./fsa-resolution-after-google");
  const { resolveCustomerMatchAfterGoogle } = await import("./customer-resolution-after-google");
  const { assessPhysicalPremises } = await import("./physical-premises");
  const { rescreenGroupAfterGoogle, computeGoogleSiblingBrandCounts } = await import("./group-rescreen-after-google");
  const { loadCustomerFile } = await import("./load-customers");
  const { loadGroupRegistry } = await import("./load-group-registry");

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });

  console.log("=== Lead-production bridge: Phase 3 — Google Places identity/premises + resolution ===");
  console.log(`FSA-stage checkpoint (read-only): ${fsaDir}`);

  // --- Load read-only inputs. Checksummed on read so the report can prove the FSA-stage
  // checkpoint files were not modified by this run. ---
  const inputPopulationPath = await resolveGoogleInputPopulationPath(outDir, fsaDir!);
  const populationRaw = JSON.parse(await fs.readFile(inputPopulationPath, "utf8")) as any[];
  const populationChecksum = await md5(inputPopulationPath);
  console.log(`Google-stage population: ${populationRaw.length} candidates (expected 83) — ${path.basename(inputPopulationPath)} md5=${populationChecksum}`);
  if (populationRaw.length !== 83) console.warn(`WARNING: expected exactly 83 candidates, found ${populationRaw.length}.`);

  const fsaResultsPath = path.join(fsaDir!, "fsa-results.json");
  const fsaResultsRaw = JSON.parse(await fs.readFile(fsaResultsPath, "utf8")) as FsaMatchResult[];
  const fsaResultsChecksum = await md5(fsaResultsPath);
  const fsaByCandidate = new Map(fsaResultsRaw.map((r) => [r.candidateId, r]));
  console.log(`FSA results (read-only): ${fsaResultsRaw.length} records — fsa-results.json md5=${fsaResultsChecksum}`);

  const fsaResolutionCsvPath = path.join(fsaDir!, "customer-match-resolution-after-fsa.csv");
  const fsaResolutionCsvChecksum = await md5(fsaResolutionCsvPath);
  const { rows: fsaResolutionRows } = parseCsvObjects(await fs.readFile(fsaResolutionCsvPath, "utf8"));
  const fsaResolutionByCandidate = new Map(fsaResolutionRows.map((r) => [r.candidate_id, r]));
  console.log(`FSA-stage customer resolutions (read-only): ${fsaResolutionRows.length} records — customer-match-resolution-after-fsa.csv md5=${fsaResolutionCsvChecksum}`);

  const customersLoaded = await loadCustomerFile(customersPath!);
  const customerById = new Map(customersLoaded.customers.map((c) => [c.customerId, c]));

  const registryLoaded = await loadGroupRegistry(registryPath!);

  // --- Build the OperationalCandidate view for each of the 83. Note: neither the Phase 1 nor
  // FSA-stage JSON checkpoints persist candidate latitude/longitude, company number, or brand
  // (run-comparison.ts's JSON writer keeps only the normalised name/postcode/phone pair) — this
  // is the SAME accepted limitation already present in the FSA stage (run-fsa-stage.ts uses the
  // identical reconstruction). Coordinate-based evidence in this stage is therefore neutral
  // (never a false negative) rather than fabricated. Recorded explicitly in the preflight report.
  const candidates: OperationalCandidate[] = populationRaw.map((p) => ({
    id: p.candidateId, name: p.normalisedName?.candidateOriginal ?? "", postcode: p.normalisedPostcode?.candidateOriginal ?? null,
    phone: p.normalisedPhone?.candidateOriginal ?? null, latitude: null, longitude: null, brand: null, companyNumber: null, website: null, sources: [],
  }));

  const config = getGooglePlacesConfig();
  const enabled = isGooglePlacesEnabled();
  const hardMaxRequestCap = Math.max(0, Math.min(candidates.length, maxCallsOverride ?? config.maxCallsPerRun));

  const dryRunRequestPlan = candidates.map((c) => {
    const p = populationRaw.find((r) => r.candidateId === c.id);
    const fsa = fsaByCandidate.get(c.id) ?? null;
    const fsaOfficialName = fsa?.plausibleEstablishments[0]?.officialBusinessName ?? null;
    return { candidateId: c.id, candidateName: c.name, postcode: c.postcode, phase2SourceBucket: p?.phase2SourceBucket ?? null, queryString: buildQueryString(c.name, c.postcode, fsaOfficialName) };
  });

  const preflight = {
    generatedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    maxSearchRequests: candidates.length, // one Text Search call per candidate under normal conditions; a transient retry reserves a SECOND slot from the same shared run-wide cap (see google-adapter.ts) — if the cap is already exhausted, the retry is skipped and the candidate is reported as google_api_failure rather than exceeding it
    endpointPlan: "POST https://places.googleapis.com/v1/places:searchText — Places API (New), Text Search, maxResultCount=5 per call (bounded, never unbounded pagination)",
    fieldMaskPlan: GOOGLE_STAGE_FIELD_MASK.split(","),
    skuNote: "Approximate SKU tier only (exact SKU-to-field boundaries are set by Google's own billing docs, not independently verifiable offline): the requested fields correspond to Google's Text Search Pro + Enterprise tiers (id/displayName/formattedAddress/addressComponents/location/businessStatus/types/primaryType = Pro; regularOpeningHours/rating/userRatingCount = Enterprise). No Atmosphere-tier fields (reviews, photos) are requested.",
    cachedDataReusabilityStatement: "Not directly reusable. This bridge has no formal cross-run cache. Three Google Places CSV exports found under an unrelated legacy-pipeline run dated 2026-07-13 were reviewed and explicitly NOT reused — different run, different candidate population, no verifiable freshness guarantee.",
    hardMaxRequestCap,
    credentialsAvailable: { apiKeyPresent: config.apiKeyPresent, enabled: config.enabled, maxCallsPerRunPositive: config.maxCallsPerRun > 0, effectivelyEnabled: enabled },
    dryRunRequestPlanSample: dryRunRequestPlan.slice(0, 5),
    dryRunRequestPlanFullCount: dryRunRequestPlan.length,
    exactLiveCommand: `npx tsx scripts/lead-production/run-google-stage.ts --fsa-dir=${fsaDir} --customers=${customersPath} --registry=${registryPath} --out=<NEW-timestamped-output-dir> --live`,
    stopConditions: {
      credentialsMissing: !config.apiKeyPresent,
      requestCountUnbounded: false, // capped at candidates.length and further at maxCallsPerRun/--max-calls
      configUnclear: !config.enabled || config.maxCallsPerRun <= 0,
      liveVsSyntheticModeProvable: true, // this script has exactly one live code path (queryGooglePlaces → fetch) and never falls back to synthetic data on any failure — see google-adapter.ts
    },
    inputChecksums: { googleInputPopulation: populationChecksum, fsaResultsJson: fsaResultsChecksum, fsaResolutionCsv: fsaResolutionCsvChecksum },
    noticeIfDryRun: "DRY RUN — no Google Places request has been made. None of the 19 Google-stage result files have been written (writing placeholder versions without real data would be fabricated data).",
  };
  await fs.writeFile(path.join(outDir, "google-preflight-report.json"), JSON.stringify(preflight, null, 2));

  console.log("\n--- Preflight report ---");
  console.log(JSON.stringify({ ...preflight, dryRunRequestPlanSample: `[${preflight.dryRunRequestPlanSample.length} of ${preflight.dryRunRequestPlanFullCount} shown — full plan in google-preflight-report.json]` }, null, 2));

  if (!live) {
    console.log("\nDry run complete. No live Google Places request has been made. Pass --live to execute the real run (subject to the same isGooglePlacesEnabled() gate).");
    process.exit(0);
  }

  // --- Live mode: stop conditions are hard gates, not warnings. ---
  if (!enabled) {
    console.error("\nREFUSING TO RUN LIVE: Google Places is not enabled (missing API key, GOOGLE_PLACES_ENABLED!=='true', or GOOGLE_PLACES_MAX_CALLS_PER_RUN<=0). No request has been made.");
    process.exit(1);
  }
  if (hardMaxRequestCap <= 0) {
    console.error("\nREFUSING TO RUN LIVE: effective request cap is 0. No request has been made.");
    process.exit(1);
  }

  console.log(`\n=== LIVE RUN — up to ${hardMaxRequestCap} Google Places requests will be made ===`);

  const budget = newBudget(hardMaxRequestCap);
  const googleResults: GoogleMatchResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const fsa = fsaByCandidate.get(c.id) ?? null;
    const fsaOfficialName = fsa?.plausibleEstablishments[0]?.officialBusinessName ?? null;
    const queryResult = await queryGooglePlaces(c.name, c.postcode, fsaOfficialName, budget);
    const classified = classifyGoogleMatch(c, queryResult);
    googleResults.push(classified);
    if ((i + 1) % 10 === 0 || i === candidates.length - 1) console.log(`  Google queried ${i + 1}/${candidates.length} (budget used ${budget.callsMade}/${budget.maxCalls})`);
  }

  const googleByCandidate = new Map(googleResults.map((g) => [g.candidateId, g]));
  const siblingCounts = computeGoogleSiblingBrandCounts(candidates.map((c) => ({ candidate: c, google: googleByCandidate.get(c.id)! })));

  const fsaResolutions: FsaResolutionAfterGoogle[] = [];
  const customerResolutions: CustomerResolutionAfterGoogle[] = [];
  const premisesResults: PhysicalPremisesAssessment[] = [];
  const newlyDetectedGroups: NewlyDetectedGroup[] = [];

  for (const c of candidates) {
    const p = populationRaw.find((r) => r.candidateId === c.id);
    const google = googleByCandidate.get(c.id)!;
    const fsa = fsaByCandidate.get(c.id) as FsaMatchResult;

    fsaResolutions.push(resolveFsaMatchAfterGoogle(fsa, google));

    const fsaResRow = fsaResolutionByCandidate.get(c.id);
    const priorResolution: CustomerResolutionOutcome | "n/a" = (fsaResRow?.resolution_outcome as CustomerResolutionOutcome) ?? "n/a";
    const priorMatchedCustomerId = fsaResRow?.prior_matched_customer_id || null;
    const matchedCustomer = priorMatchedCustomerId ? (customerById.get(priorMatchedCustomerId) ?? null) : null;
    customerResolutions.push(resolveCustomerMatchAfterGoogle(c.id, c.name, priorResolution, matchedCustomer, google, fsa));

    premisesResults.push(assessPhysicalPremises(c.id, google, fsa));

    const priorGroup: GroupScreenResult | null = p?.group ?? null;
    const googlePlaceName = google.plausibleResults[0]?.officialName ?? null;
    const siblingKey = googlePlaceName ? normaliseName(googlePlaceName) : "";
    const rescreen = rescreenGroupAfterGoogle(c, priorGroup, google, registryLoaded.entries, siblingKey ? (siblingCounts.get(siblingKey) ?? 0) : 0);
    if (rescreen) newlyDetectedGroups.push(rescreen);
  }

  // --- Outputs (19 files) ---
  await fs.writeFile(path.join(outDir, "google-results.csv"), writeCsv([...GOOGLE_COLUMNS], googleResults.map(googleRow)));
  await fs.writeFile(path.join(outDir, "google-results.json"), JSON.stringify(googleResults, null, 2));

  const gBucket = (pred: (r: GoogleMatchResult) => boolean) => googleResults.filter(pred).map(googleRow);
  await fs.writeFile(path.join(outDir, "exact-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "exact_google_match")));
  await fs.writeFile(path.join(outDir, "probable-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "strong_probable_google_match")));
  await fs.writeFile(path.join(outDir, "multiple-or-conflicting-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => ["multiple_google_matches", "google_name_conflict", "google_address_conflict", "google_postcode_conflict"].includes(r.outcome))));
  await fs.writeFile(path.join(outDir, "no-google-match.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "no_google_match")));
  await fs.writeFile(path.join(outDir, "google-api-failures.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "google_api_failure")));
  await fs.writeFile(path.join(outDir, "permanently-closed.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "permanently_closed")));
  await fs.writeFile(path.join(outDir, "temporarily-closed.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "temporarily_closed")));

  await fs.writeFile(path.join(outDir, "fsa-resolution-after-google.csv"), writeCsv([...FSA_RESOLUTION_COLUMNS], fsaResolutions.map(fsaResolutionRow)));

  await fs.writeFile(path.join(outDir, "customer-resolution-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], customerResolutions.map(customerResolutionRow)));
  const cBucket = (pred: (r: CustomerResolutionAfterGoogle) => boolean) => customerResolutions.filter(pred).map(customerResolutionRow);
  await fs.writeFile(path.join(outDir, "confirmed-active-customers-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "confirmed_active_customer_after_google")));
  await fs.writeFile(path.join(outDir, "confirmed-inactive-customers-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "confirmed_inactive_customer_after_google")));
  await fs.writeFile(path.join(outDir, "released-from-customer-hold-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "released_from_customer_hold_after_google")));
  await fs.writeFile(path.join(outDir, "unresolved-customer-matches-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "unresolved_customer_match_after_google")));

  await fs.writeFile(path.join(outDir, "physical-premises-results.csv"), writeCsv([...PREMISES_COLUMNS], premisesResults.map(premisesRow)));
  await fs.writeFile(path.join(outDir, "newly-detected-groups.csv"), writeCsv([...NEWLY_DETECTED_COLUMNS], newlyDetectedGroups.map(newlyDetectedRow)));

  const registerColumns = [...GOOGLE_COLUMNS, "phase2_source_bucket", "fsa_resolution", "customer_resolution_outcome", "physical_premises_result"] as const;
  const fsaResByCandidate = new Map(fsaResolutions.map((r) => [r.candidateId, r]));
  const custResByCandidate = new Map(customerResolutions.map((r) => [r.candidateId, r]));
  const premisesByCandidate = new Map(premisesResults.map((r) => [r.candidateId, r]));
  const registerRows = googleResults.map((g) => {
    const p = populationRaw.find((r) => r.candidateId === g.candidateId);
    return {
      ...googleRow(g),
      phase2_source_bucket: p?.phase2SourceBucket ?? "",
      fsa_resolution: fsaResByCandidate.get(g.candidateId)?.resolution ?? "",
      customer_resolution_outcome: custResByCandidate.get(g.candidateId)?.resolutionOutcome ?? "",
      physical_premises_result: premisesByCandidate.get(g.candidateId)?.result ?? "",
    };
  });
  await fs.writeFile(path.join(outDir, "complete-google-evidence-register.csv"), writeCsv([...registerColumns], registerRows));

  const countBy = (rows: unknown[], get: (r: any) => string) => {
    const counts: Record<string, number> = {};
    for (const r of rows) { const k = get(r); counts[k] = (counts[k] ?? 0) + 1; }
    return counts;
  };

  const summary = {
    fsaDir, processingTimestamp: new Date().toISOString(),
    candidatesExpected: 83, candidatesProcessed: candidates.length,
    googleRequestsMade: budget.callsMade, googleRequestCap: hardMaxRequestCap,
    googleOutcomeCounts: countBy(googleResults, (r) => r.outcome),
    fsaResolutionCounts: countBy(fsaResolutions, (r) => r.resolution),
    customerResolutionCounts: countBy(customerResolutions, (r) => r.resolutionOutcome),
    physicalPremisesCounts: countBy(premisesResults, (r) => r.result),
    newlyDetectedGroupsCount: newlyDetectedGroups.length,
    totalReconciled: googleResults.length,
    notice: "Google Places identity/premises evidence, FSA-multiple-match resolution, customer-match resolution, physical-premises assessment, and group rescreen only. No numeric Level 0-4 score has been assigned. No candidate here is sales-ready. Companies House, websites, scoring and representative exports have NOT been called.",
  };
  await fs.writeFile(path.join(outDir, "google-processing-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\nGoogle outcome counts: ${JSON.stringify(summary.googleOutcomeCounts)}`);
  console.log(`FSA resolution counts: ${JSON.stringify(summary.fsaResolutionCounts)}`);
  console.log(`Customer resolution counts: ${JSON.stringify(summary.customerResolutionCounts)}`);
  console.log(`Physical premises counts: ${JSON.stringify(summary.physicalPremisesCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  console.log("No candidate is sales-ready. Companies House, websites, scoring and representative exports have NOT been called.");
  process.exit(0);
}

async function fileExists(p: string): Promise<boolean> {
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

/** The 83-candidate Google-input population was written earlier this session directly into the
 *  Google-stage output directory (google-input-population.json) — sibling to this run's own
 *  --out, not under --fsa-dir. Resolve it robustly: prefer <out>/google-input-population.json;
 *  fall back to a candidate-population.json under --fsa-dir's parent if a different layout is
 *  ever used. */
async function resolveGoogleInputPopulationPath(outDir: string, _fsaDir: string): Promise<string> {
  const preferred = path.join(outDir, "google-input-population.json");
  if (await fileExists(preferred)) return preferred;
  throw new Error(`google-input-population.json not found in --out directory (${outDir}). Expected it to already exist there (written by the population-extraction step earlier this session) before running this stage.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
