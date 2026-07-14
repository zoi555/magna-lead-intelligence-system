// Portable map package invariants — npm run test:map
import {
  createDefaultMapProfile, validateMapProfile, mergeMapProfiles, serialiseMapProfile, deserialiseMapProfile,
  validateRoadCoverage, motorwayLocked, ROAD_CLASS_MAPPINGS, layerVisibilityForProfile, CONTROL_SECTIONS,
  buildMapSources,
} from "@geospatial-map";
import type { GeospatialSourceConfig, MapProfile } from "@geospatial-map";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

console.log("Map package invariants:");

// motorways cannot be disabled
assert(motorwayLocked(), "motorways are locked visible in the road registry");
const p = createDefaultMapProfile();
assert(p.roads.motorwaysVisible === true && p.labels.motorwayNumbers === true, "default profile has motorways + motorway numbers on");
const forced = validateMapProfile({ ...p, roads: { ...p.roads, motorwaysVisible: false }, labels: { ...p.labels, motorwayNumbers: false } });
assert(forced.profile.roads.motorwaysVisible === true && forced.profile.labels.motorwayNumbers === true, "malformed profile: motorways/motorway-numbers FORCED back on (locked)");
assert(forced.warnings.length >= 2, "forcing locked fields produces warnings");

// every source road class maps or documented
assert(validateRoadCoverage(ROAD_CLASS_MAPPINGS.map((m) => m.sourceClass)).ok, "every registered source road class maps to a style");
assert(validateRoadCoverage(["Totally Made Up Road"]).ok === false, "unknown road class fails coverage (test fails on unmapped)");

// label defaults + postcode labels are NOT tied to operational data
assert(p.labels.postcodeAreas === "automatic" && p.labels.postcodeDistricts === "automatic", "postcode labels default automatic (geography-driven)");
const layerVis = layerVisibilityForProfile(p);
assert(!("road-motorway" in layerVis) && !("label-motorway-num" in layerVis), "motorway layers are NOT in the toggleable set (cannot be turned off)");
assert(layerVis["label-pc-district"] === true, "postcode district labels visible from the profile alone (no lead dependency)");

// profile serialisation + merge
const round = deserialiseMapProfile(serialiseMapProfile(p));
assert(JSON.stringify(round) === JSON.stringify(p), "profile serialise → deserialise round-trips");
const merged = mergeMapProfiles(p, { postcodes: { areas: false, districts: false, sectors: true, points: true } });
assert(merged.postcodes.sectors === true && merged.roads.motorwaysVisible === true, "merge applies override AND re-forces locked fields");
assert(deserialiseMapProfile("not json{").roads.motorwaysVisible === true, "malformed JSON recovers to a valid default profile");

// control drawer honesty
const roads = CONTROL_SECTIONS.find((s) => s.id === "roads")!;
assert(roads.controls.find((c) => c.id === "motorways")!.locked === true, "motorway control is locked in the drawer");
assert(roads.controls.find((c) => c.id === "private")!.availability === "unavailable", "private roads/tracks honestly marked unavailable");

// minimal reuse — a generic source config with NO application fields instantiates
const minimal: GeospatialSourceConfig = {
  tileBaseUrl: "https://cdn.example/tiles", glyphBaseUrl: "https://cdn.example/fonts/{fontstack}/{range}.pbf",
  sources: { zoomstack: "zoomstack.pmtiles", openRoads: "openroads.pmtiles" },
  attribution: [{ text: "© OS" }],
};
const style = buildMapSources(minimal) as Record<string, unknown>;
assert(!!style["zoomstack"] && !!style["selection"] && !!style["feeders"], "buildMapSources works from a minimal generic config (portable)");
const prod: MapProfile = mergeMapProfiles(createDefaultMapProfile(), {});
assert(prod.version === 1, "profile version pinned at 1");

console.log(fails === 0 ? "\nAll map-package invariants passed ✓" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
