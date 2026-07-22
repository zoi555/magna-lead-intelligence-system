// This early bridge (customer comparison + large-group screening only) must NEVER assign a
// final Level 0-4 sales-readiness classification — that requires the complete pipeline (FSA,
// Companies House, Google, ownership, physical-presence, scoring), none of which has run yet.
// rejection_level is always the literal string "not_assessed"; the informative signal for this
// phase lives in PreliminaryStatus (preliminary-status.ts) and these reasonTags.

import type { GroupScreenResult, MatchOutcome, NotAssessedRejection, PreliminaryStatus } from "./types";

export function notAssessedRejection(
  outcome: MatchOutcome, preliminaryStatus: PreliminaryStatus, group: GroupScreenResult | null, hasTerritoryAssignment: boolean,
): NotAssessedRejection {
  const reasonTags: string[] = [];

  switch (preliminaryStatus) {
    case "active_customer": reasonTags.push("EXISTING_ACTIVE_CUSTOMER"); break;
    case "branch_of_active_customer": reasonTags.push("BRANCH_OF_EXISTING_ACTIVE_CUSTOMER"); break;
    case "inactive_customer": reasonTags.push("EXISTING_INACTIVE_CUSTOMER_REACTIVATION_CANDIDATE"); break;
    case "branch_of_inactive_customer": reasonTags.push("BRANCH_OF_INACTIVE_CUSTOMER_REACTIVATION_CANDIDATE"); break;
    case "probable_customer_match": reasonTags.push("PROBABLE_EXISTING_CUSTOMER_NEEDS_VERIFICATION"); break;
    case "possible_customer_match": reasonTags.push("WEAK_NAME_SIMILARITY_ONLY_NOT_EXCLUDED"); break;
    case "excluded_large_group": reasonTags.push(`EXCLUDED_GROUP_${(group?.classification ?? "UNKNOWN").toUpperCase()}`); break;
    case "key_account_opportunity": reasonTags.push("KEY_ACCOUNT_OPPORTUNITY"); break;
    case "ownership_unclear": reasonTags.push(`OWNERSHIP_UNCLEAR_${(group?.classification ?? "NEEDS_REVIEW").toUpperCase()}`); break;
    case "clear_for_enrichment": break;
  }

  if (!hasTerritoryAssignment) reasonTags.push("NO_TERRITORY_ASSIGNMENT");

  return { level: "not_assessed", type: null, reasonTags };
}
