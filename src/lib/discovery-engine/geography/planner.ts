// AspectLead discovery geography planner (a SOURCE-PLANNING ADAPTER concern — the piece
// AspectLead legitimately owns). Turns a run's geography selections into the postcode
// query units a specific source can execute, using the generic package expansion. Areas
// are EXPANDED to their districts (previously they were silently dropped); place selections
// resolve honestly to pending_data; exclusions are applied before execution.

import {
  parseMixedSelections, planForSource, resolveSelection,
  type PostcodeReference, type GeographySelection, type ResolvedSelection, type SourceGeographySupport,
} from "@geospatial/map";

/** Just Eat queries by postcode district only (bypostcode/{district}). */
export const JUST_EAT_GEOGRAPHY_SUPPORT: SourceGeographySupport = {
  source: "just_eat",
  supportedLevels: ["postcode_district"],
};

export interface TerritoryPlan {
  resolved: ResolvedSelection[];    // one per original selection (full provenance)
  unresolved: ResolvedSelection[];  // place/admin/invalid — surfaced, never guessed
  queryUnits: string[];             // deduped, source-compatible, post-exclusion
  excluded: string[];               // codes removed before execution
}

const normCode = (s: string) => s.toUpperCase().replace(/\s+/g, (m) => (m ? " " : m)).trim();

/**
 * Plan a run's territory for one source.
 * @param territoryInput raw mixed geography text (postcodes / places)
 * @param ref            canonical postcode reference (from the seeded table)
 * @param support        the source's declared geography support
 * @param exclude        codes to exclude before execution (user exclusions)
 */
export function planTerritory(
  territoryInput: string, ref: PostcodeReference, support: SourceGeographySupport, exclude: string[] = []
): TerritoryPlan {
  const selections = parseMixedSelections(territoryInput);
  const plan = planForSource(selections, ref, support);
  const excludeSet = new Set(exclude.map(normCode));
  const queryUnits = plan.queryUnits.filter((u) => !excludeSet.has(normCode(u)));
  const excluded = plan.queryUnits.filter((u) => excludeSet.has(normCode(u)));
  return { resolved: plan.resolved, unresolved: plan.unresolved, queryUnits, excluded };
}

/** Resolve a single explicit selection (for the UI: show type + expansion count + children). */
export function resolveOne(selection: GeographySelection, ref: PostcodeReference): ResolvedSelection {
  return resolveSelection(selection, ref);
}
