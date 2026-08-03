// Shared candidate dossier builder — joins every upstream checkpoint (Phase 1 through group
// rescreen) with a *-v2-authoritative-master.json row into one full-detail record per
// candidate. Extracted from generate-release-package-v2.ts (the accepted UB1 release-package
// generator) so the Master exporter, Sales Pro exporter, and release-package generator all
// derive field values the exact same way — never a second, divergent join implementation.
// Read-only; makes no external call; never modifies any checkpoint it reads.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "./csv";
import { isValidUkPhone, resolveValidUkPhone } from "./normalize";

async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readCsvRows(p: string): Promise<Record<string, string>[]> { return (await parseCsvObjects(await fs.readFile(p, "utf8"))).rows; }
export async function findFileEndingWith(dir: string, suffix: string): Promise<string> {
  const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
  if (!match) throw new Error(`No file ending in "${suffix}" found in ${dir}.`);
  return path.join(dir, match);
}

const isValidPhone = isValidUkPhone; // local alias — logic now lives in normalize.ts's single shared validator

// Explicit clean pass/fail labels — every hard gate always reads unambiguously as a pass or a
// failure, never a bare gate name that could be misread as a positive claim.
const GATE_LABELS: Record<string, { pass: string; fail: string }> = {
  correct_territory: { pass: "passed_correct_territory_gate", fail: "failed_correct_territory_gate" },
  genuine_physical_premises: { pass: "passed_genuine_physical_premises", fail: "failed_genuine_physical_premises" },
  currently_trading_not_permanently_closed: { pass: "passed_currently_trading_gate", fail: "failed_currently_trading_gate" },
  company_not_dissolved_or_in_liquidation: { pass: "passed_company_status_gate", fail: "failed_company_status_gate" },
  not_an_active_magna_customer: { pass: "passed_active_customer_gate", fail: "failed_active_customer_gate" },
  not_an_excluded_supermarket_chain_or_group: { pass: "passed_excluded_group_gate", fail: "failed_excluded_group_gate" },
  no_unresolved_serious_trading_address_conflict: { pass: "passed_serious_address_conflict_gate", fail: "failed_serious_address_conflict_gate" },
  suitable_foodservice_business: { pass: "passed_foodservice_business_gate", fail: "failed_foodservice_business_gate" },
  not_an_exact_duplicate: { pass: "passed_duplicate_gate", fail: "failed_duplicate_gate" },
  minimum_identity_evidence_confidence: { pass: "passed_minimum_identity_confidence", fail: "failed_minimum_identity_confidence" },
  required_channel_or_location_evidence: { pass: "passed_required_channel_evidence", fail: "failed_required_channel_evidence" },
};
export function cleanGateLabel(gate: string, passed: boolean): string {
  const l = GATE_LABELS[gate];
  if (l) return passed ? l.pass : l.fail;
  return `${passed ? "passed" : "failed"}_${gate}`;
}

export interface Dossier {
  candidateId: string; tradingName: string; postcode: string | null;
  v1Bucket: string; qualificationStatus: string; channelEligibility: string; finalLevel: string | null;
  fields: Record<string, unknown>;
  anomalies: string[]; warnings: string[];
}

export interface DossierCheckpointDirs {
  phase1Dir: string; fsaDir: string; googleDir: string; chDir: string; websiteDir: string; publicProfileDir: string; groupRescreenDir: string; v2Dir: string;
}

export interface LoadedDossiers { dossiers: Dossier[]; v2MasterFile: string; }

