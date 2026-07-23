// FSA match classification — genuinely new logic (no equivalent exists elsewhere in the
// repo). Reuses this bridge's own normalize.ts (already tested) rather than the legacy
// pipeline's separate tokenOverlap() implementation, to keep scripts/lead-production/
// self-contained. Follows the same address-first philosophy already established for FSA in
// this codebase (ADR-0005, docs/09_DECISIONS.md): postcode agreement is primary evidence,
// name similarity is secondary/confirming, coordinates are supporting only — never a trigger.
//
// Every plausible establishment is retained (never just "the first result"), and a
// no-match/failure never implies a hard rejection — that decision belongs to a later stage.

import { normaliseName, normalisePostcode, nameSimilarity } from "./normalize";
import type { FsaEstablishment } from "../../src/lib/pipeline/types";
import type { OperationalCandidate, FsaOutcome, FsaEstablishmentEvidence, FsaMatchResult } from "./types";
import type { FsaQueryResult } from "./fsa-adapter";

const EXACT_NAME_SIM = 0.75;
const CONFLICT_ADDRESS_NAME_SIM = 0.6; // name similarity strong enough to flag an address conflict even without postcode agreement

function ratingStatusOf(ratingValue: string): FsaEstablishmentEvidence["ratingStatus"] {
  const v = ratingValue.toLowerCase();
  if (/exempt/.test(v)) return "exempt";
  if (/await/.test(v)) return "awaiting_inspection";
  if (!v) return "unknown";
  return "rated";
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toEvidence(candidate: OperationalCandidate, e: FsaEstablishment): FsaEstablishmentEvidence {
  const candNameNorm = normaliseName(candidate.name);
  const estNameNorm = normaliseName(e.businessName);
  const candPostcode = normalisePostcode(candidate.postcode).canonical;
  const estPostcode = normalisePostcode(e.postcode).canonical;
  const postcodeAgreement = !!candPostcode && !!estPostcode && candPostcode === estPostcode;

  let coordinateEvidence: FsaEstablishmentEvidence["coordinateEvidence"] = null;
  if (candidate.latitude != null && candidate.longitude != null && e.latitude != null && e.longitude != null) {
    coordinateEvidence = { candidateDistanceMetres: Math.round(haversineMetres(candidate.latitude, candidate.longitude, e.latitude, e.longitude)) };
  }

  return {
    fhrsId: e.fhrsId, officialBusinessName: e.businessName, fsaAddress: e.addressLine, fsaPostcode: e.postcode,
    businessType: e.businessType, hygieneRating: e.ratingValue, ratingStatus: ratingStatusOf(e.ratingValue),
    ratingDate: e.ratingDate, localAuthority: e.localAuthority,
    nameSimilarity: candNameNorm && estNameNorm ? nameSimilarity(candNameNorm, estNameNorm) : 0,
    postcodeAgreement,
    addressAgreement: null, // AspectLead candidates carry no free-text address pre-enrichment — see reports/operational-candidates.ts
    coordinateEvidence,
  };
}

export function classifyFsaMatch(candidate: OperationalCandidate, queryResult: FsaQueryResult): FsaMatchResult {
  const base = {
    candidateId: candidate.id, candidateTradingName: candidate.name, candidatePostcode: candidate.postcode,
    retrievalTimestamp: queryResult.retrievedAt, sourceResponseReference: queryResult.queryString, apiAttempts: queryResult.attempts,
  };

  if (!queryResult.ok) {
    return { ...base, outcome: "fsa_api_failure", plausibleEstablishments: [], evidenceTags: ["FSA_API_CALL_FAILED_AFTER_RETRIES"], apiFailureReason: queryResult.errorMessage };
  }

  const evidence = queryResult.establishments.map((e) => toEvidence(candidate, e));
  const postcodeExact = evidence.filter((e) => e.postcodeAgreement);

  if (postcodeExact.length === 0) {
    const nameOnly = evidence.filter((e) => e.nameSimilarity >= CONFLICT_ADDRESS_NAME_SIM);
    if (nameOnly.length > 0) {
      return { ...base, outcome: "fsa_address_conflict", plausibleEstablishments: nameOnly, evidenceTags: ["NAME_MATCHES_BUT_POSTCODE_DIFFERS"], apiFailureReason: null };
    }
    return { ...base, outcome: "no_fsa_match", plausibleEstablishments: [], evidenceTags: queryResult.establishments.length ? ["RESULTS_RETURNED_NONE_AT_CANDIDATE_POSTCODE"] : ["NO_RESULTS_RETURNED"], apiFailureReason: null };
  }

  if (postcodeExact.length > 1) {
    return { ...base, outcome: "multiple_fsa_matches", plausibleEstablishments: postcodeExact, evidenceTags: ["MULTIPLE_ESTABLISHMENTS_AT_SAME_POSTCODE"], apiFailureReason: null };
  }

  const only = postcodeExact[0];
  if (only.ratingStatus === "exempt") {
    return { ...base, outcome: "fsa_exempt", plausibleEstablishments: [only], evidenceTags: ["FSA_RATING_EXEMPT"], apiFailureReason: null };
  }
  if (only.ratingStatus === "awaiting_inspection") {
    return { ...base, outcome: "fsa_pending", plausibleEstablishments: [only], evidenceTags: ["FSA_RATING_AWAITING_INSPECTION"], apiFailureReason: null };
  }
  if (only.nameSimilarity >= EXACT_NAME_SIM) {
    return { ...base, outcome: "exact_fsa_match", plausibleEstablishments: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_STRONG"], apiFailureReason: null };
  }
  if (only.nameSimilarity >= 0.3) {
    return { ...base, outcome: "strong_probable_fsa_match", plausibleEstablishments: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_MODERATE"], apiFailureReason: null };
  }
  return { ...base, outcome: "fsa_name_conflict", plausibleEstablishments: [only], evidenceTags: ["POSTCODE_EXACT", "NAME_WEAK_OR_ABSENT"], apiFailureReason: null };
}
