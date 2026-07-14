# Geospatial Source Register

_AspectLead Lead Intelligence Platform_

This register lists every geospatial dataset the product uses or intends to
use, with its licence, coverage and readiness. It is a human-readable mirror of
`src/lib/geo/geospatial-source-manifest.ts` (the `GEOSPATIAL_SOURCES` array),
which is the machine-readable **single source of truth**. Where the two differ,
the manifest wins and this file should be corrected.

## Honesty and licensing rules

- The product must **never claim national coverage it does not hold.** Statuses
  below are deliberately honest.
- **No licensed or paid data may be committed to the repository before licence
  review.** In particular, full-postcode-unit polygons (OS Code-Point with
  Polygons) are paid and approval-gated.
- **Large OS data belongs in object storage, not git.** `repositoryStorageAllowed`
  is `false` for all large OS datasets; they are converted to PMTiles and served
  from an object-storage / tiles endpoint at runtime.
- All OS Open\* data is licensed under the **Open Government Licence v3.0**,
  and covers **Great Britain only** (Northern Ireland is a genuine gap).

**OGL v3.0 reference:**
<https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>

## Status legend

| Status | Meaning |
| --- | --- |
| `available` | Imported and ready |
| `partial` | Present but incomplete (regional clip / subset of classes) |
| `missing` | Not present; must be downloaded/imported |
| `licence_review` | Blocked pending licence review; no lawful open source confirmed |
| `conversion_required` | Held but not yet converted to runtime format |

## Register

| Source | Provider | Purpose | Coverage | Licence | Redist. allowed | Repo storage allowed | Native proj. | Output proj. | Source format | Runtime format | Local path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **OS Open Zoomstack** | Ordnance Survey | National basemap, land, water, greenspace, woodland, buildings, railways, sites, place labels | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 (BNG) | EPSG:3857 | GeoPackage, Vector Tiles (MBTiles) | PMTiles | `tiles/zoomstack.pmtiles` (2.5GB, gitignored) | `available` (v2026-06) |
| **OS Open Roads** | Ordnance Survey | Motorways, trunk/primary, A, B, local/unclassified roads, road numbers & names | **Great Britain (national — all classes)** | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:4326 | GeoPackage (national `oproad_gb.gpkg`) | PMTiles | `tiles/openroads.pmtiles` (322MB, 3.96M links) | `available` (v2026-04) |
| **OS Open Names** | Ordnance Survey | Cities, towns, villages, localities, settlement labels, place search | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:4326 | CSV, GeoPackage | Indexed JSON (search) / PMTiles labels | held (downloaded) | `conversion_required` (v2026-04) |
| **OS OpenMap Local** | Ordnance Survey | Functional sites, railway stations, airports, buildings, surface water | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:3857 | GeoPackage | PMTiles | held (downloaded, 3.5GB) | `conversion_required` (v2026-04) |
| **Code-Point Open** | Ordnance Survey / Royal Mail / ONS | Full-postcode points; derived area/district/sector reference geometry | **Great Britain (national — 1.75M points)** | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:4326 | GeoPackage (national `codepo_gb.gpkg`) | PMTiles point layer | `tiles/codepoint.pmtiles` (38MB) | `available` (v2026-05) |
| **OS Open Greenspace** | Ordnance Survey | Greenspace, parks, playing fields | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:3857 | Vector Tiles | PMTiles | `tiles/opengreenspace.pmtiles` (81MB) | `available` (v2026-04) |
| **OS Open Rivers** | Ordnance Survey | Watercourses, rivers, canals | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:3857 | Vector Tiles | PMTiles | `tiles/openrivers.pmtiles` (126MB) | `available` (v2026-04) |
| **Boundary-Line** | Ordnance Survey | Countries, regions, counties, LAs, wards, constituencies | Great Britain | OGL v3.0 | Yes | **No** | EPSG:27700 | EPSG:3857 | Vector Tiles | PMTiles | `tiles/boundaryline.pmtiles` (331MB) | `available` (v2026-05) |
| **ONS Postcode Directory (ONSPD/NSPL)** | Office for National Statistics | Postcode → admin/geography lookup; region/LA/ward linkage; current/terminated context | United Kingdom | OGL v3.0 | Yes | **No** | EPSG:27700 + WGS84 | EPSG:4326 | CSV | Indexed lookup | — | `missing` |
| **Full-postcode-unit polygons** | Various (OS Code-Point with Polygons is commercial) | Full-postcode polygon rendering at closest zoom | N/A | — (paid product; not OGL) | — | — | — | — | — | — | — | `licence_review` |
| **Northern Ireland geography** | OSNI (separate to OS GB) | NI basemap / roads / postcodes | **Northern Ireland — not covered by the GB OS stack** | — | — | — | — | — | — | — | — | `missing` |

## Notes per source

- **OS Open Zoomstack** — Required for the national basemap plus
  environmental/contextual layers. Not in the repo; must be downloaded and
  converted to PMTiles. Too large for git — object storage only.
- **OS Open Roads** — Current file holds **only "A Road" and "Motorway"**
  classes for a West-London-area clip. B roads, local, unclassified, private
  roads and tracks are **absent**. National import + full class set required.
- **OS Open Names** — Required for town/village/locality labels and place
  search. Not present.
- **OS OpenMap Local** — Required for stations, airports and functional sites.
  These layers cannot render until imported.