export async function loadCandidateDossiers(dirs: DossierCheckpointDirs): Promise<LoadedDossiers> {
  const phase1Results = (await readJson(path.join(dirs.phase1Dir, "customer-match-results.json"))) as any[];
  const phase1ById = new Map(phase1Results.map((r) => [r.candidateId, r]));

  const fsaResults = (await readJson(path.join(dirs.fsaDir, "fsa-results.json"))) as any[];
  const fsaById = new Map(fsaResults.map((r) => [r.candidateId, r]));

  const googleResults = (await readJson(path.join(dirs.googleDir, "google-results.json"))) as any[];
  const googleById = new Map(googleResults.map((r) => [r.candidateId, r]));
  const fsaResAfterGoogleById = new Map((await readCsvRows(path.join(dirs.googleDir, "fsa-resolution-after-google.csv"))).map((r) => [r.candidate_id, r]));
  const physicalPremisesById = new Map((await readCsvRows(path.join(dirs.googleDir, "physical-premises-results.csv"))).map((r) => [r.candidate_id, r]));

  const chResults = (await readJson(path.join(dirs.chDir, "companies-house-results.json"))) as any[];
  const chById = new Map(chResults.map((r) => [r.candidateId, r]));
  const chCustResById = new Map((await readCsvRows(path.join(dirs.chDir, "customer-resolution-after-companies-house.csv"))).map((r) => [r.candidate_id, r]));
  const profileById = new Map((await readCsvRows(path.join(dirs.chDir, "company-profiles.csv"))).map((r) => [r.candidate_id, r]));
  const finCalcById = new Map((await readCsvRows(path.join(dirs.chDir, "financial-calculations.csv"))).map((r) => [r.candidate_id, r]));
  const filedAccountsById = new Map((await readCsvRows(path.join(dirs.chDir, "filed-accounts-data.csv"))).map((r) => [r.candidate_id, r]));
  const officersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "directors-and-officers.csv"))) { const l = officersByCandidate.get(r.candidate_id) ?? []; l.push(r); officersByCandidate.set(r.candidate_id, l); }
  const pscsByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "persons-with-significant-control.csv"))) { const l = pscsByCandidate.get(r.candidate_id) ?? []; l.push(r); pscsByCandidate.set(r.candidate_id, l); }
  const decisionMakersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "decision-maker-candidates.csv"))) { const l = decisionMakersByCandidate.get(r.candidate_id) ?? []; l.push(r); decisionMakersByCandidate.set(r.candidate_id, l); }

  const websiteData = (await readJson(path.join(dirs.websiteDir, "website-extracted-data.json"))) as any[];
  const websiteById = new Map(websiteData.map((r) => [r.candidateId, r]));

  const publicProfileById = new Map((await readCsvRows(path.join(dirs.publicProfileDir, "public-profile-results.csv"))).map((r) => [r.candidate_id, r]));

  const groupRescreenResults = (await readJson(path.join(dirs.groupRescreenDir, "final-group-rescreen-results.json"))) as any[];
  const groupRescreenById = new Map(groupRescreenResults.map((r) => [r.candidateId, r]));

  const v2MasterFile = await findFileEndingWith(dirs.v2Dir, "-v2-authoritative-master.json");
  const v2Rows = (await readJson(v2MasterFile)) as any[];

  function resolvedPhone(candidateId: string) {
    const website = websiteById.get(candidateId);
    const google = googleById.get(candidateId);
    const googlePhone = google?.plausibleResults?.[0]?.phone ?? null;
    const websitePhone = website?.phone?.value ?? null;
    if (isValidPhone(websitePhone)) return { phone: resolveValidUkPhone(websitePhone), source: "website", note: null as string | null };
    if (websitePhone && !isValidPhone(websitePhone) && isValidPhone(googlePhone)) return { phone: resolveValidUkPhone(googlePhone), source: "google_places", note: `Website-extracted phone "${websitePhone}" failed validation — substituted the verified Google Places phone.` };
    if (isValidPhone(googlePhone)) return { phone: resolveValidUkPhone(googlePhone), source: "google_places", note: null };
    return { phone: null, source: null, note: null };
  }

  function buildDossier(m: any): Dossier {
    const candidateId = m.candidateId;
    const p1 = phase1ById.get(candidateId);
    const fsa = fsaById.get(candidateId);
    const google = googleById.get(candidateId);
    const ch = chById.get(candidateId);
    const website = websiteById.get(candidateId) ?? null;
    const groupRescreen = groupRescreenById.get(candidateId);
    const full = m.finalOutcome;
    const profile = profileById.get(candidateId);
    const finCalc = finCalcById.get(candidateId);
    const filedAccounts = filedAccountsById.get(candidateId);
    const officers = officersByCandidate.get(candidateId) ?? [];
    const pscs = pscsByCandidate.get(candidateId) ?? [];
    const decisionMakers = (decisionMakersByCandidate.get(candidateId) ?? []).slice().sort((a, b) => Number(a.rank) - Number(b.rank));
    const topDecisionMaker = decisionMakers[0] ?? null;
    const publicProfile = publicProfileById.get(candidateId) ?? null;
    const chCustRes = chCustResById.get(candidateId);
    const physicalPremises = physicalPremisesById.get(candidateId)?.result ?? null;
    const fsaResAfterGoogle = fsaResAfterGoogleById.get(candidateId);

    const googleOutcome = m.googleOutcomeAfter ?? google?.outcome ?? null;
    const googleDecisive = ["exact_google_match", "strong_probable_google_match"].includes(googleOutcome);
    const chDecisive = ch && ["exact_company_match", "strong_probable_company_match"].includes(ch.outcome);
    const bestGoogle = google?.plausibleResults?.[0] ?? null;

    const fsaResolvedFhrsId = fsaResAfterGoogle && ["fsa_resolved_exact", "fsa_resolved_probable"].includes(fsaResAfterGoogle.resolution) ? fsaResAfterGoogle.top_fsa_fhrs_id : null;
    const fsaAmbiguous = fsa?.outcome === "multiple_fsa_matches" && !fsaResolvedFhrsId;
    const bestFsa = fsaAmbiguous ? null : (fsaResolvedFhrsId ? fsa?.plausibleEstablishments?.find((e: any) => e.fhrsId === fsaResolvedFhrsId) : null) ?? fsa?.plausibleEstablishments?.[0] ?? null;

    const { phone, source: phoneSource, note: phoneNote } = resolvedPhone(candidateId);
    const customerMatchResult = chCustRes?.resolution_outcome ?? p1?.preliminaryStatus ?? "unknown";

    const hardGateResults = (full?.hardGates?.checks ?? []).map((c: any) => ({ gate: c.gate, passed: c.passed, label: cleanGateLabel(c.gate, c.passed), reason: c.reason }));

    void googleDecisive; // retained for parity with the original derivation trace, not otherwise consumed here

    const fields: Record<string, unknown> = {
      candidate_id: candidateId,
      trading_name: m.tradingName ?? p1?.normalisedName?.candidateOriginal ?? "",
      legal_company_name: profile?.company_name ?? (chDecisive ? ch.plausibleCompanies?.[0]?.companyName ?? null : null),
      operating_address: bestGoogle?.formattedAddress ?? bestFsa?.fsaAddress ?? null,
      registered_office_address: profile?.registered_office_address ?? null,
      postcode: m.postcode ?? p1?.normalisedPostcode?.candidateOriginal ?? null,
      latitude: bestGoogle?.latitude ?? null,
      longitude: bestGoogle?.longitude ?? null,
      telephone: phone, telephone_source: phoneSource, telephone_correction_note: phoneNote,
      website: website?.officialDomain ?? bestGoogle?.website ?? null,
      verified_email: website?.email?.value ?? null,
      business_type: bestFsa?.businessType ?? bestGoogle?.primaryCategory ?? null,
      // Real, confirmed pre-existing gap (found in the earlier read-only Business-Type Eligibility
      // audit, 2026-08-02): Google's own `primaryCategory` is null for 100% of real historical
      // candidates — `business_type` above has therefore been FSA-only in practice this whole
      // campaign. `additionalCategories` is the field that actually carries real Google signal
      // (confirmed: `establishment`/`food`/`restaurant`/`meal_takeaway` etc. present on the large
      // majority of candidates) but was never read anywhere downstream until now.
      google_categories: bestGoogle?.additionalCategories ?? [],
      cuisine_service_model: { cuisineTags: website?.cuisineTags ?? [], serviceModel: website?.serviceModel ?? null },
      fsa_establishment_id: bestFsa?.fhrsId ?? null, fsa_business_name: bestFsa?.officialBusinessName ?? null,
      fsa_hygiene_rating: bestFsa?.hygieneRating ?? null, fsa_rating_status: bestFsa?.ratingStatus ?? null, fsa_rating_date: bestFsa?.ratingDate ?? null,
      // Locked policy (2026-08-02): website closure-text evidence retained separately per source
      // (never merged into a single opaque trading-status value) — populated by the new
      // extractClosureEvidence() extraction (website-extraction.ts), previously not read here at
      // all (a real, confirmed pre-existing gap: no website-based closure signal existed).
      website_closure_evidence: website?.closureEvidence?.value ?? null,
      google_place_id: bestGoogle?.placeId ?? null, google_business_status: bestGoogle?.businessStatus ?? null,
      google_rating: bestGoogle?.rating ?? null, google_review_count: bestGoogle?.reviewCount ?? null, google_outcome: googleOutcome,
      companies_house_number: profile?.company_number ?? (chDecisive ? ch.plausibleCompanies?.[0]?.companyNumber ?? null : null),
      companies_house_status: chDecisive ? (profile?.company_status ?? ch.companiesHouseStatus ?? null) : null,
      incorporation_date: profile?.incorporation_date ?? null,
      // Locked policy (2026-08-02): SIC codes must be collected/retained/passed into the master
      // dossier — captured from `company-profiles.csv`'s "sic_codes" column (semicolon-joined),
      // previously dropped before this point (companies-house-adapter.ts/companies-house-match.ts
      // already fetch and carry it this far; nothing downstream ever read it until now).
      sic_codes: profile?.sic_codes ? profile.sic_codes.split(";").map((s: string) => s.trim()).filter(Boolean) : [],
      company_age_years: finCalc?.companyAgeYears_result && finCalc.companyAgeYears_result !== "not_available" ? finCalc.companyAgeYears_result : null,
      filed_accounts_available: !!filedAccounts && filedAccounts.accounts_type !== "",
      // Real bug found and fixed 2026-08-02 (release verification for the new turnover_gbp/
      // gross_profit_gbp/net_assets_gbp/employee_count Master fields): unlike company_age_years
      // and financial_strength_band just above, this previously did NOT filter out the literal
      // string "not_available" — real UB1 filed-accounts data shows turnover/grossProfit is
      // "not_available" for the large majority of micro-entity filings (they're not required to
      // file it), so the raw string would have leaked into the Master export as a fake-looking
      // financial value instead of a genuine blank.
      key_financial_values: filedAccounts ? {
        turnover: filedAccounts.turnover_result !== "not_available" ? filedAccounts.turnover_result : null,
        grossProfit: filedAccounts.grossProfit_result !== "not_available" ? filedAccounts.grossProfit_result : null,
        netAssets: filedAccounts.netAssets_result !== "not_available" ? filedAccounts.netAssets_result : null,
        employeeCount: filedAccounts.employeeCount_result !== "not_available" ? filedAccounts.employeeCount_result : null,
      } : null,
      financial_strength_band: finCalc?.financialStrengthBand_result && finCalc.financialStrengthBand_result !== "not_available" ? finCalc.financialStrengthBand_result : null,
      directors: officers.filter((o) => o.officer_role === "director" && o.status === "current").map((o) => o.full_name),
      pscs: pscs.filter((p) => p.status === "current").map((p) => p.psc_name),
      ranked_decision_maker: topDecisionMaker ? { name: topDecisionMaker.full_name, role: topDecisionMaker.likely_role, rank: Number(topDecisionMaker.rank) } : null,
      verified_public_profile: publicProfile && ["verified_linkedin_profile", "strong_probable_public_profile"].includes(publicProfile.outcome) ? publicProfile.profile_url : null,
      public_profile_outcome: publicProfile?.outcome ?? "no_public_profile_found",
      magna_customer_match_result: customerMatchResult,
      customer_conflict_materiality_reason: m.customerConflictReason ?? null,
      group_franchise_classification: groupRescreen?.classification ?? "ownership_unresolved",
      group_default_outcome: groupRescreen?.defaultOutcome ?? null,
      physical_premises_classification: physicalPremises,
      commercial_score: m.commercialPriorityScore ?? null, max_possible_score: m.maxPossibleScore ?? null,
      telesales_score: full?.channelSuitability?.telesalesScore ?? null, field_sales_score: full?.channelSuitability?.fieldSalesScore ?? null,
      qualification_status: m.qualificationStatus, channel_eligibility: m.channelEligibility,
      enrichment_completeness_band: m.enrichmentCompletenessBand, enrichment_completeness_fraction: m.enrichmentCompletenessFraction,
      final_level: full?.level ?? null, decision_category: m.decisionCategory ?? null,
      reason_tags: full?.reasonTags ?? [], hard_gate_results: hardGateResults,
      why_selected: full?.levelReason ?? m.customerConflictReason ?? null,
      source_retrieval_dates: { fsa: fsa?.retrievalTimestamp ?? null, google: google?.retrievalTimestamp ?? null, companies_house: ch?.retrievalTimestamp ?? null, website: website?.retrievalTimestamp ?? null },
      source_references: { fsa_query: fsa?.sourceResponseReference ?? null, google_query: google?.sourceResponseReference ?? null, companies_house_queries: ch?.searchQueriesUsed ?? [] },
    };

    const anomalies: string[] = [];
    const warnings: string[] = [];
    if (phoneNote) anomalies.push(phoneNote);
    if (!fields.legal_company_name) warnings.push("No legal company name available (no decisive Companies House match) — missing optional evidence, never a hidden qualification gate.");
    if (!fields.verified_email) warnings.push("No verified email available — missing optional evidence, never a hidden qualification gate.");
    if (!fields.ranked_decision_maker) warnings.push("No ranked decision-maker identified — missing optional evidence, never a hidden qualification gate.");
    if (!fields.verified_public_profile) warnings.push("No verified LinkedIn/public profile — missing optional evidence, never a hidden qualification gate.");
    if (fields.filed_accounts_available === false) warnings.push("No filed-accounts financial data available — missing optional evidence, never a hidden qualification gate.");
    if (fsaAmbiguous) warnings.push("FSA returned multiple plausible establishments and none was resolved to a single decisive match — FSA identity fields are left unset rather than guessed.");

    return {
      candidateId, tradingName: fields.trading_name as string, postcode: fields.postcode as string | null,
      v1Bucket: m.v1Bucket, qualificationStatus: m.qualificationStatus, channelEligibility: m.channelEligibility, finalLevel: full?.level ?? null,
      fields, anomalies, warnings,
    };
  }

  return { dossiers: v2Rows.map(buildDossier), v2MasterFile };
}
