// Final ownership/group rescreen — Phase 7 (spec Phase D). Pure consolidation of already-
// computed evidence from the Google stage (physical-premises + newly-detected-groups),
// Companies House stage (related-company/group analysis — the most authoritative source, since
// it checks the resolved LEGAL company name against the SAME approved registry), and the
// website stage (franchiseGroupClues — corroborating only, never a standalone trigger, exactly
// mirroring the "shared registered office alone" / "shared director alone" discipline already
// established in group-analysis-after-companies-house.ts).
//
// The registry's default_outcome (when a registry match exists via ANY stage) is always the
// operational decision — never overridden by classification labels alone, consistent with
// every earlier stage in this bridge. Multi-site alone is never grounds for exclusion —
// "Do not exclude a regional group merely because it has multiple branches" (explicit
// instruction) is enforced by only ever promoting to a stronger category when the registry (via
// Companies House) or a decisive newly-detected-group signal (via Google) actually fired.

import type { RelatedCompanyCategory, NewlyDetectedGroup, PhysicalPremisesResult, GroupDefaultOutcome, FinalGroupClassification, FinalGroupRescreenResult } from "./types";

const RELATED_CATEGORY_TO_FINAL: Partial<Record<RelatedCompanyCategory, FinalGroupClassification>> = {
  franchise_operator: "major_franchise",
  national_chain_operator: "national_chain",
  regional_group: "regional_group",
  key_account_opportunity: "key_account_opportunity",
  common_control_group: "independent_multi_site",
  parent_subsidiary_relationship: "independent_multi_site",
  shared_director_group: "independent_multi_site",
  shared_psc_group: "independent_multi_site",
  independent_multi_site_company: "independent_multi_site",
  independent_single_site_company: "independent_single_site",
  ownership_unresolved: "ownership_unresolved",
  // shared_registered_office_only / possible_accountant_or_formation_agent_address: deliberately
  // absent — neither is a group signal on its own (see module header); falls through to the
  // independent_single_site default below.
};

export function finalGroupRescreen(
  candidateId: string,
  relatedCategory: RelatedCompanyCategory | null,
  relatedDefaultOutcome: GroupDefaultOutcome | null,
  newlyDetectedGoogleGroup: NewlyDetectedGroup | null,
  physicalPremises: PhysicalPremisesResult | null,
  websiteFranchiseClues: string[],
): FinalGroupRescreenResult {
  const evidenceSources: string[] = [];
  const evidenceTags: string[] = [];

  // Physical-premises fact takes priority for shared_kitchen specifically — it is an
  // operational-premises fact (from the Google stage), not an ownership question.
  if (physicalPremises === "virtual_or_shared_kitchen") {
    evidenceSources.push("google");
    evidenceTags.push("Google physical-premises assessment: virtual_or_shared_kitchen.");
    return { candidateId, classification: "shared_kitchen", defaultOutcome: relatedDefaultOutcome, evidenceSources, evidenceTags };
  }

  if (relatedCategory && RELATED_CATEGORY_TO_FINAL[relatedCategory]) {
    evidenceSources.push("companies_house");
    if (relatedCategory === "franchise_operator" || relatedCategory === "national_chain_operator" || relatedCategory === "regional_group" || relatedCategory === "key_account_opportunity") {
      evidenceSources.push("registry");
      evidenceTags.push(`Companies House related-company analysis matched the approved group registry (category: ${relatedCategory}).`);
    } else {
      evidenceTags.push(`Companies House related-company analysis: ${relatedCategory}.`);
    }
    if (websiteFranchiseClues.length > 0) { evidenceSources.push("website"); evidenceTags.push(`Corroborating website clue(s): ${websiteFranchiseClues.join(", ")}.`); }
    return { candidateId, classification: RELATED_CATEGORY_TO_FINAL[relatedCategory]!, defaultOutcome: relatedDefaultOutcome, evidenceSources, evidenceTags };
  }

  if (newlyDetectedGoogleGroup && newlyDetectedGoogleGroup.defaultOutcome) {
    evidenceSources.push("google", "registry");
    evidenceTags.push(`Google-stage newly-detected-group signal matched the approved registry (classification: ${newlyDetectedGoogleGroup.classification}).`);
    const mapped: FinalGroupClassification = newlyDetectedGoogleGroup.classification === "major_franchise" ? "major_franchise"
      : newlyDetectedGoogleGroup.classification === "regional_group" ? "regional_group"
      : newlyDetectedGoogleGroup.classification === "key_account_opportunity" ? "key_account_opportunity"
      : newlyDetectedGoogleGroup.classification === "excluded_national_supermarket" ? "supermarket"
      : newlyDetectedGoogleGroup.classification === "excluded_national_chain" ? "national_chain"
      : newlyDetectedGoogleGroup.classification === "excluded_wholesale_group" ? "wholesale_group"
      : "independent_single_site";
    return { candidateId, classification: mapped, defaultOutcome: newlyDetectedGoogleGroup.defaultOutcome, evidenceSources, evidenceTags };
  }

  // No registry-backed signal from any stage. Website franchise clues alone (e.g. the word
  // "franchise" appearing in page text) are corroborating-only and NEVER a standalone trigger —
  // recorded for human visibility, never auto-promoted to a stronger classification.
  if (websiteFranchiseClues.length > 0) {
    evidenceSources.push("website");
    evidenceTags.push(`Website text contains possible franchise/group language (${websiteFranchiseClues.join(", ")}) but no registry match was found via Companies House or Google — retained as a flag for human review, not auto-classified as a group.`);
  }

  if (relatedCategory === "independent_single_site_company" || !relatedCategory) {
    evidenceTags.push("No registry match, multi-site signal, or shared-kitchen evidence found across any stage.");
  }

  return { candidateId, classification: "independent_single_site", defaultOutcome: null, evidenceSources, evidenceTags };
}
