// Google match classification — genuinely new logic (no equivalent exists elsewhere in the
// repo; GooglePlacesRunner.enrich() returns a single flat contact-enrichment record, not a
// discrete multi-candidate identity classification). Mirrors fsa-match.ts's philosophy:
// postcode agreement is primary evidence, name similarity is secondary/confirming, distance is
// supporting only — never a trigger on its own. Every plausible result is retained (never just
// "the first"), and business-status closure (temporarily/permanently closed) is checked BEFORE
// identity classification — a closed premises is reported as closed regardless of how strong
// the name/postcode agreement is, since sales-readiness questions never apply to it.

import { normaliseName, normalisePostcode, nameSimilarity } from "./normalize";
import type { OperationalCandidate, GoogleOutcome, GooglePlaceEvidence, GoogleMatchResult } from "./types";
import type { GoogleQueryResult } from "./google-adapter";

const EXACT_NAME_SIM = 0.75;
const CONFLICT_ADDRESS_NAME_SIM = 0.6; // name similarity strong enough to flag an address conflict even without postcode agreement

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function postcodeFromAddressComponents(components: any[]): string | null {
  if (!Array.isArray(components)) return null;
  const pc = components.find((c) => Array.isArray(c?.types) && c.types.includes("postal_code"));
  return pc?.longText ?? pc?.shortText ?? null;
}

function toEvidence(candidate: OperationalCandidate, place: Record<string, any>): GooglePlaceEvidence {
  const candNameNorm = normaliseName(candidate.name);
  const placeName = place.displayName?.text ?? "";
  const placeNameNorm = normaliseName(placeName);
  const candPostcode = normalisePostcode(candidate.postcode).canonical;

  const rawComponents: any[] = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const addressComponents = rawComponents.map((c) => c?.longText ?? c?.shortText ?? "").filter(Boolean);
  const placePostcodeRaw = postcodeFromAddressComponents(rawComponents);
  const placePostcode = normalisePostcode(placePostcodeRaw).canonical;
  const postcodeAgreement = !!candPostcode && !!placePostcode && candPostcode === placePostcode;

  const loc = place.location as { latitude?: number; longitude?: number } | undefined;
  const latitude = typeof loc?.latitude === "number" ? loc.latitude : null;
  const longitude = typeof loc?.longitude === "number" ? loc.longitude : null;

  let distanceFromCandidateMetres: number | null = null;
  if (candidate.latitude != null && candidate.longitude != null && latitude != null && longitude != null) {
    distanceFromCandidateMetres = Math.round(haversineMetres(candidate.latitude, candidate.longitude, latitude, longitude));
  }

  const openingHours: string[] = Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
    ? place.regularOpeningHours.weekdayDescriptions
    : [];
  const additionalCategories: string[] = Array.isArray(place.types) ? place.types.filter((t: string) => t !== place.primaryType) : [];

  return {
    placeId: place.id ?? "",
    officialName: placeName,
    formattedAddress: place.formattedAddress ?? "",
    addressComponents,
    postcode: placePostcode,
    latitude,
    longitude,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    businessStatus: place.businessStatus ?? "",
    openingHours,
    primaryCategory: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
    additionalCategories,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    nameSimilarity: candNameNorm && placeNameNorm ? nameSimilarity(candNameNorm, placeNameNorm) : 0,
    postcodeAgreement,
    distanceFromCandidateMetres,
  };
}

