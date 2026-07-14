# Specification: Discovery Run Builder

_AspectLead Lead Intelligence Platform — Lead Discovery module, first screen_

## Scope

This spec covers **the first screen** of the Lead Discovery module — the
**Discovery Run Builder** — **plus the national geospatial foundation** it
embeds. **Discovery Sources (the second screen) is out of scope** for this task.

The national map here is the same shared infrastructure described in
`docs/architecture/national-geospatial-foundation.md`. It is **browsable
independently of the run**: selecting a territory focuses the map but national
panning/zoom is always retained. As established there, the app currently has
**only a regional proof-of-concept dataset**, not national coverage — the
builder must not imply otherwise.

**Cross-references:** `docs/architecture/national-geospatial-foundation.md`,
`docs/data-sources/geospatial-source-register.md`,
`docs/decisions/ADR-national-map-and-road-layers.md`,
`src/lib/geo/map-layer-config.ts`, `src/lib/geo/geospatial-source-manifest.ts`,
and the existing Territory step docs (`/run-setup`, see
`docs/47_TERRITORY_SELECTION_AND_POSTCODE_LOGIC.md`).

---

## 1. Layout — three columns

| Column | Contents |
| --- | --- |
| **Left — Pipeline stepper** | The run pipeline steps (Run identity → Territory → Target profile → … → Discovery Sources). Current step highlighted; only implemented steps are navigable. |
| **Centre — Configuration workspace** | The working area, dominated by a **large national map**, with the configuration sections below and the map controls drawer. |
| **Right — Live summary** | A live, always-visible summary of the run configuration as it is built. |

---

## 2. Run identity / draft

- Name the run; optional description.
- The run starts as a **draft**. Draft state is recoverable from `localStorage`
  (draft recovery only — see section 11).
- Records created/updated timestamps and a version.

---

## 3. Territory configuration

Reference the existing Territory step (`/run-setup`) and
`docs/47_TERRITORY_SELECTION_AND_POSTCODE_LOGIC.md`. Selection modes:

- Postcode **area**
- Postcode **district**
- Postcode **sector**
- **Full** postcode
- **CSV** upload of postcodes

Rules:

- **Physical-location rule:** a lead qualifies by the **physical location** of
  its premises within the territory, not by registered/administrative address.
- **Surrounding-area behaviour:** configure whether and how surrounding areas
  are included around the selected territory.

Today only the six POC areas (HA, SL, SW, TW, UB, W) have postcode polygons;
territory selection outside those has no polygon geometry until national data is
imported.

---

## 4. National map foundation

- The map is the **shared national foundation** and is **browsable independently
  of the run**.
- Selecting a territory (e.g. **TW**) **focuses** TW but **national panning is
  retained** — the user can pan away at any time.
- **No TW-specific rule becomes national application logic** (locked decision).
- Map actions on a feature/area:
  - **Inspect** — view details without changing the run.
  - **Add to run** — add the area to the run territory.
  - **Replace territory** — replace the current run territory with the selection.
  - **Start separate run** — begin a new run from the selection.
  - **Only implemented actions are active**; unimplemented ones are shown
    disabled or hidden, never fake.

---

## 5. Map controls drawer

A drawer exposing the layer configuration from `src/lib/geo/map-layer-config.ts`:

| Group | Controls |
| --- | --- |
| **Map detail** | Basemap detail / zoom-band behaviour |
| **Roads** | Per-class visibility per `ROAD_CLASSES` — motorways locked on; A default on; B off at wide zoom; minor/local automatic; private/tracks at closest |
| **Feeder roads** | Show organisation feeder network; suggest roads serving territory; suggest roads entering towns; highlight motorway connections and town-centre approaches (`FEEDER_CONTROLS`) |
| **Places & labels** | `LABEL_CATEGORIES` toggles; density **Standard / Dense (default) / Maximum** |
| **Postcodes** | Area / district / sector / points / full-postcode polygons (polygons gated by licence review) |
| **Transport** | Railways, stations, airports |
| **Environment** | Water, greenspace, woodland, buildings, contours, POI (`ENV_LAYERS`) |
| **Operational overlays** | Territory overlay; future lead/customer/demographic/route overlays |

Drawer actions: **Reset**, **Save as organisation default**, **Save as run
profile**. **Only working persistence is enabled**; controls whose datasets are
missing are disabled with an honest note rather than shown as working.

---

## 6. Target-business profile

- **Default profile: "Independent Foodservice."**
- Food categories: restaurants, takeaways, fast food, chicken shops, piri-piri,
  grills, kebab, pizza, burger, fish & chips, cafés, coffee shops, bakeries,
  dessert, caterers, food trucks, pubs serving food, independent hotel
  restaurants.

### Separate classification axes

Configured independently of each other:

| Axis | Examples |
| --- | --- |
| **Primary type** | Restaurant, takeaway, café, pub, caterer, food truck… |
| **Cuisine** | Piri-piri, kebab, pizza, burger, fish & chips, dessert… |
| **Service model** | Dine-in, takeaway, delivery, catering, mobile… |
| **Ownership** | Independent, small group, franchise… |
| **Trading status** | Trading, dormant, newly opened, closed… |

---

## 7. Default exclusion policy

Excluded by default: supermarkets, hypermarkets, grocery, convenience, petrol
(forecourt), wholesalers, cash-and-carry, non-food retail, large national
chains, unsuitable premises, and unproven physical outlets.

- The **chain registry** (the list of large national chains to exclude) is a
  **configurable registry kept OUT of the component** — it is data, editable and
  referenceable, not hardcoded into the UI.
- Exclusions are configurable per run (overridable where justified).

---

## 8. Requested data fields

Configure which data fields the run should request/collect per lead (e.g.
business name, address, postcode, category, contact, company registration,
ratings/reviews, evidence links). Field selection is part of the run
configuration and persisted with it.

---

## 9. Custom terms & tags

- **Custom terms:** run-specific search/matching terms.
- **Tags:** free-form labels attached to the run for organisation/filtering.

---

## 10. Live configuration summary

The right-hand column shows, live: run identity, territory (mode + selection +
surrounding-area behaviour), target profile and axes, active exclusions, map/
label/road/feeder profile in use, requested fields, and custom terms/tags. It
updates as the user edits.

---

## 11. Persistence

**DB-ready schema** (tables the design must support, even if only drafted now):

- `runs`
- `territories`
- `map_profiles`
- `label_profiles`
- `road_profiles`
- `feeder_entries` (matching `FeederRoadEntry`)
- `target_profiles`
- `exclusions`
- `chain_policy` (the configurable chain registry)
- `custom_terms`
- `fields`
- `tags`
- `audit` (audit trail)
- versioning across the above

**localStorage** is used for **draft recovery only**. It must **never** store
national geospatial data or customer data.

---

## Out of scope

- **Discovery Sources** (second screen).
- Full national map rendering (pending dataset import — see the architecture
  doc and source register).
- Full-postcode polygons (licence review; points only for now).
- Northern Ireland (documented gap).
