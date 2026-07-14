// AspectLead application adapter — geospatial source configuration.
// Thin glue between the portable @geospatial/map package and this app's asset hosting.
// Environment-configurable; no hardcoded localhost.
//
//   NEXT_PUBLIC_MAP_ASSET_BASE_URL  → e.g. "/map" (dev) or "https://cdn.example/aspectlead-map" (prod)

import type { GeospatialSourceConfig } from "@geospatial-map";

const ASSET_BASE = (process.env.NEXT_PUBLIC_MAP_ASSET_BASE_URL || "/map").replace(/\/$/, "");

export function aspectleadSourceConfig(): GeospatialSourceConfig {
  return {
    tileBaseUrl: `${ASSET_BASE}/tiles`,
    glyphBaseUrl: `${ASSET_BASE}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      zoomstack: "zoomstack.pmtiles",
      openRoads: "openroads.pmtiles",
      codePoint: "codepoint.pmtiles",
      openMapLocal: "funcsite.pmtiles",
      greenspace: "opengreenspace.pmtiles",
      rivers: "openrivers.pmtiles",
      boundaryLine: "boundaryline.pmtiles",
      postcodeLabels: `${ASSET_BASE}/postcode_labels.geojson`,
    },
    attribution: [
      { text: "Contains OS data © Crown copyright and database right 2026", url: "https://www.ordnancesurvey.co.uk/" },
      { text: "Open Government Licence v3.0", url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" },
    ],
  };
}

export const NATIONAL_INITIAL_VIEW = { longitude: -2.9, latitude: 54.3, zoom: 5.2 };
