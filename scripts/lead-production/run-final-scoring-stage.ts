// Phase 8 CLI (spec Phase E/F): final hard-gate qualification, 100-point scoring, telesales/
// field-sales channel suitability, and Level 0-4 assignment for the eligible population — then
// the complete master evidence register and UB1 final output files, reconciled back to every
// one of the ORIGINAL Phase 1 candidates. No live calls — pure consolidation of every prior
// checkpoint (Phase 1 through Phase 7), so running it is the live execution.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeCsv, parseCsvObjects } from "./csv";
import { evaluateHardGates, trustworthyCompaniesHouseStatus } from "./hard-gates";
import { calculateScore } from "./scoring";
import { calculateChannelSuitability } from "./channel-suitability";
import { assignFinalOutcome } from "./final-outcome";
import type { MasterOutcomeBucket, FinalOutcomeResult } from "./types";

const RULES_VERSION = "final-scoring-stage-v1";
function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function md5(filePath: string): Promise<string> { return createHash("md5").update(await fs.readFile(filePath)).digest("hex"); }
function gitCommitSha(): string { try { return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { return "unknown"; } }

async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readCsvRows(p: string): Promise<Record<string, string>[]> { return (await parseCsvObjects(await fs.readFile(p, "utf8"))).rows; }

interface MasterRow {
  candidateId: string;
  tradingName: string;
  postcode: string | null;
  bucket: MasterOutcomeBucket;
  bucketReason: string;
  finalOutcome: FinalOutcomeResult | null;
  channel: string | null;
}

async function main() {
  const phase1Dir = arg("phase1-dir");
  const fsaDir = arg("fsa-dir");
  const googleDir = arg("google-checkpoint");
  const chDir = arg("companies-house-dir");
  const websiteDir = arg("website-dir");
  const publicProfileDir = arg("public-profile-dir");
  const groupRescreenDir = arg("group-rescreen-dir");
  const outArg = arg("out");
  const territory = arg("territory") ?? "UB1";

  const missing = [!phase1Dir && "--phase1-dir", !fsaDir && "--fsa-dir", !googleDir && "--google-checkpoint", !chDir && "--companies-house-dir", !websiteDir && "--website-dir", !publicProfileDir && "--public-profile-dir", !groupRescreenDir && "--group-rescreen-dir", !outArg && "--out"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.map((m) => `${m}=<path>`).join("\n  ")); process.exit(1); }

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });
  console.log("=== Lead-production bridge: Phase 8 — Final qualification, scoring, and UB1 outputs ===");

  // --- Load every checkpoint (read-only) ---
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

  console.log(`Phase 1: ${phase1Results.length} original candidates. CH-eligible population: ${eligibleIds.length}.`);

  // --- Determine each of the 94's MasterOutcomeBucket ---
  const masterRows: MasterRow[] = [];
  const eligibleSet = new Set(eligibleIds);

  for (const p1 of phase1Results) {
    const candidateId = p1.candidateId;
    const tradingName = p1.normalisedName?.candidateOriginal ?? "";
    const postcode = p1.normalisedPostcode?.candidateOriginal ?? null;

    // Phase 1 terminal exclusions.
    if (p1.preliminaryStatus === "active_customer") { masterRows.push({ candidateId, tradingName, postcode, bucket: "active_customer_excluded", bucketReason: "Confirmed active Magna customer at Phase 1.", finalOutcome: null, channel: null }); continue; }
    if (p1.preliminaryStatus === "inactive_customer") { masterRows.push({ candidateId, tradingName, postcode, bucket: "inactive_customer_reactivation", bucketReason: "Confirmed inactive Magna customer at Phase 1 (reactivation candidate).", finalOutcome: null, channel: null }); continue; }
    if (p1.preliminaryStatus === "excluded_large_group") { masterRows.push({ candidateId, tradingName, postcode, bucket: "excluded_large_group", bucketReason: "Excluded large national group/chain at Phase 1.", finalOutcome: null, channel: null }); continue; }

    // FSA-stage terminal exclusion.
    const fsaCustRes = fsaCustResByCandidate.get(candidateId);
    if (fsaCustRes?.resolution_outcome === "confirmed_active_customer_after_fsa") { masterRows.push({ candidateId, tradingName, postcode, bucket: "active_customer_excluded", bucketReason: "Confirmed active Magna customer after FSA evidence.", finalOutcome: null, channel: null }); continue; }
    if (fsaCustRes?.resolution_outcome === "confirmed_inactive_customer_after_fsa") { masterRows.push({ candidateId, tradingName, postcode, bucket: "inactive_customer_reactivation", bucketReason: "Confirmed inactive Magna customer after FSA evidence.", finalOutcome: null, channel: null }); continue; }

    // Google-stage terminal exclusions (only for candidates that reached the Google stage).
    const googleCustRes = googleCustResByCandidate.get(candidateId);
    if (googleCustRes?.resolution_outcome === "confirmed_active_customer_after_google") { masterRows.push({ candidateId, tradingName, postcode, bucket: "active_customer_excluded", bucketReason: "Confirmed active Magna customer after Google evidence.", finalOutcome: null, channel: null }); continue; }
    if (googleCustRes?.resolution_outcome === "confirmed_inactive_customer_after_google") { masterRows.push({ candidateId, tradingName, postcode, bucket: "inactive_customer_reactivation", bucketReason: "Confirmed inactive Magna customer after Google evidence.", finalOutcome: null, channel: null }); continue; }
    const google = googleByCandidate.get(candidateId);
    if (google?.outcome === "permanently_closed") { masterRows.push({ candidateId, tradingName, postcode, bucket: "permanently_closed", bucketReason: "Google evidence confirms permanent closure.", finalOutcome: null, channel: null }); continue; }
    if (google?.outcome === "temporarily_closed") { masterRows.push({ candidateId, tradingName, postcode, bucket: "temporarily_closed_held", bucketReason: "Google evidence confirms temporary closure — held, not discarded.", finalOutcome: null, channel: null }); continue; }

    if (!eligibleSet.has(candidateId)) {
      // Should not happen given the above exhaustively covers every exclusion reason, but
      // fail closed rather than silently drop the candidate from the register.
      masterRows.push({ candidateId, tradingName, postcode, bucket: "probable_customer_match_unresolved", bucketReason: "Excluded from the Companies House-eligible population by an exclusion reason not explicitly enumerated above — held for manual review rather than silently dropped.", finalOutcome: null, channel: null });
      continue;
    }

    // --- Eligible: run hard gates, scoring, channel suitability, final Level 0-4 outcome. ---
    const chResult = chByCandidate.get(candidateId);
    const chCustRes = chCustResByCandidate.get(candidateId);
    const finCalc = financialCalcByCandidate.get(candidateId);
    const groupRescreen = groupRescreenByCandidate.get(candidateId);
    const website = websiteByCandidate.get(candidateId) ?? null;
    const productFit = productFitByCandidate.get(candidateId) ?? null;
    const physicalPremises = physicalPremisesByCandidate.get(candidateId) ?? null;
    const fsa = fsaByCandidate.get(candidateId);
    const fsaResAfterGoogle = fsaResolutionByCandidate.get(candidateId);
    const decisionMaker = decisionMakerByCandidate.get(candidateId);
    const publicProfile = decisionMaker ? publicProfileByCandidate.get(candidateId) : undefined;

    const googleDecisive = google && ["exact_google_match", "strong_probable_google_match"].includes(google.outcome);
    const chDecisive = chResult && ["exact_company_match", "strong_probable_company_match"].includes(chResult.outcome);
    const fsaDecisive = fsa && (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match" || fsaResAfterGoogle?.resolution === "fsa_resolved_exact" || fsaResAfterGoogle?.resolution === "fsa_resolved_probable");
    const websiteCrawled = !!website?.officialDomain;
    const stagesWithDecisiveEvidence = [googleDecisive, fsaDecisive, chDecisive, websiteCrawled].filter(Boolean).length;

    const phone = website?.phone?.value ?? google?.plausibleResults?.[0]?.phone ?? null;
    const phoneSource: "website" | "google" | null = website?.phone?.value ? "website" : google?.plausibleResults?.[0]?.phone ? "google" : null;
    const lat = googleDecisive ? google.plausibleResults[0]?.latitude ?? null : null;
    const lng = googleDecisive ? google.plausibleResults[0]?.longitude ?? null : null;
    const hasWebsiteContact = website?.hasContactForm?.value === true || !!website?.email?.value;

    const identityConfidence: "high" | "medium" | "low" | "not_available" = googleDecisive && chDecisive ? "high" : googleDecisive || chDecisive ? "medium" : fsaDecisive ? "low" : "not_available";
    const decisionMakerConfidence: "high" | "medium" | "low" | "not_available" = publicProfile?.outcome === "official_website_profile_only" ? "medium" : decisionMaker ? "low" : "not_available";

    // See hard-gates.ts's trustworthyCompaniesHouseStatus() header for why this is necessary —
    // a non-decisive CH outcome's status must never leak in as if it were this candidate's own.
    const trustworthyChStatus = trustworthyCompaniesHouseStatus(chResult?.outcome ?? null, chResult?.companiesHouseStatus ?? null);

    const gates = evaluateHardGates({
      candidateId, territory,
      physicalPremises: physicalPremises as any,
      googleOutcome: (google?.outcome ?? "no_google_match") as any,
      companiesHouseOutcome: (chResult?.outcome ?? "no_company_record") as any,
      companiesHouseStatus: trustworthyChStatus,
      customerResolutionOutcome: (chCustRes?.resolution_outcome ?? "unresolved_customer_match_after_companies_house") as any,
      finalGroupClassification: (groupRescreen?.classification ?? "ownership_unresolved") as any,
      finalGroupDefaultOutcome: (groupRescreen?.defaultOutcome ?? null) as any,
      hasContactablePostcode: !!postcode,
      hasAnyContactChannel: !!phone || hasWebsiteContact,
    });

    const scoring = calculateScore({
      candidateId, googleOutcome: (google?.outcome ?? "no_google_match") as any,
      googlePrimaryCategory: googleDecisive ? google.plausibleResults[0]?.primaryCategory ?? null : null,
      googleAdditionalCategories: googleDecisive ? google.plausibleResults[0]?.additionalCategories ?? [] : [],
      googleRating: googleDecisive ? google.plausibleResults[0]?.rating ?? null : null,
      googleReviewCount: googleDecisive ? google.plausibleResults[0]?.reviewCount ?? null : null,
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

    const hasUnresolvedCustomerConflict = chCustRes?.resolution_outcome === "unresolved_customer_match_after_companies_house" && chCustRes.prior_matched_customer_id;
    const finalOutcome = assignFinalOutcome(candidateId, gates, scoring, channel, !!hasUnresolvedCustomerConflict);

    const bucket: MasterOutcomeBucket = finalOutcome.level === "level_0" ? "level_0_sales_ready" : finalOutcome.level === "level_1" ? "level_1_soft_gap" : finalOutcome.level === "level_2" ? "level_2_promising_incomplete" : finalOutcome.level === "level_3" ? "level_3_conflict" : "level_4_hard_reject";
    masterRows.push({ candidateId, tradingName, postcode, bucket, bucketReason: finalOutcome.levelReason, finalOutcome, channel: channel.suitability });
  }

  // --- Reconciliation ---
  if (masterRows.length !== phase1Results.length) throw new Error(`Master row count (${masterRows.length}) does not reconcile to the original Phase 1 population (${phase1Results.length}).`);
  const uniqueIds = new Set(masterRows.map((r) => r.candidateId));
  if (uniqueIds.size !== phase1Results.length) throw new Error(`Master evidence register has duplicate or missing candidate IDs (${uniqueIds.size} unique of ${phase1Results.length} expected).`);
  console.log(`Reconciliation: ${masterRows.length} master rows, ${uniqueIds.size} unique candidate IDs, matches ${phase1Results.length} original Phase 1 candidates. ✓`);

  // --- Output files ---
  const MASTER_COLUMNS = ["candidate_id", "trading_name", "postcode", "bucket", "bucket_reason", "level", "total_score", "max_possible_score", "channel_suitability", "hard_gates_passed", "failed_gates"] as const;
  function masterRow(r: MasterRow): Record<string, unknown> {
    return {
      candidate_id: r.candidateId, trading_name: r.tradingName, postcode: r.postcode ?? "", bucket: r.bucket, bucket_reason: r.bucketReason,
      level: r.finalOutcome?.level ?? "", total_score: r.finalOutcome?.scoring?.totalScore ?? "", max_possible_score: r.finalOutcome?.scoring?.maxPossibleScore ?? "",
      channel_suitability: r.channel ?? "", hard_gates_passed: r.finalOutcome?.hardGates.allPassed ?? "", failed_gates: r.finalOutcome?.hardGates.failedGates.join(";") ?? "",
    };
  }
  await fs.writeFile(path.join(outDir, "ub1-authoritative-master.csv"), writeCsv([...MASTER_COLUMNS], masterRows.map(masterRow)));
  await fs.writeFile(path.join(outDir, "ub1-authoritative-master.json"), JSON.stringify(masterRows, null, 2));
  await fs.writeFile(path.join(outDir, "ub1-complete-evidence-register.csv"), writeCsv([...MASTER_COLUMNS], masterRows.map(masterRow)));

  const bucketFilter = (bucket: MasterOutcomeBucket) => masterRows.filter((r) => r.bucket === bucket).map(masterRow);
  await fs.writeFile(path.join(outDir, "ub1-sales-ready.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("level_0_sales_ready")));
  await fs.writeFile(path.join(outDir, "ub1-telesales-ready.csv"), writeCsv([...MASTER_COLUMNS], masterRows.filter((r) => r.bucket === "level_0_sales_ready" && (r.channel === "telesales_only" || r.channel === "both")).map(masterRow)));
  await fs.writeFile(path.join(outDir, "ub1-field-sales-ready.csv"), writeCsv([...MASTER_COLUMNS], masterRows.filter((r) => r.bucket === "level_0_sales_ready" && (r.channel === "field_sales_only" || r.channel === "both")).map(masterRow)));
  await fs.writeFile(path.join(outDir, "ub1-both-channels.csv"), writeCsv([...MASTER_COLUMNS], masterRows.filter((r) => r.bucket === "level_0_sales_ready" && r.channel === "both").map(masterRow)));
  await fs.writeFile(path.join(outDir, "ub1-level-1-soft-gaps.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("level_1_soft_gap")));
  await fs.writeFile(path.join(outDir, "ub1-level-2-promising-incomplete.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("level_2_promising_incomplete")));
  await fs.writeFile(path.join(outDir, "ub1-level-3-conflicts.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("level_3_conflict")));
  await fs.writeFile(path.join(outDir, "ub1-level-4-hard-rejects.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("level_4_hard_reject")));
  await fs.writeFile(path.join(outDir, "ub1-active-customers-excluded.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("active_customer_excluded")));
  await fs.writeFile(path.join(outDir, "ub1-inactive-customer-reactivation.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("inactive_customer_reactivation")));
  await fs.writeFile(path.join(outDir, "ub1-probable-customer-matches.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("probable_customer_match_unresolved")));
  await fs.writeFile(path.join(outDir, "ub1-key-account-opportunities.csv"), writeCsv([...MASTER_COLUMNS], masterRows.filter((r) => groupRescreenByCandidate.get(r.candidateId)?.classification === "key_account_opportunity").map(masterRow)));
  await fs.writeFile(path.join(outDir, "ub1-out-of-territory-reassignment.csv"), writeCsv([...MASTER_COLUMNS], bucketFilter("out_of_territory_reassignment")));

  const scoringBreakdown = masterRows.filter((r) => r.finalOutcome?.scoring).map((r) => ({ candidateId: r.candidateId, level: r.finalOutcome!.level, components: r.finalOutcome!.scoring!.components, totalScore: r.finalOutcome!.scoring!.totalScore }));
  await fs.writeFile(path.join(outDir, "ub1-scoring-breakdown.json"), JSON.stringify(scoringBreakdown, null, 2));

  const countBy = (rows: MasterRow[], get: (r: MasterRow) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = {
    territory, processingTimestamp: new Date().toISOString(),
    originalCandidateCount: phase1Results.length, masterRowCount: masterRows.length, reconciles: masterRows.length === phase1Results.length,
    bucketCounts: countBy(masterRows, (r) => r.bucket),
    channelSuitabilityCounts: countBy(masterRows.filter((r) => r.channel), (r) => r.channel!),
    notice: "Final Level 0-4 outcomes assigned. This is the first and only stage in this bridge where a numeric score or Level is assigned.",
  };
  await fs.writeFile(path.join(outDir, "ub1-processing-summary.json"), JSON.stringify(summary, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(), territory, rulesVersion: RULES_VERSION, codeCommitSha: gitCommitSha(),
    sourceCheckpoints: { phase1Dir, phase1Checksum, fsaDir, googleDir, chDir, websiteDir, publicProfileDir, groupRescreenDir },
    scoreComponentMaxPoints: { targetBusinessTypeFit: 15, physicalAndTerritoryConfidence: 15, independentLocalPurchasingFit: 10, tradingStatusConfidence: 10, fsaComplianceConfidence: 10, commercialAndFinancialPotential: 15, demandRatingsPopularity: 10, dataCompletenessConfidence: 10, magnaProductCategoryFit: 5 },
  };
  await fs.writeFile(path.join(outDir, "ub1-final-run-manifest.json"), JSON.stringify(manifest, null, 2));

  // --- System-import placeholders (spec: never invent the external schema) ---
  await fs.writeFile(path.join(outDir, "system-import-template-required.json"), JSON.stringify({ notice: "The exact external-system import schema has not been supplied by the system owner. This file is a placeholder — populate it once the owner provides the exact required field list/format.", requiredFromOwner: ["Exact target system name (NetSuite CRM module? separate telesales tool?)", "Exact field names/order/types expected by the import", "Any required constant/default fields", "Encoding/delimiter requirements"] }, null, 2));
  await fs.writeFile(path.join(outDir, "system-import-field-gap-report.csv"), writeCsv(["field", "status"], [{ field: "ALL_FIELDS", status: "Exact external-system schema not yet supplied by the owner — see system-import-template-required.json" }]));

  console.log(`\nBucket counts: ${JSON.stringify(summary.bucketCounts)}`);
  console.log(`Channel suitability counts: ${JSON.stringify(summary.channelSuitabilityCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
