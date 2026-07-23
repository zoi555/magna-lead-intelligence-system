// One-off, NO-NEW-API-CALLS correction pass for the live UB1 Google-stage run of
// 2026-07-23T03-09-14Z, which was executed BEFORE two real defects were found and fixed (see
// commit c9e7c89): (1) postcode agreement was always false because Places API (New) Text Search
// never populated addressComponents, and (2) some queries were polluted with an ambiguous FSA
// establishment's name. Defect (2) cannot be corrected retroactively without a fresh Google call
// (the query already went out) — this script corrects ONLY defect (1), by reclassifying the
// ALREADY-RETRIEVED evidence through the real, fixed classifyGoogleMatch() function. It makes
// ZERO Google Places requests.
//
// Reconstructs an approximate raw Places API response shape from the persisted
// GooglePlaceEvidence (the only thing available — the true raw response was never persisted)
// and feeds it back through classifyGoogleMatch(), so the fix is applied via the real,
// tested code path rather than a duplicated one-off. Known limitation: for candidates that
// previously had MULTIPLE Google results but only one qualified for retention under the old
// (buggy) logic, this can only recover the ONE retained result — it cannot resurrect results
// that were discarded before persistence. This affects only the no_google_match bucket (32
// candidates, empty plausibleResults, genuinely nothing to reprocess) — the 49
// google_postcode_conflict candidates each retained exactly one result and are fully
// recoverable.

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv, parseCsvObjects } from "./csv";
import { normaliseName } from "./normalize";
import type {
  OperationalCandidate, CustomerRecord, FsaMatchResult, GoogleMatchResult, GroupScreenResult,
  FsaResolutionAfterGoogle, CustomerResolutionAfterGoogle, PhysicalPremisesAssessment, NewlyDetectedGroup,
  CustomerResolutionOutcome,
} from "./types";

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

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

/** Reconstructs an approximate raw Places API (New) place object from the persisted
 *  GooglePlaceEvidence — the true raw response was never stored, only the mapped evidence.
 *  addressComponents is deliberately left empty here too: the fixed classifyGoogleMatch()
 *  already falls back to parsing formattedAddress, which IS faithfully preserved. */
