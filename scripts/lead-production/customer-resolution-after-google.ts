// Automated customer-match resolution after Google evidence (Phase 3, spec section 8). New
// logic — no equivalent exists elsewhere. Reruns the SAME resolution question the FSA stage
// asked (customer-resolution-after-fsa.ts), against the SAME originally-suspected customer
// (Phase 1's priorMatchedCustomerId, carried through the FSA stage), but now with Google's
// richer identity evidence (official name, formatted address, phone, website domain) added to
// the FSA official name/address already available. It never opens a fresh search across the
// whole customer file — that would go beyond "rerun resolution for the 54 unresolved" and risks
// pulling an already-cleared candidate back onto weak evidence.
//
// The Magna "Inactive" flag remains the sole lifecycle authority, unchanged from Phase 1/FSA.
//
// CustomerRecord has no website field, so "exact website domain + business-name agreement" is
// evaluated against the customer's EMAIL domain as a documented, honest proxy (many small
// operators' email domain matches their trading website domain) — never fabricated data, and
// always paired with business-name agreement, never used alone.

import { normaliseName, normaliseAddress, normalisePostcode, normalisePhone, normaliseDomain, nameSimilarity } from "./normalize";
import { classifyNameOverlap } from "./customer-resolution-after-fsa";
import type {
  CustomerRecord, FsaMatchResult, GoogleMatchResult, GooglePlaceEvidence,
  CustomerResolutionOutcome, CustomerResolutionAfterGoogleOutcome, CustomerResolutionAfterGoogle,
} from "./types";

const STRONG_NAME = 0.75;
const NEAR_EXACT_NAME = 0.85; // postcode+name alone (the weakest strong-confirm route) needs a higher bar
const STRONG_ADDRESS = 0.4;
const RELEASE_DIFFERENT_BUSINESS_NAME_SIM = 0.2;

function bestGoogleEvidence(google: GoogleMatchResult): GooglePlaceEvidence | null {
  // Identity evidence is usable even from a closed premises (closure is a premises fact, not
  // an identity fact) — but not from a genuinely ambiguous/conflicting/absent result.
  const usableOutcomes = ["exact_google_match", "strong_probable_google_match", "temporarily_closed", "permanently_closed"];
  if (!usableOutcomes.includes(google.outcome)) return null;
  return google.plausibleResults[0] ?? null;
}

