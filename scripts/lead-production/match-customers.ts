// Customer-matching hierarchy. Classifies by EVIDENCE (named rules from the fixed 6-label
// vocabulary in types.ts's EvidenceRule), never a single opaque blended score, and never
// describes postcode+name evidence as an "address match" — consolidated_candidates has no
// free-text address field pre-enrichment (postcode + coordinates only).
//
// Confirmed tier (any one is sufficient):
//   exact_company_number             — candidate and customer company numbers match exactly
//   exact_normalised_telephone       — normalised phones match, AND the name isn't flatly
//                                       conflicting (a shared/reused number with a completely
//                                       unrelated name doesn't get blindly confirmed)
//   exact_postcode_exact_name        — canonical postcode matches AND normalised name is exactly equal
//   verified_parent_branch_relationship — customer's parent/group account field, normalised,
//                                       exactly equals the candidate's normalised name/brand
//
// Probable tier (only evaluated when nothing confirmed fires):
//   probable_postcode_name_similarity — canonical postcode matches AND name similarity is
//                                       meaningful but not exact
//
// Weak tier (only when nothing confirmed/probable fires):
//   weak_name_similarity             — name similarity alone, no postcode/phone/company/parent
//                                       corroboration. NEVER creates an automatic exclusion.

import { normaliseName, normaliseCompanyNumber, normalisePhone, normalisePostcode, nameSimilarity } from "./normalize";
import type { CustomerRecord, OperationalCandidate, MatchResult, MatchTier, MatchOutcome, EvidenceRule, NormalisedPair } from "./types";

const PROBABLE_NAME_SIM = 0.3;  // probable-tier floor: postcode match + at least this much name overlap
const WEAK_NAME_SIM = 0.3;      // weak-tier floor: name similarity alone
const PHONE_CONFLICT_FLOOR = 0.15; // below this, a shared phone number is NOT auto-confirmed (flatly conflicting name)

// Model-defect fix (2026-08-03, customer-suppression forensic audit): a name similarity purely
// from a shared TOWN/AREA suffix (a real, common pattern in this pipeline's trading names, e.g.
// "Franzos - Ilford" vs an unrelated inactive customer "Peri Peri Chicken Bites (Ilford)") was
// enough to clear PHONE_CONFLICT_FLOOR on its own (0.2 > 0.15) and wrongly auto-confirm two
// genuinely unrelated businesses as the same customer purely because a shared/reassigned phone
// number happened to also share a locality word. Stripped ONLY for the phone-conflict check —
// never for the postcode-gated probable/weak tiers below, where an independent postcode match
// already establishes genuine geographic corroboration. Small, explicit, pilot-district-scoped
// list — never a general gazetteer.
const LOCATION_SUFFIX_WORDS = new Set(["ilford", "chelmsford", "bromley", "dartford", "romford", "london"]);
function stripLocationSuffix(normalisedName: string): string {
  return normalisedName.split(" ").filter((t) => t && !LOCATION_SUFFIX_WORDS.has(t)).join(" ");
}

interface PairEvaluation {
  tier: MatchTier;
  rules: EvidenceRule[];
  nameSim: number | null;
  directIdentity: boolean; // true when the match is to the customer's own identity (not merely a branch/parent signal)
}

