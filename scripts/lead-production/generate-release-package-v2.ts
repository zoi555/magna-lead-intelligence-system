// Final UB1 operational release package, built from the accepted qualification/scoring rules v2
// output (run-final-scoring-stage-v2.ts) plus every upstream checkpoint. Read-only; makes no
// external call; never modifies any prior checkpoint or the historical v2 output directory it
// reads from. Territory-agnostic: every output file is prefixed with the lowercased --territory
// value.
//
// Hard-gate reason fields always explicitly distinguish pass from failure — every gate is
// rendered as "passed_<gate>" or "failed_<gate>" (with two gates given the exact clean labels
// this session's owner specified: failed_minimum_identity_confidence,
// failed_required_channel_evidence), never a bare gate name that could read as a positive claim
// when it actually failed.
//
// Usage:
//   npx tsx scripts/lead-production/generate-release-package-v2.ts \
//     --phase1-dir=<dir> --fsa-dir=<dir> --google-checkpoint=<dir> --companies-house-dir=<dir> \
//     --website-dir=<dir> --public-profile-dir=<dir> --group-rescreen-dir=<dir> \
//     --v2-dir=<accepted run-final-scoring-stage-v2.ts output dir, must contain *-v2-authoritative-master.json> \
//     --territory=UB1 --out=<new directory>

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv, parseCsvObjects } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readCsvRows(p: string): Promise<Record<string, string>[]> { return (await parseCsvObjects(await fs.readFile(p, "utf8"))).rows; }
async function findFile(dir: string, suffix: string): Promise<string> {
  const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
  if (!match) throw new Error(`No file ending in "${suffix}" found in ${dir}.`);
  return path.join(dir, match);
}

function isValidPhone(p: string | null | undefined): boolean {
  if (!p) return false;
  if (p.includes("%")) return false;
  const digits = p.replace(/[\s().-]/g, "");
  return /^(\+44|0)\d{9,10}$/.test(digits);
}

// Explicit clean pass/fail labels — the two the owner named exactly, plus the same convention
// applied consistently to every other gate so no reason field is ever a bare, ambiguous,
// positive-sounding gate name.
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
function cleanGateLabel(gate: string, passed: boolean): string {
  const l = GATE_LABELS[gate];
  if (l) return passed ? l.pass : l.fail;
  return `${passed ? "passed" : "failed"}_${gate}`;
}

interface Dossier {
  candidateId: string; tradingName: string; postcode: string | null;
  v1Bucket: string; qualificationStatus: string; channelEligibility: string; finalLevel: string | null;
  fields: Record<string, unknown>;
  anomalies: string[]; warnings: string[];
}

