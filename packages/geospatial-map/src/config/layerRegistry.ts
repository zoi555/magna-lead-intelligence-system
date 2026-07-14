// Control-drawer registry + the single profile→layer-visibility mapping used by both
// the initial style and runtime toggles. Sections match Part 14. Availability is honest:
// private roads / tracks are marked unavailable unless a supplemental source provides them.

import type { MapProfile, MapControlCapabilities } from "../types";

const on = (m: string | boolean) => (m === true || m === "automatic" || m === "show");

/** Map a profile to the visibility of every toggleable style layer id. Motorway
 *  layers are ALWAYS visible and are intentionally omitted (they cannot be toggled). */
export function layerVisibilityForProfile(p: MapProfile): Record<string, boolean> {
  return {
    // environment
    "env-woodland": p.environment.woodland,
    "env-greenspace": p.environment.greenspace,
    "zs-sea": p.environment.water, "env-water-surface": p.environment.water, "env-water-lines": p.environment.water,
    "env-buildings": p.environment.buildings,
    "env-funcsite": p.environment.functionalSites,
    // transport
    "transport-rail": p.transport.railways,
    "label-station": p.transport.stations && p.labels.railwayStations,
    // roads
    "road-a-primary": p.roads.primaryARoads,
    "road-a-other": p.roads.allARoads,
    "road-b": on(p.roads.bRoads),
    "road-minor": on(p.roads.localRoads), "road-local": on(p.roads.localRoads), "road-localaccess": on(p.roads.localRoads),
    "road-restricted": on(p.roads.localRoads), "road-secondary-access": on(p.roads.localRoads),
    "road-track": on(p.roads.privateAndTracks), "road-private-restricted": on(p.roads.privateAndTracks),
    "feeder-highlight": p.feederRoads.showFeeders,
    // labels
    "label-city": p.labels.cities, "label-town": p.labels.towns,
    "label-village": on(p.labels.villages), "label-locality": on(p.labels.localities),
    "label-a-num": p.labels.aRoadNumbers, "label-b-num": on(p.labels.bRoadNumbers),
    "label-road-name": on(p.labels.roadNames),
    // postcodes
    "pc-points": p.postcodes.points,
    "label-pc-area": on(p.labels.postcodeAreas), "label-pc-district": on(p.labels.postcodeDistricts), "label-pc-sector": on(p.labels.postcodeSectors),
  };
}

export type ProfilePatch = (p: MapProfile) => void;
export interface DrawerControl {
  id: string; label: string; get: (p: MapProfile) => boolean; set: ProfilePatch & ((p: MapProfile, v: boolean) => void);
  locked?: boolean; availability: "available" | "unavailable"; note?: string;
}
export interface DrawerSection { id: keyof MapControlCapabilities; title: string; controls: DrawerControl[] }

const b = (id: string, label: string, get: (p: MapProfile) => boolean, set: (p: MapProfile, v: boolean) => void, extra: Partial<DrawerControl> = {}): DrawerControl =>
  ({ id, label, get, set: set as DrawerControl["set"], availability: "available", ...extra });
const tri = (m: "automatic" | "show" | "hide", v: boolean): "automatic" | "hide" => (v ? "automatic" : "hide");

export const CONTROL_SECTIONS: DrawerSection[] = [
  { id: "roads", title: "Roads", controls: [
    b("motorways", "Motorways", () => true, () => {}, { locked: true, note: "Always visible — cannot be disabled." }),
    b("feeder", "Feeder roads", (p) => p.feederRoads.showFeeders, (p, v) => { p.feederRoads.showFeeders = v; }, { note: "On by default. Configured in the feeder panel." }),
    b("aPrimary", "Primary A roads", (p) => p.roads.primaryARoads, (p, v) => { p.roads.primaryARoads = v; }),
    b("aAll", "All A roads", (p) => p.roads.allARoads, (p, v) => { p.roads.allARoads = v; }),
    b("bRoads", "B roads", (p) => on(p.roads.bRoads), (p, v) => { p.roads.bRoads = tri(p.roads.bRoads, v); }, { note: "Zoom + user controlled." }),
    b("local", "Local / unclassified roads", (p) => on(p.roads.localRoads), (p, v) => { p.roads.localRoads = tri(p.roads.localRoads, v); }, { note: "Appear at closer zooms." }),
    b("private", "Private roads / tracks", (p) => on(p.roads.privateAndTracks), (p, v) => { p.roads.privateAndTracks = tri(p.roads.privateAndTracks, v); }, { availability: "unavailable", note: "Not in the free OS Open source (premium/supplemental only)." }),
  ] },
  { id: "placesAndLabels", title: "Places & labels", controls: [
    b("cities", "Cities", (p) => p.labels.cities, (p, v) => { p.labels.cities = v; }),
    b("towns", "Towns", (p) => p.labels.towns, (p, v) => { p.labels.towns = v; }),
    b("villages", "Villages & localities", (p) => on(p.labels.villages), (p, v) => { p.labels.villages = tri(p.labels.villages, v); p.labels.localities = tri(p.labels.localities, v); }),
    b("aNum", "Road-number labels", (p) => p.labels.aRoadNumbers, (p, v) => { p.labels.aRoadNumbers = v; p.labels.bRoadNumbers = tri(p.labels.bRoadNumbers, v); }, { note: "Motorway numbers are always on." }),
    b("roadNames", "Road-name / street labels", (p) => on(p.labels.roadNames), (p, v) => { p.labels.roadNames = tri(p.labels.roadNames, v); }, { note: "Appear at close zoom." }),
  ] },
  { id: "postcodes", title: "Postcodes", controls: [
    b("pcArea", "Postcode areas", (p) => on(p.labels.postcodeAreas), (p, v) => { p.labels.postcodeAreas = tri(p.labels.postcodeAreas, v); }),
    b("pcDistrict", "Postcode districts (outcodes)", (p) => on(p.labels.postcodeDistricts), (p, v) => { p.labels.postcodeDistricts = tri(p.labels.postcodeDistricts, v); }),
    b("pcSector", "Postcode sectors", (p) => on(p.labels.postcodeSectors), (p, v) => { p.labels.postcodeSectors = tri(p.labels.postcodeSectors, v); }),
    b("pcPoints", "Postcode points", (p) => p.postcodes.points, (p, v) => { p.postcodes.points = v; }, { note: "Full postcodes shown on hover / selection." }),
  ] },
  { id: "transport", title: "Transport", controls: [
    b("railways", "Railways", (p) => p.transport.railways, (p, v) => { p.transport.railways = v; }),
    b("stations", "Railway stations", (p) => p.transport.stations, (p, v) => { p.transport.stations = v; }),
  ] },
  { id: "environment", title: "Environment", controls: [
    b("greenspace", "Greenspace", (p) => p.environment.greenspace, (p, v) => { p.environment.greenspace = v; }),
    b("woodland", "Woodland", (p) => p.environment.woodland, (p, v) => { p.environment.woodland = v; }),
    b("water", "Water", (p) => p.environment.water, (p, v) => { p.environment.water = v; }),
    b("buildings", "Buildings", (p) => p.environment.buildings, (p, v) => { p.environment.buildings = v; }),
    b("funcsites", "Functional sites", (p) => p.environment.functionalSites, (p, v) => { p.environment.functionalSites = v; }),
  ] },
];
