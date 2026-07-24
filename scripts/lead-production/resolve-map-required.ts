// Single authoritative source for whether a representative requires a field-sales map
// deliverable. Fix (2026-07-24): map_required must come from
// config/lead-production/sales-territories-v2.json's own `mapsRequired` field, keyed by
// representative — never hand-typed into a per-district assignment CSV (found hardcoded to
// "true" for every representative, including telesales, because nothing cross-checked it
// against the canonical config) and never inferred from whether a candidate happens to have
// coordinates (every candidate gets Google-derived lat/long regardless of channel — presence
// of coordinates says nothing about whether a REPRESENTATIVE needs a map deliverable).
//
// Used by run-full-territory.ts (feeds the phase1 config hash, so a changed
// sales-territories-v2.json invalidates affected checkpoints) and by any handover-package
// builder that needs to decide whether to produce a map file.

import { loadSalesTerritoriesV2, findRepresentative, type TerritoryRepresentative } from "./territory-assignment-v2";

export interface ResolvedMapRequirement {
  representative: string;
  role: TerritoryRepresentative["role"];
  mapRequired: boolean;
  sourceConfigPath: string;
}

export class UnknownRepresentativeError extends Error {}

/** Resolves a representative's map requirement from the canonical config. Fails closed
 *  (throws) if the representative is not found — never silently defaults to a guessed value. */
export async function resolveMapRequired(
  representative: string,
  configPath = "config/lead-production/sales-territories-v2.json",
): Promise<ResolvedMapRequirement> {
  const config = await loadSalesTerritoriesV2(configPath);
  const rep = findRepresentative(config, representative);
  if (!rep) {
    throw new UnknownRepresentativeError(
      `"${representative}" was not found in ${configPath} — cannot resolve map_required. Refusing to guess (never defaults to true or false for an unrecognised representative).`,
    );
  }
  return { representative: rep.representative, role: rep.role, mapRequired: rep.mapsRequired, sourceConfigPath: configPath };
}
