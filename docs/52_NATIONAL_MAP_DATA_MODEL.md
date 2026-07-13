# 52 — National Map Data Model

Status: draft (interfaces only, no bulk data bundled)
Owner: Lead Intelligence Engine
Related: `docs/47_TERRITORY_SELECTION_AND_POSTCODE_LOGIC.md`, `docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md`

## Purpose

Define a **national** (Great Britain) geospatial data model for the map engine so that
territory selection, postcode lookup and road rendering work anywhere in GB — not just
the pilot area. This document covers the open data sources, the loader interfaces, the
in-memory indexes, and the (future) map rendering requirements.

## POC vs national engine — important

The existing file `src/lib/map/west-london-map.data.ts` is **POC ONLY**. It is an
auto-derived, pre-baked data blob covering a West London pilot bounding box (areas HA/SL/SW,
a fixed set of feeder A-roads, and hard-coded pilot outcodes). It is **not** the national
engine and **must not** be treated as production geometry or extended in place.

The national engine described here:

- does **not** hard-code West London, any bounding box, or any fixed outcode list;
- derives everything from open GB datasets loaded at runtime from local files;
- degrades cleanly to "no data" when those files are not present (nothing is faked).

Do **not** redesign the map UI here. This document defines the **data model and loaders**
that a national map UI would consume; the rendering requirements below are stated as
requirements only.

## Data flow

```
Open GB datasets (local files under data/geo/, gitignored)
   │
   ├─ OS Code-Point Open (CSV)      → loadCodePoint()  → CodePointRecord[]
   ├─ ONSPD / NSPL (CSV)            → loadOnspd()       → OnsPostcodeRecord[]
   └─ OS Open Roads (GeoJSON)       → loadOpenRoads()   → RoadSegment[]
                                              │
                    ┌─────────────────────────┴───────────────┐
                    ▼                                          ▼
        buildPostcodeIndex(records)                  buildRoadIndex(segments)
        → byPostcode / byOutcode / bySector          → byClass / aRoads() / motorways()
        → lookup(), outcodesInArea()                 → roadsInBBox()
                    │                                          │
                    └────────────────► map engine / territory logic ◄─┘
```

## Sources (summary)

| Dataset | Role in the model | Loader | Env var | Default path |
| --- | --- | --- | --- | --- |
| OS Code-Point Open | Postcode unit → coordinates, positional quality, admin GSS codes | `loadCodePoint()` | `OS_CODEPOINT_PATH` | `data/geo/codepoint-open.csv` |
| ONSPD / NSPL | Postcode → region / local authority / ward, live-or-terminated flag | `loadOnspd()` | `ONSPD_PATH` | `data/geo/onspd.csv` |
| OS Open Roads | Classified road network (motorway / A / B / local) + labels | `loadOpenRoads()` | `OS_OPEN_ROADS_PATH` | `data/geo/os-open-roads.geojson` |

Full download, licence and format details are in `docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md`.

Geo data files live under **`data/geo/`**, which is **gitignored** and never committed.
All loaders read a configurable local path if present, otherwise return an empty result
with a clear "data not provided" status. Loaders never throw and never fabricate data.

## Loader interfaces

Defined in `src/lib/geo/`. Each returns a result envelope with `loaded`, `source`,
`count`, the parsed records/segments, and a human-readable `note`.

### `os-codepoint-loader.ts`

```ts
interface CodePointRecord {
  postcode: string;              // "HA0 1AB"
  latitude: number;              // WGS84 degrees (NaN if only BNG eastings/northings supplied)
  longitude: number;
  positionalQuality: number | null; // OS PQI 10–90, lower = more precise
  adminCodes: Record<string, string>; // GSS admin codes (county/district/ward)
}
loadCodePoint(path?: string): {
  loaded: boolean; source: string | null; count: number;
  records: CodePointRecord[]; note: string;
}
```

Note: the raw OS distribution is projected in **British National Grid** (eastings/northings),
not WGS84. This loader only reads lat/lon when a header row names those columns; otherwise it
flags in `note` that a reprojection step (not bundled) is required. No coordinate is invented.

