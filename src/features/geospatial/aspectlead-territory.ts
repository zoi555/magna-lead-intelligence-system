// AspectLead application adapter — turn a run's outcode territory (free text) into
// TerritoryGeometry[] the portable map draws as its orange, lightly-filled overlay.
//
// Geometry source: the app's own /map/pc_districts.geojson (Code-Point-Open-derived
// district polygons, a feasibility layer shipped with AspectLead). This is an APPLICATION
// asset, NOT the package's production map source — the package CDN carries postcode
// CENTROID POINTS only. The map package never imports this file.

import { classifyPostcode, areaOf, type TerritoryGeometry } from "@geospatial/map";

interface DistrictFeature { type: "Feature"; properties: { code?: string }; geometry: unknown }
let districtCache: Promise<DistrictFeature[]> | null = null;

async function loadDistricts(): Promise<DistrictFeature[]> {
  if (!districtCache) {
    districtCache = fetch("/map/pc_districts.geojson")
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((g) => (g.features || []) as DistrictFeature[])
      .catch(() => []);
  }
  return districtCache;
}

/** Parse a mixed geography input into area/district tokens using the CANONICAL package
 *  classifier (no duplicated regex). Sectors/units contribute their district. */
export function parseOutcodes(input: string): { areas: string[]; districts: string[] } {
  const toks = (input || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const areas = new Set<string>(); const districts = new Set<string>();
  for (const t of toks) {
    const c = classifyPostcode(t);
    if (c.level === "area") areas.add(c.area);
    else if (c.district) districts.add(c.district);   // district/sector/unit → its district
  }
  return { areas: [...areas], districts: [...districts] };
}

/** True when a district code belongs to a requested area (e.g. "TW3" ∈ area "TW"). */
function districtInArea(code: string, area: string): boolean {
  return areaOf(code) === area;
}

/**
 * Build the run-territory overlay geometry. Returns one TerritoryGeometry per matched
 * district polygon. Empty input (or no geometry match) yields [] — the map clears the
 * territory rather than drawing anything invented.
 */
export async function runTerritoryGeometry(input: string): Promise<TerritoryGeometry[]> {
  const { areas, districts } = parseOutcodes(input);
  if (!areas.length && !districts.length) return [];
  const feats = await loadDistricts();
  const wantExact = new Set(districts);
  const out: TerritoryGeometry[] = [];
  for (const f of feats) {
    const code = f.properties?.code;
    if (!code) continue;
    if (wantExact.has(code) || areas.some((a) => districtInArea(code, a))) {
      out.push({ id: code, label: code, geojson: { geometry: f.geometry } });
    }
  }
  return out;
}