export function resolveCustomerMatchAfterGoogle(
  candidateId: string,
  candidateName: string,
  priorResolution: CustomerResolutionOutcome | "n/a",
  matchedCustomer: CustomerRecord | null,
  google: GoogleMatchResult,
  fsa: FsaMatchResult,
): CustomerResolutionAfterGoogle {
  const base = { candidateId, priorResolution, priorMatchedCustomerId: matchedCustomer?.customerId ?? null, googleOutcome: google.outcome };

  if (!matchedCustomer) {
    return { ...base, resolutionOutcome: "unresolved_customer_match_after_google", evidenceUsed: ["No customer match was suspected at Phase 1 or the FSA stage — nothing for this stage to confirm or release."] };
  }

  const gPlace = bestGoogleEvidence(google);
  const fsaBest = fsa.plausibleEstablishments[0] ?? null;
  const evidenceUsed: string[] = [];

  const outcome = (isActive: boolean): CustomerResolutionAfterGoogleOutcome =>
    isActive ? "confirmed_active_customer_after_google" : "confirmed_inactive_customer_after_google";

  // --- Strong confirmation routes. Each is checked independently; the DO-NOT-CONFIRM list
  // (locality words, generic name tokens, weak name similarity, shared postcode alone) never
  // appears among them — none of these routes accepts postcode or name-overlap alone.

  if (gPlace) {
    const custPhone = normalisePhone(matchedCustomer.phone).comparison;
    const googlePhone = normalisePhone(gPlace.phone).comparison;
    if (custPhone && googlePhone && custPhone === googlePhone) {
      evidenceUsed.push(`Exact normalised telephone match: customer "${matchedCustomer.tradingName}" phone matches Google's listed phone for "${gPlace.officialName}".`);
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }

    const googleDomain = normaliseDomain(gPlace.website);
    const custEmailDomain = matchedCustomer.email ? normaliseDomain(matchedCustomer.email.split("@")[1] ?? null) : null;
    const domainNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    if (googleDomain && custEmailDomain && googleDomain === custEmailDomain && domainNameSim >= STRONG_NAME) {
      evidenceUsed.push(`Exact domain match: Google website domain "${googleDomain}" matches customer email domain, with strong business-name agreement (${domainNameSim.toFixed(2)}).`);
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }

    const addressSim = matchedCustomer.address ? nameSimilarity(normaliseAddress(gPlace.formattedAddress), normaliseAddress(matchedCustomer.address)) : 0;
    const addressNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    if (addressSim >= STRONG_ADDRESS && addressNameSim >= STRONG_NAME) {
      evidenceUsed.push(`Exact full address + strong name agreement: Google address "${gPlace.formattedAddress}" against customer address "${matchedCustomer.address}" (address similarity ${addressSim.toFixed(2)}), name similarity ${addressNameSim.toFixed(2)}.`);
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }

    const googlePostcode = gPlace.postcode ? normalisePostcode(gPlace.postcode).canonical : null;
    const custPostcode = normalisePostcode(matchedCustomer.postcode).canonical;
    const postcodeExact = !!googlePostcode && !!custPostcode && googlePostcode === custPostcode;
    const postcodeNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    if (postcodeExact && postcodeNameSim >= NEAR_EXACT_NAME) {
      evidenceUsed.push(`Exact postcode + near-exact official name: Google name "${gPlace.officialName}" against customer "${matchedCustomer.tradingName}" (similarity ${postcodeNameSim.toFixed(2)} >= ${NEAR_EXACT_NAME}), same postcode.`);
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }
  }

  if (gPlace && fsaBest) {
    const fsaNameSim = nameSimilarity(normaliseName(fsaBest.officialBusinessName), normaliseName(matchedCustomer.tradingName));
    const googleNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    const fsaPostcode = normalisePostcode(fsaBest.fsaPostcode).canonical;
    const custPostcodeForFsa = normalisePostcode(matchedCustomer.postcode).canonical;
    const fsaPostcodeAgrees = !!fsaPostcode && !!custPostcodeForFsa && fsaPostcode === custPostcodeForFsa;
    if (fsaNameSim >= STRONG_NAME && googleNameSim >= STRONG_NAME && fsaPostcodeAgrees) {
      evidenceUsed.push(`Confirmed FSA+Google identity agreement: both FSA ("${fsaBest.officialBusinessName}") and Google ("${gPlace.officialName}") independently agree with customer "${matchedCustomer.tradingName}" (FSA sim ${fsaNameSim.toFixed(2)}, Google sim ${googleNameSim.toFixed(2)}), same postcode.`);
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }
  }

  // --- Release: Google/FSA evidence positively identifies a different business at this
  // location, or the original evidence was never more than a location/generic word.
  const overlapCategory = classifyNameOverlap(candidateName, matchedCustomer.tradingName);
  if (gPlace) {
    const googleVsCustomerNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    const googlePostcode = gPlace.postcode ? normalisePostcode(gPlace.postcode).canonical : null;
    const custPostcode = normalisePostcode(matchedCustomer.postcode).canonical;
    if (googlePostcode && custPostcode && googlePostcode === custPostcode && googleVsCustomerNameSim < RELEASE_DIFFERENT_BUSINESS_NAME_SIM) {
      evidenceUsed.push(`Google identifies "${gPlace.officialName}" at this postcode — an unrelated business to the suspected customer "${matchedCustomer.tradingName}" (similarity ${googleVsCustomerNameSim.toFixed(2)}).`);
      return { ...base, resolutionOutcome: "released_from_customer_hold_after_google", evidenceUsed };
    }
  }
  if (overlapCategory === "location_only_name_overlap" || overlapCategory === "generic_name_token_overlap" || overlapCategory === "no_overlap") {
    evidenceUsed.push(`Original customer-match evidence was only a ${overlapCategory.replace(/_/g, " ")} — no genuine business-name signal, and neither FSA nor Google evidence independently confirmed the match.`);
    return { ...base, resolutionOutcome: "released_from_customer_hold_after_google", evidenceUsed };
  }

  // --- Remain unresolved: real business-name overlap existed, but neither FSA nor Google
  // evidence was decisive enough for a safe automatic confirm or release.
  evidenceUsed.push(`Original evidence included genuine business-name overlap (category: ${overlapCategory}), but Google evidence (${google.outcome}) and FSA evidence (${fsa.outcome}) are not decisive enough for a safe automatic confirm or release.`);
  return { ...base, resolutionOutcome: "unresolved_customer_match_after_google", evidenceUsed };
}
