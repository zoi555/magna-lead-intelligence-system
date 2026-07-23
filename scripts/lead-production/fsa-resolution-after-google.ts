// FSA multiple-match resolution using Google evidence (Phase 3, spec section 7). New logic —
// no equivalent exists elsewhere. Only ever ADDS a resolution result; the historical FsaOutcome
// on the FSA-stage record is never mutated (see run-google-stage.ts — the FSA-stage output
// directory is read-only).
//
// Resolution is gate-based, not a single weighted score: automatic resolution requires exact
// postcode AND strong name AND strong street/address AND consistent coordinates to ALL hold at
// once. This is deliberate — "name similarity alone must not resolve a dense-postcode FSA
// result" (explicit user requirement) is only true if name is one gate among several, never a
// score component strong enough to carry a decision alone. A numeric composite score is still
// computed for ranking/reporting (topFsaScore/secondFsaScore/scoreMargin), but the decision
// itself is the explicit gate check below.
//
// "Consistent coordinates" is necessarily a proxy: FsaEstablishmentEvidence retains only the
// establishment's DISTANCE from the candidate (coordinateEvidence.candidateDistanceMetres), not
// its raw lat/lng — so direct FSA-to-Google distance cannot be computed. Instead, the FSA
// candidate-distance and the Google place's candidate-distance are compared to each other: if
// both distances are small and close to one another, that corroborates the same real-world
// premises. When either distance is unavailable, coordinate evidence is treated as neutral
// (not a false negative) — this is recorded explicitly in evidenceResponsible.

import { normaliseName, normaliseAddress, normalisePostcode, nameSimilarity } from "./normalize";
import type { FsaMatchResult, FsaEstablishmentEvidence, GoogleMatchResult, GooglePlaceEvidence, FsaResolutionOutcome, FsaResolutionAfterGoogle } from "./types";

const STRONG_NAME = 0.75;
const PROBABLE_NAME = 0.5;
const STRONG_ADDRESS = 0.4;
const PROBABLE_ADDRESS = 0.25;
const CONSISTENT_DISTANCE_TOLERANCE_METRES = 100;
const AMBIGUOUS_MARGIN = 0.15; // top vs second FSA candidate must clear this margin to auto-resolve
const GOOGLE_CONFLICT_FLOOR = 0.3; // best-of-all-candidates composite below this ⇒ Google doesn't correspond to any FSA candidate

interface ScoredFsaCandidate {
  establishment: FsaEstablishmentEvidence;
  nameSim: number;
  addressSim: number;
  postcodeExact: boolean;
  coordinatesConsistent: boolean | null; // null: not evaluable (a distance was unavailable) — neutral, not a strike against
  composite: number;
}

function coordinatesConsistent(fsaDistance: number | null, googleDistance: number | null): boolean | null {
  if (fsaDistance == null || googleDistance == null) return null;
  return Math.abs(fsaDistance - googleDistance) <= CONSISTENT_DISTANCE_TOLERANCE_METRES;
}

function scoreCandidate(fsa: FsaEstablishmentEvidence, google: GooglePlaceEvidence): ScoredFsaCandidate {
  const nameSim = nameSimilarity(normaliseName(google.officialName), normaliseName(fsa.officialBusinessName));
  const addressSim = nameSimilarity(normaliseAddress(google.formattedAddress), normaliseAddress(fsa.fsaAddress));
  const fsaPostcode = normalisePostcode(fsa.fsaPostcode).canonical;
  const googlePostcode = google.postcode ? normalisePostcode(google.postcode).canonical : null;
  const postcodeExact = !!fsaPostcode && !!googlePostcode && fsaPostcode === googlePostcode;
  const consistent = coordinatesConsistent(fsa.coordinateEvidence?.candidateDistanceMetres ?? null, google.distanceFromCandidateMetres);
  const coordComponent = consistent === null ? 0.5 : consistent ? 1 : 0; // neutral when not evaluable
  const composite = (nameSim + addressSim + (postcodeExact ? 1 : 0) + coordComponent) / 4;
  return { establishment: fsa, nameSim, addressSim, postcodeExact, coordinatesConsistent: consistent, composite };
}

