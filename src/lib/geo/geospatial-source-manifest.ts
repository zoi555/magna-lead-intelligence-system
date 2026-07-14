// National geospatial source manifest — AspectLead Lead Intelligence Platform.
//
// This is the SINGLE SOURCE OF TRUTH for which geospatial datasets the product has,
// their coverage, licence and readiness. It is deliberately honest: datasets that are
// not present are marked `missing`/`partial`/`licence_review` — the product must never
// claim national coverage it does not hold. See docs/data-sources/geospatial-source-register.md.

export type GeospatialSourceManifest = {
  id: string;
  name: string;
  provider: string;
  purpose: string[];
  geographicCoverage: string;
  version: string | null;
  publishedAt: string | null;
  importedAt: string | null;
  nativeProjection: string | null;
  outputProjection: string | null;
  sourceFormat: string[];
  runtimeFormat: string[];
  licenceName: string | null;
  licenceReference: string | null;
  redistributionAllowed: boolean | null;
  repositoryStorageAllowed: boolean | null;
  localPath: string | null;
  status: "available" | "partial" | "missing" | "licence_review" | "conversion_required";
  notes: string[];
};

const OGL = "Open Government Licence v3.0";
const OGL_REF = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

// Honest inventory as of the current build. `importedAt` null = not yet imported here.
export const GEOSPATIAL_SOURCES: GeospatialSourceManifest[] = [
  {
    id: "os-open-zoomstack",
    name: "OS Open Zoomstack",
    provider: "Ordnance Survey",
    purpose: ["national basemap", "land", "water", "greenspace", "woodland", "buildings", "railways", "sites", "place labels"],
    geographicCoverage: "Great Britain",
    version: "2026-06", publishedAt: "2026-06", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700 (British National Grid)", outputProjection: "EPSG:3857 (Web Mercator)",
    sourceFormat: ["GeoPackage", "Vector Tiles (MBTiles)"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/zoomstack.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["National basemap imported + converted to PMTiles (2.5GB, MVT z0-14, 18 vector layers).", "GB coverage verified 2026-07-14 (Shetland → Cornwall). PMTiles served from object storage / gitignored local path, never committed.", "Provides land/water/greenspace/woodland/buildings/rail/railwaystations/airports/sites/boundaries/place labels."],
  },
  {
    id: "os-open-roads",
    name: "OS Open Roads",
    provider: "Ordnance Survey",
    purpose: ["motorways", "trunk/primary roads", "A roads", "B roads", "local/unclassified roads", "road numbers", "road names"],
    geographicCoverage: "Great Britain (national)",
    version: "2026-04", publishedAt: "2026-04", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:4326 (WGS84)",
    sourceFormat: ["GeoPackage (national oproad_gb.gpkg)"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/openroads.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["National import: 3,961,077 road links tiled to PMTiles (322MB, z5-14).", "ALL road_function classes present: Motorway, A, B, Minor, Local, Local Access, Restricted Local Access, Secondary Access — every class maps to map-layer-config ROAD_CLASSES.", "The regional POC clip (public/map/roads.geojson, A Road + Motorway only) is superseded and must not be used as the production dataset."],
  },
  {
    id: "os-open-names",
    name: "OS Open Names",
    provider: "Ordnance Survey",
    purpose: ["cities", "towns", "villages", "localities", "settlement labels", "place search"],
    geographicCoverage: "Great Britain",
    version: "2026-04", publishedAt: "2026-04", importedAt: "2026-07-14 (downloaded, not yet tiled)",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:4326",
    sourceFormat: ["CSV", "GeoPackage"], runtimeFormat: ["indexed JSON (search) / PMTiles labels"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/downloads/OpenNames.zip (held)", status: "conversion_required",
    notes: ["Downloaded (214MB GeoPackage). On-map place labels are already provided by the Zoomstack 'names' layer.", "OS Open Names remains to be built into a place-SEARCH gazetteer index (name → lng/lat/type). Not required for national map render; needed for the place-search box."],
  },
  {
    id: "os-openmap-local",
    name: "OS OpenMap Local",
    provider: "Ordnance Survey",
    purpose: ["functional sites", "railway stations", "airports", "buildings", "surface water", "important buildings"],
    geographicCoverage: "Great Britain",
    version: "2026-04", publishedAt: "2026-04", importedAt: "2026-07-14 (downloaded, not yet tiled)",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:3857",
    sourceFormat: ["GeoPackage"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/downloads/OpenMapLocal.zip (held, 3.5GB)", status: "conversion_required",
    notes: ["Downloaded (3.5GB GeoPackage). National railwaystations, airports, buildings and sites are ALREADY provided nationally by the Zoomstack basemap layers, so the national map does not depend on this.", "Deferred: OpenMap Local adds higher-detail building footprints + functional-site polygons. Heavy to tile (national buildings); convert per-theme when detail is required."],
  },
  {
    id: "code-point-open",
    name: "Code-Point Open",
    provider: "Ordnance Survey / Royal Mail / ONS",
    purpose: ["full-postcode points", "postcode area/district/sector reference geometry (derived)"],
    geographicCoverage: "Great Britain (national)",
    version: "2026-05", publishedAt: "2026-05", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:4326",
    sourceFormat: ["GeoPackage (national codepo_gb.gpkg)"], runtimeFormat: ["PMTiles point layer"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/codepoint.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["National import: 1,747,841 postcode points tiled to PMTiles (38MB, z10-14).", "Supersedes the regional derived polygons (public/map/pc_*.geojson) as the production postcode source.", "Full-unit POLYGONS remain a separate paid product (see full-postcode-polygons); points are the lawful open representation.", "National area/district/sector expansion still benefits from ONSPD (not yet imported)."],
  },
  {
    id: "os-open-greenspace",
    name: "OS Open Greenspace",
    provider: "Ordnance Survey",
    purpose: ["greenspace", "parks", "playing fields", "access points"],
    geographicCoverage: "Great Britain",
    version: "2026-04", publishedAt: "2026-04", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:3857",
    sourceFormat: ["Vector Tiles (MBTiles)"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/opengreenspace.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["Detailed greenspace overlay (81MB PMTiles, layers greenspace_site + access_point).", "Zoomstack also carries a generalised greenspaces layer; this is the higher-detail overlay."],
  },
  {
    id: "os-open-rivers",
    name: "OS Open Rivers",
    provider: "Ordnance Survey",
    purpose: ["watercourses", "rivers", "canals"],
    geographicCoverage: "Great Britain",
    version: "2026-04", publishedAt: "2026-04", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:3857",
    sourceFormat: ["Vector Tiles (MBTiles)"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/openrivers.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["Detailed watercourse network overlay (126MB PMTiles, layers watercourse_link + hydro_node)."],
  },
  {
    id: "boundary-line",
    name: "Boundary-Line",
    provider: "Ordnance Survey",
    purpose: ["countries", "regions", "counties", "local authorities", "wards", "constituencies"],
    geographicCoverage: "Great Britain",
    version: "2026-05", publishedAt: "2026-05", importedAt: "2026-07-14",
    nativeProjection: "EPSG:27700", outputProjection: "EPSG:3857",
    sourceFormat: ["Vector Tiles (MBTiles)"], runtimeFormat: ["PMTiles"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: "~/Data/aspectlead-geospatial/tiles/boundaryline.pmtiles (served at /map/tiles/, gitignored)", status: "available",
    notes: ["Administrative/region boundary overlay for context (331MB PMTiles, 18 admin layers).", "Boundaries are context only; they never constrain lead territory or national browsing."],
  },
  {
    id: "onspd",
    name: "ONS Postcode Directory (ONSPD/NSPL)",
    provider: "Office for National Statistics",
    purpose: ["postcode → admin/geography lookup", "region/LA/ward linkage", "current/terminated postcode context"],
    geographicCoverage: "United Kingdom",
    version: null, publishedAt: null, importedAt: null,
    nativeProjection: "EPSG:27700 + WGS84", outputProjection: "EPSG:4326",
    sourceFormat: ["CSV"], runtimeFormat: ["indexed lookup"],
    licenceName: OGL, licenceReference: OGL_REF, redistributionAllowed: true, repositoryStorageAllowed: false,
    localPath: null, status: "missing",
    notes: ["Required to expand postcode areas → districts → sectors nationally without hardcoding.", "Not present."],
  },
  {
    id: "full-postcode-polygons",
    name: "Full-postcode-unit polygons",
    provider: "Various (OS Code-Point with Polygons is commercial)",
    purpose: ["full-postcode polygon rendering at closest zoom"],
    geographicCoverage: "N/A",
    version: null, publishedAt: null, importedAt: null,
    nativeProjection: null, outputProjection: null,
    sourceFormat: [], runtimeFormat: [],
    licenceName: null, licenceReference: null, redistributionAllowed: null, repositoryStorageAllowed: null,
    localPath: null, status: "licence_review",
    notes: ["Lawful open full-unit polygons are not generally available; OS Code-Point with Polygons is a paid, approval-gated product.", "Product must render full postcodes as POINTS from Code-Point Open unless a lawful polygon source is confirmed.", "Do not commit any paid polygon data without licence review."],
  },
  {
    id: "ni-gap",
    name: "Northern Ireland geography",
    provider: "OSNI (separate to OS GB)",
    purpose: ["NI basemap/roads/postcodes"],
    geographicCoverage: "Northern Ireland — not covered by the GB OS stack",
    version: null, publishedAt: null, importedAt: null,
    nativeProjection: null, outputProjection: null,
    sourceFormat: [], runtimeFormat: [],
    licenceName: null, licenceReference: null, redistributionAllowed: null, repositoryStorageAllowed: null,
    localPath: null, status: "missing",
    notes: ["The OS Open* stack is Great Britain only. NI requires separate OSNI/Royal Mail sources.", "Product must show NI as an explicit, honest gap — never faked."],
  },
];

export function sourceById(id: string): GeospatialSourceManifest | undefined {
  return GEOSPATIAL_SOURCES.find((s) => s.id === id);
}
export function sourcesByStatus(status: GeospatialSourceManifest["status"]): GeospatialSourceManifest[] {
  return GEOSPATIAL_SOURCES.filter((s) => s.status === status);
}
/**
 * Coverage is national only when the map-critical foundation sources are imported
 * AND GB-wide coverage has been verified. The foundation is the national basemap,
 * the full classified road network, and national postcode points. On-map place
 * labels come from the Zoomstack basemap, so OS Open Names (search gazetteer) is
 * not part of the render-critical foundation.
 *
 * Verified 2026-07-14: GB extremes (Shetland → Cornwall, Wales, East Anglia) all
 * return real basemap/road/postcode tiles. Northern Ireland remains an explicit
 * gap (OS Open* is GB-only) — this function asserts GREAT BRITAIN readiness.
 */
export function isNationalCoverageReady(): boolean {
  const foundation = ["os-open-zoomstack", "os-open-roads", "code-point-open"];
  return foundation.every((id) => sourceById(id)?.status === "available");
}
