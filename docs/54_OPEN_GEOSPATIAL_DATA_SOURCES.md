# 54 — Open Geospatial Data Sources

Status: reference
Related: `docs/52_NATIONAL_MAP_DATA_MODEL.md`

This document lists the open Great Britain geospatial datasets the national map engine can
consume, with their purpose, licence, where to download them, the expected local path /
environment variable, and file format.

## Where the data lives

All geo data files live under **`data/geo/`**. This directory is **gitignored** (the whole
`data/` tree is excluded in `.gitignore`) and is **never committed**. Each loader reads its
configured local path if present, otherwise returns an empty result with a clear
"data not provided" status — loaders never throw and never fabricate data.

To provision the data locally:

1. Download the dataset from the source below.
2. Unpack it into `data/geo/` (or anywhere you like).
3. Point the matching environment variable at the file, or use the default path.

## Sources

### Core (used by the current loaders)

| # | Dataset | Purpose | Licence | Download | Local path / env var | Format |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **OS Code-Point Open** | GB postcode unit → coordinates, positional quality, admin GSS codes | OS OpenData (Open Government Licence) | Ordnance Survey OpenData Hub / OS Data Hub — "Code-Point Open" | `data/geo/codepoint-open.csv` · `OS_CODEPOINT_PATH` | CSV (British National Grid eastings/northings; reprojection to WGS84 required) |
| 2 | **ONSPD / NSPL** | Postcode → region, local authority, ward; live-or-terminated flag; WGS84 lat/lon | Open Government Licence (OGL) | ONS Open Geography Portal — "ONS Postcode Directory" (ONSPD) or "National Statistics Postcode Lookup" (NSPL) | `data/geo/onspd.csv` · `ONSPD_PATH` | CSV (with header; `pcds`, `lat`, `long`, `doterm`, `oslaua`, `rgn`, `osward`, …) |
| 3 | **OS Open Roads** | Classified GB road network (motorway / A / B / local) + road numbers / names | OS OpenData (Open Government Licence) | Ordnance Survey OpenData Hub / OS Data Hub — "OS Open Roads" | `data/geo/os-open-roads.geojson` · `OS_OPEN_ROADS_PATH` | GeoJSON `FeatureCollection` (LineString / MultiLineString; also shipped as GML/Shapefile) |

### Optional (for later — no loader yet)

| # | Dataset | Purpose | Licence | Download | Suggested local path | Format |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | **OS Open Names** | Gazetteer of place names, settlements, populated-place labels for the base map | OS OpenData (OGL) | OS Data Hub — "OS Open Names" | `data/geo/os-open-names.csv` | CSV / GeoPackage |
| 5 | **OS Boundary-Line** and/or **ONS boundaries** | Administrative / electoral / postcode-area boundary polygons for territory shading | OS OpenData (OGL) / OGL | OS Data Hub — "Boundary-Line"; ONS Open Geography Portal (boundary GeoJSON) | `data/geo/boundaries.geojson` | Shapefile / GeoJSON |
| 6 | **OS Open Zoomstack** | Ready-made multi-scale GB base map (backdrop) | OS OpenData (OGL) | OS Data Hub — "OS Open Zoomstack" | `data/geo/open-zoomstack.gpkg` | GeoPackage / vector tiles (MBTiles) |

## Licence notes

- **OS OpenData** products (Code-Point Open, Open Roads, Open Names, Boundary-Line,
  Open Zoomstack) are released under the **Open Government Licence** and require an
  attribution statement such as: "Contains OS data © Crown copyright and database right
  [year]".
- **ONS** products (ONSPD, NSPL, ONS boundaries) are released under the **Open Government
  Licence**. ONSPD/NSPL also carry the standard ONS/OS/GeoPlace source acknowledgement,
  e.g. "Contains OS data © Crown copyright and database right [year]; Royal Mail data;
  National Statistics data © Crown copyright and database right [year]".
- Always confirm the exact attribution wording on the download page for the release you use.

## Format gotchas

- **Code-Point Open coordinates are British National Grid** (eastings/northings, EPSG:27700),
  not WGS84. The loader only reads lat/lon when a header names those columns; otherwise it
  flags that a BNG→WGS84 reprojection (not bundled) is needed. Prefer ONSPD/NSPL when WGS84
  lat/lon is required directly.
- **ONSPD vs NSPL** share most columns; the loader matches known aliases
  (`pcds`/`pcd`/`postcode`, `lat`/`latitude`, `long`/`lon`/`longitude`, `doterm`, `oslaua`,
  `rgn`, `osward`). A header row is required.
- **OS Open Roads** is distributed as GML and ESRI Shapefile by OS; convert to GeoJSON
  (e.g. with `ogr2ogr`) to match the loader's expected `data/geo/os-open-roads.geojson`.

## Related files

- Loaders: `src/lib/geo/os-codepoint-loader.ts`, `src/lib/geo/ons-postcode-loader.ts`,
  `src/lib/geo/os-open-roads-loader.ts`.
- Indexes: `src/lib/geo/postcode-index.ts`, `src/lib/geo/road-index.ts`.
- Data model + rendering requirements: `docs/52_NATIONAL_MAP_DATA_MODEL.md`.
- POC data (not the national engine): `src/lib/map/west-london-map.data.ts`.
