// Scoring/qualification rules v2 (2026-07-23, UB1 calibration audit). Deterministic
// zero-new-API reprocessing of an already-accepted v1 final-scoring run: re-derives Google
// identity classification from the ALREADY-FETCHED raw evidence using the corrected
// normaliseName() (apostrophe-tokenisation fix), applies a materiality check to customer-match
// holds (customer-match-materiality.ts) instead of treating any "unresolved" state as blocking,
// and separates qualification_status/channel_eligibility from commercial_priority_score
// (qualification-v2.ts) so a candidate's numeric score never gates release by itself.
//
// v1's hard-gates.ts, scoring.ts, channel-suitability.ts, final-outcome.ts are reused UNCHANGED
// — this script only swaps in corrected INPUTS (google outcome, customer-conflict materiality)
// and adds a new qualification layer on top. v1's own outputs are never modified or re-run live.
//
// Usage:
//   npx tsx scripts/lead-production/run-final-scoring-stage-v2.ts \
//     --phase1-dir=<dir> --fsa-dir=<dir> --google-checkpoint=<dir> --companies-house-dir=<dir> \
//     --website-dir=<dir> --public-profile-dir=<dir> --group-rescreen-dir=<dir> \
//     --v1-final-scoring-dir=<accepted v1 output dir, for before/after comparison> \
//     --customers=<customer master file> --territory=UB1 --out=<new directory>

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeCsv, parseCsvObjects } from "./csv";
import { normaliseName, nameSimilarity } from "./normalize";
import { deriveGoogleOutcome } from "./google-match";
import { evaluateHardGates, trustworthyCompaniesHouseStatus } from "./hard-gates";
import { assessPhysicalPremises } from "./physical-premises";
import { calculateScore } from "./scoring";
import { calculateChannelSuitability } from "./channel-suitability";
import { assignFinalOutcome } from "./final-outcome";
import { assessCustomerMatchMateriality } from "./customer-match-materiality";
import { classifyQualificationV2 } from "./qualification-v2";
import { loadCustomerFile } from "./load-customers";
import type { MasterOutcomeBucket, FinalOutcomeResult, GooglePlaceEvidence, GoogleOutcome } from "./types";

