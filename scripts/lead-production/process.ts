// Pure orchestration: candidates + customers + assignments + group registry -> ProcessedCandidate[].
// No file I/O, no Supabase — kept separate from run-comparison.ts so it's directly unit-testable
// against fixtures.

import { matchAllCandidates } from "./match-customers";
import { screenLargeGroups, computeSiblingBrandCounts, siblingCountFor } from "./screen-large-groups";
import { derivePreliminaryStatus } from "./preliminary-status";
import { notAssessedRejection } from "./rejection-levels";
import type { AssignmentRecord, GroupRegistryEntry, OperationalCandidate, CustomerRecord, ProcessedCandidate } from "./types";

const CONFIRMED_CUSTOMER_OUTCOMES = new Set([
  "confirmed_active_customer", "confirmed_inactive_customer", "branch_of_active_customer", "branch_of_inactive_customer",
]);

function findTerritory(candidate: OperationalCandidate, assignments: AssignmentRecord[]): { territory: string | null; salesperson: string | null } {
  if (!candidate.postcode) return { territory: null, salesperson: null };
  const outward = candidate.postcode.toUpperCase().replace(/\s+/g, "").replace(/\d[A-Z]{2}$/, "");
  const hit = assignments.find((a) => a.postcodePrefixes.some((p) => p === outward || outward.startsWith(p)));
  return hit ? { territory: hit.territory, salesperson: hit.salesperson } : { territory: null, salesperson: null };
}

export function processCandidates(
  candidates: OperationalCandidate[], customers: CustomerRecord[], assignments: AssignmentRecord[], groupRegistry: GroupRegistryEntry[],
): ProcessedCandidate[] {
  const matches = matchAllCandidates(candidates, customers);
  const siblingCounts = computeSiblingBrandCounts(candidates);

  return matches.map((match) => {
    const { territory, salesperson } = findTerritory(match.candidate, assignments);

    // Group screening is moot once a candidate is already a confirmed/probable existing-customer
    // match (that signal already decides the preliminary status) — still run for weak/new-prospect.
    const group = CONFIRMED_CUSTOMER_OUTCOMES.has(match.outcome) || match.outcome === "probable_match"
      ? null
      : screenLargeGroups(match.candidate, groupRegistry, siblingCountFor(match.candidate, siblingCounts));

    const preliminaryStatus = derivePreliminaryStatus(match.outcome, group);
    const rejection = notAssessedRejection(match.outcome, preliminaryStatus, group, territory !== null);

    return { match, group, preliminaryStatus, rejection, assignedTerritory: territory, assignedSalesperson: salesperson };
  });
}
