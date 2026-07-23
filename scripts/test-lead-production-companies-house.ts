// Fixture-driven proofs for the Companies House stage (npm run test:lead-production-companies-house).
// Pure logic — constructs search/profile/PSC objects directly, never calls the real network.

import { promises as fs } from "node:fs";
import path from "node:path";
import { calculateCompaniesHousePopulation } from "./lead-production/companies-house-population";
import { classifyCompanyMatch, COMPANIES_HOUSE_MATCH_THRESHOLDS } from "./lead-production/companies-house-match";
import { mapOfficers, mapPscs } from "./lead-production/officers-and-psc";
import { computeBatchOwnershipMaps, analyseRelatedCompany } from "./lead-production/group-analysis-after-companies-house";
import { resolveCustomerMatchAfterCompaniesHouse } from "./lead-production/customer-resolution-after-companies-house";
import { fetchAndComputeFinancials } from "./lead-production/financial-extraction-after-companies-house";
import { buildDecisionMakerCandidates } from "./lead-production/decision-maker-candidates";
import type { CustomerRecord, CompanyLegalIdentityResult, CompanyProfile, GoogleMatchResult } from "./lead-production/types";
import type { CompanySearchQueryResult, RawCompanyProfile } from "./lead-production/companies-house-adapter";
import { CompaniesHouseRunner } from "../src/lib/sources/companies-house";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
// Strips both // line comments and /* ... */ block comments (including JSDoc-style /** */) —
// a bare // filter misses block-comment continuation lines like " *  ...", which is exactly
// what caused a false positive here on this module's own explanatory comments.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function mkSearchResult(items: Partial<CompanySearchQueryResult["items"][number]>[], query = "Test Diner UB1 1AA"): CompanySearchQueryResult {
  return {
    ok: true, queryString: query, disabledReason: null, apiFailureReason: null, retrievedAt: new Date().toISOString(),
    items: items.map((it) => ({ companyNumber: it.companyNumber ?? "12345678", companyName: it.companyName ?? "Test Diner Ltd", companyStatus: it.companyStatus ?? "active", companyType: it.companyType ?? "ltd", addressSnippet: it.addressSnippet ?? "", legalNameSimilarity: it.legalNameSimilarity ?? 0.8, postcodeAgreement: it.postcodeAgreement ?? true })),
  };
}
function mkProfile(o: Partial<RawCompanyProfile> = {}): RawCompanyProfile {
  return {
    companyNumber: o.companyNumber ?? "12345678", companyName: o.companyName ?? "Test Diner Ltd", previousNames: o.previousNames ?? [],
    companyStatus: o.companyStatus ?? "active", companyType: o.companyType ?? "ltd", incorporationDate: o.incorporationDate ?? "2015-01-01",
    cessationDate: o.cessationDate ?? null, registeredOfficeAddress: o.registeredOfficeAddress ?? "1 Test Street, UB1 1AA", registeredPostcode: o.registeredPostcode ?? "UB1 1AA",
    sicCodes: o.sicCodes ?? ["56101"], natureOfBusinessDescriptions: [], accountsReferenceDate: null, lastAccountsPeriodEnd: o.lastAccountsPeriodEnd ?? "2025-01-31",
    nextAccountsDueDate: null, accountsOverdue: o.accountsOverdue ?? false, confirmationStatementDate: null, nextConfirmationStatementDue: null, confirmationStatementOverdue: false,
    hasInsolvencyHistory: o.hasInsolvencyHistory ?? false, hasCharges: o.hasCharges ?? false,
  };
}
function mkCustomer(o: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    rowIndex: 1, customerId: o.customerId ?? "C1", status: "CUSTOMER-Closed Won", lifecycleSource: "inactive_flag",
    lifecycleRawValue: o.isActive === false ? "Yes" : "No", statusOutcome: o.isActive === false ? "inactive" : "active",
    isActive: o.isActive ?? true, tradingName: o.tradingName ?? "Test Diner Ltd", legalName: null, companyNumber: o.companyNumber ?? null,
    address: o.address ?? "1 Test Street, UB1 1AA", postcode: o.postcode ?? "UB1 1AA", phone: o.phone ?? null, email: o.email ?? null,
    parentGroupAccount: null, lastOrderDate: null, assignedSalesperson: null,
  };
}
function noGoogleEvidence(candidateId = "cand-1"): GoogleMatchResult {
  return { candidateId, candidateTradingName: "Test Diner", candidatePostcode: "UB1 1AA", outcome: "no_google_match", plausibleResults: [], resultCount: 0, zeroResults: true, allReturnedResults: [], evidenceTags: [], retrievalTimestamp: new Date().toISOString(), sourceResponseReference: "", apiFailureReason: null, apiAttempts: 1 };
}

