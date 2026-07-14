// National geospatial ACQUISITION CATALOGUE — AspectLead.
//
// Verified against the OS Downloads API (api.os.uk/downloads/v1) on 2026-07-14.
// These are the free, OGL v3.0, Great Britain OS OpenData products required for a
// complete national map, with their CONFIRMED upstream versions, formats and sizes,
// the exact download endpoint, and the conversion steps to browser-deliverable tiles.
//
// STATUS: reachable + catalogued, NOT imported. Integration requires (a) GDAL/ogr2ogr,
// tippecanoe and pmtiles (absent in the current environment) and (b) object storage —
// OGL data of this size must NOT be committed to git. Until imported + verified, the
// product must NOT describe the map as national. Run scripts/acquire-national-geo.sh
// in an environment with the tools to perform the acquisition + conversion.

export interface NationalDatasetCatalogueEntry {
  osProductId: string;      // OS Downloads API product id
  name: string;
  osVersion: string;        // confirmed upstream version
  verifiedAt: string;       // when we queried the OS Downloads API
  licence: "OGL v3.0";
  coverage: "Great Britain";
  formats: string[];        // formats offered upstream
  chosenFormat: string;     // format we will download
  maxSizeMB: number;        // largest offered format size (indicative)
  downloadApi: string;      // scriptable OS Downloads API endpoint (append &redirect to stream)
  runtimeTarget: string;    // browser delivery form
  feeds: string[];          // which map layers this dataset supplies
  conversionSteps: string[];
  repoStorable: false;      // never committed — object storage only
}

const API = "https://api.os.uk/downloads/v1/products";
const dl = (id: string, fmt: string) => `${API}/${id}/downloads?area=GB&format=${encodeURIComponent(fmt)}&redirect`;

