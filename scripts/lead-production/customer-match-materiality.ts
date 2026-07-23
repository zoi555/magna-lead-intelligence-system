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

import { normaliseName, normalisePhone, normaliseDomain, normaliseCompanyNumber, normalisePostcode, nameSimilarity } from "./normalize";

export type CustomerMatchEvidenceTier =
  | "exact_company_number"
  | "exact_phone"
  | "exact_domain"
  | "exact_postcode_and_identity"
  | "none";

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
  material: boolean;
  evidenceTier: CustomerMatchEvidenceTier;
  reason: string;
}

// Same threshold already used elsewhere in this codebase (google-match.ts's
// strong_probable_google_match floor) — reused here for consistency, not invented fresh.
const IDENTITY_NAME_SIM_FLOOR = 0.3;

export function assessCustomerMatchMateriality(input: CustomerMatchMaterialityInput): CustomerMatchMaterialityResult {
  const cust = input.matchedCustomer;
  if (!cust) return { material: false, evidenceTier: "none", reason: "No matched customer record was ever suspected — the default 'unresolved' state, not a genuine conflict." };

  const candCompanyNumber = input.candidateCompanyNumber ? normaliseCompanyNumber(input.candidateCompanyNumber) : null;
  const custCompanyNumber = cust.companyNumber ? normaliseCompanyNumber(cust.companyNumber) : null;
  if (candCompanyNumber && custCompanyNumber && candCompanyNumber === custCompanyNumber) {
    return { material: true, evidenceTier: "exact_company_number", reason: `Exact Companies House number match (${candCompanyNumber}).` };
  }

  const candPhone = input.candidatePhone ? normalisePhone(input.candidatePhone).comparison : null;
  const custPhone = cust.phone ? normalisePhone(cust.phone).comparison : null;
  if (candPhone && custPhone && candPhone === custPhone) {
    return { material: true, evidenceTier: "exact_phone", reason: `Exact normalised phone match (${candPhone}).` };
  }

  const candDomain = input.candidateDomain ? normaliseDomain(input.candidateDomain) : null;
  const custDomain = cust.domain ? normaliseDomain(cust.domain) : null;
  if (candDomain && custDomain && candDomain === custDomain) {
    return { material: true, evidenceTier: "exact_domain", reason: `Exact verified domain match (${candDomain}).` };
  }

  // Foundational geographic gate: the matched customer's OWN registered postcode must be in the
  // same postal district as the candidate's own postcode before any name-based evidence is even
  // considered. A shared or similar business name is not corroborating evidence of the same
  // physical outlet when the matched customer trades from a different town entirely.
  const candOutward = normalisePostcode(input.candidatePostcode).outward;
  const custOutward = normalisePostcode(cust.postcode).outward;
  if (!candOutward || !custOutward || candOutward !== custOutward) {
    return { material: false, evidenceTier: "none", reason: `Matched customer's own postcode (${cust.postcode ?? "unknown"}) is in a different postal district than the candidate's own postcode (${input.candidatePostcode ?? "unknown"}) — cannot be the same physical outlet regardless of name similarity.` };
  }

  const sameFullPostcode = normalisePostcode(input.candidatePostcode).canonical != null && normalisePostcode(input.candidatePostcode).canonical === normalisePostcode(cust.postcode).canonical;
  const sim = nameSimilarity(normaliseName(input.candidateName), normaliseName(cust.tradingName));
  if (sameFullPostcode && sim >= IDENTITY_NAME_SIM_FLOOR) {
    return { material: true, evidenceTier: "exact_postcode_and_identity", reason: `Exact full postcode match (${cust.postcode}) plus genuine name correspondence (similarity ${sim.toFixed(2)}) — not a generic locality/word overlap.` };
  }

  return { material: false, evidenceTier: "none", reason: sameFullPostcode ? `Exact postcode match but name similarity (${sim.toFixed(2)}) is below the identity floor (${IDENTITY_NAME_SIM_FLOOR}) — likely a coincidental/generic word overlap, not the same business.` : `Same postal district but a different specific postcode (candidate ${input.candidatePostcode ?? "unknown"} vs customer ${cust.postcode ?? "unknown"}) with no other corroborating evidence — plausibly a different premises nearby, not corroborated as the same outlet.` };
}
