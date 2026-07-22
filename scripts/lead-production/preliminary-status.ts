// Derives the PRELIMINARY status only — this bridge never assigns a final Level 0-4
// sales-readiness classification (see rejection-levels.ts). A candidate reaching
// clear_for_enrichment has merely survived customer comparison and early group screening; it
// still needs FSA, Companies House, Google, ownership, physical-presence and scoring before it
// is sales-ready.
//
// Precedence: a confirmed/probable customer-match signal always wins over group screening
// (whether or not group screening even ran — see process.ts, which skips group screening
// entirely for confirmed/probable customer matches). For weak/no customer match, a REGISTRY
// group match's default_outcome decides — NEVER classification alone (classification is
// descriptive/audit context only; see types.ts's GroupRegistryEntry comment and
// screen-large-groups.ts). weak_name_similarity only breaks the tie when no group matched at
// all (or the group's default_outcome is "continue").
//
// When no registry entry matched (the same-batch repeated-brand heuristic fired instead —
// group.defaultOutcome is null in that case, since there is no operator-supplied decision to
// consult), a documented fallback applies: repeated-brand-implies-regional-group -> ownership
// still needs a human look -> ownership_unclear; a two-sibling "possible multi-site" signal is
// even weaker evidence -> also ownership_unclear. independent/acceptable classifications (no
// group signal at all) fall through to clear_for_enrichment / possible_customer_match.

import type { GroupScreenResult, MatchOutcome, PreliminaryStatus } from "./types";

export function derivePreliminaryStatus(outcome: MatchOutcome, group: GroupScreenResult | null): PreliminaryStatus {
  switch (outcome) {
    case "confirmed_active_customer": return "active_customer";
    case "confirmed_inactive_customer": return "inactive_customer";
    case "branch_of_active_customer": return "branch_of_active_customer";
    case "branch_of_inactive_customer": return "branch_of_inactive_customer";
    case "probable_match": return "probable_customer_match";
    case "weak_possible_match":
    case "new_prospect": {
      if (group?.defaultOutcome) {
        // default_outcome — set explicitly on the matched registry entry — controls the
        // result. classification is NEVER consulted here.
        switch (group.defaultOutcome) {
          case "exclude": return "excluded_large_group";
          case "key_account": return "key_account_opportunity";
          case "review": return "ownership_unclear";
          case "continue": break; // falls through to the weak/clear check below
        }
      } else if (group && !group.matchedRegistryEntry) {
        // Heuristic-only (no registry entry at all) — see module header for the documented
        // fallback used when there is no operator default_outcome to consult.
        if (group.classification === "regional_group" || group.classification === "ownership_unclear") return "ownership_unclear";
      }
      return outcome === "weak_possible_match" ? "possible_customer_match" : "clear_for_enrichment";
    }
  }
}