export function resolveFsaMatchAfterGoogle(fsa: FsaMatchResult, google: GoogleMatchResult): FsaResolutionAfterGoogle {
  const base = { candidateId: fsa.candidateId, priorFsaOutcome: fsa.outcome };

  if (fsa.outcome !== "multiple_fsa_matches") {
    // Nothing for this module to resolve — the FSA-stage outcome was already a single, or an
    // absent, or an already-conflicting record, not an ambiguous set. The FSA outcome stands.
    return {
      ...base, resolution: "no_corresponding_fsa_record",
      topFsaCandidateFhrsId: null, topFsaCandidateName: null, topFsaScore: null,
      secondFsaCandidateFhrsId: null, secondFsaCandidateName: null, secondFsaScore: null,
      scoreMargin: null, evidenceResponsible: [`Prior FSA outcome was "${fsa.outcome}", not multiple_fsa_matches — no ambiguous FSA set for this module to resolve.`],
    };
  }

  const decisiveGoogle = (google.outcome === "exact_google_match" || google.outcome === "strong_probable_google_match")
    ? google.plausibleResults[0] ?? null
    : null;

  if (!decisiveGoogle) {
    return {
      ...base, resolution: "fsa_still_multiple",
      topFsaCandidateFhrsId: fsa.plausibleEstablishments[0]?.fhrsId ?? null, topFsaCandidateName: fsa.plausibleEstablishments[0]?.officialBusinessName ?? null, topFsaScore: null,
      secondFsaCandidateFhrsId: fsa.plausibleEstablishments[1]?.fhrsId ?? null, secondFsaCandidateName: fsa.plausibleEstablishments[1]?.officialBusinessName ?? null, secondFsaScore: null,
      scoreMargin: null, evidenceResponsible: [`Google outcome was "${google.outcome}" — not a single decisive identity, so it cannot safely resolve which of the ${fsa.plausibleEstablishments.length} FSA candidates is correct.`],
    };
  }

  const scored = fsa.plausibleEstablishments.map((e) => scoreCandidate(e, decisiveGoogle)).sort((a, b) => b.composite - a.composite);
  const top = scored[0];
  const second: ScoredFsaCandidate | undefined = scored[1];
  const margin = second ? top.composite - second.composite : top.composite;

  const reportFields = {
    topFsaCandidateFhrsId: top.establishment.fhrsId, topFsaCandidateName: top.establishment.officialBusinessName, topFsaScore: Number(top.composite.toFixed(3)),
    secondFsaCandidateFhrsId: second?.establishment.fhrsId ?? null, secondFsaCandidateName: second?.establishment.officialBusinessName ?? null, secondFsaScore: second ? Number(second.composite.toFixed(3)) : null,
    scoreMargin: Number(margin.toFixed(3)),
  };

  const bestOfAll = scored[0].composite;
  if (bestOfAll < GOOGLE_CONFLICT_FLOOR) {
    return {
      ...base, resolution: "fsa_google_conflict", ...reportFields,
      evidenceResponsible: [`Google's decisive identity "${decisiveGoogle.officialName}" (${decisiveGoogle.formattedAddress}) does not correspond well to any of the ${fsa.plausibleEstablishments.length} FSA candidates (best composite ${bestOfAll.toFixed(2)}) — Google and FSA evidence conflict.`],
    };
  }

  if (second && margin < AMBIGUOUS_MARGIN) {
    return {
      ...base, resolution: "fsa_still_multiple", ...reportFields,
      evidenceResponsible: [`Top two FSA candidates score within ${AMBIGUOUS_MARGIN} of each other against the Google evidence (margin ${margin.toFixed(2)}) — not a safe automatic resolution.`],
    };
  }

  const gateExact = top.postcodeExact && top.nameSim >= STRONG_NAME && top.addressSim >= STRONG_ADDRESS && top.coordinatesConsistent !== false;
  if (gateExact) {
    return {
      ...base, resolution: "fsa_resolved_exact", ...reportFields,
      evidenceResponsible: [
        `Exact postcode agreement`, `strong name similarity (${top.nameSim.toFixed(2)} >= ${STRONG_NAME})`,
        `strong street/address similarity (${top.addressSim.toFixed(2)} >= ${STRONG_ADDRESS})`,
        `coordinates ${top.coordinatesConsistent === null ? "not evaluable (neutral)" : "consistent"}`,
        `clear margin over next candidate (${margin.toFixed(2)} >= ${AMBIGUOUS_MARGIN})`,
      ],
    };
  }

  const gateProbable = top.postcodeExact && top.nameSim >= PROBABLE_NAME && top.addressSim >= PROBABLE_ADDRESS && top.coordinatesConsistent !== false;
  if (gateProbable) {
    return {
      ...base, resolution: "fsa_resolved_probable", ...reportFields,
      evidenceResponsible: [
        `Exact postcode agreement`, `probable name similarity (${top.nameSim.toFixed(2)} >= ${PROBABLE_NAME})`,
        `probable street/address similarity (${top.addressSim.toFixed(2)} >= ${PROBABLE_ADDRESS})`,
        `coordinates ${top.coordinatesConsistent === null ? "not evaluable (neutral)" : "consistent"}`,
      ],
    };
  }

  return {
    ...base, resolution: "fsa_still_multiple", ...reportFields,
    evidenceResponsible: [`Top FSA candidate did not clear the combined-evidence gate (postcode exact: ${top.postcodeExact}, name: ${top.nameSim.toFixed(2)}, address: ${top.addressSim.toFixed(2)}, coordinates consistent: ${top.coordinatesConsistent}) — remains unresolved rather than guessed.`],
  };
}