### `ons-postcode-loader.ts`

```ts
interface OnsPostcodeRecord {
  postcode: string;      // "HA0 1AB"
  outcode: string;       // "HA0"
  latitude: number;      // WGS84 degrees
  longitude: number;
  localAuthority: string; // name or GSS code
  region: string;         // name or GSS code
  ward: string;           // name or GSS code
  terminated: boolean;    // ONSPD "doterm" populated
}
loadOnspd(path?: string): { loaded; source; count; records; note }
```

### `os-open-roads-loader.ts`

```ts
type RoadClass = 'motorway' | 'a_road' | 'b_road' | 'local' | 'unknown';
interface RoadSegment {
  id: string;
  name: string;                     // road number or street name, e.g. "A40"
  roadClass: RoadClass;
  coordinates: [number, number][];  // [lon, lat] pairs
}
loadOpenRoads(path?: string): { loaded; source; count; segments; note }
```

Parses a GeoJSON `FeatureCollection`; handles `LineString` and `MultiLineString`.

## Indexes

### `postcode-index.ts`

`buildPostcodeIndex(records)` accepts the output of the Code-Point and/or ONSPD loaders
(both structurally satisfy the minimal `PostcodePoint` shape) and returns:

- `byPostcode: Map<string, T>` — full unit → record;
- `byOutcode: Map<string, T[]>` — district (outcode) → records;
- `bySector: Map<string, T[]>` — sector → records;
- `lookup(pc)` — single unit lookup (loosely formatted input accepted);
- `outcodesInArea(area)` — distinct outcodes within a postcode area.

Postcode-part helpers are exported: `postcodeArea`, `postcodeDistrict`, `postcodeSector`,
`normalisePostcode`. Anatomy of `"HA0 1AB"`: area `HA`, district/outcode `HA0`,
sector `HA0 1`, unit `HA0 1AB`.

### `road-index.ts`

`buildRoadIndex(segments)` returns:

- `all` — every segment;
- `byClass: Map<RoadClass, RoadSegment[]>`;
- `aRoads()` / `motorways()` — class convenience filters;
- `roadsInBBox(bbox)` — **stub**: currently a vertex-in-box test. A future version should
  test segment/box edge intersection so links that cross a viewport without a vertex inside
  are still returned. `bbox` is `[minLon, minLat, maxLon, maxLat]` in WGS84 degrees.

## Future map rendering requirements

Stated as requirements for a future national map UI (not implemented here, not a UI redesign):

1. **Zoom-dependent postcode labels.**
   - Low zoom → postcode **area** labels only (e.g. `HA`, `SW`).
   - Medium zoom → **district / outcode** labels (e.g. `HA0`).
   - High zoom → **sector** labels (e.g. `HA0 1`).
   - Full postcode unit label only when a point is **selected or the camera is close**.
2. **A-road labelling** with a **halo / contrast outline** so numbers stay legible over any
   base or territory shading; motorways ranked above A-roads for label priority.
3. **Road layer above shaded territory layers** — roads must draw on top of filled
   territory/area polygons so the network stays readable.
4. **Clustering for dense points** — cluster postcode/lead points where they overlap at the
   current zoom; expand to individual points when the camera is close enough.
5. **National GB frame** — the map must be able to frame the whole of Great Britain and any
   sub-region, with no hard-coded bounding box.
6. **Missing-coordinate handling** — records with `NaN` lat/lon (e.g. Code-Point supplied as
   BNG before reprojection, or postcodes absent from the reference data) must be excluded
   from rendering and surfaced in a data-quality count, never plotted at 0,0.
7. **Selected-territory overlay** — when a territory (set of outcodes/sectors) is selected,
   draw a distinct overlay above the base territory shading using `outcodesInArea()` /
   the sector index to resolve membership.

## Non-goals

- No bulk datasets are committed to the repo (see `.gitignore` → `data/`).
- No reprojection library is bundled; BNG→WGS84 is flagged, not performed.
- No change to the West London POC data or the current map UI.
