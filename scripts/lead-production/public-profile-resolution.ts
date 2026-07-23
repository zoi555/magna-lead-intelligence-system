// Public-profile resolution — Phase 6 (spec Phase C). This run uses ONLY the safe fallback
// path explicitly authorised by the spec: no lawful external public-search connector was
// budgeted for tonight's run (see run-public-profile-stage.ts's preflight notice), so every
// resolution here is grounded in the candidate's OWN official website evidence (Phase 5) —
// never an external search, never a same-name-only match, never a scraped/logged-into LinkedIn
// page. verified_linkedin_profile and strong_probable_public_profile are architecturally
// reachable (the type/outcome exists for a future run with a configured connector) but this
// function never produces them without a real external-search result to evaluate — none is
// ever passed in this run.

import { normaliseName, nameSimilarity } from "./normalize";
import type { DecisionMakerCandidate, WebsiteExtractedData, PublicProfileResult } from "./types";

export function resolvePublicProfile(candidate: DecisionMakerCandidate, website: WebsiteExtractedData | null, companyName: string | null): PublicProfileResult {
  const base = { candidateId: candidate.candidateId, personName: candidate.fullName, verifiedCompany: companyName, verifiedRole: candidate.likelyRole };

  if (!website || website.publicTeamNames.length === 0) {
    return { ...base, profileUrl: null, profileSource: "none", companyAgreement: null, roleAgreement: null, locationAgreement: null, outcome: "no_public_profile_found", confidence: "not_available", evidenceTags: ["No official-website team/contact names were extracted for this candidate — no external search connector was configured this run."] };
  }

  const nameOnWebsite = website.publicTeamNames.find((n) => nameSimilarity(normaliseName(n), normaliseName(candidate.fullName)) >= 0.5);
  if (!nameOnWebsite) {
    return { ...base, profileUrl: null, profileSource: "none", companyAgreement: null, roleAgreement: null, locationAgreement: null, outcome: "no_public_profile_found", confidence: "not_available", evidenceTags: [`Official website lists team names (${website.publicTeamNames.join(", ")}) but none match "${candidate.fullName}" closely enough to corroborate.`] };
  }

  // A name found on the business's OWN official website, next to a role label, is real —
  // but it is not an external LinkedIn/public-search verification, so it is explicitly marked
  // profile_not_verified for anything beyond the website itself.
  return {
    ...base, profileUrl: website.officialDomain ? `https://${website.officialDomain}` : null, profileSource: "official_website",
    companyAgreement: true, roleAgreement: null, locationAgreement: null,
    outcome: "official_website_profile_only", confidence: "medium",
    evidenceTags: [`Name "${nameOnWebsite}" found on the candidate's own official website (Phase 5 crawl), near a role label — no external LinkedIn/public-search verification was performed this run.`],
  };
}
