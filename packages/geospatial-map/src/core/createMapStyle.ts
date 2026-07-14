// Build a MapLibre style from a GeospatialSourceConfig + MapProfile.
// Generic: no application data. Roads/labels/postcodes/environment visibility all
// derive from the profile; motorways + motorway numbers are always on (locked).

import type { GeospatialSourceConfig, MapProfile } from "../types";
import { ROAD_CLASS_MAPPINGS } from "../config/roadRules";

const FONT = ["Open Sans Regular"];
const FONT_BOLD = ["Open Sans Bold"];

const PALETTE = {
  land: "#eef1ee", sea: "#cfe0ea", water: "#bcd6e6", foreshore: "#e9e4d4",
  woodland: "#cfe0c6", greenspace: "#dcead0", nationalPark: "#e6efdc", urban: "#e7e6e2",
  building: "#dcdad2", site: "#e9e7e0", funcsite: "#e4dcc4", rail: "#9aa0a6",
  boundary: "#c8b6cf", postcode: "#6b4fa0", label: "#3a3a3a", halo: "#ffffff",
  roadNum: "#1f4e79", pcLabel: "#7c5fb0",
};

const vis = (on: boolean) => (on ? "visible" : "none");
const auto = (m: "automatic" | "show" | "hide") => (m === "hide" ? "none" : "visible");

