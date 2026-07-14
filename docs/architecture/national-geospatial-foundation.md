# National Geospatial Foundation

_AspectLead Lead Intelligence Platform — shared map infrastructure_

**Status:** Foundation accepted; national datasets not yet imported. The
product currently ships a small **regional proof-of-concept** dataset only.
This document describes the target architecture and states honestly what
exists today versus what is still missing.

**Cross-references:**

- `src/lib/geo/geospatial-source-manifest.ts` — the single source of truth for
  which datasets exist, their coverage, licence and readiness.
- `src/lib/geo/map-layer-config.ts` — the locked layer/zoom/road/label/feeder
  configuration this document describes, encoded as data.
- `docs/data-sources/geospatial-source-register.md` — the human-readable
  source register that mirrors the manifest.
- `docs/decisions/ADR-national-map-and-road-layers.md` — the decision record.

---

## 1. Honest status (read this first)

The application does **not** have national coverage. What is present in
`public/map/` today is a regional feasibility clip:

| File | What it is |
| --- | --- |
| `pc_areas.geojson` | Postcode **area** polygons, derived from Code-Point Open, for **HA, SL, SW, TW, UB, W only** |
| `pc_districts.geojson` | Postcode **district** polygons, same six areas only |
| `pc_sectors.geojson` | Postcode **sector** polygons, same six areas only |
| `roads.geojson` | OS Open Roads clip containing **only** the "A Road" and "Motorway" classes — no B roads, minor, local, private or tracks |
| `delivery_boundary.geojson` | A single operational delivery boundary polygon |

MapLibre GL is vendored locally in `public/vendor/`.

**Missing entirely** (must be imported before the national map can render):
OS Open Zoomstack (national basemap), OS Open Names (place labels/search),
OS OpenMap Local (stations, airports, functional sites), the national OS Open
Roads dataset (full class set), the ONS Postcode Directory (ONSPD), any
PMTiles/MBTiles/vector tiles, and all Northern Ireland geography.

---

## 2. Purpose of the map

The national map is **shared infrastructure used by every AspectLead module**,
not a feature of any single lead run. It must be **browsable independently** of
whether any lead discovery run has ever been completed. A user can open the map
and pan/zoom the whole of Great Britain as a reference surface; lead
territories, customers, demographics and routes are drawn **on top** as
optional overlays and never restrict what can be browsed.

---

## 3. Supported geography

- **Great Britain** is covered by the OS Open\* family (England, Scotland,
  Wales), all under the **Open Government Licence v3.0**.
- **Northern Ireland is a genuine, documented gap.** The OS Open\* stack is GB
  only; NI needs separate OSNI/Royal Mail sources that we do not hold. NI must
  be shown as an explicit gap and never faked.

---

## 4. Rendering architecture

MapLibre GL (vendored) renders a **tiled** national map. The chosen approach:

- Convert each OS source (GeoPackage/GeoJSON) into **PMTiles** (or a
  vector-tile endpoint) served from **object storage**.
- Each dataset is a **separate source with separate layers** — there is **no
  single giant GeoJSON** driving the whole map.
- **National datasets are never bundled into the JavaScript and never committed
  to git.** They are too large and are licence-sensitive; they live in object
  storage / a tiles endpoint and are fetched at runtime.
- The current regional GeoJSON files are a stop-gap for the POC only and will
  be replaced by tiles as datasets are imported.

---

## 5. Layer hierarchy

Layers are drawn bottom-to-top. Availability reflects section 1.

