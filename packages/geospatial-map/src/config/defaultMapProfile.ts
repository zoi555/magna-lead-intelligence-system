// Serialisable, validatable, mergeable MapProfile.
// The default is a generic national browsing profile — NOT tied to any application.

import type { MapProfile } from "../types";

export function createDefaultMapProfile(): MapProfile {
  return {
    version: 1,
    roads: { motorwaysVisible: true, primaryARoads: true, allARoads: true, bRoads: "automatic", localRoads: "automatic", privateAndTracks: "automatic" },
    feederRoads: { showFeeders: true, highlightColour: "#d9772b" },
    labels: {
      cities: true, towns: true, villages: "automatic", localities: "automatic",
      motorwayNumbers: true, aRoadNumbers: true, bRoadNumbers: "automatic",
      roadNames: "automatic", streetNames: "automatic", railwayStations: true,
      postcodeAreas: "automatic", postcodeDistricts: "automatic", postcodeSectors: "automatic",
      fullPostcode: "hover_and_selection", density: "dense",
    },
    postcodes: { areas: true, districts: true, sectors: false, points: false },
    transport: { railways: true, stations: true },
    environment: { greenspace: true, woodland: true, water: true, buildings: true, functionalSites: true },
    labelDensity: "dense",
  };
}

export interface ProfileValidation { ok: boolean; errors: string[]; warnings: string[]; profile: MapProfile }

/**
 * Validate + repair a profile. Locked invariants (motorways visible, motorway
 * numbers on) are FORCED true and reported if they were wrong — a malformed
 * profile is recovered rather than rejected.
 */
export function validateMapProfile(input: unknown): ProfileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = createDefaultMapProfile();
  // Inspect the RAW input for locked-field violations before the merge re-forces them.
  const raw = (input && typeof input === "object" ? input : {}) as { roads?: { motorwaysVisible?: unknown }; labels?: { motorwayNumbers?: unknown }; version?: unknown };
  if (raw.roads?.motorwaysVisible === false) warnings.push("motorwaysVisible was false — forced on (locked).");
  if (raw.labels?.motorwayNumbers === false) warnings.push("labels.motorwayNumbers was false — forced on (locked).");
  if (raw.version != null && raw.version !== 1) warnings.push(`Unknown profile version ${String(raw.version)}; treated as 1.`);
  let p: MapProfile;
  try {
    p = mergeMapProfiles(base, (input as Partial<MapProfile>) || {}); // merge re-forces the locked fields
  } catch {
    errors.push("Profile could not be parsed; default substituted.");
    return { ok: false, errors, warnings, profile: base };
  }
  return { ok: errors.length === 0, errors, warnings, profile: p };
}

/** Deep-merge an override onto a base profile (override wins; locked fields re-forced). */
export function mergeMapProfiles(base: MapProfile, override: Partial<MapProfile>): MapProfile {
  const merged: MapProfile = {
    version: 1,
    roads: { ...base.roads, ...(override.roads || {}), motorwaysVisible: true },
    feederRoads: { ...base.feederRoads, ...(override.feederRoads || {}) },
    labels: { ...base.labels, ...(override.labels || {}), motorwayNumbers: true },
    postcodes: { ...base.postcodes, ...(override.postcodes || {}) },
    transport: { ...base.transport, ...(override.transport || {}) },
    environment: { ...base.environment, ...(override.environment || {}) },
    labelDensity: override.labelDensity ?? base.labelDensity,
  };
  return merged;
}

export function serialiseMapProfile(p: MapProfile): string { return JSON.stringify(p); }
export function deserialiseMapProfile(json: string): MapProfile {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { parsed = null; } // malformed → recover to default
  return validateMapProfile(parsed).profile;
}