function resolve(base: string, name?: string): string | null {
  if (!name) return null;
  if (/^https?:\/\//.test(name) || name.startsWith("/")) return name;
  return `${base.replace(/\/$/, "")}/${name}`;
}

export function buildMapSources(cfg: GeospatialSourceConfig): Record<string, unknown> {
  const s = cfg.sources; const b = cfg.tileBaseUrl;
  const attribution = cfg.attribution.map((a) => a.text).join(" · ");
  const out: Record<string, unknown> = {};
  const pm = (id: string, name?: string) => { const u = resolve(b, name); if (u) out[id] = { type: "vector", url: `pmtiles://${u}`, attribution }; };
  const gj = (id: string, name?: string) => { const u = resolve(b, name); if (u) out[id] = { type: "geojson", data: u, attribution }; };
  pm("zoomstack", s.zoomstack); pm("openroads", s.openRoads); pm("codepoint", s.codePoint);
  pm("funcsite", s.openMapLocal); pm("greenspace", s.greenspace); pm("rivers", s.rivers); pm("boundaryline", s.boundaryLine);
  gj("pclabels", s.postcodeLabels);
  out["selection"] = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  out["hover"] = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  out["feeders"] = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  return out;
}

const C = (id: string) => ROAD_CLASS_MAPPINGS.find((r) => r.sourceClass === id)!;
const roadFilter = (cls: string) => ["any", ["==", ["get", "road_function"], cls], ["==", ["get", "road_classification"], cls]];
const wexpr = (rc: ReturnType<typeof C>) => ["interpolate", ["linear"], ["zoom"], rc.minZoom, rc.width[0], rc.maxZoom ?? 22, rc.width[1]] as unknown;

export function createMapStyle(cfg: GeospatialSourceConfig, profile: MapProfile): Record<string, unknown> {
  const p = profile;
  const layers: Record<string, unknown>[] = [
    { id: "bg", type: "background", paint: { "background-color": PALETTE.land } },
    { id: "zs-sea", type: "fill", source: "zoomstack", "source-layer": "sea", layout: { visibility: vis(p.environment.water) }, paint: { "fill-color": PALETTE.sea } },
    { id: "zs-foreshore", type: "fill", source: "zoomstack", "source-layer": "foreshore", paint: { "fill-color": PALETTE.foreshore } },
    { id: "env-woodland", type: "fill", source: "zoomstack", "source-layer": "woodland", layout: { visibility: vis(p.environment.woodland) }, paint: { "fill-color": PALETTE.woodland } },
    { id: "zs-nationalparks", type: "fill", source: "zoomstack", "source-layer": "national_parks", paint: { "fill-color": PALETTE.nationalPark, "fill-opacity": 0.5 } },
    { id: "env-greenspace", type: "fill", source: "zoomstack", "source-layer": "greenspaces", layout: { visibility: vis(p.environment.greenspace) }, paint: { "fill-color": PALETTE.greenspace } },
    { id: "env-water-surface", type: "fill", source: "zoomstack", "source-layer": "surfacewater", layout: { visibility: vis(p.environment.water) }, paint: { "fill-color": PALETTE.water } },
    { id: "zs-urban", type: "fill", source: "zoomstack", "source-layer": "urban_areas", paint: { "fill-color": PALETTE.urban, "fill-opacity": 0.55 } },
    { id: "zs-sites", type: "fill", source: "zoomstack", "source-layer": "sites", paint: { "fill-color": PALETTE.site } },
    { id: "env-funcsite", type: "fill", source: "funcsite", "source-layer": "functional_site", minzoom: 12, layout: { visibility: vis(p.environment.functionalSites) }, paint: { "fill-color": PALETTE.funcsite, "fill-opacity": 0.6 } },
    { id: "env-water-lines", type: "line", source: "zoomstack", "source-layer": "waterlines", layout: { visibility: vis(p.environment.water) }, paint: { "line-color": PALETTE.water, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 14, 1.6] } },
    { id: "env-buildings", type: "fill", source: "zoomstack", "source-layer": "buildings", minzoom: 13, layout: { visibility: vis(p.environment.buildings) }, paint: { "fill-color": PALETTE.building } },
    { id: "zs-boundaries", type: "line", source: "zoomstack", "source-layer": "boundaries", paint: { "line-color": PALETTE.boundary, "line-dasharray": [3, 2], "line-opacity": 0.6 } },
    { id: "transport-rail", type: "line", source: "zoomstack", "source-layer": "rail", layout: { visibility: vis(p.transport.railways) }, paint: { "line-color": PALETTE.rail, "line-dasharray": [2, 2], "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 14, 1.4] } },
    // roads (minor→motorway; motorway drawn last/top)
    { id: "road-track", type: "line", source: "openroads", "source-layer": "roads", minzoom: 15, layout: { visibility: auto(p.roads.privateAndTracks) }, paint: { "line-color": C("Track").colour, "line-width": wexpr(C("Track")) } },
    { id: "road-private-restricted", type: "line", source: "openroads", "source-layer": "roads", minzoom: 17, filter: roadFilter("Private Road - Restricted Access"), layout: { visibility: auto(p.roads.privateAndTracks) }, paint: { "line-color": C("Private Road - Restricted Access").colour, "line-width": wexpr(C("Private Road - Restricted Access")) } },
    { id: "road-secondary-access", type: "line", source: "openroads", "source-layer": "roads", minzoom: 16, filter: roadFilter("Secondary Access Road"), layout: { visibility: auto(p.roads.localRoads) }, paint: { "line-color": C("Secondary Access Road").colour, "line-width": wexpr(C("Secondary Access Road")) } },
    { id: "road-restricted", type: "line", source: "openroads", "source-layer": "roads", minzoom: 16, filter: roadFilter("Restricted Local Access Road"), layout: { visibility: auto(p.roads.localRoads) }, paint: { "line-color": C("Restricted Local Access Road").colour, "line-width": wexpr(C("Restricted Local Access Road")) } },
    { id: "road-localaccess", type: "line", source: "openroads", "source-layer": "roads", minzoom: 15, filter: roadFilter("Local Access Road"), layout: { visibility: auto(p.roads.localRoads) }, paint: { "line-color": C("Local Access Road").colour, "line-width": wexpr(C("Local Access Road")) } },
    { id: "road-local", type: "line", source: "openroads", "source-layer": "roads", minzoom: 14, filter: roadFilter("Local Road"), layout: { visibility: auto(p.roads.localRoads) }, paint: { "line-color": C("Local Road").colour, "line-width": wexpr(C("Local Road")) } },
    { id: "road-minor", type: "line", source: "openroads", "source-layer": "roads", minzoom: 13, filter: roadFilter("Minor Road"), layout: { visibility: auto(p.roads.localRoads) }, paint: { "line-color": C("Minor Road").colour, "line-width": wexpr(C("Minor Road")) } },
    { id: "road-b", type: "line", source: "openroads", "source-layer": "roads", minzoom: 11, filter: roadFilter("B Road"), layout: { visibility: auto(p.roads.bRoads) }, paint: { "line-color": C("B Road").colour, "line-width": wexpr(C("B Road")) } },
    { id: "road-a-other", type: "line", source: "openroads", "source-layer": "roads", minzoom: 7, filter: ["all", roadFilter("A Road"), ["!=", ["to-boolean", ["get", "primary_route"]], true]], layout: { visibility: vis(p.roads.allARoads) }, paint: { "line-color": C("A Road").colour, "line-width": wexpr(C("A Road")) } },
    { id: "road-a-primary", type: "line", source: "openroads", "source-layer": "roads", minzoom: 6, filter: ["all", roadFilter("A Road"), ["==", ["to-boolean", ["get", "primary_route"]], true]], layout: { visibility: vis(p.roads.primaryARoads) }, paint: { "line-color": "#3f8f5b", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 14, 3.4] } },
    { id: "feeder-highlight", type: "line", source: "feeders", layout: { "line-cap": "round", visibility: vis(p.feederRoads.showFeeders) }, paint: { "line-color": p.feederRoads.highlightColour, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 14, 5], "line-opacity": 0.85 } },
    { id: "road-motorway", type: "line", source: "openroads", "source-layer": "roads", minzoom: 5, filter: roadFilter("Motorway"), paint: { "line-color": C("Motorway").colour, "line-width": wexpr(C("Motorway")) } }, // LOCKED: no visibility=none
    // selection / hover
    { id: "hover-line", type: "line", source: "hover", paint: { "line-color": "#111827", "line-width": 2.5, "line-opacity": 0.7 } },
    { id: "selection-line", type: "line", source: "selection", paint: { "line-color": "#ea580c", "line-width": 3 } },
    { id: "selection-fill", type: "fill", source: "selection", paint: { "fill-color": "#ea580c", "fill-opacity": 0.08 } },
    { id: "pc-points", type: "circle", source: "codepoint", "source-layer": "codepoint", minzoom: 12, layout: { visibility: vis(p.postcodes.points) }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 2.4], "circle-color": PALETTE.postcode, "circle-opacity": 0.5 } },
    // labels
    lbl("label-pc-area", "pclabels", ["==", ["get", "level"], "area"], "code", FONT_BOLD, 6, PALETTE.pcLabel, [12, 15], auto(p.labels.postcodeAreas)),
    lbl("label-pc-district", "pclabels", ["==", ["get", "level"], "district"], "code", FONT_BOLD, 10, PALETTE.pcLabel, [10, 13], auto(p.labels.postcodeDistricts)),
    lbl("label-pc-sector", "pclabels", ["==", ["get", "level"], "sector"], "code", FONT, 13, PALETTE.pcLabel, [9, 12], auto(p.labels.postcodeSectors)),
    place("label-locality", ["in", ["get", "type"], ["literal", ["Hamlet", "Other Settlement", "Suburban Area"]]], 13, [9, 11], FONT, auto(p.labels.localities)),
    place("label-village", ["==", ["get", "type"], "Village"], 12, [10, 12], FONT, auto(p.labels.villages)),
    place("label-town", ["==", ["get", "type"], "Town"], 9, [11, 15], FONT_BOLD, vis(p.labels.towns)),
    place("label-city", ["==", ["get", "type"], "City"], 5, [13, 20], FONT_BOLD, vis(p.labels.cities)),
    station("label-station", 12, vis(p.transport.stations && p.labels.railwayStations)),
    roadNum("label-b-num", roadFilter("B Road"), 12, auto(p.labels.bRoadNumbers)),
    roadNum("label-a-num", roadFilter("A Road"), 10, vis(p.labels.aRoadNumbers)),
    roadName("label-road-name", ["any", roadFilter("A Road"), roadFilter("B Road"), roadFilter("Local Road"), roadFilter("Minor Road")], 14, auto(p.labels.roadNames)),
    roadNum("label-motorway-num", roadFilter("Motorway"), 6, "visible"), // LOCKED
  ];
  return { version: 8, glyphs: cfg.glyphBaseUrl, sources: buildMapSources(cfg), layers };
}