| # | Layer | Source (target) | Status today |
| --- | --- | --- | --- |
| 1 | Basemap | OS Open Zoomstack | Missing |
| 2 | Land | OS Open Zoomstack | Missing |
| 3 | Water | OS Open Zoomstack | Missing |
| 4 | Coastline | OS Open Zoomstack | Missing |
| 5 | Greenspace | OS Open Zoomstack | Missing |
| 6 | Woodland | OS Open Zoomstack | Missing |
| 7 | Contours | OS Open Zoomstack | Missing (default off) |
| 8 | Buildings | OS Open Zoomstack / OpenMap Local | Missing |
| 9 | Functional sites | OS OpenMap Local | Missing |
| 10 | Railways | OS Open Zoomstack / OpenMap Local | Missing |
| 11 | Stations | OS OpenMap Local | Missing |
| 12 | Airports | OS OpenMap Local | Missing |
| 13 | Motorways | OS Open Roads | **Partial** (present in clip) |
| 14 | Trunk / primary roads | OS Open Roads | Missing (national) |
| 15 | A roads | OS Open Roads | **Partial** (present in clip) |
| 16 | B roads | OS Open Roads | Missing |
| 17 | Local / unclassified roads | OS Open Roads | Missing |
| 18 | Private roads | OS Open Roads | Missing |
| 19 | Tracks | OS Open Roads | Missing |
| 20 | Road numbers / names | OS Open Roads / Open Names | Missing |
| 21 | Cities / towns / villages / localities | OS Open Names | Missing |
| 22 | Postcode areas | Code-Point Open (derived) | **Partial** (6 areas) |
| 23 | Postcode districts | Code-Point Open (derived) | **Partial** (6 areas) |
| 24 | Postcode sectors | Code-Point Open (derived) | **Partial** (6 areas) |
| 25 | Full-postcode **points** | Code-Point Open | Target (points, lawful) |
| 26 | Full-postcode **polygons** (where lawful) | Licence review | **Not lawful yet** |
| 27 | Selected-territory overlay | Operational | Overlay |
| 28 | Future lead / customer / demographic / route overlays | Operational | Future |

**Full-postcode polygons:** there is **no lawful open source** for full
postcode-unit polygons — OS Code-Point with Polygons is a paid,
approval-gated product. The product therefore renders full postcodes as
**points** from Code-Point Open. A polygon layer is retained in the design but
gated behind a `licence_review` status and must not use paid data without
review.

---

## 6. Zoom bands

Five bands govern what appears (values indicative; tuned against the tiled
source — see `ZOOM_BANDS` in `map-layer-config.ts`):

| Band | Zoom | Adds |
| --- | --- | --- |
| **National** | 4–7 | GB basemap, water/coast, motorways, major cities, countries/regions & motorway numbers, postcode areas |
| **Regional** | 7–10 | Trunk/primary + A roads, towns, greenspace/woodland, postcode districts |
| **Town / district** | 10–13 | B roads, A-road numbers, villages, railway stations, postcode sectors, functional sites begin |
| **Street / sector** | 13–16 | Minor/local roads, street names, localities, postcode points, buildings, POI |
| **Closest** | 16–22 | Local-access, restricted, private roads and tracks; full-postcode points/labels; finest detail |

---

## 7. Road visibility rules

Every road class in the source data has a defined style and zoom mapping in
`ROAD_CLASSES` (`map-layer-config.ts`). Rules:

- **Motorways are always on and cannot be disabled** (`userToggle: false`,
  locked). Visible from zoom 5 upward.
- **A roads** (trunk/primary) default **on** from regional zoom (7); all A
  roads by town zoom.
- **B roads** default **off** at wide zoom, appearing from ~zoom 11 when
  enabled.
- **Minor, local, local-access, secondary-access** roads appear **automatically
  by zoom** (13–16).
- **Private roads and tracks** appear at the **closest** zooms (16–17+). The
  user may hide them but they are never permanently omitted.
- **Road numbers and names** follow the label rules (section 8).
- **No road class is permanently omitted merely because it is minor.**

A verification safeguard, `validateRoadCoverage(discovered)`, checks that
**every road class found in the imported data maps to a style** (directly or via
a documented alias in `ROAD_CLASS_ALIASES`). Any unmapped class is a
**failure** — it is reported in `RoadCoverageReport.unmapped` and `ok` becomes
`false`. This prevents silently dropping a class when the national dataset lands.

