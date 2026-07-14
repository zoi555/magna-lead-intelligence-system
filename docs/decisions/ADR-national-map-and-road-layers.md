# ADR: National Map and Road Layers

_Architecture Decision Record — AspectLead Lead Intelligence Platform_

- **Status:** Accepted — **IMPLEMENTED for Great Britain (2026-07-14).** National
  datasets imported, tiled to PMTiles, GB coverage verified. NI remains a gap.
- **Date:** 2026-07 (foundation); 2026-07-14 (national import)
- **Related:**
  - `docs/architecture/national-geospatial-foundation.md`
  - `docs/data-sources/geospatial-source-register.md`
  - `src/lib/geo/geospatial-source-manifest.ts`
  - `src/lib/geo/map-layer-config.ts`

---

## Context

Every AspectLead module (lead discovery, customer analysis, demographics,
routing) needs a common map to browse Great Britain and to draw operational
data on top. Today the application has **only a small regional proof-of-concept
geospatial dataset**, not national data:

- `public/map/` holds postcode polygons (areas/districts/sectors) derived from
  Code-Point Open for **HA, SL, SW, TW, UB, W only**, an OS Open Roads clip
  containing **only "A Road" and "Motorway"** classes, and a single delivery
  boundary. MapLibre GL is vendored in `public/vendor/`.
- **Missing entirely:** OS Open Zoomstack (national basemap), OS Open Names
  (labels/search), OS OpenMap Local (stations/airports/functional sites), the
  national OS Open Roads dataset (full class set), the ONS Postcode Directory
  (ONSPD), any PMTiles/MBTiles/vector tiles, and all Northern Ireland geography.

We need to decide the architecture for a shared national map without pretending
national coverage exists.

---

## Decision

1. **Renderer + tiling:** Use **MapLibre GL** (vendored) with **PMTiles / vector
   tiles** generated from the **OS Open\*** family (all Open Government Licence
   v3.0). Each dataset is a separate source with separate layers; there is no
   single giant GeoJSON.
2. **Shared infrastructure:** The national map is treated as infrastructure
   shared by all modules and must remain browsable even with no lead run
   completed.
3. **Operational overlays are separate:** Lead territories, customers,
   demographics and routes are overlays drawn on top; they never restrict
   national browsing.
4. **Data placement:** National datasets are **imported, converted to PMTiles,
   and served from object storage** — never bundled into the JS and never
   committed to git.
5. **Road classes as data:** Every OS Open Roads class maps to a style + zoom
   band in `ROAD_CLASSES`, validated by `validateRoadCoverage()`. Motorways are
   locked on.
6. **Postcode points, not paid polygons:** Full postcodes render as **points**
   from Code-Point Open. Full-unit polygons stay behind a `licence_review` gate.

---

## Locked decisions (verbatim)

Copied verbatim from `LOCKED_DECISIONS` in `src/lib/geo/map-layer-config.ts`:

1. The national map is infrastructure shared by all AspectLead modules.
2. The selected lead territory is an operational overlay and never limits national browsing.
3. Motorways are always visible at every appropriate zoom level and cannot be disabled.
4. Every road class available in the national source data becomes visible when the user zooms to its appropriate scale.
5. No road class is permanently omitted from the product merely because it is minor.
6. Road, place, town, settlement, postcode and transport labels are zoom-dependent and user-configurable.
7. Selected and hovered geographic features always show their identity.
8. Feeder roads are configurable data and may be manually selected or automatically suggested.
9. Feeder-road logic must include roads that connect the selected territory and town centres to the strategic road network.
10. Postcode areas, districts and sectors are geographic layers independent of lead data.
11. The map must remain nationally browsable even where no lead run has been completed.
12. No TW-specific rule may become national application logic.

---

## Consequences

**Positive**

- One map serves every module; a clean separation between reference geography
  and operational overlays.
- Encoding road/label/postcode/feeder rules as data
  (`map-layer-config.ts`) keeps the architecture out of any one component and
  makes coverage testable (`validateRoadCoverage`).
- Honest readiness signalling via the manifest and
  `isNationalCoverageReady()`.

**Costs / obligations**

- **The national map cannot fully render until the national datasets are
  imported and converted** (Zoomstack, Open Names, OpenMap Local, national Open
  Roads, ONSPD). This work is pending.
- **Northern Ireland is a genuine gap** — the OS Open\* stack is GB only. NI must
  be shown as an explicit gap, never faked.
- **Full-postcode polygons require licence review** — no lawful open source
  exists; the product uses points until a lawful polygon source is confirmed.
  No paid data may be committed before review.
- Object-storage / tiles-endpoint delivery must be stood up; large OS data must
  never enter git or the JS bundle.

---

## Alternatives considered

- **Bundle national GeoJSON in the app** — rejected: too large, would bloat the
  JS bundle and git, and poor performance.
- **Use a commercial full-postcode polygon product now** — rejected pending
  licence review; not lawful to commit and not required for the MVP (points
  suffice).
- **Restrict the map to lead territories** — rejected: violates the locked
  decision that the map remain nationally browsable and shared.

---

## Implementation record (2026-07-14)

**National import completed for Great Britain.**

- **Datasets acquired** from the OS Downloads API (`api.os.uk/downloads/v1`, OGL
  v3.0, no key) + verified: Zoomstack v2026-06, Open Roads v2026-04, Open Names
  v2026-04, OpenMap Local v2026-04, Code-Point Open v2026-05, Open Greenspace/
  Rivers v2026-04, Boundary-Line v2026-05. ~7.7GB downloaded, checksummed.
- **Processing:** `ogr2ogr` (EPSG:27700→4326) + `tippecanoe` + `pmtiles` produced
  6 PMTiles (basemap, roads, postcodes, greenspace, rivers, boundaries). Reproducible
  via `scripts/geo/{00-install,10-acquire,20-convert}.sh` (npm `geo:*`).
- **New dependency:** `pmtiles@4.4.1` (npm) — the MapLibre PMTiles protocol shim,
  needed to read the tiles in-browser. Small, MIT, standard for PMTiles. Logged here
  per the "no new packages without a decision" rule.
- **Storage decision:** raw datasets + PMTiles live OUTSIDE git in
  `~/Data/aspectlead-geospatial/`; a gitignored `public/map/tiles/` symlink serves
  them in dev; production uploads PMTiles to object storage / CDN
  (`NEXT_PUBLIC_TILES_BASE_URL`). The repo holds only scripts, manifests, checksums,
  style config, docs, tests. **No OGL/paid data is committed.**
- **Wiring:** `src/lib/geo/national-map.ts` (sources + `buildNationalStyle()` +
  `buildRoadLayers()` honouring the locked road hierarchy) → `/national-map` page.
- **Verification:** GB coverage confirmed at extremes; tiles carry
  `road_function`/`road_classification` + basemap layers; motorways present in
  motorway tiles; route serves 200, PMTiles serve HTTP 206 range. Build + tests green.
- **Still open:** glyph font stack for text labels; OS Open Names search gazetteer;
  ONSPD national postcode expansion; NI (separate OSNI sources); full-unit polygons
  (paid, licence review). A live browser screenshot was not captured (Chrome
  extension not connected) — open `/national-map` on the dev server to eyeball.
