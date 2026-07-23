// Automated customer-match resolution after FSA evidence (Phase 2, section 6/7). New logic —
// no equivalent exists elsewhere. Uses the FSA official name/postcode as the comparison basis
// against the Magna customer master (never the original JE trading name alone — that's exactly
// what produced the weak/probable matches being resolved here). The Magna "Inactive" flag
// remains the sole lifecycle authority, unchanged from Phase 1 — this module never re-derives
// lifecycle any other way.

import { normaliseName, nameSimilarity, normalisePostcode } from "./normalize";
import type { CustomerRecord, FsaMatchResult, NameOverlapCategory, CustomerResolutionOutcome, CustomerResolutionResult, PreliminaryStatus } from "./types";

// Illustrative, extendable — not exhaustive. Location words specific to this run's observed
// pattern (Southall and neighbouring West London place names) plus generic food-service
// descriptors. A shared token from either list, ALONE, must never confirm or strengthen a
// customer match (see the module header and the Phase 1 report's "Southall" finding).
const LOCATION_WORDS = new Set(["southall", "hayes", "hanwell", "ealing", "greenford", "uxbridge", "northolt", "wembley", "broadway", "london", "west", "east", "north", "south"]);
const GENERIC_WORDS = new Set(["restaurant", "cafe", "kitchen", "takeaway", "foods", "grill", "express", "house", "bar", "kebab", "pizza", "chicken", "fried", "food", "diner"]);

export function classifyNameOverlap(candidateName: string, customerName: string): NameOverlapCategory {
  const candTokens = new Set(normaliseName(candidateName).split(" ").filter(Boolean));
  const custTokens = new Set(normaliseName(customerName).split(" ").filter(Boolean));
  const shared = [...candTokens].filter((t) => custTokens.has(t));
  if (shared.length === 0) return "no_overlap";
  const nonGenericNonLocation = shared.filter((t) => !LOCATION_WORDS.has(t) && !GENERIC_WORDS.has(t));
  if (nonGenericNonLocation.length > 0) return "business_name_overlap";
  if (shared.some((t) => LOCATION_WORDS.has(t))) return "location_only_name_overlap";
  return "generic_name_token_overlap";
}

const CONFIRM_NAME_SIM = 0.75;
const RELEASE_DIFFERENT_BUSINESS_NAME_SIM = 0.2;

export function resolveCustomerMatchAfterFsa(
  candidateId: string,
  priorStatus: PreliminaryStatus,
  priorMatchedCustomerId: string | null,
  priorCandidateName: string,
  matchedCustomer: CustomerRecord | null,
  fsa: FsaMatchResult,
): CustomerResolutionResult {
  const overlapCategory: NameOverlapCategory = matchedCustomer ? classifyNameOverlap(priorCandidateName, matchedCustomer.tradingName) : "no_overlap";
  const evidenceUsed: string[] = [];

  const best = fsa.plausibleEstablishments[0] ?? null;

  // --- Confirm: only on strong, explicit evidence. ---
  if (matchedCustomer && best && (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match")) {
    const fsaPostcode = normalisePostcode(best.fsaPostcode).canonical;
    const customerPostcode = normalisePostcode(matchedCustomer.postcode).canonical;
    const fsaVsCustomerNameSim = nameSimilarity(normaliseName(best.officialBusinessName), normaliseName(matchedCustomer.tradingName));
    const postcodeAndNameAgree = !!fsaPostcode && !!customerPostcode && fsaPostcode === customerPostcode && fsaVsCustomerNameSim >= CONFIRM_NAME_SIM;

    if (postcodeAndNameAgree) {
      evidenceUsed.push(`FSA official name "${best.officialBusinessName}" (postcode ${best.fsaPostcode}) matches customer "${matchedCustomer.tradingName}" (postcode ${matchedCustomer.postcode}) — exact postcode + strong name agreement (similarity ${fsaVsCustomerNameSim.toFixed(2)})`);
      const outcome: CustomerResolutionOutcome = matchedCustomer.isActive ? "confirmed_active_customer_after_fsa" : "confirmed_inactive_customer_after_fsa";
      evidenceUsed.push(`Magna Inactive field is authoritative for lifecycle: isActive=${matchedCustomer.isActive} (source: ${matchedCustomer.lifecycleSource}, raw value "${matchedCustomer.lifecycleRawValue}")`);
      return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: outcome, evidenceUsed, fsaOutcome: fsa.outcome };
    }
  }

  // --- Release: FSA evidence points away from the suspected customer, or the original
  // evidence was never more than a location/generic word. ---
  if (fsa.outcome === "fsa_name_conflict") {
    evidenceUsed.push("FSA confirms a registered business at this exact postcode with a materially different name — the earlier customer-match candidate is not this business.");
    return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: "clear_for_enrichment_after_fsa", evidenceUsed, fsaOutcome: fsa.outcome };
  }
  if (fsa.outcome === "fsa_address_conflict") {
    evidenceUsed.push("FSA's best name match is registered at a different postcode — official address conflicts materially with the suspected Magna customer.");
    return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: "clear_for_enrichment_after_fsa", evidenceUsed, fsaOutcome: fsa.outcome };
  }
  if (matchedCustomer && best && (fsa.outcome === "exact_fsa_match" || fsa.outcome === "strong_probable_fsa_match")) {
    const fsaVsCustomerNameSim = nameSimilarity(normaliseName(best.officialBusinessName), normaliseName(matchedCustomer.tradingName));
    if (fsaVsCustomerNameSim < RELEASE_DIFFERENT_BUSINESS_NAME_SIM) {
      evidenceUsed.push(`FSA identifies "${best.officialBusinessName}" at this address — an unrelated business to the suspected customer "${matchedCustomer.tradingName}" (similarity ${fsaVsCustomerNameSim.toFixed(2)}).`);
      return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: "clear_for_enrichment_after_fsa", evidenceUsed, fsaOutcome: fsa.outcome };
    }
  }
  if (overlapCategory === "location_only_name_overlap" || overlapCategory === "generic_name_token_overlap" || overlapCategory === "no_overlap") {
    // The ONLY thing tying this candidate to the suspected customer was a location/generic
    // word (or nothing at all beyond postcode proximity) — and FSA did not supply strong
    // countervailing evidence to confirm it either. Release rather than leave it hanging on
    // evidence this weak.
    evidenceUsed.push(`Original customer-match evidence was only a ${overlapCategory.replace(/_/g, " ")} — no genuine business-name signal, and FSA evidence (${fsa.outcome}) did not independently confirm the match.`);
    return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: "clear_for_enrichment_after_fsa", evidenceUsed, fsaOutcome: fsa.outcome };
  }

  // --- Remain unresolved: real business-name overlap existed, but FSA didn't decisively
  // confirm or contradict it (multiple matches, no match, pending, exempt, or API failure). ---
  evidenceUsed.push(`Original evidence included genuine business-name overlap (category: ${overlapCategory}), but FSA evidence (${fsa.outcome}) is not decisive enough for a safe automatic confirm or release.`);
  return { candidateId, priorPreliminaryStatus: priorStatus, priorMatchedCustomerId, priorOverlapCategory: overlapCategory, resolutionOutcome: "unresolved_customer_match", evidenceUsed, fsaOutcome: fsa.outcome };
}