---

## 8. Label rules

Labels are **independent of lead data** and controlled by `LABEL_CATEGORIES`:

- **Zoom-dependent:** each category has a minimum zoom and a default behaviour
  (`always`, `on`, `zoom`, `hover_selection`, `off`).
- **User-configurable:** users can override category visibility.
- **Density:** Standard / **Dense (default)** / Maximum
  (`DEFAULT_LABEL_DENSITY = "dense"`).
- **Postcode labels** (areas/districts/sectors/full postcodes) are labelled
  independently of any lead data.
- **Selected and hovered features always show their identity**, regardless of
  the density setting.
- **Tiny-polygon fallback:** where a polygon is too small to carry a label at
  the current zoom, its identity is shown on **hover** or via a **centroid**
  label so it is never unlabelled when selected/hovered.

Motorway numbers are `always`; cities/towns/A-road numbers default `on`;
villages, localities, B-road numbers, street names, stations, transport
facilities and postcode labels default `zoom`; full postcodes are
`hover_selection` only.

---

## 9. Postcode-geography layers

Postcode areas, districts and sectors are **standalone geographic layers**,
independent of lead data (`POSTCODE_LAYERS`). They tie to zoom bands:

| Layer | Default | Band |
| --- | --- | --- |
| Postcode areas | zoom | national |
| Postcode districts | zoom | regional |
| Postcode sectors | zoom | town/district |
| Postcode points | zoom | street/sector |
| Full-postcode polygons | off | closest (licence review) |

Today these are derived polygons for six areas only; national coverage needs
the national Code-Point Open file plus ONSPD.

---

## 10. Environmental / contextual layers

From `ENV_LAYERS`: water (on), greenspace (on), woodland (on), buildings
(zoom), railways (on), stations (zoom), functional sites (zoom), contours
(off), points of interest (zoom). All depend on OS Open Zoomstack / OpenMap
Local, which are not yet imported.

---

## 11. Feeder-road model

Feeder roads are **configurable data**, not hardcoded logic
(`FeederRoadEntry`, `FEEDER_CONTROLS`):

- Each entry records a display name, road number/name, the source features it
  covers, the territories and towns/localities it serves, its **source**
  (`manual` / `automatic_suggestion` / `organisation_default`), **status**
  (`included` / `excluded` / `suggested`), **priority** (`primary` /
  `secondary` / `context`) and a reason.
- Controls (`FEEDER_CONTROLS`): show organisation feeder network, suggest roads
  serving the territory, suggest roads entering towns, highlight motorway
  connections, highlight town-centre approaches.
- Feeder logic must include roads that connect the selected territory and town
  centres to the **strategic road network**.

---

## 12. Performance approach

- **Tiling** (PMTiles / vector tiles) rather than large GeoJSON downloads.
- **Zoom-based rendering** so only relevant classes/labels are drawn per band.
- **Lazy loading** of tiles and overlays as the viewport demands them.
- **Caching** of tiles from object storage.
- National data is fetched at runtime, never shipped in the JS bundle.

---

## 13. Limitations

- No national basemap, place labels, functional sites, national roads or ONSPD
  yet — the national map cannot fully render until these are imported.
- Roads are limited to A/Motorway in a six-area clip.
- Postcode polygons cover six areas only.
- Full-postcode polygons are not lawfully available as open data (points only).
- **Northern Ireland is not covered.**

---

## 14. The Northern Ireland gap

The OS Open\* stack is **Great Britain only**. NI requires separate OSNI /
Royal Mail sources we do not hold. NI must be presented as an explicit,
honest gap in the map — never faked or implied to exist.

---

## 15. Future overlays

Lead, customer, demographic and route overlays are planned to draw **on top**
of this shared foundation. They are operational overlays and never restrict
national browsing.

---

## Appendix A — Locked decisions (verbatim)

These are copied verbatim from `LOCKED_DECISIONS` in
`src/lib/geo/map-layer-config.ts`:

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
