// Phase 4 CLI: Companies House legal-entity matching + company profile + filed accounts +
// financial calculations + directors/PSC + related-company/group analysis + customer-match
// resolution + decision-maker candidates, for the eligible population derived from an approved
// Google checkpoint. Reads the Google checkpoint (and, through the FSA-dir argument, the FSA
// checkpoint) as read-only input — never modifies either — and writes an entirely new, separate,
// timestamped output directory. Territory-agnostic: takes checkpoint directory paths as
// arguments, never a hardcoded candidate ID or territory assumption.
//
// Two modes, exactly like the FSA/Google stages: (default / --dry-run) preflight report only,
// zero live calls, zero output files. --live executes the bounded live run.
//
// Usage:
//   npx tsx scripts/lead-production/run-companies-house-stage.ts \
//     --google-checkpoint=<accepted final Google-stage directory> \
//     --fsa-dir=<accepted FSA-stage directory> \
//     --customers=<the SAME customer master file used throughout> \
//     --registry=<the SAME approved group registry> \
//     --out=<new timestamped output directory> \
//     [--dry-run | --live] [--max-calls=<n>] [--max-document-calls=<n>]

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeCsv, parseCsvObjects } from "./csv";
import { calculateCompaniesHousePopulation } from "./companies-house-population";
import type {
  CustomerRecord, GoogleMatchResult, FsaMatchResult, FsaResolutionAfterGoogle, GroupScreenResult,
  CompanyLegalIdentityResult, CompanyProfile, FiledAccountsData, FinancialCalculations,
  OfficerRecord, PscRecord, RelatedCompanyAnalysis, CustomerResolutionAfterCompaniesHouse,
  DecisionMakerCandidate, CustomerResolutionAfterGoogleOutcome,
} from "./types";

