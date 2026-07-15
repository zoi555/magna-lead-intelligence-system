# 56 — Map Interaction Functional Pass

Status: implemented 2026-07-15. Package `@geospatial/map` bumped to **v0.1.2**; AspectLead
pinned to that tag. This pass fixed map controls that did not accurately control the
visible map. It did **not** start the Discovery Sources engine (that is the next task).

## 1. Road rendering

A roads previously rendered as fuzzy sub-pixel hairlines. Fixed in the package:

- Road widths raised above ~0.9px at each class's min zoom so lines render as clean solids
  (`config/roadRules.ts`).
- Major classes (motorway, A, B) now draw a **casing + solid fill** pair (`core/createMapStyle.ts`
  `casing()` + `solidRoad()`), round caps/joins, no dash arrays.
- Hierarchy preserved: motorway > primary A > other A > B > minor/local. Primary A vs other
  A are split by the `primary_route` flag (`A_PRIMARY_FILTER` / `A_OTHER_FILTER`).

## 2. Road labels obey road visibility (coupling)

Road-number and road-name label layers are tied to their road geometry's visibility in
`layerVisibilityForProfile` (`config/layerRegistry.ts`):

| Label layer | Visible only when |
| --- | --- |
| `label-a-num` | any A road visible **and** A-number labels on |
| `label-b-num` | B roads visible **and** B-number labels on |
| `label-road-name` | any labellable road visible **and** road names on |
| `label-motorway-num` | always (locked — the single exception) |

Disabling primary A / other A / B / local roads now hides both the geometry and the labels.
Covered by `tests/test-map-package.ts` ("disabling all A roads hides … number labels").

## 3. Postcode study mode

One explicit mode selector replaces the four independent postcode checkboxes.
`profile.postcodes.mode` ∈ `off | area | district | sector | full`. The active mode alone
drives labels, hoverable geography, hover highlight, click selection, persistent selection
and the feature-inspector identity. Levels are never shown all at once, and full-postcode
labels are never mass-rendered. Drawer: "Postcode study mode" section, radio-like controls.

## 4. Actual postcode boundary availability (audited, honest)

The package's **production CDN** (`assets.geospatmap.com`) carries postcode **centroid
POINTS only — no boundary polygons** at any level:

| Level | Asset | Geometry | Interaction |
| --- | --- | --- | --- |
| Area / District / Sector | `postcode_labels.geojson` (`level=…`) | centroid point | label + point hover/select (`pc-hit` transparent circle) |
| Full postcode | `codepoint.pmtiles` | point | points at close zoom + point hover/select (`pc-hit-full`) |

Postcode hover/selection is therefore **point-based**, not polygon fill. The drawer states
"Boundary polygons unavailable" on every level. Polygons are **not fabricated** from
centroids. Missing asset recorded: canonical postcode boundary polygons (area/district/
sector). If licensed later, polygon layers can be wired without changing the mode contract.

> Note: AspectLead separately ships a **local feasibility polygon layer**
> (`public/map/pc_districts.geojson`, Code-Point-Open-derived) used only for the run
> **territory outline** (§6). That is an application asset, not the package's map source.

## 5. Hover vs selection (generic, in the package)

- Hover → light temporary highlight (`hover` / `hover-point`).
- Click → persistent selection (`selection` / `selection-point`), **blue `#2563eb`**.
- A new click replaces the previous selection; hover never erases the selection.
- **Escape** (or a host clear action) removes the selection.

The package owns the highlight rendering; AspectLead only consumes `onFeatureHover` /
`onFeatureSelect`.

## 6. Run-territory styling (AspectLead)

The run's outcodes (free text, e.g. `TW3, TW4`) are turned into `TerritoryGeometry[]` by
`src/features/geospatial/aspectlead-territory.ts`, matched against the local district
polygon layer, and passed to the map as `selectedTerritories`. The package draws them as an
**orange (`#ea580c`) dashed outline + 6% fill** — visually distinct from the blue selection
and the dark postcode hover. The outline is recomputed only from the territory input, so
**browsing the map never changes it**. No polygon match → the territory clears (nothing
invented), with an honest on-screen note.

## 7. Delivery-coverage overlay (AspectLead)

`deliveryCoverageOverlay()` in `aspectlead-coverage-overlays.ts` produces a generic
`MapOverlayDefinition` (teal `#0f766e`, restrained dashed outline + 8% fill, off by default),
grouped under "Operational" in the coverage-map panel. The map package never imports this
file — coverage is application-specific.

**Honesty:** there is **no canonical delivery-area geometry** yet. The only asset is
`public/map/delivery_boundary.geojson`, which self-describes as an *illustrative mock*. The
overlay is labelled "Current delivery coverage (mock)" and the panel carries an amber notice.
`DELIVERY_COVERAGE_SOURCE_STATUS` records the missing canonical source for later swap-in.

## 8. Map height & expansion

- Embedded run-builder map raised to responsive `620 → 720 → 760px`
  (`ExpandableMap` default `embeddedClassName`).
- **Expand** control toggles the map container to a full-viewport overlay. It uses the
  **same `GeospatialMap` instance** — the React subtree is never unmounted; only the
  container CSS changes and `map.resize()` is called. Expanded mode therefore retains the
  view, study mode, selection, territory, roads, coverage overlays and feeders. Escape
  collapses.
- Ownership: `src/features/geospatial/ExpandableMap.tsx` is app glue; no map logic, no
  second map implementation.

## 9. Run Builder layout

Sticky pipeline stepper (`sticky top-0`), sticky right-side Live config / Validation /
Draft rail (`xl:sticky xl:top-16`), persistent visible **Save run draft** in the Validation
card. Map section carries the Expand control and the territory-outline status line.

## 10. Control audit

Every drawer control now maps to a real, visible layer/behaviour change, or is disabled
with an honest note (private roads/tracks: "unavailable"; postcode levels: "Boundary
polygons unavailable"). The previously no-effect postcode-sector checkbox is replaced by the
single study-mode selector (§3).

## 11–13. Verification & release

- Package: `npm run typecheck` + `npm run test` green (adds study-mode + label/road coupling
  invariants). Released as immutable tag **v0.1.2**, pushed to `zoi555/geospatial-platform`.
- AspectLead: pinned to v0.1.2, `npx tsc --noEmit` clean, retained tests green
  (`run-draft`, `custom-config`, `scoring`, `telesales-safe`, `geo`), `npm run build`
  succeeds, all routes serve 200, no asset 404s, no server errors.
- Not force-pushed. In-browser pixel verification (solid A roads on screen, live hover,
  expand) was **not** run in this pass — the Chrome automation extension was unavailable;
  see `11_ISSUES_LOG.md`.

## 14. Next task

The next task is the **Discovery Sources engine** (pipeline step 2 in the Run Builder). It
was deliberately **not** started here.
