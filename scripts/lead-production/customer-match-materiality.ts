// Customer-match hold materiality — model-defect fix (2026-07-23, UB1 calibration audit).
//
// Every enrichment stage's customer-resolution logic (customer-resolution-after-fsa.ts,
// -after-google.ts, -after-companies-house.ts) only ever transitions a Phase-1-suggested
// customer match to "confirmed" or "released" on DECISIVE identity evidence from that specific
// stage (an exact/strong FSA or Google or Companies House match). If no stage ever produces
// decisive evidence either way, the match sits at "unresolved" forever — and run-final-scoring-
// stage.ts's hasUnresolvedCustomerConflict check treats ANY "unresolved" state with a non-empty
// prior_matched_customer_id as a material conflict that forces Level 3, regardless of how weak
// or implausible the ORIGINAL Phase-1 suggestion was.
//
// Real UB1 evidence: of 35 Level 3 holds, 24 were matched to a customer whose own registered
// postcode is in a materially different postal district (some 20+ miles away — Luton, Oxford,
// Leicester, Milton Keynes), or matched purely on a generic shared word to a differently-named
// business at a different address in the same postal area. None of that is genuine corroborating
// evidence that the candidate IS that customer's outlet — it is uncorroborated Phase-1 noise
// that no downstream stage was ever built to actively release.
//
// This module is the missing release check: independent of whatever stage-specific resolution
// outcome exists, a customer-match hold is only MATERIAL when the matched customer record
// itself corroborates the same real-world business — exact company number, exact phone, exact
// domain, or (same postal district AND either an exact full postcode match or a genuine,
// non-generic name correspondence). Territory-agnostic: works identically for any UK postcode
// district, never references UB1 specifically.
//
// 2026-07-24 update (customer_master_exclusion permanent hard-exclusion rule): the strongest 3
// tiers (exact company number/phone/domain) are unambiguous 1:1 identifiers — genuinely
// CONFIRMED evidence, never merely "probable". The weakest material tier (postcode + name
// correspondence) is split by name-similarity strength: a STRONG name match is confirmed;
// a moderate-but-still-genuine match is only PROBABLE and must be held for review, never
// silently excluded OR silently released. Weak/generic matches remain "none" (rejected as
// evidence), unchanged.

import { normaliseName, normalisePhone, normaliseDomain, normaliseCompanyNumber, normalisePostcode, nameSimilarity } from "./normalize";

export type CustomerMatchEvidenceTier =
  | "exact_company_number"
  | "exact_phone"
  | "exact_domain"
  | "exact_postcode_and_strong_identity"
  | "exact_postcode_and_moderate_identity"
  | "none";

// "confirmed" -> customer_master_exclusion (permanent hard exclusion, regardless of lifecycle).
// "probable" -> held_for_customer_match_review (never rep-facing until conclusively released).
// "none" -> not customer evidence at all; proceeds through normal qualification.
export type CustomerMatchOutcomeTier = "confirmed" | "probable" | "none";

export interface MatchedCustomerRecord {
  postcode: string | null;
  tradingName: string;
  phone: string | null;
  domain: string | null;
  companyNumber: string | null;
}

export interface CustomerMatchMaterialityInput {
  candidatePostcode: string | null;
  candidateName: string;
  candidatePhone: string | null;
  candidateDomain: string | null;
  candidateCompanyNumber: string | null;
  matchedCustomer: MatchedCustomerRecord | null;
}

export interface CustomerMatchMaterialityResult {
  material: boolean; // true for BOTH confirmed and probable — kept for backward compatibility with any/every genuinely-material check
  outcomeTier: CustomerMatchOutcomeTier;
  evidenceTier: CustomerMatchEvidenceTier;
  reason: string;
}

// Same "material at all" floor already used elsewhere in this codebase (google-match.ts's
// strong_probable_google_match floor) — a genuine, non-generic name correspondence, but not yet
// strong enough to CONFIRM on its own. Below this floor: rejected as evidence entirely.
const IDENTITY_NAME_SIM_FLOOR = 0.3;
// A materially higher bar for CONFIRMED (postcode+name only, the weakest evidence route) — most
// of a candidate's name tokens must agree, not merely a partial/generic overlap, before this
// route alone is treated as strong enough for a permanent hard exclusion.
const STRONG_IDENTITY_NAME_SIM_FLOOR = 0.6;