const RULES_VERSION = "companies-house-stage-v1";

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
  return createHash("md5").update(await fs.readFile(filePath)).digest("hex");
}
function gitCommitSha(): string {
  try { return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { return "unknown"; }
}

// --- CSV column sets ---
const CH_RESULT_COLUMNS = [
  "candidate_id", "candidate_trading_name", "candidate_postcode", "outcome", "companies_house_status",
  "num_plausible_companies", "best_company_number", "best_company_name", "best_company_status",
  "best_registered_office_address", "best_registered_postcode", "best_legal_name_similarity", "best_postcode_agreement",
  "evidence_tags", "search_queries_used", "retrieval_timestamp", "api_failure_reason", "api_attempts",
] as const;
function chResultRow(r: CompanyLegalIdentityResult): Record<string, unknown> {
  const best = r.plausibleCompanies[0] ?? null;
  return {
    candidate_id: r.candidateId, candidate_trading_name: r.candidateTradingName, candidate_postcode: r.candidatePostcode ?? "",
    outcome: r.outcome, companies_house_status: r.companiesHouseStatus ?? "",
    num_plausible_companies: r.plausibleCompanies.length, best_company_number: best?.companyNumber ?? "", best_company_name: best?.companyName ?? "",
    best_company_status: best?.companyStatus ?? "", best_registered_office_address: best?.registeredOfficeAddress ?? "", best_registered_postcode: best?.registeredPostcode ?? "",
    best_legal_name_similarity: best ? best.legalNameSimilarity.toFixed(3) : "", best_postcode_agreement: best?.postcodeAgreement ?? "",
    evidence_tags: r.evidenceTags.join(";"), search_queries_used: r.searchQueriesUsed.join(";"), retrieval_timestamp: r.retrievalTimestamp,
    api_failure_reason: r.apiFailureReason ?? "", api_attempts: r.apiAttempts,
  };
}

const PROFILE_COLUMNS = [
  "candidate_id", "company_number", "company_name", "previous_names", "company_status", "company_type",
  "incorporation_date", "cessation_date", "registered_office_address", "registered_postcode", "sic_codes",
  "accounts_reference_date", "last_accounts_period_end", "next_accounts_due_date", "accounts_overdue",
  "confirmation_statement_date", "next_confirmation_statement_due", "confirmation_statement_overdue",
  "has_insolvency_history", "has_charges", "retrieval_timestamp", "source_reference",
] as const;
function profileRow(p: CompanyProfile): Record<string, unknown> {
  return {
    candidate_id: p.candidateId, company_number: p.companyNumber, company_name: p.companyName, previous_names: p.previousNames.join(";"),
    company_status: p.companyStatus, company_type: p.companyType ?? "", incorporation_date: p.incorporationDate ?? "", cessation_date: p.cessationDate ?? "",
    registered_office_address: p.registeredOfficeAddress ?? "", registered_postcode: p.registeredPostcode ?? "", sic_codes: p.sicCodes.join(";"),
    accounts_reference_date: p.accountsReferenceDate ?? "", last_accounts_period_end: p.lastAccountsPeriodEnd ?? "", next_accounts_due_date: p.nextAccountsDueDate ?? "",
    accounts_overdue: p.accountsOverdue ?? "", confirmation_statement_date: p.confirmationStatementDate ?? "", next_confirmation_statement_due: p.nextConfirmationStatementDue ?? "",
    confirmation_statement_overdue: p.confirmationStatementOverdue ?? "", has_insolvency_history: p.hasInsolvencyHistory ?? "", has_charges: p.hasCharges ?? "",
    retrieval_timestamp: p.retrievalTimestamp, source_reference: p.sourceReference,
  };
}

function financialResultCols(prefix: string): string[] {
  return [`${prefix}_result`, `${prefix}_currency`, `${prefix}_formula`, `${prefix}_source_fields`, `${prefix}_source_periods`, `${prefix}_confidence`, `${prefix}_value_source`, `${prefix}_unavailable_reason`];
}
function financialResultVals(prefix: string, v: { result: string | number | null; currency: string | null; formula: string; sourceFields: string[]; sourcePeriods: string[]; confidence: string; valueSource: string; unavailableReason: string | null }): Record<string, unknown> {
  return {
    [`${prefix}_result`]: v.result ?? "not_available", [`${prefix}_currency`]: v.currency ?? "",
    [`${prefix}_formula`]: v.formula, [`${prefix}_source_fields`]: v.sourceFields.join(";"), [`${prefix}_source_periods`]: v.sourcePeriods.join(";"),
    [`${prefix}_confidence`]: v.confidence, [`${prefix}_value_source`]: v.valueSource, [`${prefix}_unavailable_reason`]: v.unavailableReason ?? "",
  };
}
const FILED_ACCOUNTS_PREFIXES = ["turnover", "grossProfit", "operatingProfit", "profitOrLoss", "cashAndCashEquivalents", "currentAssets", "currentLiabilities", "netCurrentAssetsLiabilities", "fixedAssets", "totalAssets", "totalLiabilities", "creditors", "netAssets", "shareholdersFunds", "employeeCount"] as const;
const FILED_ACCOUNTS_COLUMNS = ["candidate_id", "company_number", "accounts_type", "reporting_period_start", "reporting_period_end", "retrieval_timestamp", ...FILED_ACCOUNTS_PREFIXES.flatMap((p) => financialResultCols(p))];
function filedAccountsRow(f: FiledAccountsData): Record<string, unknown> {
  const row: Record<string, unknown> = {
    candidate_id: f.candidateId, company_number: f.companyNumber, accounts_type: f.accountsType ?? "",
    reporting_period_start: f.reportingPeriodStart ?? "", reporting_period_end: f.reportingPeriodEnd ?? "", retrieval_timestamp: f.retrievalTimestamp,
  };
  for (const p of FILED_ACCOUNTS_PREFIXES) Object.assign(row, financialResultVals(p, f.values[p as keyof typeof f.values]));
  return row;
}

const CALC_PREFIXES = ["companyAgeYears", "daysSinceLastAccounts", "accountsFilingRecency", "currentRatio", "workingCapital", "liabilitiesToAssetsRatio", "netAssetValue", "netAssetGrowth", "turnoverGrowth", "profitMargin", "revenuePerEmployee", "financialStrengthBand", "companySizeBand", "likelyPurchasingCapacityBand"] as const;
const FINANCIAL_CALC_COLUMNS = ["candidate_id", "company_number", ...CALC_PREFIXES.flatMap((p) => financialResultCols(p)), "financial_risk_flags", "financial_data_completeness", "financial_data_confidence"];
function financialCalcRow(c: FinancialCalculations): Record<string, unknown> {
  const row: Record<string, unknown> = { candidate_id: c.candidateId, company_number: c.companyNumber };
  for (const p of CALC_PREFIXES) Object.assign(row, financialResultVals(p, c.calculations[p as keyof typeof c.calculations]));
  row.financial_risk_flags = c.financialRiskFlags.map((f) => f.flag).join(";");
  row.financial_data_completeness = c.financialDataCompleteness.result ?? "not_available";
  row.financial_data_confidence = c.financialDataConfidence;
  return row;
}

const OFFICER_COLUMNS = ["candidate_id", "company_number", "full_name", "officer_role", "appointed_date", "resigned_date", "status", "nationality", "occupation", "current_appointments_count", "resigned_appointments_count", "shared_director_flag", "likely_owner_director_indicator", "likely_operational_decision_maker_indicator", "source_reference", "retrieval_timestamp"] as const;
function officerRow(o: OfficerRecord): Record<string, unknown> {
  return {
    candidate_id: o.candidateId, company_number: o.companyNumber, full_name: o.fullName, officer_role: o.officerRole,
    appointed_date: o.appointedDate ?? "", resigned_date: o.resignedDate ?? "", status: o.status, nationality: o.nationality ?? "", occupation: o.occupation ?? "",
    current_appointments_count: o.currentAppointmentsCount ?? "", resigned_appointments_count: o.resignedAppointmentsCount ?? "",
    shared_director_flag: o.sharedDirectorFlag, likely_owner_director_indicator: o.likelyOwnerDirectorIndicator, likely_operational_decision_maker_indicator: o.likelyOperationalDecisionMakerIndicator,
    source_reference: o.sourceReference, retrieval_timestamp: o.retrievalTimestamp,
  };
}

const PSC_COLUMNS = ["candidate_id", "company_number", "psc_name", "psc_type", "notified_date", "ceased_date", "status", "nature_of_control", "ownership_percentage_band", "voting_rights_band", "appointment_removal_rights", "is_corporate_controller", "linked_company_number", "source_reference", "retrieval_timestamp"] as const;
function pscRow(p: PscRecord): Record<string, unknown> {
  return {
    candidate_id: p.candidateId, company_number: p.companyNumber, psc_name: p.pscName, psc_type: p.pscType,
    notified_date: p.notifiedDate ?? "", ceased_date: p.ceasedDate ?? "", status: p.status, nature_of_control: p.natureOfControl.join(";"),
    ownership_percentage_band: p.ownershipPercentageBand ?? "", voting_rights_band: p.votingRightsBand ?? "", appointment_removal_rights: p.appointmentRemovalRights ?? "",
    is_corporate_controller: p.isCorporateController, linked_company_number: p.linkedCompanyNumber ?? "", source_reference: p.sourceReference, retrieval_timestamp: p.retrievalTimestamp,
  };
}

const RELATED_COLUMNS = ["candidate_id", "company_number", "category", "related_company_numbers", "related_company_names", "shared_director_names", "shared_psc_names", "evidence_tags"] as const;
function relatedRow(r: RelatedCompanyAnalysis): Record<string, unknown> {
  return {
    candidate_id: r.candidateId, company_number: r.companyNumber ?? "", category: r.category,
    related_company_numbers: r.relatedCompanyNumbers.join(";"), related_company_names: r.relatedCompanyNames.join(";"),
    shared_director_names: r.sharedDirectorNames.join(";"), shared_psc_names: r.sharedPscNames.join(";"), evidence_tags: r.evidenceTags.join(";"),
  };
}

const CUSTOMER_RES_COLUMNS = ["candidate_id", "prior_resolution", "prior_matched_customer_id", "resolution_outcome", "companies_house_outcome", "evidence_used"] as const;
function customerResRow(r: CustomerResolutionAfterCompaniesHouse): Record<string, unknown> {
  return { candidate_id: r.candidateId, prior_resolution: r.priorResolution, prior_matched_customer_id: r.priorMatchedCustomerId ?? "", resolution_outcome: r.resolutionOutcome, companies_house_outcome: r.companiesHouseOutcome, evidence_used: r.evidenceUsed.join(" | ") };
}

const DECISION_MAKER_COLUMNS = ["candidate_id", "company_number", "full_name", "likely_role", "rank", "source_type", "evidence_tags"] as const;
function decisionMakerRow(d: DecisionMakerCandidate): Record<string, unknown> {
  return { candidate_id: d.candidateId, company_number: d.companyNumber ?? "", full_name: d.fullName, likely_role: d.likelyRole, rank: d.rank, source_type: d.sourceType, evidence_tags: d.evidenceTags.join(";") };
}

async function main() {
  await loadDotEnv();

  const googleCheckpointDir = arg("google-checkpoint");
  const fsaDir = arg("fsa-dir");
  const customersPath = arg("customers");
  const registryPath = arg("registry");
  const outArg = arg("out");
  const live = flag("live");
  const maxCallsOverride = arg("max-calls") ? Number.parseInt(arg("max-calls")!, 10) : null;
  const maxDocumentCallsOverride = arg("max-document-calls") ? Number.parseInt(arg("max-document-calls")!, 10) : null;
  const territory = arg("territory") ?? "UB1";

  const missing = [!googleCheckpointDir && "--google-checkpoint=<path>", !fsaDir && "--fsa-dir=<path>", !customersPath && "--customers=<path>", !registryPath && "--registry=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const { getCompaniesHouseConfig, isCompaniesHouseEnabled, newCompaniesHouseBudget, budgetCallsMade, budgetRemaining, searchCompanies, getCompanyProfile, getCompanyPsc } = await import("./companies-house-adapter");
  const { classifyCompanyMatch } = await import("./companies-house-match");
  const { mapOfficers, mapPscs } = await import("./officers-and-psc");
  const { fetchAndComputeFinancials } = await import("./financial-extraction-after-companies-house");
  const { computeBatchOwnershipMaps, analyseRelatedCompany } = await import("./group-analysis-after-companies-house");
  const { resolveCustomerMatchAfterCompaniesHouse } = await import("./customer-resolution-after-companies-house");
  const { buildDecisionMakerCandidates } = await import("./decision-maker-candidates");
  const { loadCustomerFile } = await import("./load-customers");
  const { loadGroupRegistry } = await import("./load-group-registry");

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });

  console.log("=== Lead-production bridge: Phase 4 — Companies House legal-entity + financials + directors/PSC + group analysis ===");
  console.log(`Google checkpoint (read-only): ${googleCheckpointDir}`);
  console.log(`FSA checkpoint (read-only): ${fsaDir}`);

  // --- Load read-only inputs, checksummed ---
  const googleResultsPath = path.join(googleCheckpointDir!, "google-results.json");
  const googleResults = JSON.parse(await fs.readFile(googleResultsPath, "utf8")) as GoogleMatchResult[];
  const googleResultsChecksum = await md5(googleResultsPath);

  const custResPath = path.join(googleCheckpointDir!, "customer-resolution-after-google.csv");
  const { rows: custResRows } = parseCsvObjects(await fs.readFile(custResPath, "utf8"));
  const custResChecksum = await md5(custResPath);
  const custResByCandidate = new Map(custResRows.map((r) => [r.candidate_id, r]));

  const fsaResolutionPath = path.join(googleCheckpointDir!, "fsa-resolution-after-google.csv");
  const { rows: fsaResolutionRows } = parseCsvObjects(await fs.readFile(fsaResolutionPath, "utf8"));
  const fsaResolutionByCandidate = new Map<string, FsaResolutionAfterGoogle | Record<string, string>>(fsaResolutionRows.map((r) => [r.candidate_id, r]));

  const fsaResultsPath = path.join(fsaDir!, "fsa-results.json");
  const fsaResults = JSON.parse(await fs.readFile(fsaResultsPath, "utf8")) as FsaMatchResult[];
  const fsaResultsChecksum = await md5(fsaResultsPath);
  const fsaByCandidate = new Map(fsaResults.map((r) => [r.candidateId, r]));

  const customersLoaded = await loadCustomerFile(customersPath!);
  const customerById = new Map(customersLoaded.customers.map((c) => [c.customerId, c]));
  const customersChecksum = await md5(customersPath!);

  const registryLoaded = await loadGroupRegistry(registryPath!);
  const registryChecksum = await md5(registryPath!);

  // --- Population derivation (spec section 1 / A1) — pure candidate-ID set operations ---
  const populationRows = googleResults.map((g) => ({
    candidateId: g.candidateId,
    customerResolutionOutcome: custResByCandidate.get(g.candidateId)?.resolution_outcome ?? null,
    googleOutcome: g.outcome,
  }));
  const population = calculateCompaniesHousePopulation(populationRows);
  console.log(`Companies House population: starting=${population.startingCandidateCount}, excluded=${population.excludedUnionCount}, eligible=${population.eligibleCount}, reconciles=${population.reconciles}`);
  if (!population.reconciles) { console.error("REFUSING TO RUN: population reconciliation failed."); process.exit(1); }
  await fs.writeFile(path.join(outDir, "companies-house-population-manifest.json"), JSON.stringify(population, null, 2));

  const googleByCandidate = new Map(googleResults.map((g) => [g.candidateId, g]));
  const eligibleIds = population.eligibleIds;

  const config = getCompaniesHouseConfig();
  const enabled = isCompaniesHouseEnabled();
  const hardMaxRequestCap = Math.max(0, Math.min(1000, maxCallsOverride ?? config.maxCallsPerRun));
  const hardMaxDocumentCap = Math.max(0, maxDocumentCallsOverride ?? 250);

  // --- Query plan (spec section 4 / A4) — evidence priority, computed for the preflight report
  // AND reused identically in the live loop. ---
  function buildQueryPlan(candidateId: string): { queryText: string | null; knownCompanyNumber: string | null; evidenceTier: string; candidateName: string; candidatePostcode: string | null } {
    const g = googleByCandidate.get(candidateId);
    const candidateName = g?.candidateTradingName ?? "";
    const candidatePostcode = g?.candidatePostcode ?? null;
    const custRow = custResByCandidate.get(candidateId);
    const matchedCustomer = custRow?.prior_matched_customer_id ? customerById.get(custRow.prior_matched_customer_id) : null;

    if (matchedCustomer?.companyNumber) {
      return { queryText: null, knownCompanyNumber: matchedCustomer.companyNumber, evidenceTier: "existing_verified_company_number", candidateName, candidatePostcode };
    }
    const gPlace = g && ["exact_google_match", "strong_probable_google_match"].includes(g.outcome) ? g.plausibleResults[0] : null;
    if (gPlace?.officialName) {
      return { queryText: gPlace.officialName, knownCompanyNumber: null, evidenceTier: "google_official_business_name", candidateName, candidatePostcode };
    }
    const fsaRes = fsaResolutionByCandidate.get(candidateId) as any;
    const fsa = fsaByCandidate.get(candidateId);
    if (fsaRes && (fsaRes.resolution === "fsa_resolved_exact" || fsaRes.resolution === "fsa_resolved_probable") && fsaRes.top_fsa_name) {
      return { queryText: fsaRes.top_fsa_name, knownCompanyNumber: null, evidenceTier: "resolved_fsa_official_name", candidateName, candidatePostcode };
    }
    if (fsa && (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match") && fsa.plausibleEstablishments[0]) {
      return { queryText: fsa.plausibleEstablishments[0].officialBusinessName, knownCompanyNumber: null, evidenceTier: "fsa_official_business_name", candidateName, candidatePostcode };
    }
    return { queryText: candidateName, knownCompanyNumber: null, evidenceTier: "original_trading_name", candidateName, candidatePostcode };
  }

  const dryRunRequestPlan = eligibleIds.map((id) => ({ candidateId: id, ...buildQueryPlan(id) }));

  const preflight = {
    generatedAt: new Date().toISOString(), territory,
    eligibleCandidateCount: eligibleIds.length,
    estimatedRequestsPerCandidate: "up to 7 (search[0-1] + profile[0-1] + officers[1] + PSC[1] + filing-history[1] + document[0-2]), fewer when a known company number skips search or a candidate resolves to a company already cached from an earlier candidate this run",
    estimatedMaxCombinedRequests: eligibleIds.length * 5, // search/profile/officer/PSC/filing-history — excludes document calls, capped separately
    estimatedMaxDocumentRequests: eligibleIds.length * 2,
    hardMaxCombinedRequestCap: hardMaxRequestCap,
    hardMaxDocumentRequestCap: hardMaxDocumentCap,
    cacheStrategy: "in-run Map keyed by normalised company number — profile/officers/PSC/financials are fetched at most once per distinct company number per run, regardless of how many candidates resolve to it",
    retryPolicy: "one bounded retry on HTTP 429/5xx per custom call (search/profile/PSC), consuming a second slot from the same shared budget; the reused CompaniesHouseRunner methods (officers/filing-history/document) use their own existing behaviour (see companies-house-adapter.ts header for the documented limitation in their built-in 429 handling)",
    endpointPlan: [
      "GET /search/companies?q=... (only when no known company number)",
      "GET /company/{number} (profile — only for the top-ranked search hit, or directly when a company number was already known)",
      "GET /company/{number}/officers",
      "GET /company/{number}/persons-with-significant-control",
      "GET /company/{number}/filing-history?category=accounts",
      "{documentMetadataLink} then {documentMetadataLink}/content (iXBRL/XBRL/XHTML text only — PDF-only accounts are never downloaded/OCR'd)",
    ],
    credentialsAvailable: { apiKeyPresent: config.apiKeyPresent, enabled: config.enabled, maxCallsPerRunPositive: config.maxCallsPerRun > 0, effectivelyEnabled: enabled },
    dryRunRequestPlanSample: dryRunRequestPlan.slice(0, 5),
    dryRunRequestPlanFullCount: dryRunRequestPlan.length,
    evidenceTierCounts: Object.fromEntries(Object.entries(dryRunRequestPlan.reduce((acc: Record<string, number>, r) => { acc[r.evidenceTier] = (acc[r.evidenceTier] ?? 0) + 1; return acc; }, {}))),
    stopConditions: {
      credentialsMissing: !config.apiKeyPresent,
      requestCountUnbounded: false,
      configUnclear: !config.enabled || config.maxCallsPerRun <= 0,
    },
    inputChecksums: { googleResultsJson: googleResultsChecksum, customerResolutionAfterGoogleCsv: custResChecksum, fsaResultsJson: fsaResultsChecksum, customersFile: customersChecksum, groupRegistry: registryChecksum },
    noticeIfDryRun: "DRY RUN — no Companies House request has been made. None of the 22 Companies House-stage result files have been written.",
  };
  await fs.writeFile(path.join(outDir, "companies-house-preflight-report.json"), JSON.stringify(preflight, null, 2));
  console.log(`\nPreflight: ${eligibleIds.length} eligible candidates, combined cap ${hardMaxRequestCap}, document cap ${hardMaxDocumentCap}.`);
  console.log(`Evidence tiers: ${JSON.stringify(preflight.evidenceTierCounts)}`);

  if (!live) {
    console.log("\nDry run complete. No live Companies House request has been made. Pass --live to execute the real run.");
    process.exit(0);
  }
  if (!enabled) { console.error("\nREFUSING TO RUN LIVE: Companies House is not enabled. No request has been made."); process.exit(1); }
  if (hardMaxRequestCap <= 0) { console.error("\nREFUSING TO RUN LIVE: effective combined request cap is 0."); process.exit(1); }

  console.log(`\n=== LIVE RUN — up to ${hardMaxRequestCap} combined requests, ${hardMaxDocumentCap} document requests ===`);

  const budget = newCompaniesHouseBudget();
  let documentCallsMade = 0;
  const referenceIso = new Date().toISOString();

  // --- Priority ordering for graceful degradation if the cap would be exceeded (A11) ---
  const priority = (id: string): number => {
    const custRow = custResByCandidate.get(id);
    if (custRow?.resolution_outcome === "unresolved_customer_match_after_google") return 0;
    const g = googleByCandidate.get(id);
    if (g && ["exact_google_match", "strong_probable_google_match"].includes(g.outcome)) return 1;
    return 2;
  };
  const orderedIds = [...eligibleIds].sort((a, b) => priority(a) - priority(b));

  interface CachedCompany { profile: any; officers: OfficerRecord[]; pscs: PscRecord[]; filedAccounts: FiledAccountsData; calculations: FinancialCalculations; }
  const companyCache = new Map<string, CachedCompany>();

  const chResults: CompanyLegalIdentityResult[] = [];
  const profiles: CompanyProfile[] = [];
  const filedAccountsRows: FiledAccountsData[] = [];
  const financialCalcRows: FinancialCalculations[] = [];
  const officersByCandidate = new Map<string, OfficerRecord[]>();
  const pscsByCandidate = new Map<string, PscRecord[]>();
  const officersByCompany = new Map<string, OfficerRecord[]>();
  const pscsByCompany = new Map<string, PscRecord[]>();
  const deferredIds: string[] = [];

  for (let i = 0; i < orderedIds.length; i++) {
    const candidateId = orderedIds[i];
    const plan = buildQueryPlan(candidateId);

    if (budgetRemaining(budget) <= 0) { deferredIds.push(candidateId); continue; }

    let companyNumber: string | null = plan.knownCompanyNumber;
    let searchResult: any;
    let searchQueriesUsed: string[] = [];

    if (companyNumber) {
      searchResult = { ok: true, items: [], queryString: `company_number:${companyNumber}`, disabledReason: null, apiFailureReason: null, retrievedAt: referenceIso };
      searchQueriesUsed = [`known company number: ${companyNumber}`];
    } else {
      searchResult = await searchCompanies(budget, plan.queryText ?? plan.candidateName, plan.candidatePostcode);
      searchQueriesUsed = [searchResult.queryString];
      if (searchResult.ok && searchResult.items.length > 0) {
        const best = [...searchResult.items].sort((a: any, b: any) => (b.legalNameSimilarity + (b.postcodeAgreement ? 1 : 0)) - (a.legalNameSimilarity + (a.postcodeAgreement ? 1 : 0)))[0];
        companyNumber = best.companyNumber || null;
      }
    }

    let profile: any = null;
    if (companyNumber) {
      const cached = companyCache.get(companyNumber);
      if (cached) {
        profile = cached.profile;
      } else if (budgetRemaining(budget) > 0) {
        const profileRes = await getCompanyProfile(budget, companyNumber);
        if (profileRes.ok) profile = profileRes.profile;
      }
    }

    // Fold the fetched/known company number back into a synthetic search item when it was
    // known-in-advance (no search was performed) so classifyCompanyMatch has evidence to score.
    if (plan.knownCompanyNumber && profile) {
      const { normaliseName: nn, nameSimilarity: ns, normalisePostcode: np } = await import("./normalize");
      const candOutward = np(plan.candidatePostcode).outward;
      const rOutward = profile.registeredPostcode ? np(profile.registeredPostcode).outward : null;
      searchResult = {
        ok: true, queryString: searchResult.queryString, disabledReason: null, apiFailureReason: null, retrievedAt: referenceIso,
        items: [{
          companyNumber: profile.companyNumber, companyName: profile.companyName, companyStatus: profile.companyStatus, companyType: profile.companyType,
          addressSnippet: profile.registeredOfficeAddress ?? "", legalNameSimilarity: ns(nn(plan.candidateName), nn(profile.companyName)),
          postcodeAgreement: !!candOutward && !!rOutward && candOutward === rOutward,
        }],
      };
    }

    const chResult = classifyCompanyMatch(candidateId, plan.candidateName, plan.candidatePostcode, searchResult, searchQueriesUsed, companyNumber, profile);
    chResults.push(chResult);

    const decisive = chResult.outcome === "exact_company_match" || chResult.outcome === "strong_probable_company_match";
    if (decisive && companyNumber && profile) {
      let cached = companyCache.get(companyNumber);
      if (!cached) {
        let officers: OfficerRecord[] = [];
        let pscs: PscRecord[] = [];
        if (budgetRemaining(budget) > 0) {
          budget.runner.callsMade += 1;
          const rawOfficers = await budget.runner.fetchOfficers(companyNumber, referenceIso);
          officers = mapOfficers(candidateId, companyNumber, rawOfficers, referenceIso, `GET /company/${companyNumber}/officers`);
        }
        if (budgetRemaining(budget) > 0) {
          const pscRes = await getCompanyPsc(budget, companyNumber);
          if (pscRes.ok) pscs = mapPscs(candidateId, companyNumber, pscRes.items, referenceIso, `GET /company/${companyNumber}/persons-with-significant-control`);
        }
        let filedAccounts: FiledAccountsData;
        let calculations: FinancialCalculations;
        if (documentCallsMade < hardMaxDocumentCap && budgetRemaining(budget) > 0) {
          const before = budget.runner.callsMade;
          const fin = await fetchAndComputeFinancials(budget.runner, candidateId, companyNumber, profile.incorporationDate, referenceIso);
          documentCallsMade += Math.max(0, budget.runner.callsMade - before - 1); // filing-history itself counted once; document retrieval calls are the delta beyond that
          filedAccounts = fin.filedAccounts;
          calculations = fin.calculations;
        } else {
          filedAccounts = { candidateId, companyNumber, accountsType: null, reportingPeriodStart: null, reportingPeriodEnd: null, values: Object.fromEntries(["turnover", "grossProfit", "operatingProfit", "profitOrLoss", "cashAndCashEquivalents", "currentAssets", "currentLiabilities", "netCurrentAssetsLiabilities", "fixedAssets", "totalAssets", "totalLiabilities", "creditors", "netAssets", "shareholdersFunds", "employeeCount"].map((f) => [f, { result: null, currency: null, formula: "directly reported", sourceFields: [], sourcePeriods: [], sourceConcept: null, sourceDocument: null, valueSource: "not_available", confidence: "not_available", unavailableReason: "Document/accounts request cap reached for this run — deferred." }])) as any, sourceDocumentReference: null, retrievalTimestamp: referenceIso };
          calculations = { candidateId, companyNumber, calculations: {} as any, financialRiskFlags: [], financialDataCompleteness: { result: null, currency: null, formula: "n/a", sourceFields: [], sourcePeriods: [], sourceConcept: null, sourceDocument: null, valueSource: "not_available", confidence: "not_available", unavailableReason: "Document/accounts request cap reached for this run — deferred." }, financialDataConfidence: "not_available" };
        }
        cached = { profile, officers, pscs, filedAccounts, calculations };
        companyCache.set(companyNumber, cached);
      }
      officersByCandidate.set(candidateId, cached.officers.map((o) => ({ ...o, candidateId })));
      pscsByCandidate.set(candidateId, cached.pscs.map((p) => ({ ...p, candidateId })));
      officersByCompany.set(companyNumber, cached.officers);
      pscsByCompany.set(companyNumber, cached.pscs);
      const chProfile: CompanyProfile = { candidateId, ...profile, parentCompanyEvidence: null, branchOrMultiSiteIndicator: null, retrievalTimestamp: referenceIso, sourceReference: `GET /company/${companyNumber}` };
      profiles.push(chProfile);
      filedAccountsRows.push({ ...cached.filedAccounts, candidateId });
      financialCalcRows.push({ ...cached.calculations, candidateId });
    } else {
      officersByCandidate.set(candidateId, []);
      pscsByCandidate.set(candidateId, []);
    }

    if ((i + 1) % 10 === 0 || i === orderedIds.length - 1) console.log(`  Companies House processed ${i + 1}/${orderedIds.length} (budget used ${budgetCallsMade(budget)}/${hardMaxRequestCap}, documents ${documentCallsMade}/${hardMaxDocumentCap})`);
  }

  // --- Group/related-company analysis (needs the full batch's officer/PSC/profile context) ---
  const batchMaps = computeBatchOwnershipMaps(profiles, officersByCompany, pscsByCompany);
  const relatedByCandidate = new Map<string, RelatedCompanyAnalysis>();
  for (const chResult of chResults) {
    const candidateId = chResult.candidateId;
    const profile = profiles.find((p) => p.candidateId === candidateId) ?? null;
    const officers = officersByCandidate.get(candidateId) ?? [];
    const pscs = pscsByCandidate.get(candidateId) ?? [];
    const related = analyseRelatedCompany(candidateId, chResult, profile, officers, pscs, registryLoaded.entries, batchMaps);
    relatedByCandidate.set(candidateId, related);
    // Backfill sharedDirectorFlag now that batch maps exist.
    for (const o of officers) {
      const others = [...(batchMaps.companyNumbersByDirectorName.get(o.fullName.toLowerCase().trim()) ?? [])];
      o.sharedDirectorFlag = others.filter((n) => n !== o.companyNumber).length > 0;
      o.associatedCompanyNumbers = others.filter((n) => n !== o.companyNumber);
    }
  }

  // --- Customer resolution after Companies House ---
  const customerResolutions: CustomerResolutionAfterCompaniesHouse[] = [];
  for (const chResult of chResults) {
    const candidateId = chResult.candidateId;
    const custRow = custResByCandidate.get(candidateId);
    const priorResolution = (custRow?.resolution_outcome as CustomerResolutionAfterGoogleOutcome) ?? "n/a";
    const priorMatchedCustomerId = custRow?.prior_matched_customer_id || null;
    const matchedCustomer: CustomerRecord | null = priorMatchedCustomerId ? (customerById.get(priorMatchedCustomerId) ?? null) : null;
    const related = relatedByCandidate.get(candidateId) ?? null;
    const google = googleByCandidate.get(candidateId)!;
    const candidateName = google?.candidateTradingName ?? "";
    customerResolutions.push(resolveCustomerMatchAfterCompaniesHouse(candidateId, candidateName, priorResolution, matchedCustomer, chResult, related, google));
  }

  // --- Decision-maker candidates ---
  const decisionMakers: DecisionMakerCandidate[] = [];
  for (const chResult of chResults) {
    const candidateId = chResult.candidateId;
    const profile = profiles.find((p) => p.candidateId === candidateId) ?? null;
    const officers = officersByCandidate.get(candidateId) ?? [];
    const pscs = pscsByCandidate.get(candidateId) ?? [];
    decisionMakers.push(...buildDecisionMakerCandidates(candidateId, profile?.companyNumber ?? null, officers, pscs, profile?.incorporationDate ?? null));
  }

  // --- Outputs (22 files) ---
  await fs.writeFile(path.join(outDir, "companies-house-results.csv"), writeCsv([...CH_RESULT_COLUMNS], chResults.map(chResultRow)));
  await fs.writeFile(path.join(outDir, "companies-house-results.json"), JSON.stringify(chResults, null, 2));
  const chBucket = (pred: (r: CompanyLegalIdentityResult) => boolean) => chResults.filter(pred).map(chResultRow);
  await fs.writeFile(path.join(outDir, "exact-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], chBucket((r) => r.outcome === "exact_company_match")));
  await fs.writeFile(path.join(outDir, "probable-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], chBucket((r) => r.outcome === "strong_probable_company_match")));
  await fs.writeFile(path.join(outDir, "multiple-or-conflicting-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], chBucket((r) => ["multiple_company_matches", "company_name_conflict", "registered_address_conflict", "dissolved_company_conflict", "dormant_company_conflict"].includes(r.outcome))));
  await fs.writeFile(path.join(outDir, "no-company-record.csv"), writeCsv([...CH_RESULT_COLUMNS], chBucket((r) => r.outcome === "no_company_record" || r.outcome === "probable_sole_trader_or_partnership")));
  await fs.writeFile(path.join(outDir, "companies-house-api-failures.csv"), writeCsv([...CH_RESULT_COLUMNS], chBucket((r) => r.outcome === "companies_house_api_failure")));

  await fs.writeFile(path.join(outDir, "company-profiles.csv"), writeCsv([...PROFILE_COLUMNS], profiles.map(profileRow)));
  await fs.writeFile(path.join(outDir, "filed-accounts-data.csv"), writeCsv(FILED_ACCOUNTS_COLUMNS, filedAccountsRows.map(filedAccountsRow)));
  await fs.writeFile(path.join(outDir, "financial-calculations.csv"), writeCsv(FINANCIAL_CALC_COLUMNS, financialCalcRows.map(financialCalcRow)));

  const allOfficers = [...officersByCandidate.values()].flat();
  const allPscs = [...pscsByCandidate.values()].flat();
  await fs.writeFile(path.join(outDir, "directors-and-officers.csv"), writeCsv([...OFFICER_COLUMNS], allOfficers.map(officerRow)));
  await fs.writeFile(path.join(outDir, "persons-with-significant-control.csv"), writeCsv([...PSC_COLUMNS], allPscs.map(pscRow)));

  const allRelated = [...relatedByCandidate.values()];
  await fs.writeFile(path.join(outDir, "related-companies.csv"), writeCsv([...RELATED_COLUMNS], allRelated.map(relatedRow)));
  await fs.writeFile(path.join(outDir, "group-and-franchise-analysis.csv"), writeCsv([...RELATED_COLUMNS], allRelated.map(relatedRow)));

  await fs.writeFile(path.join(outDir, "customer-resolution-after-companies-house.csv"), writeCsv([...CUSTOMER_RES_COLUMNS], customerResolutions.map(customerResRow)));
  const custBucket = (pred: (r: CustomerResolutionAfterCompaniesHouse) => boolean) => customerResolutions.filter(pred).map(customerResRow);
  await fs.writeFile(path.join(outDir, "confirmed-active-customers-after-companies-house.csv"), writeCsv([...CUSTOMER_RES_COLUMNS], custBucket((r) => r.resolutionOutcome === "confirmed_active_customer_after_companies_house")));
  await fs.writeFile(path.join(outDir, "confirmed-inactive-customers-after-companies-house.csv"), writeCsv([...CUSTOMER_RES_COLUMNS], custBucket((r) => r.resolutionOutcome === "confirmed_inactive_customer_after_companies_house")));
  await fs.writeFile(path.join(outDir, "released-from-customer-hold-after-companies-house.csv"), writeCsv([...CUSTOMER_RES_COLUMNS], custBucket((r) => r.resolutionOutcome === "released_from_customer_hold_after_companies_house")));
  await fs.writeFile(path.join(outDir, "unresolved-customer-matches-after-companies-house.csv"), writeCsv([...CUSTOMER_RES_COLUMNS], custBucket((r) => r.resolutionOutcome === "unresolved_customer_match_after_companies_house")));

  await fs.writeFile(path.join(outDir, "decision-maker-candidates.csv"), writeCsv([...DECISION_MAKER_COLUMNS], decisionMakers.map(decisionMakerRow)));

  const registerColumns = [...CH_RESULT_COLUMNS, "related_category", "customer_resolution_outcome", "decision_maker_count"] as const;
  const custResByC = new Map(customerResolutions.map((r) => [r.candidateId, r]));
  const dmCountByC = new Map<string, number>();
  for (const d of decisionMakers) dmCountByC.set(d.candidateId, (dmCountByC.get(d.candidateId) ?? 0) + 1);
  const registerRows = chResults.map((r) => ({
    ...chResultRow(r), related_category: relatedByCandidate.get(r.candidateId)?.category ?? "",
    customer_resolution_outcome: custResByC.get(r.candidateId)?.resolutionOutcome ?? "", decision_maker_count: dmCountByC.get(r.candidateId) ?? 0,
  }));
  await fs.writeFile(path.join(outDir, "complete-companies-house-evidence-register.csv"), writeCsv([...registerColumns], registerRows));

  const countBy = (rows: unknown[], get: (r: any) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = {
    territory, processingTimestamp: new Date().toISOString(),
    candidatesEligible: eligibleIds.length, candidatesProcessed: chResults.length, candidatesDeferred: deferredIds.length, deferredCandidateIds: deferredIds,
    combinedRequestsMade: budgetCallsMade(budget), combinedRequestCap: hardMaxRequestCap,
    documentRequestsMade: documentCallsMade, documentRequestCap: hardMaxDocumentCap,
    distinctCompaniesFetched: companyCache.size,
    legalIdentityOutcomeCounts: countBy(chResults, (r) => r.outcome),
    companiesHouseStatusCounts: countBy(chResults.filter((r) => r.companiesHouseStatus), (r) => r.companiesHouseStatus),
    filedAccountsAvailability: { withAnyDirectlyReportedValue: filedAccountsRows.filter((f) => Object.values(f.values).some((v) => v.valueSource === "directly_reported")).length, total: filedAccountsRows.length },
    officersRetrieved: { current: allOfficers.filter((o) => o.status === "current").length, resigned: allOfficers.filter((o) => o.status === "resigned").length },
    pscsRetrieved: { current: allPscs.filter((p) => p.status === "current").length, ceased: allPscs.filter((p) => p.status === "ceased").length },
    relatedCompanyCategoryCounts: countBy(allRelated, (r) => r.category),
    customerResolutionCounts: countBy(customerResolutions, (r) => r.resolutionOutcome),
    decisionMakerCandidateCounts: countBy(decisionMakers, (r) => r.likelyRole),
    totalReconciled: chResults.length,
    notice: "Companies House legal-entity/company-profile/filed-accounts/financial-calculations/directors/PSC/related-company evidence only. No numeric Level 0-4 score has been assigned. No candidate here is sales-ready. Website enrichment, LinkedIn/public-profile search, and final scoring have NOT been run.",
  };
  await fs.writeFile(path.join(outDir, "companies-house-processing-summary.json"), JSON.stringify(summary, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(), territory, rulesVersion: RULES_VERSION, codeCommitSha: gitCommitSha(),
    sourceCheckpoints: { googleCheckpointDir, googleResultsChecksum, customerResolutionAfterGoogleChecksum: custResChecksum, fsaDir, fsaResultsChecksum },
    customerMasterHash: customersChecksum, groupRegistryHash: registryChecksum,
    requestLimits: { hardMaxCombinedRequestCap: hardMaxRequestCap, hardMaxDocumentRequestCap: hardMaxDocumentCap },
    requestCounts: { combinedRequestsMade: budgetCallsMade(budget), documentRequestsMade: documentCallsMade, distinctCompaniesCached: companyCache.size },
    deferredCandidateIds: deferredIds,
  };
  await fs.writeFile(path.join(outDir, "companies-house-run-manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nLegal identity outcomes: ${JSON.stringify(summary.legalIdentityOutcomeCounts)}`);
  console.log(`Customer resolution: ${JSON.stringify(summary.customerResolutionCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  console.log("No candidate is sales-ready. Website enrichment, LinkedIn/public-profile search, and final scoring have NOT been run.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
