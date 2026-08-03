// Fixture-driven proofs for the qualification/scoring rules v2 calibration fixes
// (npm run test:lead-production-final-scoring-v2). Covers: the normaliseName() apostrophe and
// "t/a" tokenisation fixes, the HTML-entity decode fix, customer-match-materiality.ts, and
// qualification-v2.ts — plus an end-to-end territory-agnosticism proof running
// run-final-scoring-stage-v2.ts against two independent synthetic territories.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { normaliseName, nameSimilarity, isValidUkPhone } from "./lead-production/normalize";
import { decodeHtmlEntities } from "./lead-production/load-customers";
import { assessCustomerMatchMateriality } from "./lead-production/customer-match-materiality";
import { classifyQualificationV2 } from "./lead-production/qualification-v2";
import { deriveGoogleOutcome } from "./lead-production/google-match";
import type { HardGateResult, ChannelSuitabilityResult } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkGates(overrides: Partial<HardGateResult> = {}): HardGateResult {
  return { candidateId: "c1", allPassed: true, checks: [{ gate: "correct_territory", passed: true, reason: "ok" }], failedGates: [], ...overrides };
}
function mkChannel(suitability: ChannelSuitabilityResult["suitability"]): ChannelSuitabilityResult {
  return { candidateId: "c1", telesalesScore: 50, telesalesFactors: {}, fieldSalesScore: 50, fieldSalesFactors: {}, suitability };
}

