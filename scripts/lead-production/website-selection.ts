// Website selection — spec section B1. Evidence priority: verified Google website first, then
// a verified official domain from Companies House/group evidence, then a strong tied candidate
// (name+postcode+phone). Never a directory-site URL treated as the official website (Just Eat,
// Uber Eats, Deliveroo, TripAdvisor, Yelp, Facebook/Instagram profile pages are explicitly
// excluded — those are third-party listings, not the business's own site).

import { normaliseDomain } from "./normalize";

const DIRECTORY_DOMAIN_HINTS = [
  "just-eat", "justeat", "ubereats", "uber.com", "deliveroo", "tripadvisor", "yelp",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "google.com", "maps.google",
  "opentable", "zomato", "foursquare", "yell.com", "thomsonlocal", "192.com",
];

export function isDirectorySite(domain: string | null): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return DIRECTORY_DOMAIN_HINTS.some((h) => d.includes(h));
}

export interface WebsiteSelectionInput {
  candidateId: string;
  googleWebsite: string | null; // from the decisive Google plausibleResults[0].website, when present
  registryDomain: string | null; // a matched group-registry entry's domain, when this candidate matched one
}

export function selectWebsite(input: WebsiteSelectionInput): { candidateId: string; selectedDomain: string | null; selectionTier: string; evidenceTags: string[] } {
  const googleDomain = normaliseDomain(input.googleWebsite);
  if (googleDomain && !isDirectorySite(googleDomain)) {
    return { candidateId: input.candidateId, selectedDomain: googleDomain, selectionTier: "verified_google_website", evidenceTags: [`Google-verified website: ${googleDomain}`] };
  }

  const registryDomain = normaliseDomain(input.registryDomain);
  if (registryDomain && !isDirectorySite(registryDomain)) {
    return { candidateId: input.candidateId, selectedDomain: registryDomain, selectionTier: "verified_official_domain_from_evidence", evidenceTags: [`Group-registry-verified domain: ${registryDomain}`] };
  }

  // "Strong tied candidate" (name+postcode+phone) requires an independent lawful discovery
  // mechanism (e.g. a live web search) that is not budgeted for this stage tonight — see the
  // run manifest's scopingNotice. Never a guessed domain (e.g. businessname.co.uk) — that would
  // be exactly the kind of invented contact information section B3 explicitly forbids.
  return { candidateId: input.candidateId, selectedDomain: null, selectionTier: "no_website_available", evidenceTags: ["No verified Google website or registry domain; no additional lawful website-discovery mechanism was budgeted for this run — never guessed."] };
}