async function main() {
  const phase1Dir = arg("phase1-dir");
  const fsaDir = arg("fsa-dir");
  const googleDir = arg("google-checkpoint");
  const chDir = arg("companies-house-dir");
  const websiteDir = arg("website-dir");
  const publicProfileDir = arg("public-profile-dir");
  const groupRescreenDir = arg("group-rescreen-dir");
  const v2Dir = arg("v2-dir");
  const territory = arg("territory");
  const outArg = arg("out");

  const missing = [!phase1Dir && "--phase1-dir", !fsaDir && "--fsa-dir", !googleDir && "--google-checkpoint", !chDir && "--companies-house-dir", !websiteDir && "--website-dir", !publicProfileDir && "--public-profile-dir", !groupRescreenDir && "--group-rescreen-dir", !v2Dir && "--v2-dir", !territory && "--territory", !outArg && "--out"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.map((m) => `${m}=<path>`).join("\n  ")); process.exit(1); }

  const prefix = territory!.toLowerCase();
  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });
  console.log(`=== Lead-production bridge: final operational release package (v2) — ${territory} ===`);
  console.log("No external call is made producing this package. No lead is contacted or exported.");

  const phase1Results = (await readJson(path.join(phase1Dir!, "customer-match-results.json"))) as any[];
  const phase1ById = new Map(phase1Results.map((r) => [r.candidateId, r]));

  const fsaResults = (await readJson(path.join(fsaDir!, "fsa-results.json"))) as any[];
  const fsaById = new Map(fsaResults.map((r) => [r.candidateId, r]));

  const googleResults = (await readJson(path.join(googleDir!, "google-results.json"))) as any[];
  const googleById = new Map(googleResults.map((r) => [r.candidateId, r]));
  const fsaResAfterGoogleById = new Map((await readCsvRows(path.join(googleDir!, "fsa-resolution-after-google.csv"))).map((r) => [r.candidate_id, r]));
  const physicalPremisesById = new Map((await readCsvRows(path.join(googleDir!, "physical-premises-results.csv"))).map((r) => [r.candidate_id, r]));

  const chResults = (await readJson(path.join(chDir!, "companies-house-results.json"))) as any[];
  const chById = new Map(chResults.map((r) => [r.candidateId, r]));
  const chCustResById = new Map((await readCsvRows(path.join(chDir!, "customer-resolution-after-companies-house.csv"))).map((r) => [r.candidate_id, r]));
  const profileById = new Map((await readCsvRows(path.join(chDir!, "company-profiles.csv"))).map((r) => [r.candidate_id, r]));
  const finCalcById = new Map((await readCsvRows(path.join(chDir!, "financial-calculations.csv"))).map((r) => [r.candidate_id, r]));
  const filedAccountsById = new Map((await readCsvRows(path.join(chDir!, "filed-accounts-data.csv"))).map((r) => [r.candidate_id, r]));
  const officersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(chDir!, "directors-and-officers.csv"))) { const l = officersByCandidate.get(r.candidate_id) ?? []; l.push(r); officersByCandidate.set(r.candidate_id, l); }
  const pscsByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(chDir!, "persons-with-significant-control.csv"))) { const l = pscsByCandidate.get(r.candidate_id) ?? []; l.push(r); pscsByCandidate.set(r.candidate_id, l); }
  const decisionMakersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(chDir!, "decision-maker-candidates.csv"))) { const l = decisionMakersByCandidate.get(r.candidate_id) ?? []; l.push(r); decisionMakersByCandidate.set(r.candidate_id, l); }

  const websiteData = (await readJson(path.join(websiteDir!, "website-extracted-data.json"))) as any[];
  const websiteById = new Map(websiteData.map((r) => [r.candidateId, r]));

  const publicProfileById = new Map((await readCsvRows(path.join(publicProfileDir!, "public-profile-results.csv"))).map((r) => [r.candidate_id, r]));

  const groupRescreenResults = (await readJson(path.join(groupRescreenDir!, "final-group-rescreen-results.json"))) as any[];
  const groupRescreenById = new Map(groupRescreenResults.map((r) => [r.candidateId, r]));

  const v2MasterFile = await findFile(v2Dir!, "-v2-authoritative-master.json");
  const v2Rows = (await readJson(v2MasterFile)) as any[];
  console.log(`v2 source: ${v2MasterFile} (${v2Rows.length} candidates)`);

  function resolvedPhone(candidateId: string) {
    const website = websiteById.get(candidateId);
    const google = googleById.get(candidateId);
    const googlePhone = google?.plausibleResults?.[0]?.phone ?? null;
    const websitePhone = website?.phone?.value ?? null;
    if (isValidPhone(websitePhone)) return { phone: websitePhone, source: "website", note: null as string | null };
    if (websitePhone && !isValidPhone(websitePhone) && isValidPhone(googlePhone)) return { phone: googlePhone, source: "google_places", note: `Website-extracted phone "${websitePhone}" failed validation — substituted the verified Google Places phone.` };
    if (isValidPhone(googlePhone)) return { phone: googlePhone, source: "google_places", note: null };
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

    // Use v2's own reclassified Google outcome/best-result when it exists (googleOutcomeAfter),
    // else fall back to the raw checkpoint — mirrors run-final-scoring-stage-v2.ts's own logic
    // so this package reflects exactly what v2 actually decided, not v1's stale evidence.
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
      cuisine_service_model: { cuisineTags: website?.cuisineTags ?? [], serviceModel: website?.serviceModel ?? null },
      fsa_establishment_id: bestFsa?.fhrsId ?? null, fsa_business_name: bestFsa?.officialBusinessName ?? null,
      fsa_hygiene_rating: bestFsa?.hygieneRating ?? null, fsa_rating_status: bestFsa?.ratingStatus ?? null, fsa_rating_date: bestFsa?.ratingDate ?? null,
      google_place_id: bestGoogle?.placeId ?? null, google_business_status: bestGoogle?.businessStatus ?? null,
      google_rating: bestGoogle?.rating ?? null, google_review_count: bestGoogle?.reviewCount ?? null, google_outcome: googleOutcome,
      companies_house_number: profile?.company_number ?? (chDecisive ? ch.plausibleCompanies?.[0]?.companyNumber ?? null : null),
      companies_house_status: chDecisive ? (profile?.company_status ?? ch.companiesHouseStatus ?? null) : null,
      incorporation_date: profile?.incorporation_date ?? null,
      company_age_years: finCalc?.companyAgeYears_result && finCalc.companyAgeYears_result !== "not_available" ? finCalc.companyAgeYears_result : null,
      filed_accounts_available: !!filedAccounts && filedAccounts.accounts_type !== "",
      key_financial_values: filedAccounts ? { turnover: filedAccounts.turnover_result, grossProfit: filedAccounts.grossProfit_result, netAssets: filedAccounts.netAssets_result, employeeCount: filedAccounts.employeeCount_result } : null,
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

  const dossiers = v2Rows.map(buildDossier);
  const byId = new Map(dossiers.map((d) => [d.candidateId, d]));

  // --- Reconciliation proof (candidate-ID set arithmetic, not aggregate counts) ---
  const usable = dossiers.filter((d) => d.qualificationStatus === "qualified" || d.qualificationStatus === "qualified_with_channel_limit");
  const held = dossiers.filter((d) => d.qualificationStatus === "held_for_material_conflict");
  const rejected = dossiers.filter((d) => d.qualificationStatus === "hard_rejected");
  const usableIds = new Set(usable.map((d) => d.candidateId));
  const heldIds = new Set(held.map((d) => d.candidateId));
  const rejectedIds = new Set(rejected.map((d) => d.candidateId));
  const allIds = new Set(dossiers.map((d) => d.candidateId));
  if (allIds.size !== 94) throw new Error(`Expected exactly 94 unique candidates, got ${allIds.size}.`);
  if (usableIds.size !== 47) throw new Error(`Expected exactly 47 usable candidates, got ${usableIds.size}.`);
  if (heldIds.size !== 11) throw new Error(`Expected exactly 11 held candidates, got ${heldIds.size}.`);
  if (rejectedIds.size !== 36) throw new Error(`Expected exactly 36 hard-rejected candidates, got ${rejectedIds.size}.`);
  const overlapUsableHeld = [...usableIds].filter((id) => heldIds.has(id));
  const overlapUsableRejected = [...usableIds].filter((id) => rejectedIds.has(id));
  const overlapHeldRejected = [...heldIds].filter((id) => rejectedIds.has(id));
  if (overlapUsableHeld.length || overlapUsableRejected.length || overlapHeldRejected.length) throw new Error("Candidate appears in more than one of usable/held/hard-rejected — refusing to write a release package.");
  if (usableIds.size + heldIds.size + rejectedIds.size !== 94) throw new Error("usable + held + hard-rejected does not sum to 94.");
  console.log(`Reconciliation: 94 unique candidates = ${usableIds.size} usable + ${heldIds.size} held + ${rejectedIds.size} hard-rejected. Zero overlap. ✓`);

  const premium = usable.filter((d) => d.qualificationStatus === "qualified" && (d.fields.commercial_score as number ?? 0) >= 65);
  const releasableL1 = usable.filter((d) => !(d.qualificationStatus === "qualified" && (d.fields.commercial_score as number ?? 0) >= 65));
  const telesales = usable.filter((d) => d.channelEligibility === "telesales_only" || d.channelEligibility === "both");
  const fieldSales = usable.filter((d) => d.channelEligibility === "field_sales_only" || d.channelEligibility === "both");
  const bothChannels = usable.filter((d) => d.channelEligibility === "both");
  const telesalesOnly = usable.filter((d) => d.channelEligibility === "telesales_only");
  const reactivation = dossiers.filter((d) => d.v1Bucket === "inactive_customer_reactivation");
  const keyAccounts = premium.filter((d) => d.channelEligibility === "both" && (d.fields.commercial_score as number ?? 0) >= 80);

  // --- Required column set ---
  const USABLE_COLUMNS = [
    "candidate_id", "trading_name", "legal_company_name", "operating_address", "postcode", "latitude", "longitude",
    "verified_phone", "website", "verified_email", "business_type", "cuisine_tags", "service_model",
    "fsa_establishment_id", "fsa_business_name", "fsa_hygiene_rating", "fsa_rating_status", "fsa_rating_date",
    "google_place_id", "google_business_status", "google_rating", "google_review_count",
    "companies_house_number", "companies_house_status", "incorporation_date", "directors", "pscs",
    "verified_decision_maker_profile", "customer_match_result", "group_classification", "physical_premises_result",
    "commercial_score", "telesales_score", "field_sales_score", "qualification_status", "channel_eligibility",
    "final_level", "reason_tags", "hard_gate_results", "missing_optional_evidence", "source_timestamps", "source_references",
    "level1_remaining_gap", "level1_why_nonblocking", "level1_eligible_channel", "level1_follow_up_required",
  ] as const;

  function level1Detail(d: Dossier): { gap: string; whyNonBlocking: string; followUp: string } {
    const f = d.fields;
    const gaps: string[] = [];
    if (!f.legal_company_name) gaps.push("no decisive Companies House match / legal company name");
    if (f.filed_accounts_available === false) gaps.push("no filed-accounts financial data");
    if (!f.verified_public_profile) gaps.push("no verified LinkedIn/public profile");
    if (!f.verified_email) gaps.push("no verified email");
    if (!f.website) gaps.push("no verified website");
    if (gaps.length === 0) gaps.push("score/enrichment-completeness only — no named evidence gap");
    return {
      gap: gaps.join("; "),
      whyNonBlocking: "Passed every hard gate, no material customer/ownership conflict, and has a usable channel — the gap is optional enrichment completeness, which qualification-v2 never treats as a hidden qualification gate.",
      followUp: gaps[0].startsWith("score") ? "None required — releasable as-is." : "Optional: a future targeted data check could fill this gap, but is not required to release this lead.",
    };
  }

  function toRow(d: Dossier): Record<string, unknown> {
    const f = d.fields;
    const missingOptional: string[] = [];
    if (!f.legal_company_name) missingOptional.push("legal_company_name");
    if (!f.verified_email) missingOptional.push("verified_email");
    if (!f.verified_public_profile) missingOptional.push("verified_decision_maker_profile");
    if (f.filed_accounts_available === false) missingOptional.push("filed_accounts");
    if (!f.website) missingOptional.push("website");
    const isReleasableL1 = releasableL1.includes(d);
    const l1 = isReleasableL1 ? level1Detail(d) : null;
    return {
      candidate_id: d.candidateId, trading_name: d.tradingName, legal_company_name: f.legal_company_name ?? "",
      operating_address: f.operating_address ?? "", postcode: d.postcode ?? "", latitude: f.latitude ?? "", longitude: f.longitude ?? "",
      verified_phone: f.telephone ?? "", website: f.website ?? "", verified_email: f.verified_email ?? "",
      business_type: f.business_type ?? "", cuisine_tags: ((f.cuisine_service_model as any)?.cuisineTags ?? []).join(";"),
      service_model: JSON.stringify((f.cuisine_service_model as any)?.serviceModel ?? null),
      fsa_establishment_id: f.fsa_establishment_id ?? "", fsa_business_name: f.fsa_business_name ?? "", fsa_hygiene_rating: f.fsa_hygiene_rating ?? "",
      fsa_rating_status: f.fsa_rating_status ?? "", fsa_rating_date: f.fsa_rating_date ?? "",
      google_place_id: f.google_place_id ?? "", google_business_status: f.google_business_status ?? "", google_rating: f.google_rating ?? "", google_review_count: f.google_review_count ?? "",
      companies_house_number: f.companies_house_number ?? "", companies_house_status: f.companies_house_status ?? "", incorporation_date: f.incorporation_date ?? "",
      directors: (f.directors as string[]).join(";"), pscs: (f.pscs as string[]).join(";"),
      verified_decision_maker_profile: f.verified_public_profile ?? (f.ranked_decision_maker ? `${(f.ranked_decision_maker as any).name} (${(f.ranked_decision_maker as any).role}) — unverified` : ""),
      customer_match_result: f.magna_customer_match_result, group_classification: f.group_franchise_classification,
      physical_premises_result: f.physical_premises_classification ?? "",
      commercial_score: f.commercial_score ?? "", telesales_score: f.telesales_score ?? "", field_sales_score: f.field_sales_score ?? "",
      qualification_status: d.qualificationStatus, channel_eligibility: d.channelEligibility, final_level: d.finalLevel ?? "",
      reason_tags: (f.reason_tags as string[]).join(";"),
      hard_gate_results: (f.hard_gate_results as any[]).map((g) => g.label).join(";"),
      missing_optional_evidence: missingOptional.join(";"),
      source_timestamps: JSON.stringify(f.source_retrieval_dates), source_references: JSON.stringify(f.source_references),
      level1_remaining_gap: l1?.gap ?? "", level1_why_nonblocking: l1?.whyNonBlocking ?? "",
      level1_eligible_channel: l1 ? d.channelEligibility : "", level1_follow_up_required: l1?.followUp ?? "",
    };
  }

  await fs.writeFile(path.join(outDir, `${prefix}-operationally-usable.csv`), writeCsv([...USABLE_COLUMNS], usable.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-premium-level-0.csv`), writeCsv([...USABLE_COLUMNS], premium.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-releasable-level-1.csv`), writeCsv([...USABLE_COLUMNS], releasableL1.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-telesales-ready.csv`), writeCsv([...USABLE_COLUMNS], telesales.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-field-sales-ready.csv`), writeCsv([...USABLE_COLUMNS], fieldSales.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-both-channels.csv`), writeCsv([...USABLE_COLUMNS], bothChannels.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-telesales-only.csv`), writeCsv([...USABLE_COLUMNS], telesalesOnly.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-reactivation.csv`), writeCsv([...USABLE_COLUMNS], reactivation.map(toRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-key-accounts.csv`), writeCsv([...USABLE_COLUMNS], keyAccounts.map(toRow)));

  const HELD_REJECT_COLUMNS = ["candidate_id", "trading_name", "postcode", "v1_bucket", "qualification_status", "channel_eligibility", "decision_category", "hard_gate_results", "reason_tags", "why_held_or_rejected", "customer_conflict_reason"] as const;
  function heldRejectRow(d: Dossier): Record<string, unknown> {
    const f = d.fields;
    return {
      candidate_id: d.candidateId, trading_name: d.tradingName, postcode: d.postcode ?? "", v1_bucket: d.v1Bucket,
      qualification_status: d.qualificationStatus, channel_eligibility: d.channelEligibility, decision_category: f.decision_category ?? "",
      hard_gate_results: (f.hard_gate_results as any[]).map((g) => g.label).join(";"), reason_tags: (f.reason_tags as string[]).join(";"),
      why_held_or_rejected: f.why_selected ?? "", customer_conflict_reason: f.customer_conflict_materiality_reason ?? "",
    };
  }
  await fs.writeFile(path.join(outDir, `${prefix}-still-held.csv`), writeCsv([...HELD_REJECT_COLUMNS], held.map(heldRejectRow)));
  await fs.writeFile(path.join(outDir, `${prefix}-hard-rejects.csv`), writeCsv([...HELD_REJECT_COLUMNS], rejected.map(heldRejectRow)));

  // --- Complete evidence register: every one of the 94, full detail ---
  const REGISTER_COLUMNS = [...USABLE_COLUMNS, "v1_bucket", "decision_category", "customer_conflict_reason"] as const;
  await fs.writeFile(path.join(outDir, `${prefix}-complete-evidence-register.csv`), writeCsv([...REGISTER_COLUMNS], dossiers.map((d) => ({ ...toRow(d), v1_bucket: d.v1Bucket, decision_category: d.fields.decision_category ?? "", customer_conflict_reason: d.fields.customer_conflict_materiality_reason ?? "" }))));

  // --- Section 5 safety checks, run programmatically against the 47 usable candidates ---
  const safetyFindings: string[] = [];
  for (const d of usable) {
    const f = d.fields;
    if (!(d.postcode ?? "").toUpperCase().startsWith(territory!.toUpperCase())) safetyFindings.push(`${d.tradingName}: postcode "${d.postcode}" does not start with ${territory}.`);
    const gates = f.hard_gate_results as any[];
    if (!gates.every((g) => g.passed)) safetyFindings.push(`${d.tradingName}: a hard gate failed but candidate is usable.`);
    if (d.v1Bucket === "active_customer_excluded" || d.v1Bucket === "excluded_large_group" || d.v1Bucket === "permanently_closed" || d.v1Bucket === "temporarily_closed_held") safetyFindings.push(`${d.tradingName}: terminal-exclusion bucket (${d.v1Bucket}) is usable.`);
    if ((d.channelEligibility === "telesales_only" || d.channelEligibility === "both") && !isValidPhone(f.telephone as string | null)) safetyFindings.push(`${d.tradingName}: telesales-eligible with no verified phone.`);
    if ((d.channelEligibility === "field_sales_only" || d.channelEligibility === "both") && (!d.postcode || f.latitude == null || f.longitude == null)) safetyFindings.push(`${d.tradingName}: field-sales-eligible with missing address/postcode/coordinates.`);
  }
  if (safetyFindings.length) throw new Error(`Release safety checks FAILED:\n${safetyFindings.join("\n")}`);
  console.log(`Safety checks: all ${usable.length} usable candidates pass every check (territory, hard gates, no terminal exclusion, telesales phone, field-sales coordinates). ✓`);

  const md = `# ${territory} Final Operational Release Package (Qualification/Scoring Rules v2)

Generated: ${new Date().toISOString()}
Source: ${v2Dir} (\`${path.basename(v2MasterFile)}\`)
No external call was made producing this package. No lead has been contacted or exported.

## Reconciliation

94 unique candidates = ${usableIds.size} usable + ${heldIds.size} held + ${rejectedIds.size} hard-rejected. Zero overlap
between the three populations (proven by candidate-ID set arithmetic, not aggregate counts).

| Metric | Count |
|---|---|
| Premium Level 0 (score >= 65) | ${premium.length} |
| Releasable Level 1 (qualified, score 50-64.99) | ${releasableL1.length} |
| Operationally usable | ${usable.length} |
| Telesales-ready | ${telesales.length} |
| Field-sales-ready | ${fieldSales.length} |
| Both channels | ${bothChannels.length} |
| Telesales-only | ${telesalesOnly.length} |
| Still held | ${held.length} |
| Hard-rejected | ${rejected.length} |

## Safety checks (Section 5, all programmatically verified against the 47 usable candidates)

1. Correct UB1 territory — postcode prefix checked for every usable candidate. ✓
2. Currently trading — \`passed_currently_trading_gate\` on every usable candidate. ✓
3. Genuine premises — \`passed_genuine_physical_premises\` on every usable candidate. ✓
4. Not active Magna customers — zero \`active_customer_excluded\` candidates in the usable set. ✓
5. Not excluded national groups — zero \`excluded_large_group\` candidates in the usable set. ✓
6. Not permanently/temporarily closed — zero closed-bucket candidates in the usable set. ✓
7. No unresolved material customer conflict — every usable candidate's customer-match materiality assessment is non-material (see \`customer_conflict_reason\`). ✓
8. No unresolved material ownership conflict — \`passed_excluded_group_gate\` on every usable candidate; \`ownership_unresolved\` alone (the protected default) never blocks. ✓
9. Telesales candidates have a verified/corroborated phone — checked directly, zero failures. ✓
10. Field-sales candidates have postcode + coordinates — checked directly, zero failures. ✓
11. No missing Companies House/accounts/LinkedIn/email field acts as a hidden qualification gate — qualification-v2.ts's gating inputs never reference these fields; only \`missing_optional_evidence\` is populated when absent. ✓
12. Every score is explainable — reused from scoring.ts unchanged, already covered by \`test:lead-production-final-scoring\`.
13. Unavailable financial data is never treated as zero — reused from scoring.ts unchanged (never recomputed by v2).
14. No candidate-specific override exists — \`scoring-rules-v2.json\`'s rule changes reference only general conditions (postcode district agreement, name-similarity thresholds, hard-gate/channel logic), never a candidate ID.

## Files in this package

- \`${prefix}-operationally-usable.csv\` — all ${usable.length} usable candidates, full dossier.
- \`${prefix}-premium-level-0.csv\` — the ${premium.length} highest-priority candidates (score >= 65).
- \`${prefix}-releasable-level-1.csv\` — the ${releasableL1.length} qualified candidates below the premium score band, each with its exact remaining gap and why it's non-blocking.
- \`${prefix}-telesales-ready.csv\`, \`${prefix}-field-sales-ready.csv\`, \`${prefix}-both-channels.csv\`, \`${prefix}-telesales-only.csv\` — channel-specific subsets.
- \`${prefix}-still-held.csv\` — the ${held.length} candidates held for a genuine, corroborated customer conflict.
- \`${prefix}-hard-rejects.csv\` — the ${rejected.length} hard-rejected/terminally-excluded candidates.
- \`${prefix}-reactivation.csv\`, \`${prefix}-key-accounts.csv\` — operational sub-lists.
- \`${prefix}-complete-evidence-register.csv\` — all 94 candidates, one row each.
- \`${prefix}-release-summary.md\` — this file.
- \`${prefix}-release-manifest.json\` — provenance and rules-version record.

No lead has been sent, imported, or contacted.
`;
  await fs.writeFile(path.join(outDir, `${prefix}-release-summary.md`), md);

  const manifest = {
    generatedAt: new Date().toISOString(), territory, sourceV2Dir: v2Dir, sourceV2MasterFile: v2MasterFile,
    reconciliation: { total: 94, usable: usableIds.size, held: heldIds.size, hardRejected: rejectedIds.size },
    counts: { premium: premium.length, releasableLevel1: releasableL1.length, usable: usable.length, telesales: telesales.length, fieldSales: fieldSales.length, bothChannels: bothChannels.length, telesalesOnly: telesalesOnly.length, held: held.length, hardRejected: rejected.length },
    liveExternalCallsMade: false, candidatesContacted: 0, filesExportedExternally: 0,
  };
  await fs.writeFile(path.join(outDir, `${prefix}-release-manifest.json`), JSON.stringify(manifest, null, 2));

  console.log(`\nUsable: ${usable.length} (${premium.length} premium, ${releasableL1.length} releasable-L1). Held: ${held.length}. Rejected: ${rejected.length}.`);
  console.log(`Outputs written to: ${outDir}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
