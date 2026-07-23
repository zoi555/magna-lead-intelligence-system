// Group/franchise rescreen using Google evidence (Phase 3, spec section 10). Reuses
// screenLargeGroups() from screen-large-groups.ts UNCHANGED — same registry, same prefix-match
// discipline, same "postcode is supporting evidence only" rule. What's new here is only the
// INPUT: an enriched candidate view built from Google's official name/website domain/categories,
// which the original Phase 1 screen never had (OperationalCandidate.website is always null
// pre-enrichment). This is exactly how a locally-disguised franchise branch gets caught: the JE
// trading name may read "Chicken Corner Southall", but Google's official name/domain can reveal
// it is legally operating as a Subway/KFC/McDonald's franchise — the registry prefix-match then
// fires against the GOOGLE name where it could not fire against the JE name.
//
// None of the 5 already-excluded groups can be "reopened" by construction: they were filtered
// out of the population before the Google stage ever ran (see run-google-stage.ts), so this
// module never sees them. This module only ever ADDS information (a NewlyDetectedGroup record)
// — it never overrides the Phase 1 GroupScreenResult, which remains the historical record.

import { normaliseName } from "./normalize";
import { screenLargeGroups } from "./screen-large-groups";
import type { OperationalCandidate, GroupRegistryEntry, GroupScreenResult, GoogleMatchResult, GooglePlaceEvidence, NewlyDetectedGroup } from "./types";

const CHAIN_CATEGORY_HINTS = ["fast_food_restaurant", "meal_takeaway", "supermarket", "grocery_store", "convenience_store"];

function enrichedCandidate(candidate: OperationalCandidate, place: GooglePlaceEvidence): OperationalCandidate {
  return { ...candidate, name: place.officialName || candidate.name, website: place.website };
}

/** Same-batch repeated-brand signal, but keyed on Google's OFFICIAL name rather than the JE
 *  trading name — catches a chain that uses inconsistent JE listing names but a consistent
 *  Google Business Profile name. Computed once per run over every candidate with decisive
 *  Google identity evidence. */
export function computeGoogleSiblingBrandCounts(entries: { candidate: OperationalCandidate; google: GoogleMatchResult }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { google } of entries) {
    const place = google.plausibleResults[0];
    if (!place || !["exact_google_match", "strong_probable_google_match"].includes(google.outcome)) continue;
    const key = normaliseName(place.officialName);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const MULTI_SITE_GROUP_THRESHOLD = 3;
const MULTI_SITE_UNCLEAR_THRESHOLD = 2;

export function rescreenGroupAfterGoogle(
  candidate: OperationalCandidate,
  priorGroupResult: GroupScreenResult | null,
  google: GoogleMatchResult,
  registry: GroupRegistryEntry[],
  googleSiblingCount: number,
): NewlyDetectedGroup | null {
  const place = google.plausibleResults[0];
  const hasDecisiveIdentity = place && ["exact_google_match", "strong_probable_google_match"].includes(google.outcome);
  if (!hasDecisiveIdentity || !place) return null;

  const enriched = enrichedCandidate(candidate, place);
  const rescreened = screenLargeGroups(enriched, registry, googleSiblingCount);

  const priorWasRegistryMatch = !!priorGroupResult?.matchedRegistryEntry;
  const newRegistryMatchViaGoogle = !!rescreened.matchedRegistryEntry && !priorWasRegistryMatch;

  if (newRegistryMatchViaGoogle) {
    return {
      candidateId: candidate.id, candidateTradingName: candidate.name,
      signal: place.website ? "google_domain" : "google_name_pattern",
      classification: rescreened.classification, defaultOutcome: rescreened.defaultOutcome,
      evidenceTags: [
        `Google official name "${place.officialName}"${place.website ? ` / domain "${place.website}"` : ""} matches registry entry — no match was found against the original JE trading name "${candidate.name}".`,
        ...rescreened.rulesTriggered,
      ],
    };
  }

  // No registry hit, but the batch-repeated Google name plus chain-shaped Google categories
  // suggest a group the registry does not yet cover — flag for a human decision, never
  // auto-excluded (defaultOutcome null, per NewlyDetectedGroup's contract).
  const categories = [place.primaryCategory, ...place.additionalCategories].filter(Boolean).map((c) => (c as string).toLowerCase());
  const looksChainShaped = categories.some((c) => CHAIN_CATEGORY_HINTS.some((hint) => c.includes(hint)));
  if (!rescreened.matchedRegistryEntry && googleSiblingCount >= MULTI_SITE_UNCLEAR_THRESHOLD && looksChainShaped) {
    const classification = googleSiblingCount >= MULTI_SITE_GROUP_THRESHOLD ? "regional_group" : "ownership_unclear";
    return {
      candidateId: candidate.id, candidateTradingName: candidate.name, signal: "repeated_across_batch",
      classification, defaultOutcome: null,
      evidenceTags: [
        `Google official name "${place.officialName}" appears ${googleSiblingCount} times across this batch with chain-shaped categories (${categories.join(", ")}) — not in the approved group registry.`,
      ],
    };
  }

  return null;
}