export function classifyGoogleMatch(candidate: OperationalCandidate, queryResult: GoogleQueryResult): GoogleMatchResult {
  const base = {
    candidateId: candidate.id, candidateTradingName: candidate.name, candidatePostcode: candidate.postcode,
    retrievalTimestamp: queryResult.retrievedAt, sourceResponseReference: queryResult.queryString, apiAttempts: queryResult.attempts,
  };

  if (queryResult.disabledReason) {
    return { ...base, outcome: "google_api_failure", plausibleResults: [], evidenceTags: ["GOOGLE_PLACES_NOT_ATTEMPTED"], apiFailureReason: queryResult.disabledReason };
  }
  if (!queryResult.ok) {
    return { ...base, outcome: "google_api_failure", plausibleResults: [], evidenceTags: ["GOOGLE_API_CALL_FAILED_AFTER_RETRIES"], apiFailureReason: queryResult.errorMessage };
  }

  const evidence = queryResult.places.map((p) => toEvidence(candidate, p));

  // Closure status is checked ahead of identity classification and ahead of postcode/name
  // filtering — a permanently/temporarily closed premises is reported as such regardless of
  // how strong its identity match is; sales-readiness questions never apply to it.
  const permanentlyClosed = evidence.filter((e) => e.businessStatus === "CLOSED_PERMANENTLY");
  const temporarilyClosed = evidence.filter((e) => e.businessStatus === "CLOSED_TEMPORARILY");
  const postcodeExactAll = evidence.filter((e) => e.postcodeAgreement);
  if (postcodeExactAll.some((e) => e.businessStatus === "CLOSED_PERMANENTLY")) {
    return { ...base, outcome: "permanently_closed", plausibleResults: postcodeExactAll.filter((e) => e.businessStatus === "CLOSED_PERMANENTLY"), evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_PERMANENTLY"], apiFailureReason: null };
  }
  if (postcodeExactAll.some((e) => e.businessStatus === "CLOSED_TEMPORARILY")) {
    return { ...base, outcome: "temporarily_closed", plausibleResults: postcodeExactAll.filter((e) => e.businessStatus === "CLOSED_TEMPORARILY"), evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_TEMPORARILY"], apiFailureReason: null };
  }
  // No postcode-agreeing result at all, but every result returned happens to be closed —
  // still worth surfacing rather than reporting a bare no-match.
  if (postcodeExactAll.length === 0 && evidence.length > 0 && permanentlyClosed.length === evidence.length) {
    return { ...base, outcome: "permanently_closed", plausibleResults: permanentlyClosed, evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_PERMANENTLY", "NO_POSTCODE_AGREEMENT"], apiFailureReason: null };
  }
  if (postcodeExactAll.length === 0 && evidence.length > 0 && temporarilyClosed.length === evidence.length) {
    return { ...base, outcome: "temporarily_closed", plausibleResults: temporarilyClosed, evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_TEMPORARILY", "NO_POSTCODE_AGREEMENT"], apiFailureReason: null };
  }

  const postcodeExact = postcodeExactAll.filter((e) => e.businessStatus !== "CLOSED_PERMANENTLY" && e.businessStatus !== "CLOSED_TEMPORARILY");
  const candOutward = normalisePostcode(candidate.postcode).outward;

  if (postcodeExact.length === 0) {
    const nameOnly = evidence.filter((e) => e.nameSimilarity >= CONFLICT_ADDRESS_NAME_SIM && e.businessStatus !== "CLOSED_PERMANENTLY" && e.businessStatus !== "CLOSED_TEMPORARILY");
    if (nameOnly.length > 0) {
      // Distinguish an address-level conflict (same postal district, different building — the
      // premises likely just moved a few doors down) from a genuine postcode conflict (a
      // materially different postal district entirely, casting real doubt on identity).
      const sameDistrict = nameOnly.filter((e) => {
        const placeOutward = e.postcode ? normalisePostcode(e.postcode).outward : null;
        return !!candOutward && !!placeOutward && candOutward === placeOutward;
      });
      if (sameDistrict.length > 0) {
        return { ...base, outcome: "google_address_conflict", plausibleResults: sameDistrict, evidenceTags: ["NAME_MATCHES_SAME_DISTRICT_DIFFERENT_POSTCODE"], apiFailureReason: null };
      }
      return { ...base, outcome: "google_postcode_conflict", plausibleResults: nameOnly, evidenceTags: ["NAME_MATCHES_DIFFERENT_POSTAL_DISTRICT"], apiFailureReason: null };
    }
    return { ...base, outcome: "no_google_match", plausibleResults: [], evidenceTags: queryResult.places.length ? ["RESULTS_RETURNED_NONE_AT_CANDIDATE_POSTCODE"] : ["NO_RESULTS_RETURNED"], apiFailureReason: null };
  }

  if (postcodeExact.length > 1) {
    return { ...base, outcome: "multiple_google_matches", plausibleResults: postcodeExact, evidenceTags: ["MULTIPLE_PLACES_AT_SAME_POSTCODE"], apiFailureReason: null };
  }

  const only = postcodeExact[0];
  if (only.nameSimilarity >= EXACT_NAME_SIM) {
    return { ...base, outcome: "exact_google_match", plausibleResults: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_STRONG"], apiFailureReason: null };
  }
  if (only.nameSimilarity >= 0.3) {
    return { ...base, outcome: "strong_probable_google_match", plausibleResults: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_MODERATE"], apiFailureReason: null };
  }
  return { ...base, outcome: "google_name_conflict", plausibleResults: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_WEAK_OR_ABSENT"], apiFailureReason: null };
}

export const GOOGLE_MATCH_THRESHOLDS = { EXACT_NAME_SIM, CONFLICT_ADDRESS_NAME_SIM };