function lbl(id: string, source: string, filter: unknown, field: string, font: string[], minzoom: number, color: string, size: [number, number], visibility: string): Record<string, unknown> {
  return { id, type: "symbol", source, filter, minzoom, layout: { "text-field": ["get", field], "text-font": font, "text-size": ["interpolate", ["linear"], ["zoom"], minzoom, size[0], 22, size[1]], "text-padding": 4, "text-allow-overlap": false, visibility }, paint: { "text-color": color, "text-halo-color": PALETTE.halo, "text-halo-width": 1.4 } };
}
function place(id: string, filter: unknown, minzoom: number, size: [number, number], font: string[], visibility: string): Record<string, unknown> {
  return { id, type: "symbol", source: "zoomstack", "source-layer": "names", filter, minzoom, layout: { "text-field": ["get", "name1"], "text-font": font, "text-size": ["interpolate", ["linear"], ["zoom"], minzoom, size[0], 14, size[1]], "text-padding": 6, "text-allow-overlap": false, "text-max-width": 7, visibility }, paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.halo, "text-halo-width": 1.6 } };
}
function station(id: string, minzoom: number, visibility: string): Record<string, unknown> {
  return { id, type: "symbol", source: "zoomstack", "source-layer": "railwaystations", minzoom, layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 10, "text-offset": [0, 0.6], "text-anchor": "top", "text-allow-overlap": false, visibility }, paint: { "text-color": "#7a5a2a", "text-halo-color": PALETTE.halo, "text-halo-width": 1.4 } };
}
function roadNum(id: string, filter: unknown, minzoom: number, visibility: string): Record<string, unknown> {
  return { id, type: "symbol", source: "openroads", "source-layer": "roads", filter, minzoom, layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "road_classification_number"], ""], "text-font": FONT_BOLD, "text-size": 10, "symbol-spacing": 240, "text-allow-overlap": false, visibility }, paint: { "text-color": PALETTE.roadNum, "text-halo-color": PALETTE.halo, "text-halo-width": 1.6 } };
}
function roadName(id: string, filter: unknown, minzoom: number, visibility: string): Record<string, unknown> {
  return { id, type: "symbol", source: "openroads", "source-layer": "roads", filter, minzoom, layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name_1"], ""], "text-font": FONT, "text-size": 10, "symbol-spacing": 300, visibility }, paint: { "text-color": "#333", "text-halo-color": PALETTE.halo, "text-halo-width": 1.4 } };
}