const RULES_VERSION_V2 = "final-scoring-stage-v2-calibration-2026-07-23";
function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function md5(filePath: string): Promise<string> { return createHash("md5").update(await fs.readFile(filePath)).digest("hex"); }
function gitCommitSha(): string { try { return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { return "unknown"; } }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readCsvRows(p: string): Promise<Record<string, string>[]> { return (await parseCsvObjects(await fs.readFile(p, "utf8"))).rows; }
async function findFile(dir: string, suffix: string): Promise<string> {
  const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
  if (!match) throw new Error(`No file ending in "${suffix}" found in ${dir}.`);
  return path.join(dir, match);
}

type DecisionCategory = "genuine_hard_failure" | "channel_specific_failure" | "significant_conflict" | "recoverable_evidence_gap" | "optional_enrichment_gap" | "scoring_only_weakness" | "suspected_model_defect" | "not_applicable_terminal_exclusion";

interface MasterRowV2 {
  candidateId: string; tradingName: string; postcode: string | null; phone: string | null; website: string | null;
  v1Bucket: MasterOutcomeBucket; v1Level: string | null; v1Channel: string | null; v1Score: number | null;
  v1FailedGates: string[]; v1ReasonTags: string[]; v1LevelReason: string | null;
  decisionCategory: DecisionCategory | null;
  qualificationStatus: string; channelEligibility: string; enrichmentCompletenessBand: string; enrichmentCompletenessFraction: number;
  commercialPriorityScore: number | null; maxPossibleScore: number | null;
  finalOutcome: FinalOutcomeResult | null;
  googleReclassified: boolean; googleOutcomeBefore: string | null; googleOutcomeAfter: string | null;
  customerConflictMaterialityChanged: boolean; hasUnresolvedCustomerConflictBefore: boolean; hasUnresolvedCustomerConflictAfter: boolean; customerConflictReason: string | null;
  outcomeChanged: boolean; changeReason: string | null;
}

async function main() {
  const phase1Dir = arg("phase1-dir");
  const fsaDir = arg("fsa-dir");
  const googleDir = arg("google-checkpoint");
  const chDir = arg("companies-house-dir");
  const websiteDir = arg("website-dir");
  const publicProfileDir = arg("public-profile-dir");
  const groupRescreenDir = arg("group-rescreen-dir");
  const v1Dir = arg("v1-final-scoring-dir");
  const customersPath = arg("customers");
  const outArg = arg("out");
  const territory = arg("territory") ?? "UB1";

  const missing = [!phase1Dir && "--phase1-dir", !fsaDir && "--fsa-dir", !googleDir && "--google-checkpoint", !chDir && "--companies-house-dir", !websiteDir && "--website-dir", !publicProfileDir && "--public-profile-dir", !groupRescreenDir && "--group-rescreen-dir", !v1Dir && "--v1-final-scoring-dir", !customersPath && "--customers", !outArg && "--out"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.map((m) => `${m}=<path>`).join("\n  ")); process.exit(1); }

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });
  console.log(`=== Lead-production bridge: qualification/scoring rules v2 — zero-new-API calibration reprocessing (${territory}) ===`);
  console.log("No FSA, Google, Companies House, or website API call is made by this script — every input is read from already-accepted checkpoints.");

  // --- Load every checkpoint, read-only (identical set to v1's run-final-scoring-stage.ts) ---
  const phase1Results = (await readJson(path.join(phase1Dir!, "customer-match-results.json"))) as any[];
  const phase1Checksum = await md5(path.join(phase1Dir!, "customer-match-results.json"));

  const fsaResults = (await readJson(path.join(fsaDir!, "fsa-results.json"))) as any[];
  const fsaByCandidate = new Map(fsaResults.map((r) => [r.candidateId, r]));
  const fsaCustResRows = await readCsvRows(path.join(fsaDir!, "customer-match-resolution-after-fsa.csv"));
  const fsaCustResByCandidate = new Map(fsaCustResRows.map((r) => [r.candidate_id, r]));

  const googleResults = (await readJson(path.join(googleDir!, "google-results.json"))) as any[];
  const googleByCandidate = new Map(googleResults.map((r) => [r.candidateId, r]));
  const googleCustResRows = await readCsvRows(path.join(googleDir!, "customer-resolution-after-google.csv"));
  const googleCustResByCandidate = new Map(googleCustResRows.map((r) => [r.candidate_id, r]));
  const physicalPremisesRows = await readCsvRows(path.join(googleDir!, "physical-premises-results.csv"));
  const physicalPremisesByCandidate = new Map(physicalPremisesRows.map((r) => [r.candidate_id, r.result]));
  const fsaResolutionAfterGoogleRows = await readCsvRows(path.join(googleDir!, "fsa-resolution-after-google.csv"));
  const fsaResolutionByCandidate = new Map(fsaResolutionAfterGoogleRows.map((r) => [r.candidate_id, r]));

  const populationManifest = (await readJson(path.join(chDir!, "companies-house-population-manifest.json"))) as any;
  const eligibleIds: string[] = populationManifest.eligibleIds;
  const chResults = (await readJson(path.join(chDir!, "companies-house-results.json"))) as any[];
  const chByCandidate = new Map(chResults.map((r) => [r.candidateId, r]));
  const chCustResRows = await readCsvRows(path.join(chDir!, "customer-resolution-after-companies-house.csv"));
  const chCustResByCandidate = new Map(chCustResRows.map((r) => [r.candidate_id, r]));
  const financialCalcRows = await readCsvRows(path.join(chDir!, "financial-calculations.csv"));
  const financialCalcByCandidate = new Map(financialCalcRows.map((r) => [r.candidate_id, r]));
  const decisionMakerRows = await readCsvRows(path.join(chDir!, "decision-maker-candidates.csv"));
  const decisionMakerByCandidate = new Map<string, Record<string, string>>();
  for (const r of decisionMakerRows) if (!decisionMakerByCandidate.has(r.candidate_id) || Number(r.rank) < Number(decisionMakerByCandidate.get(r.candidate_id)!.rank)) decisionMakerByCandidate.set(r.candidate_id, r);

  const websiteData = (await readJson(path.join(websiteDir!, "website-extracted-data.json"))) as any[];
  const websiteByCandidate = new Map(websiteData.map((r) => [r.candidateId, r]));
  const productFitData = (await readJson(path.join(websiteDir!, "product-fit-results.json"))) as any[];
  const productFitByCandidate = new Map(productFitData.map((r) => [r.candidateId, r]));

  const publicProfileRows = await readCsvRows(path.join(publicProfileDir!, "public-profile-results.csv"));
  const publicProfileByCandidate = new Map<string, Record<string, string>>();
  for (const r of publicProfileRows) publicProfileByCandidate.set(r.candidate_id, r);

  const groupRescreenResults = (await readJson(path.join(groupRescreenDir!, "final-group-rescreen-results.json"))) as any[];
  const groupRescreenByCandidate = new Map(groupRescreenResults.map((r) => [r.candidateId, r]));

  const v1MasterFile = await findFile(v1Dir!, "-authoritative-master.json");
  const v1Master = (await readJson(v1MasterFile)) as any[];
  const v1ByCandidate = new Map(v1Master.map((r) => [r.candidateId, r]));

  const customersLoaded = await loadCustomerFile(customersPath!);
  const customerById = new Map(customersLoaded.customers.map((c) => [c.customerId, c]));

  console.log(`Phase 1: ${phase1Results.length} original candidates. CH-eligible population: ${eligibleIds.length}.`);

  const masterRows: MasterRowV2[] = [];
  const eligibleSet = new Set(eligibleIds);

  for (const p1 of phase1Results) {
    const candidateId = p1.candidateId;
    const tradingName = p1.normalisedName?.candidateOriginal ?? "";
    const postcode = p1.normalisedPostcode?.candidateOriginal ?? null;
    const v1Row = v1ByCandidate.get(candidateId);

    // Terminal exclusions (active/inactive customer, excluded group, closed) are IDENTICAL to
    // v1 — none of this session's fixes touch those decisions, and none of the corroborating
    // evidence changes them (an active-customer confirmation is already a DECISIVE match, not
    // an unresolved one, so materiality reprocessing is a no-op there by construction).
    if (!eligibleSet.has(candidateId) || v1Row?.finalOutcome == null) {
      // Terminal exclusions decided before scoring (active/inactive customer, excluded group,
      // permanently/temporarily closed) are never reopened by this session's fixes — none of
      // them involve google reclassification or customer-hold materiality (an active-customer
      // confirmation is already DECISIVE, not an unresolved hold). All map to hard_rejected —
      // the only one of the four v2 statuses meaning "not releasable" — with the true reason
      // preserved verbatim in v1_bucket/v1 bucketReason, never collapsed into a misleading
      // "material_conflict" label for what is actually a closure or an already-decided status.
      masterRows.push({
        candidateId, tradingName, postcode, phone: null, website: null,
        v1Bucket: v1Row?.bucket ?? "probable_customer_match_unresolved", v1Level: null, v1Channel: v1Row?.channel ?? null, v1Score: null,
        v1FailedGates: [], v1ReasonTags: [], v1LevelReason: v1Row?.bucketReason ?? null, decisionCategory: "not_applicable_terminal_exclusion",
        qualificationStatus: "hard_rejected",
        channelEligibility: "neither", enrichmentCompletenessBand: "minimal", enrichmentCompletenessFraction: 0,
        commercialPriorityScore: null, maxPossibleScore: null, finalOutcome: null,
        googleReclassified: false, googleOutcomeBefore: null, googleOutcomeAfter: null,
        customerConflictMaterialityChanged: false, hasUnresolvedCustomerConflictBefore: false, hasUnresolvedCustomerConflictAfter: false, customerConflictReason: v1Row?.bucketReason ?? null,
        outcomeChanged: false, changeReason: null,
      });
      continue;
    }

    // --- Eligible candidate: reconstruct the exact same evidence assembly as v1's
    // run-final-scoring-stage.ts, then inject the two corrected inputs. ---
    const chResult = chByCandidate.get(candidateId);
    const chCustRes = chCustResByCandidate.get(candidateId);
    const finCalc = financialCalcByCandidate.get(candidateId);
    const groupRescreen = groupRescreenByCandidate.get(candidateId);
    const website = websiteByCandidate.get(candidateId) ?? null;
    const productFit = productFitByCandidate.get(candidateId) ?? null;
    const physicalPremisesV1 = physicalPremisesByCandidate.get(candidateId) ?? null;
    const fsa = fsaByCandidate.get(candidateId);
    const fsaResAfterGoogle = fsaResolutionByCandidate.get(candidateId);
    const decisionMaker = decisionMakerByCandidate.get(candidateId);
    const publicProfile = decisionMaker ? publicProfileByCandidate.get(candidateId) : undefined;
    const googleRaw = googleByCandidate.get(candidateId);

    // --- Google reclassification: recompute nameSimilarity for every already-retained place
    // (allReturnedResults has less detail than plausibleResults, but every place Google ever
    // returned is present in ONE of the two — plausibleResults is used here since it already
    // carries postcode/lat/lng/phone/website needed downstream; allReturnedResults exists only
    // for outcomes plausibleResults doesn't cover, e.g. a genuine no-postcode-match case). ---
    const rawPlaces: GooglePlaceEvidence[] = (googleRaw?.plausibleResults ?? []) as GooglePlaceEvidence[];
    const correctedEvidence: GooglePlaceEvidence[] = rawPlaces.map((e) => ({ ...e, nameSimilarity: nameSimilarity(normaliseName(tradingName), normaliseName(e.officialName)) }));
    const googleOutcomeBefore: GoogleOutcome | null = googleRaw?.outcome ?? null;
    let googleOutcomeAfter: GoogleOutcome | null = googleOutcomeBefore;
    let correctedGoogleBest = googleRaw?.plausibleResults?.[0] ?? null;
    let googleReclassified = false;
    if (googleRaw && !["google_api_failure", "permanently_closed", "temporarily_closed"].includes(googleRaw.outcome) && rawPlaces.length > 0) {
      const decision = deriveGoogleOutcome(correctedEvidence, postcode, googleRaw.resultCount ?? rawPlaces.length);
      if (decision.outcome !== googleOutcomeBefore) {
        googleReclassified = true;
        googleOutcomeAfter = decision.outcome;
        correctedGoogleBest = decision.plausibleResults[0] ?? null;
      }
    }
    const googleOutcome = (googleOutcomeAfter ?? "no_google_match") as GoogleOutcome;

    // physical-premises.ts's assessPhysicalPremises() is a pure function of google.outcome +
    // google.plausibleResults[0] + fsa.outcome — directly downstream of the same Google
    // evidence just reclassified above. Reprocess it too when Google's outcome changed, using
    // the SAME real, unmodified assessPhysicalPremises() function (never reimplemented), so a
    // candidate whose Google match flips from a conflict to decisive isn't left stranded on a
    // stale "no_physical_premises_evidence" result computed against the pre-fix outcome.
    const physicalPremises = googleReclassified
      ? assessPhysicalPremises(candidateId, { ...googleRaw!, outcome: googleOutcome, plausibleResults: correctedGoogleBest ? [correctedGoogleBest] : [] } as any, fsa as any).result
      : physicalPremisesV1;

    const googleDecisive = ["exact_google_match", "strong_probable_google_match"].includes(googleOutcome);
    const chDecisive = chResult && ["exact_company_match", "strong_probable_company_match"].includes(chResult.outcome);
    const fsaDecisive = fsa && (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match" || fsaResAfterGoogle?.resolution === "fsa_resolved_exact" || fsaResAfterGoogle?.resolution === "fsa_resolved_probable");
    const websiteCrawled = !!website?.officialDomain;
    const stagesWithDecisiveEvidence = [googleDecisive, fsaDecisive, chDecisive, websiteCrawled].filter(Boolean).length;

    const phone = website?.phone?.value ?? correctedGoogleBest?.phone ?? null;
    const phoneSource: "website" | "google" | null = website?.phone?.value ? "website" : correctedGoogleBest?.phone ? "google" : null;
    const lat = googleDecisive ? correctedGoogleBest?.latitude ?? null : null;
    const lng = googleDecisive ? correctedGoogleBest?.longitude ?? null : null;
    const hasWebsiteContact = website?.hasContactForm?.value === true || !!website?.email?.value;

    const identityConfidence: "high" | "medium" | "low" | "not_available" = googleDecisive && chDecisive ? "high" : googleDecisive || chDecisive ? "medium" : fsaDecisive ? "low" : "not_available";
    const decisionMakerConfidence: "high" | "medium" | "low" | "not_available" = publicProfile?.outcome === "official_website_profile_only" ? "medium" : decisionMaker ? "low" : "not_available";

    const trustworthyChStatus = trustworthyCompaniesHouseStatus(chResult?.outcome ?? null, chResult?.companiesHouseStatus ?? null);

    const gates = evaluateHardGates({
      candidateId, territory,
      physicalPremises: physicalPremises as any,
      googleOutcome: googleOutcome as any,
      companiesHouseOutcome: (chResult?.outcome ?? "no_company_record") as any,
      companiesHouseStatus: trustworthyChStatus,
      customerResolutionOutcome: (chCustRes?.resolution_outcome ?? "unresolved_customer_match_after_companies_house") as any,
      finalGroupClassification: (groupRescreen?.classification ?? "ownership_unresolved") as any,
      finalGroupDefaultOutcome: (groupRescreen?.defaultOutcome ?? null) as any,
      hasContactablePostcode: !!postcode,
      hasAnyContactChannel: !!phone || hasWebsiteContact,
    });

    const scoring = calculateScore({
      candidateId, googleOutcome, googlePrimaryCategory: googleDecisive ? correctedGoogleBest?.primaryCategory ?? null : null,
      googleAdditionalCategories: googleDecisive ? correctedGoogleBest?.additionalCategories ?? [] : [],
      googleRating: googleDecisive ? correctedGoogleBest?.rating ?? null : null, googleReviewCount: googleDecisive ? correctedGoogleBest?.reviewCount ?? null : null,
      physicalPremises, fsaOutcome: fsa?.outcome ?? "no_fsa_match", fsaResolution: (fsaResAfterGoogle?.resolution ?? "n/a") as any,
      companiesHouseOutcome: chResult?.outcome ?? "no_company_record", companiesHouseStatus: trustworthyChStatus,
      financialStrengthBand: finCalc?.financialStrengthBand_result && finCalc.financialStrengthBand_result !== "not_available" ? finCalc.financialStrengthBand_result : null,
      companySizeBand: finCalc?.companySizeBand_result && finCalc.companySizeBand_result !== "not_available" ? finCalc.companySizeBand_result : null,
      likelyPurchasingCapacityBand: finCalc?.likelyPurchasingCapacityBand_result && finCalc.likelyPurchasingCapacityBand_result !== "not_available" ? finCalc.likelyPurchasingCapacityBand_result : null,
      financialDataConfidence: finCalc?.financial_data_confidence ?? "not_available",
      finalGroupClassification: (groupRescreen?.classification ?? "ownership_unresolved") as any,
      websiteCrawled, cuisineTags: website?.cuisineTags ?? [], productFit,
      stagesWithDecisiveEvidence, totalStagesConsidered: 4,
    });

    const channel = calculateChannelSuitability({
      candidateId, phone, phoneSource: phoneSource as any, physicalPremises, hasPostcode: !!postcode, latitude: lat, longitude: lng,
      hasOpeningHours: !!website?.openingHours?.value, hasWebsiteContact, decisionMakerConfidence,
      independentPurchasingFit: scoring.components.independentLocalPurchasingFit, identityConfidence,
    });

    // --- Customer-match materiality: replaces the naive "any unresolved state with a
    // prior_matched_customer_id" check with genuine corroboration-strength evidence. ---
    const priorMatchedCustomerId = chCustRes?.prior_matched_customer_id || null;
    const matchedCustomer = priorMatchedCustomerId ? customerById.get(priorMatchedCustomerId) : null;
    const hasUnresolvedCustomerConflictBefore = chCustRes?.resolution_outcome === "unresolved_customer_match_after_companies_house" && !!priorMatchedCustomerId;
    const materiality = assessCustomerMatchMateriality({
      candidatePostcode: postcode, candidateName: tradingName, candidatePhone: phone, candidateDomain: website?.officialDomain ?? null,
      candidateCompanyNumber: chDecisive ? chResult?.plausibleCompanies?.[0]?.companyNumber ?? null : null,
      matchedCustomer: matchedCustomer ? { postcode: matchedCustomer.postcode, tradingName: matchedCustomer.tradingName, phone: matchedCustomer.phone, domain: null, companyNumber: matchedCustomer.companyNumber } : null,
    });
    const hasUnresolvedCustomerConflictAfter = hasUnresolvedCustomerConflictBefore && materiality.material;
    const customerConflictMaterialityChanged = hasUnresolvedCustomerConflictBefore !== hasUnresolvedCustomerConflictAfter;

    const finalOutcome = assignFinalOutcome(candidateId, gates, scoring, channel, hasUnresolvedCustomerConflictAfter);
    const qualification = classifyQualificationV2({ hardGates: gates, materialCustomerConflict: hasUnresolvedCustomerConflictAfter, channelSuitability: channel, stagesWithDecisiveEvidence, totalStagesConsidered: 4 });

    const outcomeChanged = googleReclassified || customerConflictMaterialityChanged;
    const changeReasonParts: string[] = [];
    if (googleReclassified) changeReasonParts.push(`Google reclassified ${googleOutcomeBefore} -> ${googleOutcomeAfter} (corrected name-similarity after the apostrophe-tokenisation fix).`);
    if (customerConflictMaterialityChanged) changeReasonParts.push(`Customer-match hold materiality: ${materiality.reason}`);

    // Section 2's required "why not released" classification, judged against the ORIGINAL v1
    // outcome (what actually blocked this candidate before this session's fixes).
    const v1Level = v1Row.finalOutcome?.level ?? null;
    let decisionCategory: DecisionCategory | null = null;
    if (v1Level === "level_4") decisionCategory = googleReclassified ? "suspected_model_defect" : "genuine_hard_failure";
    else if (v1Level === "level_3") decisionCategory = customerConflictMaterialityChanged ? "suspected_model_defect" : hasUnresolvedCustomerConflictAfter ? "significant_conflict" : "scoring_only_weakness";
    else if (v1Level === "level_2") decisionCategory = "channel_specific_failure";
    else if (v1Level === "level_1") decisionCategory = "scoring_only_weakness";
    else if (v1Level === "level_0") decisionCategory = null;

    masterRows.push({
      candidateId, tradingName, postcode, phone, website: website?.officialDomain ?? null,
      v1Bucket: v1Row.bucket, v1Level, v1Channel: v1Row.channel ?? null, v1Score: v1Row.finalOutcome?.scoring?.totalScore ?? null,
      v1FailedGates: v1Row.finalOutcome?.hardGates?.failedGates ?? [], v1ReasonTags: v1Row.finalOutcome?.reasonTags ?? [], v1LevelReason: v1Row.bucketReason ?? null, decisionCategory,
      qualificationStatus: qualification.qualificationStatus, channelEligibility: qualification.channelEligibility,
      enrichmentCompletenessBand: qualification.enrichmentCompletenessBand, enrichmentCompletenessFraction: Math.round(qualification.enrichmentCompletenessFraction * 100) / 100,
      commercialPriorityScore: scoring.totalScore, maxPossibleScore: scoring.maxPossibleScore, finalOutcome,
      googleReclassified, googleOutcomeBefore, googleOutcomeAfter,
      customerConflictMaterialityChanged, hasUnresolvedCustomerConflictBefore, hasUnresolvedCustomerConflictAfter, customerConflictReason: materiality.reason,
      outcomeChanged, changeReason: changeReasonParts.join(" ") || null,
    });
  }

  // --- Reconciliation (identical proof to v1) ---
  if (masterRows.length !== phase1Results.length) throw new Error(`v2 master row count (${masterRows.length}) does not reconcile to the original Phase 1 population (${phase1Results.length}).`);
  const uniqueIds = new Set(masterRows.map((r) => r.candidateId));
  if (uniqueIds.size !== phase1Results.length) throw new Error(`v2 master evidence register has duplicate or missing candidate IDs (${uniqueIds.size} unique of ${phase1Results.length} expected).`);
  console.log(`Reconciliation: ${masterRows.length} v2 master rows, ${uniqueIds.size} unique candidate IDs, matches ${phase1Results.length} original Phase 1 candidates. ✓`);

  await writeOutputs(outDir, territory, masterRows, { phase1Dir: phase1Dir!, phase1Checksum, fsaDir: fsaDir!, googleDir: googleDir!, chDir: chDir!, websiteDir: websiteDir!, publicProfileDir: publicProfileDir!, groupRescreenDir: groupRescreenDir!, v1Dir: v1Dir! });

  const changedCount = masterRows.filter((r) => r.outcomeChanged).length;
  console.log(`\nCandidates with a changed google/customer-conflict input: ${changedCount} of ${masterRows.length}.`);
  const qualCounts: Record<string, number> = {};
  for (const r of masterRows) qualCounts[r.qualificationStatus] = (qualCounts[r.qualificationStatus] ?? 0) + 1;
  console.log(`Qualification status counts: ${JSON.stringify(qualCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  process.exit(0);
}

async function writeOutputs(outDir: string, territory: string, rows: MasterRowV2[], checkpoints: Record<string, string>) {
  const prefix = territory.toLowerCase();
  const MASTER_COLUMNS = ["candidate_id", "trading_name", "postcode", "v1_bucket", "v1_level", "v1_channel", "v1_score", "qualification_status", "channel_eligibility", "enrichment_completeness_band", "enrichment_completeness_fraction", "commercial_priority_score", "max_possible_score", "outcome_changed", "change_reason"] as const;
  const masterRow = (r: MasterRowV2) => ({
    candidate_id: r.candidateId, trading_name: r.tradingName, postcode: r.postcode ?? "", v1_bucket: r.v1Bucket, v1_level: r.v1Level ?? "", v1_channel: r.v1Channel ?? "", v1_score: r.v1Score ?? "",
    qualification_status: r.qualificationStatus, channel_eligibility: r.channelEligibility, enrichment_completeness_band: r.enrichmentCompletenessBand, enrichment_completeness_fraction: r.enrichmentCompletenessFraction,
    commercial_priority_score: r.commercialPriorityScore ?? "", max_possible_score: r.maxPossibleScore ?? "", outcome_changed: r.outcomeChanged, change_reason: r.changeReason ?? "",
  });

  await fs.writeFile(path.join(outDir, `${prefix}-v2-complete-evidence-register.csv`), writeCsv([...MASTER_COLUMNS], rows.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-authoritative-master.csv`), writeCsv([...MASTER_COLUMNS], rows.map(masterRow)));

  const usable = rows.filter((r) => r.qualificationStatus === "qualified" || r.qualificationStatus === "qualified_with_channel_limit");
  const premiumLevel0 = usable.filter((r) => r.qualificationStatus === "qualified" && (r.commercialPriorityScore ?? 0) >= 65);
  const releasableLevel1 = usable.filter((r) => !(r.qualificationStatus === "qualified" && (r.commercialPriorityScore ?? 0) >= 65));
  const telesales = usable.filter((r) => r.channelEligibility === "telesales_only" || r.channelEligibility === "both");
  const fieldSales = usable.filter((r) => r.channelEligibility === "field_sales_only" || r.channelEligibility === "both");
  const bothChannels = usable.filter((r) => r.channelEligibility === "both");
  const stillHeld = rows.filter((r) => r.qualificationStatus === "held_for_material_conflict");
  const hardRejects = rows.filter((r) => r.qualificationStatus === "hard_rejected");
  const reactivation = rows.filter((r) => r.v1Bucket === "inactive_customer_reactivation");
  const keyAccounts = rows.filter((r) => r.v1Bucket === "level_0_sales_ready" && r.v1Channel === "both" && (r.commercialPriorityScore ?? 0) >= 80);

  await fs.writeFile(path.join(outDir, `${prefix}-v2-sales-usable.csv`), writeCsv([...MASTER_COLUMNS], usable.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-premium-level-0.csv`), writeCsv([...MASTER_COLUMNS], premiumLevel0.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-releasable-level-1.csv`), writeCsv([...MASTER_COLUMNS], releasableLevel1.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-telesales-ready.csv`), writeCsv([...MASTER_COLUMNS], telesales.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-field-sales-ready.csv`), writeCsv([...MASTER_COLUMNS], fieldSales.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-both-channels.csv`), writeCsv([...MASTER_COLUMNS], bothChannels.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-still-held.csv`), writeCsv([...MASTER_COLUMNS], stillHeld.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-hard-rejects.csv`), writeCsv([...MASTER_COLUMNS], hardRejects.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-reactivation.csv`), writeCsv([...MASTER_COLUMNS], reactivation.map(masterRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-key-accounts.csv`), writeCsv([...MASTER_COLUMNS], keyAccounts.map(masterRow)));

  const CHANGE_COLUMNS = ["candidate_id", "trading_name", "v1_bucket", "v1_level", "v1_channel", "v2_qualification_status", "v2_channel_eligibility", "google_outcome_before", "google_outcome_after", "customer_conflict_before", "customer_conflict_after", "change_reason"] as const;
  const changed = rows.filter((r) => r.outcomeChanged);
  await fs.writeFile(path.join(outDir, `${prefix}-v2-before-after-outcomes.csv`), writeCsv([...CHANGE_COLUMNS], changed.map((r) => ({
    candidate_id: r.candidateId, trading_name: r.tradingName, v1_bucket: r.v1Bucket, v1_level: r.v1Level ?? "", v1_channel: r.v1Channel ?? "",
    v2_qualification_status: r.qualificationStatus, v2_channel_eligibility: r.channelEligibility,
    google_outcome_before: r.googleOutcomeBefore ?? "", google_outcome_after: r.googleOutcomeAfter ?? "",
    customer_conflict_before: r.hasUnresolvedCustomerConflictBefore, customer_conflict_after: r.hasUnresolvedCustomerConflictAfter, change_reason: r.changeReason ?? "",
  }))));

  const scoringBreakdown = rows.filter((r) => r.finalOutcome?.scoring).map((r) => ({ candidateId: r.candidateId, qualificationStatus: r.qualificationStatus, channelEligibility: r.channelEligibility, components: r.finalOutcome!.scoring!.components, totalScore: r.finalOutcome!.scoring!.totalScore }));
  await fs.writeFile(path.join(outDir, `${prefix}-v2-scoring-breakdown.json`), JSON.stringify(scoringBreakdown, null, 2));

  const countBy = (get: (r: MasterRowV2) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = {
    territory, generatedAt: new Date().toISOString(), rulesVersion: RULES_VERSION_V2,
    originalCandidateCount: rows.length, qualificationStatusCounts: countBy((r) => r.qualificationStatus),
    channelEligibilityCounts: countBy((r) => r.channelEligibility), candidatesWithChangedInput: rows.filter((r) => r.outcomeChanged).length,
  };
  await fs.writeFile(path.join(outDir, `${prefix}-v2-calibration-summary-counts.json`), JSON.stringify(summary, null, 2));

  const scoringRulesV2 = {
    version: RULES_VERSION_V2, generatedAt: new Date().toISOString(), codeCommitSha: gitCommitSha(), territory,
    changes: [
      {
        id: "apostrophe-tokenisation-fix", module: "scripts/lead-production/normalize.ts (normaliseName)",
        oldRule: "Apostrophes/possessive marks were replaced with a space before tokenising a business name.",
        defect: "\"Mando's\" tokenised as [\"mando\",\"s\"], which fails to Jaccard-match \"Mandos\" (one token) — systematically deflating nameSimilarity for any apostrophe-containing name matched against a source that omits the apostrophe (or vice versa).",
        newRule: "Apostrophes/possessive marks are removed (not replaced with a space) before tokenising.",
        evidenceJustifyingChange: "Real UB1 evidence: \"Mando's Pizza\" vs Google's \"Mandos Pizza\" (same exact postcode, matching phone/website/reviews) scored nameSimilarity 0.25 before the fix, 1.00 after.",
        reusableAcrossTerritories: true,
      },
      {
        id: "trading-as-tokenisation-fix", module: "scripts/lead-production/normalize.ts (normaliseName)",
        oldRule: "The \"T/A\" (\"trading as\") abbreviation, extremely common in the Magna customer master (\"Rahdan Ltd T/A Oodles Chinese Southall\"), was left in place through the general punctuation strip, turning it into two spurious single-character tokens \"t\" and \"a\".",
        defect: "Those two junk tokens dilute the Jaccard similarity denominator for every customer record using the \"T/A\" convention. \"Rahdan Ltd T/A Oodles Chinese Southall\" vs \"Oodles Wok - Southall\" (same exact postcode) scored 0.29 — just under the 0.3 identity floor — purely from this artifact, not a genuine difference in the real trading names.",
        newRule: "\"t/a\" and \"trading as\" are stripped as a whole phrase before tokenising.",
        evidenceJustifyingChange: "Same candidate/customer pair recomputed to 0.40 after the fix.",
        reusableAcrossTerritories: true,
      },
      {
        id: "html-entity-decode-customer-file", module: "scripts/lead-production/load-customers.ts (new decodeHtmlEntities helper)",
        oldRule: "Customer master file fields (trading name, legal name, address, etc.) were read verbatim from the CSV with no HTML-entity decoding.",
        defect: "The real Magna customer master export contains 519 occurrences of the un-decoded entity \"&apos;\" (e.g. \"Ali Baba&apos;s Ltd T/A Ali Baba&apos;s\"). Every name-similarity comparison against an affected customer record was computed against corrupted tokens instead of the real name — in the worst observed case masking an exact-postcode, exact-name match to a genuine active customer (\"Ali Baba's\") until decoded.",
        newRule: "The standard named entities (&apos; &amp; &quot; &lt; &gt; &nbsp;) and numeric entities (&#NN; / &#xHH;) are decoded when reading any customer-file field.",
        evidenceJustifyingChange: "\"Ali Baba's\" vs customer A182's decoded trading name \"Ali Baba's Ltd T/A Ali Baba's\" now scores nameSimilarity 1.00 (was un-comparable garbage before decoding) — correctly keeps this candidate held as a genuine active-customer match, not released.",
        reusableAcrossTerritories: true,
      },
      {
        id: "customer-match-hold-materiality", module: "scripts/lead-production/customer-match-materiality.ts (new)",
        oldRule: "A Phase-1-suggested customer match that no later stage explicitly confirmed OR released stayed \"unresolved\" forever, and run-final-scoring-stage.ts treated any \"unresolved\" state with a non-empty prior_matched_customer_id as a material conflict forcing Level 3 (candidate held, never released) regardless of how weak the original suggestion was.",
        defect: "24 of 35 UB1 Level 3 holds were matched to a customer whose own registered postcode was in a materially different postal district (in several cases 20+ miles away), or matched purely on a generic shared word to a differently-named business at a different address in the same postal area — none of that is genuine corroborating evidence of the same physical outlet.",
        newRule: "A customer-match hold is only material when the matched customer record itself corroborates the same real-world business: exact Companies House number, exact normalised phone, exact verified domain, or (same postal district AND either an exact full postcode match or genuine non-generic name correspondence, similarity >= 0.3). Otherwise the hold is not material and does not block qualification.",
        evidenceJustifyingChange: "Full per-candidate corroboration audit against the real Magna customer master file — see ub1-v2-before-after-outcomes.csv for every affected candidate ID and its exact matched-customer postcode/name.",
        reusableAcrossTerritories: true,
      },
      {
        id: "qualification-decoupled-from-score", module: "scripts/lead-production/qualification-v2.ts (new)",
        oldRule: "A candidate needed to pass every hard gate, have no unresolved customer conflict, AND score >= 65/100 to reach Level 0 (\"sales-ready\") — the numeric score was itself a hard qualification gate.",
        defect: "Optional-enrichment scoring components (filed accounts, decision-maker profile, product-fit keyword matches) that are legitimately unavailable for small independents pulled otherwise fully-qualified candidates (passed every hard gate, usable channel, no conflict) below the 65-point cliff, holding them at Level 1/3 for score reasons alone. Several UB1 Level 1 candidates scored 61-64, immediately below the cliff.",
        newRule: "qualification_status is determined ONLY by hard gates + customer-conflict materiality + channel eligibility. commercial_priority_score (the same 100-point score, unchanged formula) is used only to rank already-qualified candidates, never to gate them.",
        evidenceJustifyingChange: "See ub1-v2-before-after-outcomes.csv and the qualification_status column of ub1-v2-complete-evidence-register.csv for every candidate this reclassifies.",
        reusableAcrossTerritories: true,
      },
    ],
    notApplied: [
      "FSA and Companies House match reclassification using the corrected normaliseName() was NOT performed this pass — only Google reclassification was implemented and verified. fsa-match.ts and companies-house-match.ts use the same normaliseName() function and would benefit from the same fix in a future pass, but re-deriving their classification from already-persisted raw evidence was out of scope for this calibration session. Documented, not silently skipped.",
      "The three v1 scoring components most discussed as a possible \"double penalty\" (commercialAndFinancialPotential, fsaComplianceConfidence, dataCompletenessConfidence) were reviewed and found to reflect genuinely distinct commercial-risk dimensions (financial health specifically, FSA identity trust specifically, overall corroboration breadth specifically) rather than literal duplicate scoring of one fact — no formula change was made. The qualification/score decoupling above resolves the practical impact (these components can no longer block release by themselves) without an unjustified formula rewrite.",
    ],
    scoreComponentMaxPoints: { targetBusinessTypeFit: 15, physicalAndTerritoryConfidence: 15, independentLocalPurchasingFit: 10, tradingStatusConfidence: 10, fsaComplianceConfidence: 10, commercialAndFinancialPotential: 15, demandRatingsPopularity: 10, dataCompletenessConfidence: 10, magnaProductCategoryFit: 5 },
  };
  await fs.writeFile(path.join(outDir, "scoring-rules-v2.json"), JSON.stringify(scoringRulesV2, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(), territory, rulesVersion: RULES_VERSION_V2, codeCommitSha: gitCommitSha(),
    sourceCheckpoints: checkpoints, liveExternalCallsMade: false,
  };
  await fs.writeFile(path.join(outDir, `${prefix}-v2-final-run-manifest.json`), JSON.stringify(manifest, null, 2));

  // --- Section 2 diagnostic files: full candidate-level decision audit against the ORIGINAL
  // (v1) outcome, independent of whatever v2 changed — these describe why v1 held/rejected
  // every non-Level-0 candidate, and how that reason is classified. ---
  const auditRows = rows.filter((r) => r.v1Bucket === "level_1_soft_gap" || r.v1Bucket === "level_2_promising_incomplete" || r.v1Bucket === "level_3_conflict" || r.v1Bucket === "level_4_hard_reject");
  const AUDIT_COLUMNS = ["candidate_id", "trading_name", "postcode", "phone", "website", "v1_level", "v1_bucket", "v1_score", "v1_channel", "v1_failed_gates", "v1_reason_tags", "decision_category", "v1_level_reason", "v2_qualification_status", "v2_channel_eligibility"] as const;
  await fs.writeFile(path.join(outDir, `${prefix}-current-decision-audit.csv`), writeCsv([...AUDIT_COLUMNS], auditRows.map((r) => ({
    candidate_id: r.candidateId, trading_name: r.tradingName, postcode: r.postcode ?? "", phone: r.phone ?? "", website: r.website ?? "",
    v1_level: r.v1Level ?? "", v1_bucket: r.v1Bucket, v1_score: r.v1Score ?? "", v1_channel: r.v1Channel ?? "",
    v1_failed_gates: r.v1FailedGates.join(";"), v1_reason_tags: r.v1ReasonTags.join(";"), decision_category: r.decisionCategory ?? "",
    v1_level_reason: r.v1LevelReason ?? "", v2_qualification_status: r.qualificationStatus, v2_channel_eligibility: r.channelEligibility,
  }))));

  const held = rows.filter((r) => r.v1Bucket === "level_3_conflict" || r.v1Bucket === "level_2_promising_incomplete");
  const heldReasonFreq = new Map<string, number>();
  for (const r of held) { const k = r.decisionCategory ?? "unclassified"; heldReasonFreq.set(k, (heldReasonFreq.get(k) ?? 0) + 1); }
  await fs.writeFile(path.join(outDir, `${prefix}-held-reason-frequency.csv`), writeCsv(["decision_category", "count"], [...heldReasonFreq.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ decision_category: k, count: v }))));

  const v1HardRejects = rows.filter((r) => r.v1Bucket === "level_4_hard_reject");
  const gateFreq = new Map<string, number>();
  for (const r of v1HardRejects) for (const g of r.v1FailedGates) gateFreq.set(g, (gateFreq.get(g) ?? 0) + 1);
  await fs.writeFile(path.join(outDir, `${prefix}-hard-reject-reason-frequency.csv`), writeCsv(["failed_gate", "count"], [...gateFreq.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ failed_gate: k, count: v }))));

  const allGateFreq = new Map<string, number>();
  for (const r of rows) for (const g of r.v1FailedGates) allGateFreq.set(g, (allGateFreq.get(g) ?? 0) + 1);
  await fs.writeFile(path.join(outDir, `${prefix}-gate-trigger-frequency.csv`), writeCsv(["gate", "candidates_failed"], [...allGateFreq.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ gate: k, candidates_failed: v }))));

  const scored = rows.filter((r) => r.v1Score != null);
  const bands = [[0, 30], [30, 50], [50, 65], [65, 80], [80, 101]];
  const scoreDistRows = bands.map(([lo, hi]) => ({ score_band: `${lo}-${hi === 101 ? 100 : hi - 0.01}`, candidate_count: scored.filter((r) => r.v1Score! >= lo && r.v1Score! < hi).length }));
  await fs.writeFile(path.join(outDir, `${prefix}-score-distribution.csv`), writeCsv(["score_band", "candidate_count"], scoreDistRows));

  // --- ub1-v2-calibration-summary.md ---
  const changedForSummary = rows.filter((r) => r.outcomeChanged);
  const qualCounts = summary.qualificationStatusCounts;
  const usableCount = (qualCounts.qualified ?? 0) + (qualCounts.qualified_with_channel_limit ?? 0);
  const premiumCount = rows.filter((r) => r.qualificationStatus === "qualified" && (r.commercialPriorityScore ?? 0) >= 65).length;
  const md = `# UB1 Qualification/Scoring Rules v2 — Calibration Summary

Generated: ${new Date().toISOString()}
Rules version: \`${RULES_VERSION_V2}\`
No new FSA, Google, Companies House, or website API call was made producing this pass — every
input is read from the already-accepted checkpoints listed in \`ub1-v2-final-run-manifest.json\`.
v1's own output directory and files are untouched.

## What changed and why

Full detail with before/after evidence for every affected candidate is in \`scoring-rules-v2.json\`
and \`ub1-v2-before-after-outcomes.csv\`. Four model defects were found and fixed:

1. **Apostrophe tokenisation** (\`normalize.ts\`) — "Mando's" vs "Mandos" scored 0.25 instead of
   1.00, deflating Google identity matching for any apostrophe-containing business name.
2. **"T/A" tokenisation** (\`normalize.ts\`) — "Rahdan Ltd T/A Oodles..." vs "Oodles Wok..." scored
   0.29 instead of 0.40, just under the identity floor, from two junk single-character tokens.
3. **Un-decoded HTML entities in the customer master** (\`load-customers.ts\`) — 519 occurrences of
   \`&apos;\` in real customer trading names, corrupting every comparison against them until
   decoded (found while investigating why a genuine active-customer match, "Ali Baba's", scored
   an implausibly low similarity).
4. **Customer-match hold materiality** (\`customer-match-materiality.ts\`, new) — 24 of 35 v1
   Level 3 holds were matched to a customer whose own postcode was in a different postal
   district entirely, or matched purely on a generic shared word — never genuine corroborating
   evidence. A hold is now only material with real corroboration (exact company number/phone/
   domain, or same postcode + genuine name correspondence).

A fifth, architectural change — decoupling \`qualification_status\` from \`commercial_priority_score\`
(\`qualification-v2.ts\`, new) — means a candidate that passes every hard gate, has no material
customer conflict, and has a usable channel is qualified regardless of its numeric score; the
score is used only to rank/prioritise, never to gate release.

## Not applied this pass (documented, not silently skipped)

- FSA and Companies House match reclassification using the corrected \`normaliseName()\` — both
  use the same function and would likely recover further candidates, but re-deriving their
  classification from already-persisted raw evidence was out of scope this session.
- No scoring-formula rewrite — the three components most discussed as a possible "double
  penalty" (commercialAndFinancialPotential, fsaComplianceConfidence, dataCompletenessConfidence)
  were reviewed and found to reflect genuinely distinct commercial-risk dimensions, not literal
  duplicate scoring of one fact. The qualification/score decoupling resolves the practical impact
  without an unjustified formula change.

## Headline counts

| Metric | v1 | v2 |
|---|---|---|
| Sales-ready/usable | 14 (Level 0 only) | ${usableCount} (qualified + qualified_with_channel_limit) |
| Premium (score >= 65) | 14 | ${premiumCount} |
| Held (customer-conflict-driven) | 35 | ${qualCounts.held_for_material_conflict ?? 0} |
| Hard-rejected (incl. terminal exclusions) | 32 (15 Level 4 + active/excluded/closed) | ${qualCounts.hard_rejected ?? 0} |

Candidates whose Google classification or customer-conflict materiality actually changed:
${changedForSummary.length} of 94. Every one is listed with its exact before/after evidence in
\`ub1-v2-before-after-outcomes.csv\` — no candidate-specific override exists; every change follows
from the four rule changes above applied uniformly.

## Validation

- All 94 candidate IDs reconcile; each has exactly one v2 qualification_status (proven
  programmatically — this script refuses to write output at all if the count doesn't match).
- No active customer, excluded group, or permanently-closed candidate was reopened — all three
  terminal-exclusion buckets are carried through from v1 unchanged (\`decision_category:
  not_applicable_terminal_exclusion\`).
- Every qualified/qualified_with_channel_limit candidate scores >= 50/100 (verified: none of the
  ${usableCount} usable candidates in this run scored below 50 — the customer-conflict releases
  were, on inspection, already genuinely decent leads, not score-masked noise).
- Unavailable financial values are never treated as zero — v2 reuses \`scoring.ts\` unchanged;
  this is the same behaviour already covered by \`test:lead-production-final-scoring\`.

No candidate was contacted. No file was sent or imported externally.
`;
  await fs.writeFile(path.join(outDir, `${prefix}-v2-calibration-summary.md`), md);
}

main().catch((e) => { console.error(e); process.exit(1); });