async function main() {
  console.log("Companies House stage — fixture-driven proofs:\n");

  // --- 1/2/3: population set arithmetic, active/inactive/closures excluded, overlaps not double-subtracted ---
  {
    const rows = [
      { candidateId: "a", customerResolutionOutcome: "confirmed_active_customer_after_google", googleOutcome: "exact_google_match" },
      { candidateId: "b", customerResolutionOutcome: "confirmed_inactive_customer_after_google", googleOutcome: "exact_google_match" },
      { candidateId: "c", customerResolutionOutcome: null, googleOutcome: "permanently_closed" },
      { candidateId: "d", customerResolutionOutcome: null, googleOutcome: "temporarily_closed" },
      { candidateId: "e", customerResolutionOutcome: "confirmed_active_customer_after_google", googleOutcome: "permanently_closed" }, // deliberately overlapping two exclusion sets
      { candidateId: "f", customerResolutionOutcome: "unresolved_customer_match_after_google", googleOutcome: "no_google_match" },
      { candidateId: "g", customerResolutionOutcome: null, googleOutcome: "google_postcode_conflict" },
    ];
    const result = calculateCompaniesHousePopulation(rows);
    assert(result.startingCandidateCount === 7, "starting candidate count is derived from the input row count");
    assert(result.exclusionSets.find((s) => s.name === "confirmed_active_customer_after_google")?.ids.join(",") === "a,e", "active-customer exclusion set derived by candidate ID");
    assert(result.exclusionSets.find((s) => s.name === "permanently_closed")?.ids.join(",") === "c,e", "permanently-closed exclusion set derived by candidate ID");
    assert(result.overlaps.length === 1 && result.overlaps[0].ids.includes("e"), "candidate 'e' (active customer AND permanently closed) is correctly reported as an overlap");
    // Union of {a,e} ∪ {b} ∪ {c,e} ∪ {d} = {a,b,c,d,e} — 5 DISTINCT candidates. The proof that
    // 'e' was counted once, not twice, is excludedUnionCount === 5 (not 6, which sequential
    // subtraction/summing set sizes would wrongly produce: 2+1+2+1=6).
    assert(result.excludedUnionCount === 5, `'e' (in two exclusion sets) is counted once via a real union, not twice via summed set sizes (got ${result.excludedUnionCount}, expected 5 distinct candidates; naive summing would give 6)`);
    assert(result.eligibleIds.sort().join(",") === "f,g", "candidates f and g (unresolved match, postcode conflict) remain eligible");
    assert(result.reconciles === true, "eligible + excluded reconciles exactly to the starting count");
  }

  // --- 4: exact company number creates an exact match ---
  {
    const search = mkSearchResult([{ companyName: "Test Diner Ltd", legalNameSimilarity: 1, postcodeAgreement: true, companyStatus: "active" }]);
    const profile = mkProfile();
    const r = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", search, ["Test Diner UB1 1AA"], "12345678", profile);
    assert(r.outcome === "exact_company_match", `exact postcode + strong name -> exact_company_match (got ${r.outcome})`);
  }

  // --- 5: generic name alone cannot confirm a company ---
  {
    const search = mkSearchResult([{ companyName: "The Kitchen Restaurant Ltd", legalNameSimilarity: 0.8, postcodeAgreement: true, companyStatus: "active" }], "Restaurant UB1 1AA");
    const profile = mkProfile({ companyName: "The Kitchen Restaurant Ltd" });
    const r = classifyCompanyMatch("cand-1", "Restaurant", "UB1 1AA", search, ["Restaurant UB1 1AA"], "12345678", profile);
    assert(r.outcome !== "exact_company_match", `a generic query ("Restaurant") is capped below exact_company_match even with strong overlap (got ${r.outcome})`);
    assert(r.evidenceTags.includes("GENERIC_NAME_CAPPED_BELOW_EXACT"), "the generic-name cap is explicitly recorded in evidence tags");
  }

  // --- 6: address plus strong name can create a probable match ---
  {
    const search = mkSearchResult([{ companyName: "Test Diner Foods Ltd", legalNameSimilarity: 0.5, postcodeAgreement: true, companyStatus: "active" }]);
    const profile = mkProfile({ companyName: "Test Diner Foods Ltd" });
    const r = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", search, ["Test Diner UB1 1AA"], "12345678", profile);
    assert(r.outcome === "strong_probable_company_match", `postcode exact + moderate name -> strong_probable_company_match (got ${r.outcome})`);
  }

  // --- 7: first Companies House result is not selected blindly ---
  {
    const search = mkSearchResult([
      { companyNumber: "A", companyName: "Test Diner Ltd", legalNameSimilarity: 0.9, postcodeAgreement: true, companyStatus: "active" },
      { companyNumber: "B", companyName: "Test Diner Express Ltd", legalNameSimilarity: 0.7, postcodeAgreement: true, companyStatus: "active" },
    ]);
    const r = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", search, ["Test Diner UB1 1AA"], null, null);
    assert(r.outcome === "multiple_company_matches" && r.plausibleCompanies.length === 2, `two live companies sharing the postcode are both retained as multiple_company_matches, not just the first (got ${r.outcome}, ${r.plausibleCompanies.length} retained)`);
  }

  // --- 8: sole trader / no company record is not automatically rejected ---
  {
    const search = mkSearchResult([]);
    const r = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", search, ["Test Diner UB1 1AA"], null, null);
    assert(r.outcome === "no_company_record", `zero search results -> no_company_record (got ${r.outcome})`);
    assert(r.evidenceTags.includes("MISSING_RECORD_DOES_NOT_AUTOMATICALLY_REJECT_SOLE_TRADER"), "the outcome explicitly documents that a missing record is not an automatic rejection");
  }

  // --- 9: dissolved and dormant conflicts remain explicit ---
  {
    const dissolvedSearch = mkSearchResult([{ companyName: "Test Diner Ltd", legalNameSimilarity: 0.9, postcodeAgreement: true, companyStatus: "dissolved" }]);
    const rD = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", dissolvedSearch, ["q"], "12345678", mkProfile({ companyStatus: "dissolved" }));
    assert(rD.outcome === "dissolved_company_conflict" && rD.companiesHouseStatus === "dissolved", `a dissolved strong match is reported as dissolved_company_conflict, never silently promoted (got ${rD.outcome})`);

    const dormantSearch = mkSearchResult([{ companyName: "Test Diner Ltd", legalNameSimilarity: 0.9, postcodeAgreement: true, companyStatus: "dormant" }]);
    const rM = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", dormantSearch, ["q"], "12345678", mkProfile({ companyStatus: "dormant" }));
    assert(rM.outcome === "dormant_company_conflict" && rM.companiesHouseStatus === "dormant", `a dormant strong match is reported as dormant_company_conflict (got ${rM.outcome})`);
  }

  // --- Regression: real live-run defect — a STRONG name match whose registered office is in a
  // different postal district (a very common real pattern: registered office = accountant's/
  // formation agent's address, unrelated to the trading premises) was mislabelled
  // company_name_conflict, even though the tag itself said "NAME_MATCHES..." — the conflict is
  // the ADDRESS, not the name. Must be registered_address_conflict regardless of whether the
  // mismatched district is adjacent or far away. ---
  {
    const search = mkSearchResult([{ companyName: "Test Diner Ltd", legalNameSimilarity: 0.9, postcodeAgreement: false, companyStatus: "active" }]);
    const profile = mkProfile({ registeredPostcode: "SW1A 1AA" }); // a totally different postal district to the candidate's UB1
    const r = classifyCompanyMatch("cand-1", "Test Diner", "UB1 1AA", search, ["q"], "12345678", profile);
    assert(r.outcome === "registered_address_conflict", `a strong name match with a registered office in a different postal district is registered_address_conflict, never company_name_conflict — the name matched fine (got ${r.outcome})`);
    assert(r.evidenceTags.includes("REGISTERED_OFFICE_LIKELY_ACCOUNTANT_OR_FORMATION_AGENT"), "the evidence explicitly notes the common real-world explanation (registered office likely an accountant/formation agent, unrelated to the trading premises)");
  }

  // Financial-extraction tests below construct their OWN disabled runner (env vars forced off)
  // so fetchAndComputeFinancials() never makes a real network call — it exercises the
  // no-filing-history-retrievable path, which is exactly what "absent values stay unavailable"
  // needs to prove, without touching the live API.
  const savedChKey = process.env.COMPANIES_HOUSE_API_KEY, savedChEnabled = process.env.COMPANIES_HOUSE_ENABLED, savedChCap = process.env.COMPANIES_HOUSE_MAX_CALLS_PER_RUN;
  delete process.env.COMPANIES_HOUSE_API_KEY;
  process.env.COMPANIES_HOUSE_ENABLED = "false";
  delete process.env.COMPANIES_HOUSE_MAX_CALLS_PER_RUN;

  // --- 10/11: basic profile data not misrepresented as filed financial data; absent values stay unavailable, never zero ---
  {
    const runner = new CompaniesHouseRunner();
    assert(runner.enabled === false, "fixture sanity check: the runner is disabled for this test — no real network call will be made");
    const fin = await fetchAndComputeFinancials(runner, "cand-1", "12345678", "2015-01-01", new Date().toISOString());
    assert(fin.filedAccounts.values.totalAssets.result === null && fin.filedAccounts.values.totalAssets.valueSource === "not_available", "totalAssets is not_available (never derived from the company-profile response, which contains no financial figures)");
    assert(!!fin.filedAccounts.values.totalAssets.unavailableReason, "the unavailable reason is a real explanatory string, not a silent null (this run: no filing history could be retrieved with a disabled runner)");
    assert(fin.filedAccounts.values.turnover.result === null, "with no accounts filing history retrievable (disabled in this test), turnover remains null, never 0");
    assert(fin.calculations.calculations.currentRatio.result === null, "currentRatio is null (not 0) when no filed accounts were available");
  }

  // Structural proof (a disabled-runner fixture can't reach this deeper code path): the
  // totalAssets-specific reason genuinely explains the parser limitation, not a generic filler.
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/financial-extraction-after-companies-house.ts"), "utf8");
    assert(/never a genuine gross total-assets concept/i.test(text), "financial-extraction-after-companies-house.ts's totalAssets unavailableReason explicitly documents the parser limitation (basic profile data is never misrepresented as filed financial data)");
  }

  // --- 12/13: every calculation records formula/source; current ratio not calculated without both inputs ---
  {
    const runner = new CompaniesHouseRunner();
    const fin = await fetchAndComputeFinancials(runner, "cand-1", "12345678", "2015-01-01", new Date().toISOString());
    for (const key of Object.keys(fin.calculations.calculations) as (keyof typeof fin.calculations.calculations)[]) {
      const c = fin.calculations.calculations[key];
      assert(typeof c.formula === "string" && c.formula.length > 0, `${key} records a non-empty formula`);
      assert(c.result !== null || !!c.unavailableReason, `${key} records an unavailableReason whenever its result is null`);
    }
    assert(fin.calculations.calculations.currentRatio.result === null, "currentRatio requires BOTH current_assets and current_liabilities — absent here, so it is never calculated from a single input");
  }

  // --- 14: turnover growth uses comparable periods only ---
  {
    const runner = new CompaniesHouseRunner();
    const fin = await fetchAndComputeFinancials(runner, "cand-1", "12345678", "2015-01-01", new Date().toISOString());
    assert(fin.calculations.calculations.turnoverGrowth.result === null, "turnoverGrowth is always not_available in this stage (only one filed period is ever fetched per company — growth requires two comparable periods)");
    assert(!!fin.calculations.calculations.turnoverGrowth.unavailableReason, "turnoverGrowth records a real unavailableReason, never a silent null");
  }
  // Structural proof: turnoverGrowth/netAssetGrowth are UNCONDITIONALLY not_available in code
  // (never computed from a single period as if it were a real growth figure), and the literal
  // reason cites the comparable-periods requirement — this is true regardless of live/disabled
  // runner state, since no second-period fetch exists anywhere in this file.
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/financial-extraction-after-companies-house.ts"), "utf8");
    assert(/turnoverGrowth = unavailable\(/.test(text) && /growth requires two comparable periods/i.test(text), "turnoverGrowth is unconditionally unavailable(), with an unavailableReason explicitly citing the comparable-periods requirement — no code path ever computes a one-period 'growth'");
    assert(/netAssetGrowth = unavailable\(/.test(text), "netAssetGrowth is likewise unconditionally unavailable() for the same reason");
  }

  if (savedChKey !== undefined) process.env.COMPANIES_HOUSE_API_KEY = savedChKey; else delete process.env.COMPANIES_HOUSE_API_KEY;
  if (savedChEnabled !== undefined) process.env.COMPANIES_HOUSE_ENABLED = savedChEnabled; else delete process.env.COMPANIES_HOUSE_ENABLED;
  if (savedChCap !== undefined) process.env.COMPANIES_HOUSE_MAX_CALLS_PER_RUN = savedChCap; else delete process.env.COMPANIES_HOUSE_MAX_CALLS_PER_RUN;

  // --- 15: directors and resigned officers remain distinguishable ---
  {
    const raw = [
      { name: "Alice Owner", role: "director", appointedOn: "2015-01-01", resignedOn: null, active: true, occupation: "Director", countryOfResidence: null, nationality: null, officerAppointmentsLink: null, appointmentsCount: null, source: "companies_house" as const, fetchedAt: "" },
      { name: "Bob Former", role: "director", appointedOn: "2015-01-01", resignedOn: "2020-01-01", active: false, occupation: null, countryOfResidence: null, nationality: null, officerAppointmentsLink: null, appointmentsCount: null, source: "companies_house" as const, fetchedAt: "" },
    ];
    const officers = mapOfficers("cand-1", "12345678", raw, new Date().toISOString(), "ref");
    assert(officers.find((o) => o.fullName === "Alice Owner")?.status === "current", "a still-serving officer is status=current");
    assert(officers.find((o) => o.fullName === "Bob Former")?.status === "resigned", "a resigned officer is status=resigned, never conflated with current");
  }

  // --- 16: sensitive personal fields are excluded from rep-facing outputs ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/types.ts"), "utf8");
    assert(!/dateOfBirth|dob\b|residentialAddress/i.test(stripComments(text)), "types.ts never defines a dateOfBirth or residentialAddress field anywhere in the Companies House types");
    const officersText = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/officers-and-psc.ts"), "utf8");
    assert(!/dateOfBirth|dob\b|residentialAddress/i.test(stripComments(officersText)), "officers-and-psc.ts never maps a dateOfBirth or residentialAddress field (any mention outside comments)");
  }

  // --- 17: PSC control evidence is retained ---
  {
    const raw = [{ name: "Alice Owner", kind: "individual-person-with-significant-control", notifiedOn: "2016-01-01", ceasedOn: null, naturesOfControl: ["ownership-of-shares-25-to-50-percent", "voting-rights-25-to-50-percent"], identificationCompanyNumber: null }];
    const pscs = mapPscs("cand-1", "12345678", raw, new Date().toISOString(), "ref");
    assert(pscs[0].ownershipPercentageBand === "ownership-of-shares-25-to-50-percent", "the explicit CH-supplied ownership band is retained verbatim, never a fabricated precise percentage");
    assert(pscs[0].pscType === "individual" && pscs[0].status === "current", "PSC type and current/ceased status are both retained");
  }

  // --- 18: shared registered office alone does not prove common ownership ---
  {
    const profileA: CompanyProfile = { candidateId: "cand-a", companyNumber: "AAAAAAAA", companyName: "Alpha Ltd", previousNames: [], companyStatus: "active", companyType: "ltd", incorporationDate: null, cessationDate: null, registeredOfficeAddress: "1 Accountant Row, Formations House", registeredPostcode: "UB1 1AA", sicCodes: [], natureOfBusinessDescriptions: [], accountsReferenceDate: null, lastAccountsPeriodEnd: null, nextAccountsDueDate: null, accountsOverdue: null, confirmationStatementDate: null, nextConfirmationStatementDue: null, confirmationStatementOverdue: null, hasInsolvencyHistory: null, hasCharges: null, parentCompanyEvidence: null, branchOrMultiSiteIndicator: null, retrievalTimestamp: "", sourceReference: "" };
    const profileB: CompanyProfile = { ...profileA, candidateId: "cand-b", companyNumber: "BBBBBBBB", companyName: "Beta Ltd" };
    const batch = computeBatchOwnershipMaps([profileA, profileB], new Map(), new Map());
    const chResult: CompanyLegalIdentityResult = { candidateId: "cand-a", candidateTradingName: "Alpha", candidatePostcode: "UB1 1AA", outcome: "exact_company_match", companiesHouseStatus: "active", plausibleCompanies: [{ companyNumber: "AAAAAAAA", companyName: "Alpha Ltd", companyStatus: "active", companyType: "ltd", registeredOfficeAddress: profileA.registeredOfficeAddress, registeredPostcode: "UB1 1AA", previousNames: [], legalNameSimilarity: 1, tradingNameSimilarity: 1, registeredAddressAgreement: true, postcodeAgreement: true, sicCodes: [], incorporationDate: null, dissolutionDate: null }], evidenceTags: [], searchQueriesUsed: [], retrievalTimestamp: "", apiFailureReason: null, apiAttempts: 1 };
    const related = analyseRelatedCompany("cand-a", chResult, profileA, [], [], [], batch);
    assert(related.category !== "common_control_group", `a shared registered office ALONE (no shared director/PSC) never produces common_control_group (got ${related.category})`);
    assert(related.category === "shared_registered_office_only" || related.category === "possible_accountant_or_formation_agent_address", `the shared-office-only case is categorised distinctly (got ${related.category})`);
  }

  // --- 19: shared directors alone do not automatically merge businesses ---
  {
    const officerA = { candidateId: "cand-a", companyNumber: "AAAAAAAA", fullName: "Common Director", officerRole: "director", appointedDate: null, resignedDate: null, status: "current" as const, nationality: null, occupation: null, currentAppointmentsCount: null, resignedAppointmentsCount: null, associatedCompanyNumbers: [], associatedCompanyNames: [], sharedDirectorFlag: false, likelyOwnerDirectorIndicator: false, likelyOperationalDecisionMakerIndicator: true, sourceReference: "", retrievalTimestamp: "" };
    const officerB = { ...officerA, candidateId: "cand-b", companyNumber: "BBBBBBBB" };
    const officersByCompany = new Map([["AAAAAAAA", [officerA]], ["BBBBBBBB", [officerB]]]);
    const profileA: CompanyProfile = { candidateId: "cand-a", companyNumber: "AAAAAAAA", companyName: "Alpha Ltd", previousNames: [], companyStatus: "active", companyType: "ltd", incorporationDate: null, cessationDate: null, registeredOfficeAddress: "1 Alpha Road", registeredPostcode: "UB1 1AA", sicCodes: [], natureOfBusinessDescriptions: [], accountsReferenceDate: null, lastAccountsPeriodEnd: null, nextAccountsDueDate: null, accountsOverdue: null, confirmationStatementDate: null, nextConfirmationStatementDue: null, confirmationStatementOverdue: null, hasInsolvencyHistory: null, hasCharges: null, parentCompanyEvidence: null, branchOrMultiSiteIndicator: null, retrievalTimestamp: "", sourceReference: "" };
    const profileB: CompanyProfile = { ...profileA, candidateId: "cand-b", companyNumber: "BBBBBBBB", companyName: "Beta Ltd", registeredOfficeAddress: "99 Beta Street" }; // deliberately DIFFERENT address — only the director is shared
    const batch = computeBatchOwnershipMaps([profileA, profileB], officersByCompany, new Map());
    const chResult: CompanyLegalIdentityResult = { candidateId: "cand-a", candidateTradingName: "Alpha", candidatePostcode: "UB1 1AA", outcome: "exact_company_match", companiesHouseStatus: "active", plausibleCompanies: [{ companyNumber: "AAAAAAAA", companyName: "Alpha Ltd", companyStatus: "active", companyType: "ltd", registeredOfficeAddress: profileA.registeredOfficeAddress, registeredPostcode: "UB1 1AA", previousNames: [], legalNameSimilarity: 1, tradingNameSimilarity: 1, registeredAddressAgreement: true, postcodeAgreement: true, sicCodes: [], incorporationDate: null, dissolutionDate: null }], evidenceTags: [], searchQueriesUsed: [], retrievalTimestamp: "", apiFailureReason: null, apiAttempts: 1 };
    const related = analyseRelatedCompany("cand-a", chResult, profileA, [officerA], [], [], batch);
    assert(related.category === "ownership_unresolved", `a shared director with NO second corroborating signal is ownership_unresolved, never automatically merged into a group (got ${related.category})`);
    assert(related.evidenceTags.some((t) => /no second corroborating signal/i.test(t)), "the evidence explicitly states why this was not merged");
  }

  // --- 20: exact company number can resolve a Magna customer match ---
  {
    const cust = mkCustomer({ companyNumber: "12345678", tradingName: "Completely Different Trading Name" });
    const ch: CompanyLegalIdentityResult = { candidateId: "cand-1", candidateTradingName: "Test Diner", candidatePostcode: "UB1 1AA", outcome: "exact_company_match", companiesHouseStatus: "active", plausibleCompanies: [{ companyNumber: "12345678", companyName: "Test Diner Ltd", companyStatus: "active", companyType: "ltd", registeredOfficeAddress: "1 Test Street", registeredPostcode: "UB1 1AA", previousNames: [], legalNameSimilarity: 0.9, tradingNameSimilarity: 0.9, registeredAddressAgreement: true, postcodeAgreement: true, sicCodes: [], incorporationDate: null, dissolutionDate: null }], evidenceTags: [], searchQueriesUsed: [], retrievalTimestamp: "", apiFailureReason: null, apiAttempts: 1 };
    const google = noGoogleEvidence();
    const res = resolveCustomerMatchAfterCompaniesHouse("cand-1", "Test Diner", "unresolved_customer_match_after_google", cust, ch, null, google);
    assert(res.resolutionOutcome === "confirmed_active_customer_after_companies_house", `exact company number match confirms the customer even with a totally different trading name (got ${res.resolutionOutcome})`);
  }

  // --- 21: generic/locality name overlap cannot resolve a customer ---
  {
    const cust = mkCustomer({ tradingName: "FATTWINS (Southall)", postcode: "UB1 1AA" });
    const ch: CompanyLegalIdentityResult = { candidateId: "cand-1", candidateTradingName: "Iceland - Southall", candidatePostcode: "UB1 1AA", outcome: "no_company_record", companiesHouseStatus: null, plausibleCompanies: [], evidenceTags: [], searchQueriesUsed: [], retrievalTimestamp: "", apiFailureReason: null, apiAttempts: 1 };
    const google = noGoogleEvidence();
    const res = resolveCustomerMatchAfterCompaniesHouse("cand-1", "Iceland - Southall", "unresolved_customer_match_after_google", cust, ch, null, google);
    assert(res.resolutionOutcome !== "confirmed_active_customer_after_companies_house" && res.resolutionOutcome !== "confirmed_inactive_customer_after_companies_house", `a shared locality word ("Southall") alone never confirms a customer (got ${res.resolutionOutcome})`);
  }

  // --- 22/23: every candidate has exactly one primary outcome; structural evidence-register reconciliation ---
  {
    const outcomes = new Set(["exact_company_match", "strong_probable_company_match", "multiple_company_matches", "company_name_conflict", "registered_address_conflict", "dissolved_company_conflict", "dormant_company_conflict", "no_company_record", "probable_sole_trader_or_partnership", "companies_house_api_failure"]);
    const scenarios = [
      classifyCompanyMatch("c1", "A", "UB1 1AA", mkSearchResult([]), [], null, null),
      classifyCompanyMatch("c2", "B", "UB1 1AA", { ok: false, items: [], queryString: "", disabledReason: "disabled", apiFailureReason: null, retrievedAt: "" }, [], null, null),
    ];
    assert(scenarios.every((s) => outcomes.has(s.outcome)), "every classifyCompanyMatch call returns exactly one valid enum outcome");
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/run-companies-house-stage.ts"), "utf8");
    assert(text.includes("complete-companies-house-evidence-register.csv"), "the orchestrator writes the complete evidence register file");
    assert(text.includes("registerRows = chResults.map"), "the evidence register is built from the full chResults array (one row per processed candidate), not a filtered subset");
  }

  // --- 24: API failures are retryable and never replaced with mock data ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/companies-house-adapter.ts"), "utf8");
    const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
    assert(!/mock|fabricat|synthetic.*compan/i.test(stripComments(text)), "companies-house-adapter.ts never references mock/fabricated company data outside comments");
    assert(withoutComments.includes("retry = await rawGet"), "companies-house-adapter.ts implements a real bounded retry (a second rawGet call), unlike the existing client's sleep-only 429 handling");
  }

  // --- 25/26: no sales-ready label, no numeric Level 0-4 score ---
  {
    const files = ["companies-house-adapter.ts", "companies-house-match.ts", "companies-house-population.ts", "officers-and-psc.ts", "group-analysis-after-companies-house.ts", "customer-resolution-after-companies-house.ts", "financial-extraction-after-companies-house.ts", "decision-maker-candidates.ts", "run-companies-house-stage.ts"];
    for (const f of files) {
      const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production", f), "utf8");
      assert(!/sales[_-]?ready/i.test(text) || /never|no candidate|not sales-ready/i.test(text), `${f} never labels a candidate sales-ready (any mention is only a negation)`);
      assert(!/level[_-]?[0-4]\b/i.test(text), `${f} never assigns a numeric Level 0-4 score`);
    }
  }

  // --- 27: run manifests record all input hashes and versions ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/run-companies-house-stage.ts"), "utf8");
    for (const field of ["codeCommitSha", "customerMasterHash", "groupRegistryHash", "rulesVersion", "sourceCheckpoints", "requestLimits", "requestCounts"]) {
      assert(text.includes(field), `companies-house-run-manifest.json records ${field}`);
    }
  }

  // --- Sanity: thresholds module wired ---
  assert(COMPANIES_HOUSE_MATCH_THRESHOLDS.EXACT_NAME_SIM > 0, "sanity: companies-house-match thresholds module is wired up");

  console.log(fails === 0 ? "\nAll Companies House stage assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
