# 60 — Geography Standard v1.0

A platform-wide, front-end and back-end standard for how AspectLead names, models,
resolves and persists geography. Generic geography logic lives in the independent
`@geospatial/map` package (**v0.2.0**); AspectLead keeps only the business geography
(sales region / territory / delivery coverage), run selections and source-planning
adapters.

## Canonical terminology (objective 1)

| Entity | Where defined | Notes |
| --- | --- | --- |
| Nation | package | England / Scotland / Wales / NI (NI is an honest gap) |
| County / region | package | admin grouping |
| Local authority | package | council/borough/unitary |
| City / Town / Locality / Village | package | **place** kinds |
| Postcode Area / District / Sector / Unit | package | postal hierarchy; **"Postcode District" replaces "outcode"** |
| Address / business | package | leaf premises |
| **Organisation** | AspectLead (= tenant) | |
| **Sales Region → Sales Territory → Delivery Coverage** | AspectLead | business hierarchy |

Full glossary: `@geospatial/map` `GEOGRAPHY_GLOSSARY`. The legacy word **"outcode" is
replaced by "Postcode District" in every user-facing surface**; the term survives only
inside adapter internals where an external API dictates it (Just Eat's
`bypostcode/{outcode}` path).

## Hierarchies (objectives 2–3)

- **Postal**: Postcode Area → District → Sector → Unit → Address.
- **Business**: Organisation → Sales Region → Sales Territory → Delivery Coverage.

Place geography and postcode geography are linked by **explicit many-to-many records**
(`place_postcode_link`), never by assuming "towns ≈ districts" (objective 4).

## Data-capability matrix (objective 14 — honest)

| Capability | Status | Backed by |
| --- | --- | --- |
| Postcode area/district/sector enumeration + centroids + unit counts | **available** | `postcode_reference` (13,864 rows, seeded from Code-Point-derived `postcode_labels.geojson`) |
| area→district, district→sector expansion | **available** | the reference above |
| Postcode unit classify | available | regex (leaf; not enumerated) |
| Map-polygon → districts/sectors | **available (centroid-based)** | real centroids, point-in-polygon — **labelled centroid-based, NOT boundary containment** |
| Business territory/coverage ↔ postcode sets | available | our own operational data |
| **Place (city/town/village) expansion** | **pending_data** | needs **OS Open Names** — DISABLED, fails honestly, never guesses |
| **place ↔ postcode association** | **pending_data** | no dataset; `place_postcode_link` empty |
| postcode → region / LA / ward | pending_data | needs **ONSPD** |
| National postcode **boundary polygons** | partial | only 6 West-London areas exist; national polygons absent (map-polygon uses centroids) |
| Northern Ireland | unavailable | GB-only (honest gap) |

## Expansion + planning (objectives 6–9)

- The generic engine (`resolveSelection` / `planSelections` / `planForSource`) turns a
  selection into deduped query units. **Area tokens now EXPAND to their districts**
  (previously they were silently dropped).
- Each source declares `SourceGeographySupport`. **Just Eat supports postcode-district
  only**, so sectors/units are reduced to their district; there are never duplicate query
  units.
- Discovery accepts: sales region, sales territory, delivery coverage, postcode
  area/district/sector/unit, city/town/locality/village (→ `pending_data`), map polygon,
  and a mixed list.

## Provenance (objective 7)

`discovery_selection` (one row per original selection) preserves: original kind + value,
resolved entity, status, method, expansion count, source + version, and honest reason.
`query_unit` records the codes **actually executed** per source (unique per run+source).

## Migrations & seed (objective 5)

`supabase/migrations/0012–0014`: `postcode_reference`, `postcode_alias`, `place`,
`place_postcode_link`, `admin_area` (0012); business hierarchy + `territory_postcode` /
`coverage_postcode` + `discovery_selection` + `query_unit` (0013); rename
`discovery_runs.derived_outcodes → derived_query_units` (0014). Seed:
`npm run seed:postcode-reference` (national enumeration; genuine data only). Every table
carries `source` + `source_version` for future OS Open Names / ONSPD ingestion.

## Tests

- Package: `npm run test:geography` (classification, expansion, honest place-failure,
  centroid polygon, source planning, no duplicates, mixed input).
- AspectLead: `npm run test:geography-standard` (all 11 categories incl. town-spanning →
  pending_data, provenance preservation, no user-facing "outcode").

## Known limitations (do not fabricate)

Place/admin expansion is disabled until OS Open Names + ONSPD are ingested; national
boundary polygons are absent (map-polygon is centroid-based); Northern Ireland is out of
scope. These are recorded as `pending_data`/gaps, never guessed. See `docs/11_ISSUES_LOG.md`.
