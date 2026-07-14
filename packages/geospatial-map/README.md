# @geospatial/map

A **portable, application-independent** Great Britain map component built on MapLibre GL
JS + PMTiles. It provides geography, rendering, controls, selection, layers and extension
points. **Applications supply their own operational data through overlays and adapters.**

The package knows nothing about leads, customers, pipeline runs, or any business domain.

## What it is not tied to

- No AspectLead / Magna business logic
- No single route, screen, postcode area or module
- No customer, Sales Pro or NetSuite schema
- No hardcoded hosts (tile/glyph URLs are configuration)

## Minimum copy

1. Copy `packages/geospatial-map/` into your app.
2. Install peer deps: `react`, `react-dom`, `pmtiles`. Provide MapLibre GL JS as
   `window.maplibregl` (a `<script>`, or `setMaplibreAssets({ js, css })`).
3. Host the map assets (PMTiles + glyph PBFs) somewhere and point the config at them.
4. Render:

```tsx
import { GeospatialMap } from "@geospatial/map";
import type { GeospatialSourceConfig, MapProfile } from "@geospatial/map";

const sources: GeospatialSourceConfig = {
  tileBaseUrl: "https://cdn.example/map/tiles",
  glyphBaseUrl: "https://cdn.example/map/fonts/{fontstack}/{range}.pbf",
  sources: { zoomstack: "zoomstack.pmtiles", openRoads: "openroads.pmtiles", codePoint: "codepoint.pmtiles",
             postcodeLabels: "https://cdn.example/map/postcode_labels.geojson" },
  attribution: [{ text: "Contains OS data © Crown copyright and database right 2026 · OGL v3.0" }],
};

<GeospatialMap sources={sources} initialView={{ longitude: -2.9, latitude: 54.3, zoom: 5.2 }} />
```

That is the whole requirement — no application database, no lead/customer schema.

## Public API

```ts
import {
  GeospatialMap, MapControlDrawer, FeatureInspector, MapSearch, MapStatus,
  createDefaultMapProfile, validateMapProfile, mergeMapProfiles, serialiseMapProfile, deserialiseMapProfile,
  ROAD_CLASS_MAPPINGS, validateRoadCoverage, motorwayLocked, CONTROL_SECTIONS, layerVisibilityForProfile,
  createMapStyle, buildMapSources, registerPmtilesProtocol, ensureMaplibre, setMaplibreAssets,
  suggestFeeders, addManualFeeder, addFeederByName, includedFeederNumbers, setFeederStatus, setFeederPriority, removeFeeder,
  defaultFeatureInfoAdapter, createDefaultSearchAdapter,
} from "@geospatial/map";

import type {
  GeospatialMapProps, MapProfile, MapLayerConfig, RoadLayerConfig, RoadClassStyleMapping, FeederRoadEntry,
  LabelConfig, PostcodeLayerConfig, EnvironmentLayerConfig, MapFeatureSelection, MapOverlayDefinition,
  MapEventHandlers, GeospatialSourceConfig, MapSearchAdapter, FeatureInfoAdapter, TileSourceAdapter,
  SupplementalRoadSource,
} from "@geospatial/map";
```

## Optional capabilities (how another app extends it)

| Need | How |
| --- | --- |
| Custom overlay (leads, depots, routes, demographics…) | pass `overlays={[MapOverlayDefinition]}`; toggle via the `onMapReady` handle (`addOverlay`/`removeOverlay`/`setOverlayVisibility`) |
| Custom search provider | implement `MapSearchAdapter` and pass `search={adapter}` |
| Custom feature inspector | use `onFeatureSelect`/`onFeatureHover` and render your own panel (set `controls.featureInspector: false`) |
| Custom feeder roads | own the `FeederRoadEntry[]` state; pass `feederRoads` + `onFeederRoadsChange` |
| Different default map profile | build with `mergeMapProfiles(createDefaultMapProfile(), overrides)` and pass `profile` |
| Different branding / colours | wrap in your own container/styles; the drawer is inline-styled and unopinionated |
| Different asset hosting | change `tileBaseUrl` / `glyphBaseUrl` in the source config (env-driven) |

## Do NOT require

Another app must **not** need: AspectLead routes, database, customer/lead schema, or the
TW API route. The `map-component-demo` route in this repo proves the package runs on generic
config alone.

## Folder mapping

The suggested Part-2 structure is consolidated for consistency (fewer files, one source of
truth per concern):

| Suggested | Here |
| --- | --- |
| `types/{map,layers,roads,labels,postcodes,overlays,events}.ts` | `src/types.ts` (one sectioned module) |
| `config/{defaultMapProfile,layerRegistry,zoomRules,roadRules,labelRules}` | `src/config/{defaultMapProfile,roadRules,layerRegistry}.ts` |
| `core/{createMap,createMapStyle,mapLifecycle,pmtilesProtocol}` | `src/core/*` |
| `layers/*` | folded into `src/core/createMapStyle.ts` (single style builder) |
| `adapters/*` | `src/adapters/adapters.ts` |
| `controls/*` | `src/config/layerRegistry.ts` (`CONTROL_SECTIONS`) |
| `feeder engine` | `src/feeder/feederEngine.ts` |
| `utils/*` | `src/utils/utils.ts` |
| `components/*` | `src/components/*` |

## Locked rules (enforced in code + tests)

- Motorways are always visible and cannot be disabled (`motorwaysVisible: true` is forced by
  `validateMapProfile`/`mergeMapProfiles`; motorway layers are excluded from the toggleable set).
- Motorway numbers are always on.
- Every source road class must map to a style or documented alias — `validateRoadCoverage`
  fails on unknown classes (`npm run test:map`).
- Labels (including postcode area/district/sector) are geography-driven and **independent of
  any operational data**.
- The selected territory is an overlay and never restricts national browsing.

## Assets

- **Tiles**: PMTiles produced by `scripts/geo/*` (OS OpenData, GB). Served from object
  storage / CDN. Never committed to git.
- **Glyphs**: Open Sans (SIL OFL 1.1), generated by `scripts/geo/gen-glyphs.js`
  (`npm run geo:glyphs`) from `@expo-google-fonts/open-sans`. Reproducible from a clean
  checkout; deployed via the asset pipeline, not committed.
- **Private roads / tracks**: not present in the free OS Open source. The drawer marks them
  **unavailable**; add a `SupplementalRoadSource` when a lawful source is confirmed
  (see `docs/data-sources/supplemental-road-sources.md`).