async function main() {
  console.log("Qualification/scoring rules v2 — fixture-driven proofs:\n");

  // --- normaliseName(): apostrophe fix ---
  {
    assert(normaliseName("Mando's Pizza") === "mandos pizza", `apostrophe removed, not turned into a token boundary (got "${normaliseName("Mando's Pizza")}")`);
    assert(nameSimilarity(normaliseName("Mando's Pizza"), normaliseName("Mandos Pizza")) === 1, "\"Mando's Pizza\" and \"Mandos Pizza\" are now an exact token match");
    assert(nameSimilarity(normaliseName("Rocky's"), normaliseName("Rockys")) === 1, "\"Rocky's\" and \"Rockys\" are now an exact token match");
  }

  // --- normaliseName(): "t/a" fix ---
  {
    const norm = normaliseName("Rahdan Ltd T/A Oodles Chinese Southall");
    assert(!norm.split(" ").includes("t") && !norm.split(" ").includes("a"), `"t/a" does not leave behind spurious single-character tokens "t"/"a" (got "${norm}")`);
    const sim = nameSimilarity(norm, normaliseName("Oodles Wok - Southall"));
    assert(sim > 0.3, `"T/A" no longer drags a genuine same-postcode match below the identity floor (got ${sim.toFixed(2)})`);
  }

  // --- isValidUkPhone() — the single shared validator (2026-08-02), replacing three previously
  // independently-duplicated copies (candidate-dossier.ts, generate-field-provenance.ts, and the
  // formerly-unvalidated raw value used in run-final-scoring-stage-v2.ts's eligibility check) ---
  {
    assert(isValidUkPhone("020 8813 1010") === true, "a well-formed UK landline number is valid");
    assert(isValidUkPhone("+44 20 8813 1010") === true, "a well-formed +44 international-format number is valid");
    assert(isValidUkPhone("07123456789") === true, "a well-formed UK mobile number is valid");
    assert(isValidUkPhone(null) === false, "null is invalid");
    assert(isValidUkPhone("") === false, "empty string is invalid");
    // 2026-08-04 update: an un-decoded tel: href artifact is no longer rejected outright — the
    // campaign-002 phone-exception audit found 8 real candidates with exactly this class of raw
    // value, each containing a genuinely valid, recoverable UK number obscured by URL-encoding.
    // This fixture decodes to "+44 78854 03976" -> a valid-format UK mobile once normalised; see
    // test-lead-production-phone-validation.ts for the full real-case regression suite.
    assert(isValidUkPhone("+44%2078854%2003976") === true, "an un-decoded tel: href artifact IS recoverable when it contains a genuine UK number underneath the URL-encoding");
    assert(isValidUkPhone("%2Ggarbage%notarealnumber") === false, "a % artifact with no genuine recoverable UK number underneath is still invalid");
    assert(isValidUkPhone("12345") === false, "too short to be a real UK number is invalid");
    assert(isValidUkPhone("+65 4566 743") === false, "a non-UK international number is invalid");
  }

  // --- decodeHtmlEntities() ---
  {
    assert(decodeHtmlEntities("Ali Baba&apos;s Ltd T/A Ali Baba&apos;s") === "Ali Baba's Ltd T/A Ali Baba's", "the &apos; entity is decoded to a real apostrophe");
    assert(decodeHtmlEntities("Fish &amp; Chips") === "Fish & Chips", "the &amp; entity is decoded");
    assert(decodeHtmlEntities("No entities here") === "No entities here", "text with no entities is returned unchanged");
    assert(decodeHtmlEntities("") === "", "empty string handled without throwing");
    assert(nameSimilarity(normaliseName("Ali Baba's"), normaliseName(decodeHtmlEntities("Ali Baba&apos;s Ltd T/A Ali Baba&apos;s"))) === 1, "a decoded customer name now compares as an exact match to the real candidate name");
  }

  // --- customer-match-materiality.ts ---
  {
    const r1 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1NN", candidateName: "Kebabish Original", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "LU1 1EH", tradingName: "KEBABISH", phone: "01582483848", alternatePhones: [], domain: null, domains: [], companyNumber: null } });
    assert(r1.material === false, "a matched customer in a materially different postal district is NOT material, regardless of name similarity");

    const r2 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 2NN", candidateName: "Ali Baba's", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "UB1 2NN", tradingName: "Ali Baba's Ltd T/A Ali Baba's", phone: "02085787786", alternatePhones: [], domain: null, domains: [], companyNumber: null } });
    assert(r2.material === true && (r2.evidenceTier === "exact_postcode_and_strong_identity" || r2.evidenceTier === "exact_postcode_and_moderate_identity"), `exact postcode + genuine name correspondence IS material (got tier="${r2.evidenceTier}", outcomeTier="${r2.outcomeTier}")`);

    const r3 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1RR", candidateName: "CakeCo (South Road)", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "UB1 1SU", tradingName: "ROOSTERS PIRI PIRI (SOUTH ROAD)", phone: null, alternatePhones: [], domain: null, domains: [], companyNumber: null } });
    assert(r3.material === false, "same postal district but a different specific postcode, matched only on a generic locality word, is NOT material");

    const r4 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1AA", candidateName: "Totally Different Name", candidatePhone: "020 1234 5678", candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "TW1 1AA", tradingName: "Also A Different Name Entirely", phone: "020 1234 5678", alternatePhones: [], domain: null, domains: [], companyNumber: null } });
    assert(r4.material === true && r4.evidenceTier === "exact_phone", "an exact phone match is material even with dissimilar names/postcodes");

    const r5 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1AA", candidateName: "X", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: "01234567", matchedCustomer: { postcode: "TW1 1AA", tradingName: "Y", phone: null, alternatePhones: [], domain: null, domains: [], companyNumber: "1234567" } });
    assert(r5.material === true && r5.evidenceTier === "exact_company_number", "an exact Companies House number match is material (zero-padding normalised)");

    const r6 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1AA", candidateName: "X", candidatePhone: null, candidateDomain: "example.co.uk", candidateCompanyNumber: null, matchedCustomer: { postcode: "TW1 1AA", tradingName: "Y", phone: null, alternatePhones: [], domain: "www.example.co.uk", domains: [], companyNumber: null } });
    assert(r6.material === true && r6.evidenceTier === "exact_domain", "an exact verified domain match is material");

    const r7 = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1AA", candidateName: "X", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: null });
    assert(r7.material === false && r7.evidenceTier === "none", "no matched customer record at all -> not material (the default 'unresolved' state)");
  }

  // --- qualification-v2.ts ---
  {
    const q1 = classifyQualificationV2({ hardGates: mkGates({ allPassed: false, failedGates: ["genuine_physical_premises"] }), materialCustomerConflict: false, channelSuitability: mkChannel("both"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q1.qualificationStatus === "hard_rejected", "a hard-gate failure is always hard_rejected regardless of channel/conflict");

    const q2 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: true, channelSuitability: mkChannel("both"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q2.qualificationStatus === "held_for_customer_match_review", "a material (probable-tier) customer conflict overrides an otherwise-passing candidate");

    const q3 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("neither"), hasValidPhone: false, stagesWithDecisiveEvidence: 1, totalStagesConsidered: 4 });
    assert(q3.qualificationStatus === "hard_rejected" && q3.channelEligibility === "neither", "passing every hard gate but having no usable channel is not releasable");

    const q4 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("both"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q4.qualificationStatus === "qualified", "passing every hard gate, no conflict, both channels usable, valid phone -> qualified");

    const q5 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("telesales_only"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q5.qualificationStatus === "qualified_with_channel_limit" && q5.channelEligibility === "telesales_only", "usable via only one channel -> qualified_with_channel_limit, not qualified");

    // Section 4's core requirement: qualification never depends on stagesWithDecisiveEvidence
    // (a proxy for score/completeness) once hard gates + conflict + channel all check out.
    const qLow = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("both"), hasValidPhone: true, stagesWithDecisiveEvidence: 0, totalStagesConsidered: 4 });
    assert(qLow.qualificationStatus === "qualified", "low enrichment completeness alone does not block qualification — only affects the completeness band");
    assert(qLow.enrichmentCompletenessBand === "minimal", "enrichment completeness band is still reported (informational, not gating)");

    // Locked policy 2026-08-02: mandatory valid phone, checked independently of channel type —
    // a candidate with a perfectly good field-sales (or even "both") channel but no VALID phone
    // must become phone_resolution_exception, not qualified/qualified_with_channel_limit.
    const q6 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("field_sales_only"), hasValidPhone: false, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q6.qualificationStatus === "phone_resolution_exception", "field_sales_only with no valid phone -> phone_resolution_exception, NOT qualified_with_channel_limit (a field-sales lead still requires a valid phone under the locked policy)");

    const q7 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("both"), hasValidPhone: false, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q7.qualificationStatus === "phone_resolution_exception", "channel suitability \"both\" (which implies SOME phone signal triggered telesales eligibility upstream) but the FINAL validated phone is false -> still phone_resolution_exception, never silently released as qualified");

    const q8 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: false, channelSuitability: mkChannel("telesales_only"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
    assert(q8.qualificationStatus === "qualified_with_channel_limit", "telesales_only WITH a valid phone still qualifies normally — the new check only blocks the invalid-phone case, never a genuinely valid one");
  }

  // --- deriveGoogleOutcome() (the extracted decision function used for zero-new-call reprocessing) ---
  {
    const evidence = [{ placeId: "P1", officialName: "Mandos Pizza", formattedAddress: "265 Allenby Rd, Southall UB1 2HD, UK", addressComponents: [], postcode: "UB1 2HD", latitude: 1, longitude: 1, phone: "020 8813 1010", website: null, businessStatus: "OPERATIONAL", openingHours: [], primaryCategory: null, additionalCategories: [], rating: 3.9, reviewCount: 161, nameSimilarity: 1, postcodeAgreement: true, distanceFromCandidateMetres: null }];
    const decision = deriveGoogleOutcome(evidence as any, "UB1 2HD", 1);
    assert(decision.outcome === "exact_google_match", `corrected nameSimilarity=1 at an exact postcode now classifies as exact_google_match (got ${decision.outcome})`);
  }

  // --- End-to-end territory-agnosticism: run run-final-scoring-stage-v2.ts against two
  // independent synthetic territories, proving no UB1-specific branching. ---
  {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "final-scoring-v2-test-"));
    for (const territory of ["ZZ1", "KT9"]) {
      const dirs = await genFixtureTerritory(tmpRoot, territory);
      const outDir = path.join(tmpRoot, `${territory.toLowerCase()}-v2-out`);
      const r = spawnSync("npx", [
        "tsx", "scripts/lead-production/run-final-scoring-stage-v2.ts",
        `--phase1-dir=${dirs.phase1}`, `--fsa-dir=${dirs.fsa}`, `--google-checkpoint=${dirs.google}`,
        `--companies-house-dir=${dirs.ch}`, `--website-dir=${dirs.website}`, `--public-profile-dir=${dirs.publicProfile}`,
        `--group-rescreen-dir=${dirs.groupRescreen}`, `--v1-final-scoring-dir=${dirs.v1FinalScoring}`,
        `--customers=${dirs.customers}`, `--territory=${territory}`, `--out=${outDir}`,
      ], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
      assert(r.status === 0, `${territory}: run-final-scoring-stage-v2.ts exits 0 (stderr: ${(r.stderr ?? "").slice(0, 500)})`);
      const masterPath = path.join(outDir, `${territory.toLowerCase()}-v2-authoritative-master.csv`);
      const masterExists = await fs.access(masterPath).then(() => true).catch(() => false);
      assert(masterExists, `${territory}: produces a correctly-prefixed ${territory.toLowerCase()}-v2-authoritative-master.csv (no hardcoded "ub1-" prefix)`);
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }

  // --- A brand-new territory with NO prior v1 run (--v1-final-scoring-dir omitted entirely)
  // must still produce a correct, complete qualification pass — this is the real-world RM1/
  // TW1-20 case: v2 is the only scoring pass that will ever run for those territories. ---
  {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "final-scoring-v2-nobaseline-test-"));
    const dirs = await genFixtureTerritory(tmpRoot, "ZZ2");
    const outDir = path.join(tmpRoot, "zz2-v2-out");
    const r = spawnSync("npx", [
      "tsx", "scripts/lead-production/run-final-scoring-stage-v2.ts",
      `--phase1-dir=${dirs.phase1}`, `--fsa-dir=${dirs.fsa}`, `--google-checkpoint=${dirs.google}`,
      `--companies-house-dir=${dirs.ch}`, `--website-dir=${dirs.website}`, `--public-profile-dir=${dirs.publicProfile}`,
      `--group-rescreen-dir=${dirs.groupRescreen}`, `--customers=${dirs.customers}`, `--territory=ZZ2`, `--out=${outDir}`,
      // deliberately no --v1-final-scoring-dir
    ], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    assert(r.status === 0, `no-v1-baseline run exits 0 with --v1-final-scoring-dir entirely omitted (stderr: ${(r.stderr ?? "").slice(0, 500)})`);
    const master = JSON.parse(await fs.readFile(path.join(outDir, "zz2-v2-authoritative-master.json"), "utf8").catch(() => "[]"));
    assert(Array.isArray(master) && master.length === 1, "still produces a full master row for the fixture candidate with no v1 baseline");
    if (Array.isArray(master) && master.length === 1) {
      assert(master[0].qualificationStatus === "qualified", `the fixture candidate is still correctly qualified with no v1 baseline (got ${master[0].qualificationStatus})`);
      assert(master[0].v1Bucket === "not_applicable_no_v1_baseline", "v1Bucket is explicitly marked not_applicable rather than a fabricated value");
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${fails === 0 ? "All proofs passed." : `${fails} proof(s) FAILED.`}`);
  process.exit(fails === 0 ? 0 : 1);
}

async function writeJson(p: string, v: unknown) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(v, null, 2)); }
async function writeCsvFile(p: string, columns: string[], rows: Record<string, string>[]) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  await fs.writeFile(p, [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c] ?? "")).join(","))].join("\n") + "\n");
}

/** Minimal, complete, valid checkpoint set (one qualifying candidate) for one synthetic
 *  territory, matching every file run-final-scoring-stage-v2.ts (and, through it, v1's own
 *  loaders it mirrors) actually reads. Proves the v2 script has no UB1-specific branching. */
async function genFixtureTerritory(root: string, territory: string) {
  const t = territory.toLowerCase();
  const cid = `${t}-cand-a`;
  const phase1 = path.join(root, `${t}-phase1`);
  const fsa = path.join(root, `${t}-fsa`);
  const google = path.join(root, `${t}-google`);
  const ch = path.join(root, `${t}-ch`);
  const website = path.join(root, `${t}-web`);
  const publicProfile = path.join(root, `${t}-pp`);
  const groupRescreen = path.join(root, `${t}-gr`);
  const v1FinalScoring = path.join(root, `${t}-v1`);
  const customers = path.join(root, `${t}-customers.csv`);

  await writeJson(path.join(phase1, "customer-match-results.json"), [{
    candidateId: cid, outcome: "new_prospect", matchTier: "none", matchedCustomerId: null, rulesTriggered: [], nameSimilarity: null, preliminaryStatus: "clear_for_enrichment",
    normalisedName: { candidateOriginal: `Test Diner ${territory}`, candidateNormalised: "test diner", customerOriginal: null, customerNormalised: null },
    normalisedPostcode: { candidateOriginal: `${territory} 1AA`, candidateNormalised: `${territory} 1AA`, customerOriginal: null, customerNormalised: null },
  }]);

  await writeJson(path.join(fsa, "fsa-results.json"), [{
    candidateId: cid, candidateTradingName: `Test Diner ${territory}`, candidatePostcode: `${territory} 1AA`, outcome: "exact_fsa_match",
    plausibleEstablishments: [{ fhrsId: "1", officialBusinessName: `Test Diner ${territory}`, fsaAddress: "1 Test St", fsaPostcode: `${territory} 1AA`, businessType: "Restaurant", hygieneRating: "5", ratingStatus: "rated", ratingDate: "2025-01-01", localAuthority: "Test Council", nameSimilarity: 0.9, postcodeAgreement: true, addressAgreement: null, coordinateEvidence: null }],
    evidenceTags: [], retrievalTimestamp: "2026-01-01T00:00:00Z", sourceResponseReference: "q", apiFailureReason: null, apiAttempts: 1,
  }]);
  await writeCsvFile(path.join(fsa, "customer-match-resolution-after-fsa.csv"), ["candidate_id", "resolution_outcome"], [{ candidate_id: cid, resolution_outcome: "" }]);

  await writeJson(path.join(google, "google-results.json"), [{
    candidateId: cid, candidateTradingName: `Test Diner ${territory}`, candidatePostcode: `${territory} 1AA`, outcome: "exact_google_match",
    plausibleResults: [{ placeId: "P1", officialName: `Test Diner ${territory}`, formattedAddress: `1 Test St, ${territory} 1AA, UK`, addressComponents: [], postcode: `${territory} 1AA`, latitude: 51.5, longitude: -0.3, phone: "02080000000", website: null, businessStatus: "OPERATIONAL", openingHours: [], primaryCategory: "restaurant", additionalCategories: ["food"], rating: 4.5, reviewCount: 50, nameSimilarity: 1, postcodeAgreement: true, distanceFromCandidateMetres: 0 }],
    resultCount: 1, zeroResults: false, allReturnedResults: [], evidenceTags: [], retrievalTimestamp: "2026-01-01T00:00:00Z", sourceResponseReference: "q", apiFailureReason: null, apiAttempts: 1,
  }]);
  await writeCsvFile(path.join(google, "customer-resolution-after-google.csv"), ["candidate_id", "resolution_outcome", "prior_matched_customer_id"], [{ candidate_id: cid, resolution_outcome: "unresolved_customer_match_after_google", prior_matched_customer_id: "" }]);
  await writeCsvFile(path.join(google, "physical-premises-results.csv"), ["candidate_id", "result", "evidence_tags"], [{ candidate_id: cid, result: "verified_physical_premises", evidence_tags: "" }]);
  await writeCsvFile(path.join(google, "fsa-resolution-after-google.csv"), ["candidate_id", "resolution", "top_fsa_fhrs_id", "top_fsa_name"], [{ candidate_id: cid, resolution: "fsa_resolved_exact", top_fsa_fhrs_id: "1", top_fsa_name: `Test Diner ${territory}` }]);

  await writeJson(path.join(ch, "companies-house-population-manifest.json"), { eligibleIds: [cid] });
  await writeJson(path.join(ch, "companies-house-results.json"), [{ candidateId: cid, candidateTradingName: `Test Diner ${territory}`, candidatePostcode: `${territory} 1AA`, outcome: "no_company_record", companiesHouseStatus: null, plausibleCompanies: [], evidenceTags: [], searchQueriesUsed: [], retrievalTimestamp: "2026-01-01T00:00:00Z", apiFailureReason: null, apiAttempts: 1 }]);
  await writeCsvFile(path.join(ch, "customer-resolution-after-companies-house.csv"), ["candidate_id", "resolution_outcome", "prior_matched_customer_id"], [{ candidate_id: cid, resolution_outcome: "unresolved_customer_match_after_companies_house", prior_matched_customer_id: "" }]);
  await writeCsvFile(path.join(ch, "financial-calculations.csv"), ["candidate_id", "financialStrengthBand_result", "companySizeBand_result", "likelyPurchasingCapacityBand_result", "financial_data_confidence", "companyAgeYears_result"], [{ candidate_id: cid, financialStrengthBand_result: "not_available", companySizeBand_result: "not_available", likelyPurchasingCapacityBand_result: "not_available", financial_data_confidence: "not_available", companyAgeYears_result: "not_available" }]);
  await writeCsvFile(path.join(ch, "decision-maker-candidates.csv"), ["candidate_id", "company_number", "full_name", "likely_role", "rank", "source_type", "evidence_tags"], []);
  await writeCsvFile(path.join(ch, "company-profiles.csv"), ["candidate_id", "company_number", "company_name", "company_status", "incorporation_date", "registered_office_address"], []);
  await writeCsvFile(path.join(ch, "filed-accounts-data.csv"), ["candidate_id", "company_number", "accounts_type", "turnover_result", "grossProfit_result", "netAssets_result", "employeeCount_result"], []);

  await writeJson(path.join(website, "website-extracted-data.json"), [{ candidateId: cid, officialDomain: null, phone: { value: null }, email: { value: null }, hasContactForm: { value: false }, openingHours: { value: null }, cuisineTags: [], serviceModel: {} }]);
  await writeJson(path.join(website, "product-fit-results.json"), [{ candidateId: cid, indicators: {} }]);

  await writeCsvFile(path.join(publicProfile, "public-profile-results.csv"), ["candidate_id", "outcome", "profile_url"], []);

  await writeJson(path.join(groupRescreen, "final-group-rescreen-results.json"), [{ candidateId: cid, classification: "independent_single_site", defaultOutcome: null, evidenceSources: [], evidenceTags: [] }]);

  // v1's own final-scoring output, for the v2 script's mandatory before/after comparison —
  // deliberately fabricated as "hard-rejected on identity grounds" here so the fixture also
  // exercises the reclassification path, not just a pass-through.
  await writeJson(path.join(v1FinalScoring, "ub1-authoritative-master.json"), [{
    candidateId: cid, tradingName: `Test Diner ${territory}`, postcode: `${territory} 1AA`, bucket: "level_0_sales_ready", bucketReason: "test fixture",
    channel: "both",
    finalOutcome: {
      candidateId: cid, level: "level_0", levelReason: "test fixture", reasonTags: [],
      hardGates: { candidateId: cid, allPassed: true, checks: [], failedGates: [] },
      scoring: { candidateId: cid, totalScore: 80, maxPossibleScore: 100, components: {} },
      channelSuitability: { candidateId: cid, telesalesScore: 80, telesalesFactors: {}, fieldSalesScore: 80, fieldSalesFactors: {}, suitability: "both" },
    },
  }]);

  await writeCsvFile(customers, ["Customer ID", "Customer Name", "Postcode", "Phone", "Status"], [{ "Customer ID": "C1", "Customer Name": "Unrelated Customer Ltd", Postcode: "ZZ9 9ZZ", Phone: "01111111111", Status: "CUSTOMER-Closed Won" }]);

  return { phase1, fsa, google, ch, website, publicProfile, groupRescreen, v1FinalScoring, customers };
}

main().catch((e) => { console.error(e); process.exit(1); });
