# Portable Geospatial Map Package

_AspectLead · architecture_

The Great Britain map is a **reusable, application-independent package** at
`packages/geospatial-map/` (`@geospatial/map`). It provides geography, rendering, controls,
selection, layers and extension points. AspectLead — and any other app — supplies operational
data via **overlays** and **adapters**. The package README is the primary reference; this doc
records the architecture and how AspectLead consumes it.

## Boundary

- The package imports **only** React, react-dom and pmtiles (peer deps) + its own relative
  modules. Enforced by `npm run test:map-boundary` (fails on any import of `src/app`,
  `src/features`, `src/lib/discovery`, or lead/customer/Sales Pro/NetSuite code).
- MapLibre GL JS is provided by the host (`window.maplibregl`; `setMaplibreAssets()` sets the
  vendored path). `ensureMaplibre()` polls for the global (robust to StrictMode double-mount).

## Public API

Components: `GeospatialMap`, `MapControlDrawer`, `FeatureInspector`, `MapSearch`, `MapStatus`.
Profile: `createDefaultMapProfile`, `validateMapProfile`, `mergeMapProfiles`,
`serialise/deserialiseMapProfile`. Rules: `ROAD_CLASS_MAPPINGS`, `validateRoadCoverage`,
`motorwayLocked`, `CONTROL_SECTIONS`, `layerVisibilityForProfile`. Core: `createMapStyle`,
`buildMapSources`, `registerPmtilesProtocol`, `ensureMaplibre`. Feeder engine + adapters +
utils. Full type surface exported. See `packages/geospatial-map/README.md`.

## Application adapter pattern

AspectLead glue lives **outside** the package in `src/features/geospatial/`:

- `aspectlead-map-config.ts` — builds `GeospatialSourceConfig` from
  `NEXT_PUBLIC_MAP_ASSET_BASE_URL` (no hardcoded host).
- `aspectlead-coverage-overlays.ts` — turns the TW run (`/api/tw-map-data`) into generic
  `MapOverlayDefinition[]` (ready / manual / excluded). This is the only place lead data
  touches the map.

Routes:

- `/national-map` — National Map Workbench: all controls, search, inspector.
- `/run-builder` — embeds `GeospatialMap` **directly (no iframe)** with feeder config; map
  browsing never changes the run territory.
- `/coverage-map` — `GeospatialMap` + the AspectLead coverage overlays + an overlay-toggle
  panel. Geographic labels stay lead-independent.
- `/map-component-demo` — proves portability: imports only the package + generic config.

## Map profile

`MapProfile` (v1) is serialisable, validatable, mergeable — save as organisation default,
override per app / user / run. Locked invariants (`motorwaysVisible`, `motorwayNumbers`) are
forced true by validate/merge; malformed input is recovered, not rejected.

## Road hierarchy

`RoadClassStyleMapping` maps every OS source class to an application class
(motorway/primary/a_road/b_road/local/minor/service/private/track/other) with minZoom,
default visibility and a locked flag. Motorways: always visible, never toggleable, drawn below
selections + overlays. Primary A / all A default on; B zoom+toggle; local/minor automatic by
zoom; private/track **unavailable** (see supplemental-road policy).

## Feeder-road engine

Generic and decoupled from rendering. Feeders come from organisation default / manual /
automatic suggestion / application. The engine computes candidates (strategic primary/trunk
connectors — **not** every A road) and curation (accept/reject/priority/reason); the map only
displays the included set (orange highlight). No hardcoded regional list.

## Label + postcode hierarchy

Zoom-dependent symbol layers for cities/towns/villages/localities, motorway/A/B numbers, road
& street names, stations, and postcode area/district/sector (derived centroids) + full postcode
on hover/selection. **All independent of operational data.** Glyphs: Open Sans (OFL 1.1).

## Asset / object-storage deployment

- Tiles (PMTiles) and glyph PBFs are **not committed** — served from object storage / CDN.
- `NEXT_PUBLIC_MAP_ASSET_BASE_URL` selects the origin (local `/map` in dev, CDN in prod).
- Glyphs are reproducible from a clean checkout: `npm install && npm run geo:glyphs`
  (licence + metadata + TTF checksums recorded in `docs/data-sources/`).