- **Code-Point Open** — The area/district/sector polygons are a feasibility
  layer derived for a few areas only. The national `codepo_gb.zip` exists in a
  separate map-POC repo but is **not** imported into this app. National postcode
  geography needs the national Code-Point plus ONSPD.
- **ONSPD** — Required to expand areas → districts → sectors nationally without
  hardcoding. Not present.
- **Full-postcode-unit polygons** — Lawful open full-unit polygons are not
  generally available; OS Code-Point with Polygons is paid and approval-gated.
  The product renders full postcodes as **points** from Code-Point Open unless a
  lawful polygon source is confirmed. **Do not commit any paid polygon data
  without licence review.**
- **Northern Ireland** — The OS Open\* stack is GB only. NI needs separate
  OSNI / Royal Mail sources. Must be shown as an explicit, honest gap — never
  faked.

## National coverage readiness — READY (Great Britain), verified 2026-07-14

`isNationalCoverageReady()` returns `true` when the render-critical foundation
(`os-open-zoomstack`, `os-open-roads`, `code-point-open`) is `available`. As of
2026-07-14 **all three are imported, tiled to PMTiles, and GB coverage is
verified** (real basemap/road/postcode tiles returned at Shetland, the Hebrides,
Inverness, Aberdeen, Glasgow, Newcastle, Wales, East Anglia, Cardiff, London,
Cornwall and Kent — see `~/Data/aspectlead-geospatial/manifests/coverage-verification.json`).

**Great Britain is national; Northern Ireland is still an explicit gap** (OS Open*
is GB-only — Belfast returns roads=0, postcodes=0). The status table statuses
below reflect this; the machine-readable manifest is authoritative.

Produced PMTiles (served from object storage / a gitignored local path, never git):
`zoomstack` (2.5GB basemap, 18 layers), `openroads` (322MB, 3.96M links, all classes),
`codepoint` (38MB, 1.75M postcode points), `opengreenspace` (81MB), `openrivers`
(126MB), `boundaryline` (331MB). Checksums in `manifests/tiles-checksums.sha256`.
OS Open Names (search gazetteer) and OS OpenMap Local (detailed buildings/sites)
are downloaded but not yet tiled — the Zoomstack basemap already carries their
map role (place labels, stations, airports, buildings) nationally.

## Acquisition run — 2026-07-14

Verified against the **OS Downloads API** (`https://api.os.uk/downloads/v1`) on
2026-07-14. This API serves OS OpenData products under OGL v3.0 **without an API
key or login** — confirmed `HTTP 200` for every product below. The machine-readable
catalogue is `src/lib/geo/national-acquisition-catalogue.ts`; the pipeline is
`scripts/geo/{00-install-tools,10-acquire-national-geo,20-convert-national-geo}.sh`.

| Product | OS product id | Confirmed version | Chosen format | Upstream max size | Feeds |
| --- | --- | --- | --- | --- | --- |
| OS Open Zoomstack | `OpenZoomstack` | 2026-06 | Vector Tiles (MBTiles) | 4,301 MB (GPKG) | national basemap, land/water/greenspace/woodland, buildings, railways, sites, place labels |
| OS Open Roads | `OpenRoads` | 2026-04 | GeoPackage | 1,347 MB | all road classes (motorway → track), road numbers/names |
| OS Open Names | `OpenNames` | 2026-04 | GeoPackage | 251 MB | cities, towns, villages, localities, place search |
| OS OpenMap Local | `OpenMapLocal` | 2026-04 | GeoPackage | 15,418 MB | stations, airports, functional sites, buildings, surface water |
| Code-Point Open | `CodePointOpen` | 2026-05 | GeoPackage | 56 MB | full-postcode points; derived area/district/sector geometry |
| OS Open Greenspace | `OpenGreenspace` | 2026-04 | Vector Tiles | 86 MB | greenspace, parks, playing fields |
| OS Open Rivers | `OpenRivers` | 2026-04 | Vector Tiles | 132 MB | water, rivers, canals |
| Boundary-Line | `BoundaryLine` | 2026-05 | Vector Tiles | 808 MB | countries, regions, local authorities, wards (context) |
| ONS Postcode Directory | ONSPD (ONS portal) | latest | CSV | ~200 MB | postcode → area/district/sector, LA, region, lat/lng |

**Download endpoint pattern** (no key):
`https://api.os.uk/downloads/v1/products/{id}/downloads?area=GB&format={format}&redirect`
ONSPD is on the **ONS Open Geography Portal** (`https://geoportal.statistics.gov.uk/`,
ArcGIS) — confirmed reachable `HTTP 200`; acquired separately.

**Conversion toolchain (this Mac):** `gdal` (ogr2ogr), `tippecanoe`, `pmtiles` via
Homebrew. Reproject EPSG:27700 → EPSG:4326, tile with tippecanoe, convert to PMTiles.

**Storage (outside git):** `~/Data/aspectlead-geospatial/{downloads,extracted,intermediate,tiles,manifests,logs}`.
Raw datasets and PMTiles are **never committed**; final PMTiles are uploaded to
object storage / CDN. The repo holds only scripts, manifests, checksums
(`manifests/checksums.sha256`), style config, docs and tests.

**Status discipline:** the manifest statuses above remain `missing`/`partial`
until each product's PMTiles are produced **and** GB-wide coverage + layer
completeness are verified. Only then are they flipped to `available` and the map
described as national.