function evidenceToRawPlace(e: any): Record<string, any> {
  return {
    id: e.placeId,
    displayName: { text: e.officialName },
    formattedAddress: e.formattedAddress,
    addressComponents: [],
    location: e.latitude != null && e.longitude != null ? { latitude: e.latitude, longitude: e.longitude } : undefined,
    nationalPhoneNumber: e.phone ?? undefined,
    websiteUri: e.website ?? undefined,
    businessStatus: e.businessStatus,
    regularOpeningHours: e.openingHours?.length ? { weekdayDescriptions: e.openingHours } : undefined,
    primaryType: e.primaryCategory ?? undefined,
    primaryTypeDisplayName: e.primaryCategory ? { text: e.primaryCategory } : undefined,
    types: [e.primaryCategory, ...(e.additionalCategories ?? [])].filter(Boolean),
    rating: e.rating ?? undefined,
    userRatingCount: e.reviewCount ?? undefined,
  };
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
  const dir = arg("dir");
  const customersPath = arg("customers");
  const registryPath = arg("registry");
  const fsaDir = arg("fsa-dir");
  const missing = [!dir && "--dir=<existing google-stage output dir>", !customersPath && "--customers=<path>", !registryPath && "--registry=<path>", !fsaDir && "--fsa-dir=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const { classifyGoogleMatch } = await import("./google-match");
  const { resolveFsaMatchAfterGoogle } = await import("./fsa-resolution-after-google");
  const { resolveCustomerMatchAfterGoogle } = await import("./customer-resolution-after-google");
  const { assessPhysicalPremises } = await import("./physical-premises");
  const { rescreenGroupAfterGoogle, computeGoogleSiblingBrandCounts } = await import("./group-rescreen-after-google");
  const { loadCustomerFile } = await import("./load-customers");
  const { loadGroupRegistry } = await import("./load-group-registry");

  console.log("=== Google-stage reprocessing pass (ZERO new Google Places calls) ===");
  console.log(`Directory: ${dir}`);

  const priorResults = JSON.parse(await fs.readFile(path.join(dir!, "google-results.json"), "utf8")) as GoogleMatchResult[];
  const populationRaw = JSON.parse(await fs.readFile(path.join(dir!, "google-input-population.json"), "utf8")) as any[];
  const fsaResultsRaw = JSON.parse(await fs.readFile(path.join(fsaDir!, "fsa-results.json"), "utf8")) as FsaMatchResult[];
  const fsaByCandidate = new Map(fsaResultsRaw.map((r) => [r.candidateId, r]));
  const { rows: fsaResolutionRows } = parseCsvObjects(await fs.readFile(path.join(fsaDir!, "customer-match-resolution-after-fsa.csv"), "utf8"));
  const fsaResolutionByCandidate = new Map(fsaResolutionRows.map((r) => [r.candidate_id, r]));
  const customersLoaded = await loadCustomerFile(customersPath!);
  const customerById = new Map(customersLoaded.customers.map((c) => [c.customerId, c]));
  const registryLoaded = await loadGroupRegistry(registryPath!);

  const candidates: OperationalCandidate[] = populationRaw.map((p) => ({
    id: p.candidateId, name: p.normalisedName?.candidateOriginal ?? "", postcode: p.normalisedPostcode?.candidateOriginal ?? null,
    phone: p.normalisedPhone?.candidateOriginal ?? null, latitude: null, longitude: null, brand: null, companyNumber: null, website: null, sources: [],
  }));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  let changedCount = 0;
  const googleResults: GoogleMatchResult[] = priorResults.map((prior) => {
    const candidate = candidateById.get(prior.candidateId)!;
    const rawPlaces = prior.plausibleResults.map(evidenceToRawPlace);
    const reconstructedQueryResult = {
      ok: prior.apiFailureReason === null, places: rawPlaces, attempts: prior.apiAttempts,
      errorMessage: prior.apiFailureReason, queryString: prior.sourceResponseReference,
      retrievedAt: prior.retrievalTimestamp, disabledReason: null,
    };
    const reclassified = classifyGoogleMatch(candidate, reconstructedQueryResult as any);
    if (reclassified.outcome !== prior.outcome) changedCount++;
    return reclassified;
  });
  console.log(`Reclassified ${googleResults.length} candidates — ${changedCount} outcome(s) changed by the fix.`);

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

  await fs.writeFile(path.join(dir!, "google-results.csv"), writeCsv([...GOOGLE_COLUMNS], googleResults.map(googleRow)));
  await fs.writeFile(path.join(dir!, "google-results.json"), JSON.stringify(googleResults, null, 2));
  const gBucket = (pred: (r: GoogleMatchResult) => boolean) => googleResults.filter(pred).map(googleRow);
  await fs.writeFile(path.join(dir!, "exact-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "exact_google_match")));
  await fs.writeFile(path.join(dir!, "probable-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "strong_probable_google_match")));
  await fs.writeFile(path.join(dir!, "multiple-or-conflicting-google-matches.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => ["multiple_google_matches", "google_name_conflict", "google_address_conflict", "google_postcode_conflict"].includes(r.outcome))));
  await fs.writeFile(path.join(dir!, "no-google-match.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "no_google_match")));
  await fs.writeFile(path.join(dir!, "google-api-failures.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "google_api_failure")));
  await fs.writeFile(path.join(dir!, "permanently-closed.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "permanently_closed")));
  await fs.writeFile(path.join(dir!, "temporarily-closed.csv"), writeCsv([...GOOGLE_COLUMNS], gBucket((r) => r.outcome === "temporarily_closed")));

  await fs.writeFile(path.join(dir!, "fsa-resolution-after-google.csv"), writeCsv([...FSA_RESOLUTION_COLUMNS], fsaResolutions.map(fsaResolutionRow)));

  await fs.writeFile(path.join(dir!, "customer-resolution-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], customerResolutions.map(customerResolutionRow)));
  const cBucket = (pred: (r: CustomerResolutionAfterGoogle) => boolean) => customerResolutions.filter(pred).map(customerResolutionRow);
  await fs.writeFile(path.join(dir!, "confirmed-active-customers-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "confirmed_active_customer_after_google")));
  await fs.writeFile(path.join(dir!, "confirmed-inactive-customers-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "confirmed_inactive_customer_after_google")));
  await fs.writeFile(path.join(dir!, "released-from-customer-hold-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "released_from_customer_hold_after_google")));
  await fs.writeFile(path.join(dir!, "unresolved-customer-matches-after-google.csv"), writeCsv([...CUSTOMER_RESOLUTION_COLUMNS], cBucket((r) => r.resolutionOutcome === "unresolved_customer_match_after_google")));

  await fs.writeFile(path.join(dir!, "physical-premises-results.csv"), writeCsv([...PREMISES_COLUMNS], premisesResults.map(premisesRow)));
  await fs.writeFile(path.join(dir!, "newly-detected-groups.csv"), writeCsv([...NEWLY_DETECTED_COLUMNS], newlyDetectedGroups.map(newlyDetectedRow)));

  const registerColumns = [...GOOGLE_COLUMNS, "phase2_source_bucket", "fsa_resolution", "customer_resolution_outcome", "physical_premises_result"] as const;
  const fsaResByCandidate = new Map(fsaResolutions.map((r) => [r.candidateId, r]));
  const custResByCandidate = new Map(customerResolutions.map((r) => [r.candidateId, r]));
  const premisesByCandidate = new Map(premisesResults.map((r) => [r.candidateId, r]));
  const registerRows = googleResults.map((g) => {
    const p = populationRaw.find((r) => r.candidateId === g.candidateId);
    return {
      ...googleRow(g), phase2_source_bucket: p?.phase2SourceBucket ?? "",
      fsa_resolution: fsaResByCandidate.get(g.candidateId)?.resolution ?? "",
      customer_resolution_outcome: custResByCandidate.get(g.candidateId)?.resolutionOutcome ?? "",
      physical_premises_result: premisesByCandidate.get(g.candidateId)?.result ?? "",
    };
  });
  await fs.writeFile(path.join(dir!, "complete-google-evidence-register.csv"), writeCsv([...registerColumns], registerRows));

  const countBy = (rows: unknown[], get: (r: any) => string) => {
    const counts: Record<string, number> = {};
    for (const r of rows) { const k = get(r); counts[k] = (counts[k] ?? 0) + 1; }
    return counts;
  };
  const noMatchStillEmpty = googleResults.filter((r) => r.outcome === "no_google_match").length;
  const summary = {
    reprocessedFrom: dir, reprocessingTimestamp: new Date().toISOString(),
    correctionNotice: "REPROCESSED — the original live run (all 83 real Google Places calls) was reclassified in place using the fixed postcode-agreement logic (formattedAddress fallback). ZERO new Google Places API calls were made for this correction. See docs/09_DECISIONS.md / the session report for the two defects found and fixed.",
    candidatesExpected: 83, candidatesProcessed: googleResults.length,
    outcomesChangedByFix: changedCount,
    knownLimitation: `${noMatchStillEmpty} candidates remain no_google_match with no retained raw evidence to reprocess — their original query may also have been affected by the second defect (FSA-name query pollution) but this cannot be verified without a fresh, separately-approved Google Places call.`,
    googleOutcomeCounts: countBy(googleResults, (r) => r.outcome),
    fsaResolutionCounts: countBy(fsaResolutions, (r) => r.resolution),
    customerResolutionCounts: countBy(customerResolutions, (r) => r.resolutionOutcome),
    physicalPremisesCounts: countBy(premisesResults, (r) => r.result),
    newlyDetectedGroupsCount: newlyDetectedGroups.length,
    totalReconciled: googleResults.length,
    notice: "Google Places identity/premises evidence, FSA-multiple-match resolution, customer-match resolution, physical-premises assessment, and group rescreen only. No numeric Level 0-4 score has been assigned. No candidate here is sales-ready. Companies House, websites, scoring and representative exports have NOT been called.",
  };
  await fs.writeFile(path.join(dir!, "google-processing-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\nGoogle outcome counts: ${JSON.stringify(summary.googleOutcomeCounts)}`);
  console.log(`FSA resolution counts: ${JSON.stringify(summary.fsaResolutionCounts)}`);
  console.log(`Customer resolution counts: ${JSON.stringify(summary.customerResolutionCounts)}`);
  console.log(`Physical premises counts: ${JSON.stringify(summary.physicalPremisesCounts)}`);
  console.log(`\nOutputs rewritten to: ${dir}`);
  console.log("ZERO new Google Places API calls were made in this reprocessing pass.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
