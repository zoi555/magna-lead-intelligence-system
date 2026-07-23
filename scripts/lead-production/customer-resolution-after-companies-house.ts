// Automated customer-match resolution after Companies House evidence (Phase 4, spec section
// 12). New logic — no equivalent exists elsewhere. Reruns the SAME resolution question the
// Google stage asked (customer-resolution-after-google.ts), against the SAME originally-
// suspected customer, now with Companies House's legal-entity evidence (verified company
// number, legal name, previous names, registered address, parent-company/branch relationship)
// added to Google's identity evidence already available.
//
// The Magna "Inactive" flag remains the sole lifecycle authority, unchanged from every prior
// stage. Do-not-confirm list is explicit and enforced: locality words, generic name overlap,
// registered-office postcode alone, a common director name without identity evidence — a
// shared director alone is never treated as customer-match evidence in this module (that
// question belongs to group-analysis-after-companies-house.ts, and even there requires
// additional business/control evidence, never a bare name match).

import { normaliseName, normaliseAddress, normalisePostcode, normaliseCompanyNumber, nameSimilarity } from "./normalize";
import { classifyNameOverlap } from "./customer-resolution-after-fsa";
import type {
  CustomerRecord, GoogleMatchResult, GooglePlaceEvidence, CompanyLegalIdentityResult,
  CompanySearchCandidateEvidence, RelatedCompanyAnalysis,
  CustomerResolutionAfterGoogleOutcome, CustomerResolutionAfterCompaniesHouseOutcome, CustomerResolutionAfterCompaniesHouse,
} from "./types";

const STRONG_NAME = 0.75;
const STRONG_ADDRESS = 0.4;

function bestCompanyEvidence(ch: CompanyLegalIdentityResult): CompanySearchCandidateEvidence | null {
  const usableOutcomes = ["exact_company_match", "strong_probable_company_match"];
  if (!usableOutcomes.includes(ch.outcome)) return null;
  return ch.plausibleCompanies[0] ?? null;
}

function bestGoogleEvidence(google: GoogleMatchResult): GooglePlaceEvidence | null {
  const usableOutcomes = ["exact_google_match", "strong_probable_google_match", "temporarily_closed", "permanently_closed"];
  if (!usableOutcomes.includes(google.outcome)) return null;
  return google.plausibleResults[0] ?? null;
}

