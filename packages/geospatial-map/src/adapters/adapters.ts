// Extension points — applications plug in their own search, feature-info and tile
// behaviour. Generic defaults are provided so the map works with no application code.

import type { MapSearchResult, MapSearchContext, MapFeatureSelection } from "../types";

/** Pluggable search. Applications may add postcode / place / custom providers. */
export interface MapSearchAdapter {
  search(query: string, context?: MapSearchContext): Promise<MapSearchResult[]>;
}

/** Turns a raw MapLibre feature into a generic selection. Apps may enrich the result. */
export interface FeatureInfoAdapter {
  describe(feature: RawMapFeature): MapFeatureSelection | null;
}

/** Resolves tile/source URLs (e.g. to swap CDN origins per environment). */
export interface TileSourceAdapter {
  resolve(sourceId: string, rawUrl: string): string;
}

export interface RawMapFeature {
  layer: { id: string; source: string; "source-layer"?: string };
  properties: Record<string, unknown>;
  geometry?: { type: string; coordinates: unknown };
}

/** Default feature description — generic identity only, no application semantics. */
export const defaultFeatureInfoAdapter: FeatureInfoAdapter = {
  describe(f) {
    const p = f.properties || {};
    const layerId = f.layer.id;
    let displayName = "";
    let featureType = layerId;
    if (layerId === "pc-hit" || layerId === "pc-points") { displayName = String(p.Postcode || p.postcode || ""); featureType = "postcode"; }
    else if (layerId.startsWith("road-")) { displayName = String(p.road_classification_number || p.name_1 || "Road"); featureType = "road"; }
    else if (layerId === "env-funcsite") { displayName = String(p.distinctive_name || "Functional site"); featureType = "functional_site"; }
    else if (layerId.startsWith("label-")) { displayName = String(p.name1 || p.name || p.code || ""); featureType = "place"; }
    else { displayName = String(p.name1 || p.name || p.code || layerId); }
    if (!displayName) return null;
    return {
      id: String(p.id ?? p.Postcode ?? p.code ?? displayName),
      sourceId: f.layer.source, layerId, featureType, displayName, properties: p,
    };
  },
};

/** A default search adapter over the map's rendered postcode/place/road features. */
export function createDefaultSearchAdapter(getMap: () => { queryRenderedFeatures: (opts: { layers: string[] }) => RawMapFeature[]; getLayer: (id: string) => unknown } | null): MapSearchAdapter {
  return {
    async search(query) {
      const map = getMap(); if (!map || !query.trim()) return [];
      const q = query.trim().toLowerCase();
      const layers = ["label-pc-district", "label-pc-sector", "label-pc-area", "label-city", "label-town", "label-village"].filter((l) => map.getLayer(l));
      const seen = new Set<string>(); const out: MapSearchResult[] = [];
      for (const f of map.queryRenderedFeatures({ layers })) {
        const p = f.properties || {};
        const label = String(p.code || p.name1 || "");
        if (!label || !label.toLowerCase().includes(q) || seen.has(label)) continue;
        seen.add(label);
        const g = (f.geometry as { type: string; coordinates: [number, number] } | undefined);
        if (!g || g.type !== "Point") continue;
        out.push({ id: label, type: f.layer.id.includes("pc") ? "postcode_district" : "town", label, longitude: g.coordinates[0], latitude: g.coordinates[1], zoom: 12 });
        if (out.length >= 12) break;
      }
      return out;
    },
  };
}
