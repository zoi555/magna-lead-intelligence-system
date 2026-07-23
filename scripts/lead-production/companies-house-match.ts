// Legal-entity classification — genuinely new logic (no equivalent exists elsewhere; the
// existing matchCompany() in src/lib/sources/companies-house.ts collapses straight to a single
// matched/not-matched boolean with no distinct dissolved/dormant/multiple/sole-trader outcome
// taxonomy). Mirrors google-match.ts/fsa-match.ts's philosophy: postcode/address agreement is
// primary evidence, name similarity is secondary/confirming — but the evidence-priority ORDER
// this stage is required to use is richer (company number > Google name > Google address >
// domain > FSA identity > trading name > Magna evidence), reflected in how the caller builds
// the search query, not in this classification function itself (this function classifies
// whatever ranked candidate set searchCompanies() returned, regardless of which evidence tier
// built the query).
//
// Generic names never confirm alone: GENERIC_NAME_TOKENS mirrors the same discipline as
// customer-resolution-after-fsa.ts's GENERIC_WORDS — a search built from a generic name yielding
// a high token-overlap match is deliberately capped, never promoted to exact_company_match.

import { normaliseName, normalisePostcode, nameSimilarity } from "./normalize";
import type { CompanyLegalIdentityOutcome, CompanySearchCandidateEvidence, CompanyLegalIdentityResult, CompaniesHouseStatus } from "./types";
import type { CompanySearchQueryResult, RawCompanyProfile } from "./companies-house-adapter";

const EXACT_NAME_SIM = 0.75;
const PROBABLE_NAME_SIM = 0.4;
const CONFLICT_NAME_SIM = 0.6;
const NEAR_EXACT_FOR_GENERIC = 0.9; // a generic-token query needs near-total token overlap (not just >=0.75) before exact_company_match — see isGenericQuery()

const GENERIC_NAME_TOKENS = new Set(["restaurant", "cafe", "kitchen", "takeaway", "foods", "grill", "express", "house", "bar", "kebab", "pizza", "chicken", "fried", "food", "diner", "catering", "limited", "ltd"]);

// The query string this stage actually sends is name + postcode concatenated (see
// buildQueryPlan() in run-companies-house-stage.ts) — the postcode token itself is never
// generic, so it must be stripped before checking genericity, or a query would almost never be
// classified as generic at all (defeating the whole point of this check).
const UK_POSTCODE_PATTERN = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
function isGenericQuery(query: string): boolean {
  const withoutPostcode = query.replace(UK_POSTCODE_PATTERN, " ");
  const tokens = normaliseName(withoutPostcode).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => GENERIC_NAME_TOKENS.has(t) || t.length <= 2);
}

function mapStatus(raw: string): CompaniesHouseStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("dissolved")) return "dissolved";
  if (s.includes("dormant")) return "dormant";
  if (s.includes("liquidation")) return "liquidation";
  if (s.includes("administration")) return "administration";
  if (s.includes("removed") || s.includes("strike")) return "strike_off_pending";
  if (s.includes("active")) return "active";
  return "other";
}

function toEvidence(item: { companyNumber: string; companyName: string; companyStatus: string; companyType: string | null; legalNameSimilarity: number; postcodeAgreement: boolean }, profile: RawCompanyProfile | null): CompanySearchCandidateEvidence {
  return {
    companyNumber: item.companyNumber, companyName: item.companyName, companyStatus: profile?.companyStatus || item.companyStatus,
    companyType: profile?.companyType ?? item.companyType, registeredOfficeAddress: profile?.registeredOfficeAddress ?? null,
    registeredPostcode: profile?.registeredPostcode ?? null, previousNames: profile?.previousNames ?? [],
    legalNameSimilarity: item.legalNameSimilarity, tradingNameSimilarity: item.legalNameSimilarity,
    registeredAddressAgreement: item.postcodeAgreement, postcodeAgreement: item.postcodeAgreement,
    sicCodes: profile?.sicCodes ?? [], incorporationDate: profile?.incorporationDate ?? null, dissolutionDate: profile?.cessationDate ?? null,
  };
}

/** Classifies a search result set (with the winning candidate's profile, when fetched) into
 *  exactly one primary legal-identity outcome. `profiledCompanyNumber`/`profile` are the ONE
 *  company this stage fetched a full profile for (the top-ranked search hit) — every OTHER
 *  search item is retained as evidence with only its search-summary fields (never a fabricated
 *  profile). */