function evaluatePair(candidate: OperationalCandidate, customer: CustomerRecord): PairEvaluation {
  const rules: EvidenceRule[] = [];
  const candName = normaliseName(candidate.name);
  const candBrand = candidate.brand ? normaliseName(candidate.brand) : "";
  const custTrading = normaliseName(customer.tradingName);
  const custLegal = customer.legalName ? normaliseName(customer.legalName) : "";

  const bestNameSim = Math.max(
    candName && custTrading ? nameSimilarity(candName, custTrading) : 0,
    candName && custLegal ? nameSimilarity(candName, custLegal) : 0,
    candBrand && custTrading ? nameSimilarity(candBrand, custTrading) : 0,
  );
  const namesExactlyEqual = (!!candName && (candName === custTrading || candName === custLegal))
    || (!!candBrand && (candBrand === custTrading || candBrand === custLegal));

  const candCompanyNumber = normaliseCompanyNumber(candidate.companyNumber);
  const custCompanyNumber = normaliseCompanyNumber(customer.companyNumber);
  if (candCompanyNumber && custCompanyNumber && candCompanyNumber === custCompanyNumber) rules.push("exact_company_number");

  const candPhone = normalisePhone(candidate.phone).comparison;
  const custPhoneCandidates = [customer.phone, ...customer.alternatePhones].map((p) => normalisePhone(p).comparison).filter((p): p is string => !!p);
  const phonesEqual = !!candPhone && custPhoneCandidates.includes(candPhone);

  const candPostcode = normalisePostcode(candidate.postcode).canonical;
  const custPostcode = normalisePostcode(customer.postcode).canonical;
  const postcodesEqual = !!candPostcode && !!custPostcode && candPostcode === custPostcode;

  if (postcodesEqual && namesExactlyEqual) rules.push("exact_postcode_exact_name");

  const parentGroupNorm = customer.parentGroupAccount ? normaliseName(customer.parentGroupAccount) : "";
  const parentExactMatch = !!parentGroupNorm && (parentGroupNorm === candName || (!!candBrand && parentGroupNorm === candBrand));
  if (parentExactMatch) rules.push("verified_parent_branch_relationship");

  const phoneConflictSim = Math.max(
    candName && custTrading ? nameSimilarity(stripLocationSuffix(candName), stripLocationSuffix(custTrading)) : 0,
    candName && custLegal ? nameSimilarity(stripLocationSuffix(candName), stripLocationSuffix(custLegal)) : 0,
  );
  if (phonesEqual && phoneConflictSim >= PHONE_CONFLICT_FLOOR) rules.push("exact_normalised_telephone");

  if (rules.length) {
    const directIdentity = rules.some((r) => r === "exact_company_number" || r === "exact_postcode_exact_name" || r === "exact_normalised_telephone");
    return { tier: "confirmed", rules, nameSim: bestNameSim || null, directIdentity };
  }

  // Probable tier: postcode matches and there is meaningful (but not exact) name agreement.
  if (postcodesEqual && bestNameSim >= PROBABLE_NAME_SIM && !namesExactlyEqual) {
    return { tier: "probable", rules: ["probable_postcode_name_similarity"], nameSim: bestNameSim, directIdentity: true };
  }

  // Weak tier: name similarity alone, no postcode/phone/company/parent corroboration.
  if (bestNameSim >= WEAK_NAME_SIM) {
    return { tier: "weak", rules: ["weak_name_similarity"], nameSim: bestNameSim, directIdentity: true };
  }

  return { tier: "none", rules: [], nameSim: bestNameSim || null, directIdentity: true };
}

const TIER_RANK: Record<MatchTier, number> = { confirmed: 3, probable: 2, weak: 1, none: 0 };

function pair(candOriginal: string | null, candNormalised: string, custOriginal: string | null, custNormalised: string): NormalisedPair {
  return {
    candidateOriginal: candOriginal, candidateNormalised: candNormalised || null,
    customerOriginal: custOriginal, customerNormalised: custNormalised || null,
  };
}

export function matchCandidateToCustomers(candidate: OperationalCandidate, customers: CustomerRecord[]): MatchResult {
  let best: (PairEvaluation & { customer: CustomerRecord }) | null = null;
  for (const customer of customers) {
    const ev = evaluatePair(candidate, customer);
    if (ev.tier === "none") continue;
    if (!best || TIER_RANK[ev.tier] > TIER_RANK[best.tier] || (TIER_RANK[ev.tier] === TIER_RANK[best.tier] && (ev.nameSim ?? 0) > (best.nameSim ?? 0))) {
      best = { ...ev, customer };
    }
  }

  const candName = candidate.name;
  const candNameNorm = normaliseName(candidate.name);
  const candPostcodeNorm = normalisePostcode(candidate.postcode).canonical;
  const candPhoneNorm = normalisePhone(candidate.phone).comparison;

  if (!best) {
    return {
      candidate, matchedCustomerId: null, matchTier: "none", outcome: "new_prospect", rulesTriggered: [], nameSimilarity: null, matchedCustomer: null,
      normalisedName: pair(candName, candNameNorm, null, ""),
      normalisedPostcode: pair(candidate.postcode, candPostcodeNorm ?? "", null, ""),
      normalisedPhone: pair(candidate.phone, candPhoneNorm ?? "", null, ""),
    };
  }

  let outcome: MatchOutcome;
  if (best.tier === "confirmed") {
    if (best.directIdentity) outcome = best.customer.isActive ? "confirmed_active_customer" : "confirmed_inactive_customer";
    else outcome = best.customer.isActive ? "branch_of_active_customer" : "branch_of_inactive_customer";
  } else if (best.tier === "probable") {
    outcome = "probable_match";
  } else {
    outcome = "weak_possible_match";
  }

  return {
    candidate, matchedCustomerId: best.customer.customerId, matchTier: best.tier, outcome,
    rulesTriggered: best.rules, nameSimilarity: best.nameSim, matchedCustomer: best.customer,
    normalisedName: pair(candName, candNameNorm, best.customer.tradingName, normaliseName(best.customer.tradingName)),
    normalisedPostcode: pair(candidate.postcode, candPostcodeNorm ?? "", best.customer.postcode, normalisePostcode(best.customer.postcode).canonical ?? ""),
    normalisedPhone: pair(candidate.phone, candPhoneNorm ?? "", best.customer.phone, normalisePhone(best.customer.phone).comparison ?? ""),
  };
}

export function matchAllCandidates(candidates: OperationalCandidate[], customers: CustomerRecord[]): MatchResult[] {
  return candidates.map((c) => matchCandidateToCustomers(c, customers));
}
