// Physical-premises assessment (Phase 3, spec section 9). New logic — no equivalent exists
// elsewhere. Answers ONE question only: does this candidate correspond to a real, locatable
// physical premises? It does not assess sales-readiness, ownership, or scoring — those remain
// out of scope for this stage. The same standard applies uniformly to telesales and field
// sales (the spec is explicit on this — no separate, weaker telesales standard). A missing
// phone number never invalidates a premises assessment; phone is not premises evidence.

import type { GoogleMatchResult, GooglePlaceEvidence, FsaMatchResult, PhysicalPremisesResult, PhysicalPremisesAssessment } from "./types";

const SHARED_KITCHEN_CATEGORY_HINTS = ["cloud_kitchen", "ghost_kitchen", "virtual_restaurant", "food_court", "meal_delivery"];
const SHARED_KITCHEN_NAME_HINTS = ["dark kitchen", "cloud kitchen", "ghost kitchen", "virtual kitchen", "kitchen hub"];

function looksLikeSharedOrVirtualKitchen(place: GooglePlaceEvidence): boolean {
  const categories = [place.primaryCategory, ...place.additionalCategories].filter(Boolean).map((c) => (c as string).toLowerCase());
  if (categories.some((c) => SHARED_KITCHEN_CATEGORY_HINTS.some((hint) => c.includes(hint)))) return true;
  const name = place.officialName.toLowerCase();
  return SHARED_KITCHEN_NAME_HINTS.some((hint) => name.includes(hint));
}

export function assessPhysicalPremises(candidateId: string, google: GoogleMatchResult, fsa: FsaMatchResult): PhysicalPremisesAssessment {
  const evidenceTags: string[] = [];

  if (google.outcome === "permanently_closed") {
    return { candidateId, result: "permanently_closed_premises", evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_PERMANENTLY", "HARD_QUALIFICATION_FAILURE"] };
  }
  if (google.outcome === "temporarily_closed") {
    return { candidateId, result: "temporarily_closed_premises", evidenceTags: ["GOOGLE_BUSINESS_STATUS_CLOSED_TEMPORARILY", "HELD_NOT_DISCARDED"] };
  }

  if (google.outcome === "google_postcode_conflict" || google.outcome === "google_address_conflict") {
    evidenceTags.push(`GOOGLE_OUTCOME_${google.outcome.toUpperCase()}`);
    return { candidateId, result: "premises_conflict", evidenceTags };
  }

  const place = google.plausibleResults[0] ?? null;

  if ((google.outcome === "exact_google_match" || google.outcome === "strong_probable_google_match") && place) {
    if (looksLikeSharedOrVirtualKitchen(place)) {
      evidenceTags.push("GOOGLE_CATEGORY_OR_NAME_INDICATES_SHARED_OR_VIRTUAL_KITCHEN");
      return { candidateId, result: "virtual_or_shared_kitchen", evidenceTags };
    }
    evidenceTags.push(`GOOGLE_OUTCOME_${google.outcome.toUpperCase()}`, "GOOGLE_FORMATTED_ADDRESS_PRESENT");
    if (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match") evidenceTags.push("CORROBORATED_BY_FSA_REGISTRATION");
    const result: PhysicalPremisesResult = google.outcome === "exact_google_match" ? "verified_physical_premises" : "probable_physical_premises";
    return { candidateId, result, evidenceTags };
  }

  // No decisive Google identity — fall back to FSA registration alone as weaker, but still
  // real-world, evidence of a physical premises (a registered food establishment).
  if (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match") {
    evidenceTags.push("NO_DECISIVE_GOOGLE_IDENTITY", "FSA_REGISTRATION_PRESENT");
    return { candidateId, result: "probable_physical_premises", evidenceTags };
  }

  if (google.outcome === "multiple_google_matches" || fsa.outcome === "multiple_fsa_matches") {
    evidenceTags.push("AMBIGUOUS_IDENTITY_AT_LOCATION_NOT_A_PREMISES_ABSENCE");
    return { candidateId, result: "no_physical_premises_evidence", evidenceTags };
  }

  evidenceTags.push("NO_GOOGLE_OR_FSA_EVIDENCE_OF_A_LOCATABLE_PREMISES");
  return { candidateId, result: "no_physical_premises_evidence", evidenceTags };
}