export function classifyCompanyMatch(
  candidateId: string, candidateTradingName: string, candidatePostcode: string | null,
  searchResult: CompanySearchQueryResult, searchQueriesUsed: string[],
  profiledCompanyNumber: string | null, profile: RawCompanyProfile | null,
): CompanyLegalIdentityResult {
  const base = { candidateId, candidateTradingName, candidatePostcode, retrievalTimestamp: searchResult.retrievedAt, searchQueriesUsed, apiAttempts: 1 };

  if (searchResult.disabledReason || searchResult.apiFailureReason) {
    return { ...base, outcome: "companies_house_api_failure", companiesHouseStatus: null, plausibleCompanies: [], evidenceTags: [searchResult.disabledReason ? "COMPANIES_HOUSE_NOT_ATTEMPTED" : "COMPANIES_HOUSE_API_CALL_FAILED"], apiFailureReason: searchResult.disabledReason ?? searchResult.apiFailureReason };
  }

  const evidence = searchResult.items.map((it) => toEvidence(it, it.companyNumber === profiledCompanyNumber ? profile : null));
  const candOutward = normalisePostcode(candidatePostcode).outward;
  const genericQuery = searchResult.queryString ? isGenericQuery(searchResult.queryString) : false;

  if (evidence.length === 0) {
    return { ...base, outcome: "no_company_record", companiesHouseStatus: null, plausibleCompanies: [], evidenceTags: ["NO_SEARCH_RESULTS", "MISSING_RECORD_DOES_NOT_AUTOMATICALLY_REJECT_SOLE_TRADER"], apiFailureReason: null };
  }

  // Dissolved/dormant conflicts checked ahead of a fresh identity classification — a strong
  // name+postcode match against a dissolved/dormant record is reported as that conflict
  // explicitly, never silently promoted to an active exact match.
  const postcodeExact = evidence.filter((e) => e.postcodeAgreement);
  const strongAtPostcode = postcodeExact.filter((e) => e.legalNameSimilarity >= CONFLICT_NAME_SIM);
  const dissolvedHit = strongAtPostcode.find((e) => mapStatus(e.companyStatus) === "dissolved");
  if (dissolvedHit) {
    return { ...base, outcome: "dissolved_company_conflict", companiesHouseStatus: "dissolved", plausibleCompanies: [dissolvedHit], evidenceTags: ["STRONG_NAME_POSTCODE_MATCH_BUT_DISSOLVED"], apiFailureReason: null };
  }
  const dormantHit = strongAtPostcode.find((e) => mapStatus(e.companyStatus) === "dormant");
  if (dormantHit) {
    return { ...base, outcome: "dormant_company_conflict", companiesHouseStatus: "dormant", plausibleCompanies: [dormantHit], evidenceTags: ["STRONG_NAME_POSTCODE_MATCH_BUT_DORMANT"], apiFailureReason: null };
  }

  const liveAtPostcode = postcodeExact.filter((e) => { const s = mapStatus(e.companyStatus); return s !== "dissolved" && s !== "dormant"; });

  if (liveAtPostcode.length === 0) {
    const nameOnly = evidence.filter((e) => e.legalNameSimilarity >= CONFLICT_NAME_SIM && !genericQuery);
    if (nameOnly.length > 0) {
      const sameDistrict = nameOnly.filter((e) => { const rOutward = e.registeredPostcode ? normalisePostcode(e.registeredPostcode).outward : null; return !!candOutward && !!rOutward && candOutward === rOutward; });
      if (sameDistrict.length > 0) {
        return { ...base, outcome: "registered_address_conflict", companiesHouseStatus: mapStatus(sameDistrict[0].companyStatus), plausibleCompanies: sameDistrict, evidenceTags: ["NAME_MATCHES_SAME_DISTRICT_DIFFERENT_REGISTERED_ADDRESS"], apiFailureReason: null };
      }
      return { ...base, outcome: "company_name_conflict", companiesHouseStatus: mapStatus(nameOnly[0].companyStatus), plausibleCompanies: nameOnly, evidenceTags: ["NAME_MATCHES_DIFFERENT_REGISTERED_ADDRESS"], apiFailureReason: null };
    }
    // No decisive company record — a real food-service business with no CH record is very
    // plausibly a sole trader or unincorporated partnership, which never requires a company
    // number. This is explicitly NOT a rejection.
    return { ...base, outcome: "probable_sole_trader_or_partnership", companiesHouseStatus: null, plausibleCompanies: [], evidenceTags: ["NO_DECISIVE_COMPANY_RECORD", "MISSING_RECORD_DOES_NOT_AUTOMATICALLY_REJECT_SOLE_TRADER"], apiFailureReason: null };
  }

  if (liveAtPostcode.length > 1) {
    return { ...base, outcome: "multiple_company_matches", companiesHouseStatus: null, plausibleCompanies: liveAtPostcode, evidenceTags: ["MULTIPLE_LIVE_COMPANIES_AT_SAME_POSTCODE"], apiFailureReason: null };
  }

  const only = liveAtPostcode[0];
  if (genericQuery && only.legalNameSimilarity < NEAR_EXACT_FOR_GENERIC) {
    return { ...base, outcome: "strong_probable_company_match", companiesHouseStatus: mapStatus(only.companyStatus), plausibleCompanies: [only], evidenceTags: ["POSTCODE_EXACT", "GENERIC_NAME_CAPPED_BELOW_EXACT"], apiFailureReason: null };
  }
  if (only.legalNameSimilarity >= EXACT_NAME_SIM) {
    return { ...base, outcome: "exact_company_match", companiesHouseStatus: mapStatus(only.companyStatus), plausibleCompanies: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_STRONG"], apiFailureReason: null };
  }
  if (only.legalNameSimilarity >= PROBABLE_NAME_SIM) {
    return { ...base, outcome: "strong_probable_company_match", companiesHouseStatus: mapStatus(only.companyStatus), plausibleCompanies: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_MODERATE"], apiFailureReason: null };
  }
  return { ...base, outcome: "company_name_conflict", companiesHouseStatus: mapStatus(only.companyStatus), plausibleCompanies: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_WEAK_OR_ABSENT"], apiFailureReason: null };
}

export const COMPANIES_HOUSE_MATCH_THRESHOLDS = { EXACT_NAME_SIM, PROBABLE_NAME_SIM, CONFLICT_NAME_SIM, NEAR_EXACT_FOR_GENERIC };