export const NATIONAL_CATALOGUE: NationalDatasetCatalogueEntry[] = [
  {
    osProductId: "OpenZoomstack", name: "OS Open Zoomstack", osVersion: "2026-06", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["GeoPackage", "Vector Tiles"], chosenFormat: "Vector Tiles", maxSizeMB: 4301,
    downloadApi: dl("OpenZoomstack", "Vector Tiles"),
    runtimeTarget: "MBTiles → PMTiles (national basemap)",
    feeds: ["national basemap", "land", "water", "greenspace", "woodland", "buildings", "railways", "sites", "cities/towns/villages labels"],
    conversionSteps: ["download MBTiles (Vector Tiles format)", "pmtiles convert zoomstack.mbtiles zoomstack.pmtiles", "upload to object storage", "MapLibre: add as vector source, style per map-layer-config"],
    repoStorable: false,
  },
  {
    osProductId: "OpenRoads", name: "OS Open Roads", osVersion: "2026-04", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["ESRI Shapefile", "GML", "GeoPackage", "Vector Tiles"], chosenFormat: "GeoPackage", maxSizeMB: 1347,
    downloadApi: dl("OpenRoads", "GeoPackage"),
    runtimeTarget: "GeoJSONSeq → tippecanoe → MBTiles → PMTiles (all road classes)",
    feeds: ["motorways", "trunk/primary", "A roads", "B roads", "minor/local", "private roads", "tracks", "road numbers/names"],
    conversionSteps: ["ogr2ogr -t_srs EPSG:4326 roads.geojsonl OpenRoads.gpkg RoadLink", "tippecanoe -zg -o roads.mbtiles --coalesce-densest-as-needed roads.geojsonl", "pmtiles convert roads.mbtiles roads.pmtiles", "validate every roadClassification against map-layer-config ROAD_CLASSES (validateRoadCoverage)"],
    repoStorable: false,
  },
  {
    osProductId: "OpenNames", name: "OS Open Names", osVersion: "2026-04", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["CSV", "GML", "GeoPackage"], chosenFormat: "GeoPackage", maxSizeMB: 251,
    downloadApi: dl("OpenNames", "GeoPackage"),
    runtimeTarget: "indexed JSON (search) + PMTiles label points",
    feeds: ["cities", "towns", "villages", "localities", "place search"],
    conversionSteps: ["ogr2ogr -t_srs EPSG:4326 names.geojsonl OpenNames.gpkg", "build a search index (name→lng/lat/type)", "tile label points by populatedPlace type + minzoom"],
    repoStorable: false,
  },
  {
    osProductId: "OpenMapLocal", name: "OS OpenMap Local", osVersion: "2026-04", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["ESRI Shapefile", "GML", "GeoTIFF", "GeoPackage"], chosenFormat: "GeoPackage", maxSizeMB: 15418,
    downloadApi: dl("OpenMapLocal", "GeoPackage"),
    runtimeTarget: "per-theme PMTiles (buildings, sites, stations, surface water)",
    feeds: ["railway stations", "airports", "functional sites", "important buildings", "buildings", "surface water"],
    conversionSteps: ["download ~15GB GeoPackage (largest product — requires disk + time)", "ogr2ogr per theme layer → EPSG:4326", "tippecanoe per theme with zoom-appropriate minzoom", "pmtiles convert per theme"],
    repoStorable: false,
  },
  {
    osProductId: "CodePointOpen", name: "Code-Point Open", osVersion: "2026-05", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["CSV", "GeoPackage"], chosenFormat: "GeoPackage", maxSizeMB: 56,
    downloadApi: dl("CodePointOpen", "GeoPackage"),
    runtimeTarget: "PMTiles point layer (full postcode points) + derived area/district/sector polygons",
    feeds: ["full-postcode points", "postcode area/district/sector reference geometry"],
    conversionSteps: ["ogr2ogr -t_srs EPSG:4326 codepoint.geojsonl CodePointOpen.gpkg (BNG→WGS84)", "derive area/district/sector aggregations", "tippecanoe points → PMTiles (minzoom for point layer)"],
    repoStorable: false,
  },
  {
    osProductId: "OpenGreenspace", name: "OS Open Greenspace", osVersion: "2026-04", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["ESRI Shapefile", "GML", "GeoPackage", "Vector Tiles"], chosenFormat: "Vector Tiles", maxSizeMB: 86,
    downloadApi: dl("OpenGreenspace", "Vector Tiles"),
    runtimeTarget: "PMTiles (greenspace polygons)",
    feeds: ["greenspace", "parks", "playing fields"],
    conversionSteps: ["download Vector Tiles (MBTiles)", "pmtiles convert greenspace.mbtiles greenspace.pmtiles"],
    repoStorable: false,
  },
  {
    osProductId: "OpenRivers", name: "OS Open Rivers", osVersion: "2026-04", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["ESRI Shapefile", "GML", "GeoPackage", "Vector Tiles"], chosenFormat: "Vector Tiles", maxSizeMB: 132,
    downloadApi: dl("OpenRivers", "Vector Tiles"),
    runtimeTarget: "PMTiles (watercourses)",
    feeds: ["water", "rivers", "canals"],
    conversionSteps: ["download Vector Tiles (MBTiles)", "pmtiles convert rivers.mbtiles rivers.pmtiles"],
    repoStorable: false,
  },
  {
    osProductId: "BoundaryLine", name: "Boundary-Line", osVersion: "2026-05", verifiedAt: "2026-07-14",
    licence: "OGL v3.0", coverage: "Great Britain",
    formats: ["ESRI Shapefile", "GML", "GeoPackage", "MapInfo TAB", "Vector Tiles"], chosenFormat: "Vector Tiles", maxSizeMB: 808,
    downloadApi: dl("BoundaryLine", "Vector Tiles"),
    runtimeTarget: "PMTiles (admin/region boundaries — context overlay)",
    feeds: ["countries", "regions", "local authorities", "wards"],
    conversionSteps: ["download Vector Tiles (MBTiles)", "pmtiles convert boundaryline.mbtiles boundaryline.pmtiles"],
    repoStorable: false,
  },
];

// Separate, non-OS source (ONS Open Geography Portal) — postcode → admin lookup + national expansion.
export const ONSPD_SOURCE = {
  name: "ONS Postcode Directory (ONSPD)", provider: "Office for National Statistics",
  licence: "OGL v3.0", coverage: "United Kingdom", verifiedAt: "2026-07-14",
  portal: "https://geoportal.statistics.gov.uk/ (ONSPD — search 'ONS Postcode Directory')",
  runtimeTarget: "indexed lookup (postcode → area/district/sector, LA, region, lat/lng)",
  note: "Not on the OS Downloads API. Enables national area→district→sector expansion without hardcoding.",
};

export const NATIONAL_ACQUISITION_TOTAL_MB = NATIONAL_CATALOGUE.reduce((n, e) => n + e.maxSizeMB, 0);
export const REQUIRED_TOOLING = ["ogr2ogr (GDAL)", "tippecanoe", "pmtiles", "object storage for tiles"];
