// Place-aware territory planning (Workstream A1). Runs the pure package planner, then
// resolves any unresolved place-name tokens against the ingested OS Open Names data:
// a single match contributes its districts; multiple matches are surfaced as AMBIGUOUS
// choices (never auto-guessed). Postcode expansion is unchanged.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostcodeReference, SourceGeographySupport } from "@geospatial/map";
import { planTerritory, type TerritoryPlan } from "./planner";
import { resolvePlaceName, type PlaceCandidate } from "./place-resolver";

export interface PlaceResolution { token: string; candidate: PlaceCandidate }
export interface AmbiguousPlace { token: string; candidates: PlaceCandidate[] }

export interface PlaceAwarePlan extends TerritoryPlan {
  placeResolutions: PlaceResolution[];   // uniquely-resolved place tokens
  ambiguousPlaces: AmbiguousPlace[];     // place tokens needing a user choice
}

const PLACE_LIKE = /^[A-Za-z][A-Za-z '\-]{1,}$/;

export async function planTerritoryWithPlaces(
  db: SupabaseClient, input: string, ref: PostcodeReference, support: SourceGeographySupport, exclude: string[] = []
): Promise<PlaceAwarePlan> {
  const base = planTerritory(input, ref, support, exclude);
  const placeResolutions: PlaceResolution[] = [];
  const ambiguousPlaces: AmbiguousPlace[] = [];
  const extraUnits: string[] = [];

  for (const u of base.unresolved) {
    if (u.status !== "pending_data") continue;
    const token = u.original.value;
    if (!PLACE_LIKE.test(token)) continue;
    const cands = await resolvePlaceName(db, token);
    if (cands.length === 0) continue;
    if (cands.length === 1) { placeResolutions.push({ token, candidate: cands[0] }); extraUnits.push(...cands[0].districts); }
    else ambiguousPlaces.push({ token, candidates: cands });
  }

  const excl = new Set(exclude.map((e) => e.toUpperCase().replace(/\s+/g, "")));
  const queryUnits = [...new Set([...base.queryUnits, ...extraUnits.map((d) => d.toUpperCase())])]
    .filter((u) => !excl.has(u.replace(/\s+/g, "")));

  return { ...base, queryUnits, placeResolutions, ambiguousPlaces };
}
