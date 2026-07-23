// Hard qualification gates — Phase 8 (spec Phase E1). Must run BEFORE scoring; a failure here
// caps the candidate at Level 4 regardless of score ("a hard failure cannot be rescued by
// points" — explicit instruction). Genuinely new logic.
//
// The spec lists 14 named gate concepts. Several collapse into the SAME check given the
// evidence this bridge actually has available (documented per-gate below, never silently
// merged) — e.g. "not permanently closed" and "currently trading" both resolve from the same
// physical-premises/company-status evidence; forcing 14 mechanically-distinct checks over the
// same handful of underlying facts would not add real signal. "Acceptable ownership clarity"
// is deliberately NOT a hard gate: ownership_unresolved is the EXPECTED, protected state for a
// genuine sole trader/small independent with no decisive Companies House match ("a missing
// company record must not automatically reject a likely sole trader or partnership" — explicit
// instruction) — it feeds into data-completeness confidence and Level assignment instead.

import type { PhysicalPremisesResult, CompanyLegalIdentityOutcome, GoogleOutcome, FinalGroupClassification, GroupDefaultOutcome, CustomerResolutionAfterCompaniesHouseOutcome, CompaniesHouseStatus, HardGateResult, HardGateCheck } from "./types";

// A Companies House status is only trustworthy as THIS candidate's own trading status when the
// CH outcome genuinely identifies (or strongly implicates) the same real-world business —
// exact/strong-probable matches, and dissolved/dormant_company_conflict (which specifically
// fire on a strong name+postcode match at the CANDIDATE's OWN postcode). For every other
// outcome (registered_address_conflict, company_name_conflict, multiple_company_matches,
// no_company_record, probable_sole_trader_or_partnership, companies_house_api_failure) the
// "matched" company is unconfirmed or explicitly NOT this candidate's business — its status
// says nothing real about this candidate. Found as a real defect in the first live UB1 run: 10
// registered_address_conflict candidates (a strong name match at an unrelated accountant's/
// formation-agent's registered address) failed the dissolved/liquidation hard gate purely
// because THAT unrelated company happened to be dissolved.
const CH_STATUS_TRUSTWORTHY_OUTCOMES = new Set<CompanyLegalIdentityOutcome>(["exact_company_match", "strong_probable_company_match", "dissolved_company_conflict", "dormant_company_conflict"]);
export function trustworthyCompaniesHouseStatus(outcome: CompanyLegalIdentityOutcome | null, status: CompaniesHouseStatus | string | null): string | null {
  if (!outcome || !CH_STATUS_TRUSTWORTHY_OUTCOMES.has(outcome)) return null;
  return status;
}

export interface HardGateInput {
  candidateId: string;
  territory: string; // always the run's own territory — this bridge is territory-scoped by construction
  physicalPremises: PhysicalPremisesResult | null;
  googleOutcome: GoogleOutcome;
  companiesHouseOutcome: CompanyLegalIdentityOutcome;
  companiesHouseStatus: string | null; // "dissolved" | "dormant" | "liquidation" | "administration" | "strike_off_pending" | "active" | "other" | null
  customerResolutionOutcome: CustomerResolutionAfterCompaniesHouseOutcome;
  finalGroupClassification: FinalGroupClassification;
  finalGroupDefaultOutcome: GroupDefaultOutcome | null;
  hasContactablePostcode: boolean;
  hasAnyContactChannel: boolean; // phone (any stage) OR website contact evidence
}

export function evaluateHardGates(input: HardGateInput): HardGateResult {
  const checks: HardGateCheck[] = [];
  const add = (gate: string, passed: boolean, reason: string) => checks.push({ gate, passed, reason });

  add("correct_territory", true, `Candidate is part of the ${input.territory} run population by construction — this bridge never mixes territories within one run.`);

  const genuinePremises = input.physicalPremises === "verified_physical_premises" || input.physicalPremises === "probable_physical_premises" || input.physicalPremises === "virtual_or_shared_kitchen";
  add("genuine_physical_premises", genuinePremises, genuinePremises ? `Physical-premises assessment: ${input.physicalPremises}.` : `Physical-premises assessment (${input.physicalPremises ?? "no_physical_premises_evidence"}) does not establish a genuine operating location.`);

  const notPermanentlyClosed = input.physicalPremises !== "permanently_closed_premises" && input.googleOutcome !== "permanently_closed";
  add("currently_trading_not_permanently_closed", notPermanentlyClosed, notPermanentlyClosed ? "No permanent-closure evidence from Google or the physical-premises assessment." : "Google/physical-premises evidence indicates the business is permanently closed.");

  const notDissolvedOrLiquidation = input.companiesHouseStatus !== "dissolved" && input.companiesHouseStatus !== "liquidation";
  add("company_not_dissolved_or_in_liquidation", notDissolvedOrLiquidation, notDissolvedOrLiquidation ? `Companies House status: ${input.companiesHouseStatus ?? "no decisive company record (consistent with a sole trader/partnership)"}.` : `Companies House status is ${input.companiesHouseStatus} — a hard trading-status failure.`);

  const notActiveCustomer = input.customerResolutionOutcome !== "confirmed_active_customer_after_companies_house";
  add("not_an_active_magna_customer", notActiveCustomer, notActiveCustomer ? "No stage confirmed this candidate as an active Magna customer." : "Confirmed as an active Magna customer at the Companies House stage — must never become sales-ready.");

  const notExcludedGroup = input.finalGroupDefaultOutcome !== "exclude";
  add("not_an_excluded_supermarket_chain_or_group", notExcludedGroup, notExcludedGroup ? `Final group classification: ${input.finalGroupClassification} (default_outcome: ${input.finalGroupDefaultOutcome ?? "n/a"}).` : `Final group rescreen classification (${input.finalGroupClassification}) carries an exclude default_outcome from the approved registry.`);

  const noSeriousAddressConflict = input.googleOutcome !== "google_address_conflict" && input.googleOutcome !== "google_postcode_conflict";
  add("no_unresolved_serious_trading_address_conflict", noSeriousAddressConflict, noSeriousAddressConflict ? `Google outcome: ${input.googleOutcome}.` : `Google outcome (${input.googleOutcome}) indicates an unresolved conflict between the candidate's claimed and Google-verified trading address.`);

  add("suitable_foodservice_business", true, "Candidate originates from the Just Eat food-service discovery source population by construction.");

  add("not_an_exact_duplicate", true, "Deduplication was performed at Phase 1 candidate consolidation (see docs/09_DECISIONS.md) — not re-checked at this stage.");

  const minimumEvidence = ["exact_google_match", "strong_probable_google_match"].includes(input.googleOutcome) || ["exact_company_match", "strong_probable_company_match"].includes(input.companiesHouseOutcome);
  add("minimum_identity_evidence_confidence", minimumEvidence, minimumEvidence ? "At least one stage (Google or Companies House) produced a decisive identity match." : "No stage produced a decisive identity match for this candidate — insufficient evidence confidence.");

  add("required_channel_or_location_evidence", input.hasContactablePostcode && input.hasAnyContactChannel, input.hasContactablePostcode && input.hasAnyContactChannel ? "A postcode and at least one contact channel (phone or website contact evidence) are present." : "Missing a postcode and/or any contact channel — no way to route this candidate to a channel yet.");

  const failedGates = checks.filter((c) => !c.passed).map((c) => c.gate);
  return { candidateId: input.candidateId, allPassed: failedGates.length === 0, checks, failedGates };
}