export function assessCustomerMatchMateriality(input: CustomerMatchMaterialityInput): CustomerMatchMaterialityResult {
  const cust = input.matchedCustomer;
  if (!cust) return { material: false, outcomeTier: "none", evidenceTier: "none", reason: "No matched customer record was ever suspected — the default 'unresolved' state, not a genuine conflict." };

  const candCompanyNumber = input.candidateCompanyNumber ? normaliseCompanyNumber(input.candidateCompanyNumber) : null;
  const custCompanyNumber = cust.companyNumber ? normaliseCompanyNumber(cust.companyNumber) : null;
  if (candCompanyNumber && custCompanyNumber && candCompanyNumber === custCompanyNumber) {
    return { material: true, outcomeTier: "confirmed", evidenceTier: "exact_company_number", reason: `Exact Companies House number match (${candCompanyNumber}).` };
  }

  const candPhone = input.candidatePhone ? normalisePhone(input.candidatePhone).comparison : null;
  const custPhone = cust.phone ? normalisePhone(cust.phone).comparison : null;
  if (candPhone && custPhone && candPhone === custPhone) {
    return { material: true, outcomeTier: "confirmed", evidenceTier: "exact_phone", reason: `Exact normalised phone match (${candPhone}).` };
  }

  const candDomain = input.candidateDomain ? normaliseDomain(input.candidateDomain) : null;
  const custDomain = cust.domain ? normaliseDomain(cust.domain) : null;
  if (candDomain && custDomain && candDomain === custDomain) {
    return { material: true, outcomeTier: "confirmed", evidenceTier: "exact_domain", reason: `Exact verified domain match (${candDomain}).` };
  }

  // Foundational geographic gate: the matched customer's OWN registered postcode must be in the
  // same postal district as the candidate's own postcode before any name-based evidence is even
  // considered. A shared or similar business name is not corroborating evidence of the same
  // physical outlet when the matched customer trades from a different town entirely.
  const candOutward = normalisePostcode(input.candidatePostcode).outward;
  const custOutward = normalisePostcode(cust.postcode).outward;
  if (!candOutward || !custOutward || candOutward !== custOutward) {
    return { material: false, outcomeTier: "none", evidenceTier: "none", reason: `Matched customer's own postcode (${cust.postcode ?? "unknown"}) is in a different postal district than the candidate's own postcode (${input.candidatePostcode ?? "unknown"}) — cannot be the same physical outlet regardless of name similarity.` };
  }

  const sameFullPostcode = normalisePostcode(input.candidatePostcode).canonical != null && normalisePostcode(input.candidatePostcode).canonical === normalisePostcode(cust.postcode).canonical;
  const sim = nameSimilarity(normaliseName(input.candidateName), normaliseName(cust.tradingName));
  if (sameFullPostcode && sim >= STRONG_IDENTITY_NAME_SIM_FLOOR) {
    return { material: true, outcomeTier: "confirmed", evidenceTier: "exact_postcode_and_strong_identity", reason: `Exact full postcode match (${cust.postcode}) plus strong name correspondence (similarity ${sim.toFixed(2)} >= ${STRONG_IDENTITY_NAME_SIM_FLOOR}) — confirmed, not merely probable.` };
  }
  if (sameFullPostcode && sim >= IDENTITY_NAME_SIM_FLOOR) {
    return { material: true, outcomeTier: "probable", evidenceTier: "exact_postcode_and_moderate_identity", reason: `Exact full postcode match (${cust.postcode}) plus a genuine but moderate name correspondence (similarity ${sim.toFixed(2)}, below the ${STRONG_IDENTITY_NAME_SIM_FLOOR} confirmation floor) — held for review, not a confirmed match and not rejected as coincidence.` };
  }

  return { material: false, outcomeTier: "none", evidenceTier: "none", reason: sameFullPostcode ? `Exact postcode match but name similarity (${sim.toFixed(2)}) is below the identity floor (${IDENTITY_NAME_SIM_FLOOR}) — likely a coincidental/generic word overlap, not the same business.` : `Same postal district but a different specific postcode (candidate ${input.candidatePostcode ?? "unknown"} vs customer ${cust.postcode ?? "unknown"}) with no other corroborating evidence — plausibly a different premises nearby, not corroborated as the same outlet.` };
}

// --- Stage-level decisive-confirmation aggregation (2026-07-24, customer_master_exclusion rule) ---
//
// Each of the 4 pipeline stages (Phase 1, FSA, Google Places, Companies House) can INDEPENDENTLY
// decisively confirm a suspected customer match as active or inactive, using that stage's own
// high-bar identity evidence (exact phone/address+name/etc — see customer-resolution-after-*.ts).
// Only the LAST stage's own resolution was ever checked before this rule (a real gap: an FSA- or
// Google-stage confirmation that a later stage didn't independently re-confirm could be silently
// lost, and a Companies-House-only confirmation was never checked as a terminal bucket at all).
// This function checks ALL FOUR, in stage order, and returns the FIRST confirmation found — a
// candidate confirmed at any stage is excluded regardless of what any later stage concluded.
export type CustomerResolutionStage = "Phase 1" | "FSA" | "Google Places" | "Companies House";

export interface StageConfirmationInputs {
  phase1PreliminaryStatus: string | null; // "active_customer" | "inactive_customer" | anything else
  fsaResolutionOutcome: string | null; // "confirmed_active_customer_after_fsa" | "confirmed_inactive_customer_after_fsa" | anything else
  googleResolutionOutcome: string | null; // "confirmed_active_customer_after_google" | "confirmed_inactive_customer_after_google" | anything else
  companiesHouseResolutionOutcome: string | null; // "confirmed_active_customer_after_companies_house" | "confirmed_inactive_customer_after_companies_house" | anything else
}

export function findConfirmedCustomerMasterMatch(input: StageConfirmationInputs): CustomerResolutionStage | null {
  if (input.phase1PreliminaryStatus === "active_customer" || input.phase1PreliminaryStatus === "inactive_customer") return "Phase 1";
  if (input.fsaResolutionOutcome === "confirmed_active_customer_after_fsa" || input.fsaResolutionOutcome === "confirmed_inactive_customer_after_fsa") return "FSA";
  if (input.googleResolutionOutcome === "confirmed_active_customer_after_google" || input.googleResolutionOutcome === "confirmed_inactive_customer_after_google") return "Google Places";
  if (input.companiesHouseResolutionOutcome === "confirmed_active_customer_after_companies_house" || input.companiesHouseResolutionOutcome === "confirmed_inactive_customer_after_companies_house") return "Companies House";
  return null;
}