export function resolveCustomerMatchAfterCompaniesHouse(
  candidateId: string,
  candidateName: string,
  priorResolution: CustomerResolutionAfterGoogleOutcome | "n/a",
  matchedCustomer: CustomerRecord | null,
  companiesHouse: CompanyLegalIdentityResult,
  relatedCompany: RelatedCompanyAnalysis | null,
  google: GoogleMatchResult,
): CustomerResolutionAfterCompaniesHouse {
  const base = { candidateId, priorResolution, priorMatchedCustomerId: matchedCustomer?.customerId ?? null, companiesHouseOutcome: companiesHouse.outcome };

  if (!matchedCustomer) {
    return { ...base, resolutionOutcome: "unresolved_customer_match_after_companies_house", evidenceUsed: ["No customer match was suspected at any prior stage — nothing for this stage to confirm or release."] };
  }

  const chBest = bestCompanyEvidence(companiesHouse);
  const gPlace = bestGoogleEvidence(google);
  const evidenceUsed: string[] = [];

  const outcome = (isActive: boolean): CustomerResolutionAfterCompaniesHouseOutcome =>
    isActive ? "confirmed_active_customer_after_companies_house" : "confirmed_inactive_customer_after_companies_house";
  const lifecycleNote = () => `Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`;

  // --- Strong confirmation routes ---

  if (chBest) {
    const custCompanyNumber = normaliseCompanyNumber(matchedCustomer.companyNumber);
    const chCompanyNumber = normaliseCompanyNumber(chBest.companyNumber);
    if (custCompanyNumber && chCompanyNumber && custCompanyNumber === chCompanyNumber) {
      evidenceUsed.push(`Exact Companies House company number match: customer "${matchedCustomer.tradingName}" company number matches "${chBest.companyName}" (${chBest.companyNumber}).`);
      evidenceUsed.push(lifecycleNote());
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }

    const chNameSim = nameSimilarity(normaliseName(chBest.companyName), normaliseName(matchedCustomer.tradingName));
    const custPostcode = normalisePostcode(matchedCustomer.postcode).canonical;
    const chPostcode = normalisePostcode(chBest.registeredPostcode).canonical;
    const chPostcodeAgrees = !!custPostcode && !!chPostcode && custPostcode === chPostcode;
    if (chNameSim >= STRONG_NAME && chPostcodeAgrees) {
      evidenceUsed.push(`Exact legal name + postcode: Companies House legal name "${chBest.companyName}" against customer "${matchedCustomer.tradingName}" (similarity ${chNameSim.toFixed(2)}), same postcode "${chBest.registeredPostcode}".`);
      evidenceUsed.push(lifecycleNote());
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }

    const chAddressSim = matchedCustomer.address ? nameSimilarity(normaliseAddress(chBest.registeredOfficeAddress ?? ""), normaliseAddress(matchedCustomer.address)) : 0;
    if (chAddressSim >= STRONG_ADDRESS && chNameSim >= STRONG_NAME) {
      evidenceUsed.push(`Exact registered address + strong name: Companies House registered office "${chBest.registeredOfficeAddress}" against customer address "${matchedCustomer.address}" (address similarity ${chAddressSim.toFixed(2)}), name similarity ${chNameSim.toFixed(2)}.`);
      evidenceUsed.push(lifecycleNote());
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }
  }

  if (relatedCompany && matchedCustomer.companyNumber) {
    const custCompanyNumber = normaliseCompanyNumber(matchedCustomer.companyNumber);
    const relatedNumbers = relatedCompany.relatedCompanyNumbers.map((n) => normaliseCompanyNumber(n));
    if (custCompanyNumber
      && relatedNumbers.includes(custCompanyNumber)
      && (relatedCompany.category === "parent_subsidiary_relationship" || relatedCompany.category === "common_control_group")) {
      evidenceUsed.push(`Verified branch/parent relationship: customer "${matchedCustomer.tradingName}"'s company number appears among this candidate's related companies (category: ${relatedCompany.category}).`);
      evidenceUsed.push(lifecycleNote());
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }
  }

  // Google-sourced routes (phone/domain) carried forward unchanged — Companies House itself
  // has no phone/website fields to add here.
  if (gPlace) {
    const googleNameSim = nameSimilarity(normaliseName(gPlace.officialName), normaliseName(matchedCustomer.tradingName));
    const googleAddressSim = matchedCustomer.address ? nameSimilarity(normaliseAddress(gPlace.formattedAddress), normaliseAddress(matchedCustomer.address)) : 0;
    if (googleAddressSim >= STRONG_ADDRESS && googleNameSim >= STRONG_NAME) {
      evidenceUsed.push(`Exact operating address (Google) + strong name: "${gPlace.formattedAddress}" against customer address "${matchedCustomer.address}" (similarity ${googleAddressSim.toFixed(2)}), name similarity ${googleNameSim.toFixed(2)}.`);
      evidenceUsed.push(lifecycleNote());
      return { ...base, resolutionOutcome: outcome(matchedCustomer.isActive), evidenceUsed };
    }
  }

  // --- Release: Companies House evidence positively identifies a different, unrelated legal
  // entity at this postcode, or the original evidence was never more than a location/generic word.
  const overlapCategory = classifyNameOverlap(candidateName, matchedCustomer.tradingName);
  if (chBest) {
    const chNameSim = nameSimilarity(normaliseName(chBest.companyName), normaliseName(matchedCustomer.tradingName));
    const custPostcode = normalisePostcode(matchedCustomer.postcode).canonical;
    const chPostcode = normalisePostcode(chBest.registeredPostcode).canonical;
    if (chPostcode && custPostcode && chPostcode === custPostcode && chNameSim < 0.2) {
      evidenceUsed.push(`Companies House identifies "${chBest.companyName}" registered at this postcode — an unrelated legal entity to the suspected customer "${matchedCustomer.tradingName}" (similarity ${chNameSim.toFixed(2)}).`);
      return { ...base, resolutionOutcome: "released_from_customer_hold_after_companies_house", evidenceUsed };
    }
  }
  if (overlapCategory === "location_only_name_overlap" || overlapCategory === "generic_name_token_overlap" || overlapCategory === "no_overlap") {
    evidenceUsed.push(`Original customer-match evidence was only a ${overlapCategory.replace(/_/g, " ")} — no genuine business-name signal, and no stage since (FSA, Google, Companies House) independently confirmed the match.`);
    return { ...base, resolutionOutcome: "released_from_customer_hold_after_companies_house", evidenceUsed };
  }

  // --- Remain unresolved: real business-name overlap existed, but no stage's evidence was
  // decisive enough for a safe automatic confirm or release.
  evidenceUsed.push(`Original evidence included genuine business-name overlap (category: ${overlapCategory}), but Companies House evidence (${companiesHouse.outcome}) is not decisive enough for a safe automatic confirm or release.`);
  return { ...base, resolutionOutcome: "unresolved_customer_match_after_companies_house", evidenceUsed };
}
