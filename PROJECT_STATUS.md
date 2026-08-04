# Project Status — Magna Lead Intelligence System

## Current state — 2026-07-14 (AspectLead / Lead Discovery module)

Active build on branch `feature/mvp-vertical-slice-001`. The Lead Discovery pipeline (FSA + live
Just Eat + Companies House + Google Places + customer exclusion) and the TW platform-first
independent workflow are operational and exported locally. Current focus: the **Discovery Run
Builder** first screen and its **national geospatial foundation**.

### Work completed
- Lead discovery pipeline (platform-first Just Eat, FSA validation, Companies House status/directors/financials, Google Places enrichment, customer exclusion, data completeness, commercial calc, export gate).
- TW independent review workflow (clean / manual-review / excluded) + `/coverage-map` MapLibre map (regional OS geometry) + `/export-review` showing the single current TW run.
- Geospatial-foundation Milestone 1: honest source manifest (`src/lib/geo/geospatial-source-manifest.ts`), locked map-layer/road/zoom/label/feeder architecture (`src/lib/geo/map-layer-config.ts`), road-coverage validation, `npm run test:geo`, and documentation (architecture / source register / ADR / run-builder spec).

### Map interaction functional pass — 2026-07-15 (`@geospatial/map` v0.1.2)
- Solid A roads (casing+fill, primary/other split); road labels coupled to road toggles;
  single postcode **study mode** (point-based, no fabricated polygons); hover vs persistent
  **blue** selection (Escape clears); territory stays **orange**.
- AspectLead: `ExpandableMap` (same-instance Expand, 620→760px), run-territory outline from
  local district polygons, delivery-coverage overlay (labelled **mock** — no canonical source
  yet, ISS-0009), sticky Run Builder layout.
- Verified: package + app typecheck/tests/build green, routes 200, no 404s. In-browser pixel
  verification pending (ISS-0011). Docs: `docs/56_MAP_INTERACTION_FUNCTIONAL_PASS.md`.
- **Next task: Discovery Sources engine** (not started here).

### Just Eat Discovery — Stage 1 — 2026-07-16 (first discovery-engine vertical slice)
- **New canonical database**: hosted Supabase Postgres `aspectlead-platform` (eu-west-2, $10/mo, approved). 10 version-controlled migrations applied (`supabase/migrations/0001–0010`): tenancy + RLS, discovery_runs, je_executions (+claim/heartbeat RPCs), immutable je_raw_observations, je_outlets, je_rating_history, je_field_provenance, je_execution_quality. Tenant-aware RLS; raw payloads column-restricted; anon has no access; service-role server-only.
- **Just Eat engine** (`src/lib/discovery-engine/`): field catalogue (verified from 4,904 live records), parser, UK phone normaliser, adapter (reuses the one lawful listing endpoint), repository (Supabase + in-memory), locally-runnable worker (`npm run je:worker`) with production-safe claim/heartbeat/lease contract, data-quality report.
- **APIs + UI**: `/api/discovery/runs` (save), `/queue`, `/status`, `/executions/[id]/cancel`; Run Builder "Just Eat — Stage 1" panel (save+queue+live coverage+cancel).
- **Verified**: typecheck clean; `test:je-stage1` (40+ assertions) green; DB-level immutability/dedupe/cascade/claim verified via MCP; retained tests + `npm run build` green. Integration test (`test:je-supabase`) skips until the service-role key is pasted.
- **Honesty**: phone/menu/reviews reported 0% (not supplied by the listing endpoint), never fabricated. Decision gate after Stage 1: A add another platform · B validation/dedup/customer comparison · C improve the JE connector.
- **Pending from user**: paste `SUPABASE_SERVICE_ROLE_KEY` into `.env.local` (ISS-0012); set `JUST_EAT_ENABLED=true` to run live. Docs: `docs/57`, `docs/58`.
- Deliveroo/Uber Eats/customer comparison/Companies House/FSA/Google **not started** (deliberate).
- **Fixes 2026-07-16 (migrations 0009–0011):** worker UUID crash on empty queue (claim RPC → `SETOF`); observation-delete FK `ON DELETE SET NULL`; execution progress counter (`completed_queries` written authoritatively + intra-query heartbeat + ownership-guarded finish → no more 0/1, no lease-expiry double-processing). **11 migrations total.**
- **Detail audit (docs/59):** Just Eat outlet detail is Cloudflare-blocked (403) with no public detail/menu endpoint (404) — phone/menu/opening-hours not lawfully retrievable; **recommend option B** (enrich phone/menu later via Google Places/Companies House/websites, not JE detail). ISS-0015 (718 duplicate observations from the pre-fix double-claim) awaits a prune decision.

### Geography Standard v1.0 — 2026-07-16 (platform-wide)
- **Generic geography → `@geospatial/map` v0.2.0** (`src/geography/`): canonical terminology (16 entities), postcode classify/expand, place models, capability, planner. AspectLead keeps business geography + run selections + source-planning adapters.
- **Migrations 0012–0014**: `postcode_reference` (**seeded 13,864** from the national Code-Point-derived enumeration), `postcode_alias`, `place`/`place_postcode_link`/`admin_area` (empty, **`pending_data`**), business hierarchy (`sales_region`/`sales_territory`/`delivery_coverage` + territory/coverage↔postcode M:N), `discovery_selection` + `query_unit` (provenance). Renamed `derived_outcodes → derived_query_units`. Seed: `npm run seed:postcode-reference`.
- **Deterministic expansion** area→district→sector from real data (UB→12 districts; UB1→4 sectors); **area tokens now expand** (were dropped). Just Eat declares district-only support; sectors/units reduce to district; no duplicate query units.
- **Honest gaps** (objective 14): place/admin expansion DISABLED (`pending_data`, never guessed) pending OS Open Names + ONSPD; map-polygon is **centroid-based** (national boundary polygons absent); NI out of scope. place↔postcode is explicit M:N, never inferred.
- **"outcode" → "Postcode District"** in all user-facing surfaces (kept only in adapter internals for the JE API path). UI geography selector: preview, result type, expansion count, inspect children, exclusions.
- Verified: package `test:geography` + AspectLead `test:geography-standard` (11 categories) green; retained + JE tests green; `npm run build` green; migrations applied + advisors clean. Docs: `docs/60_GEOGRAPHY_STANDARD.md`.

### Work in progress
- Discovery Run Builder Step 1 (Territory) screen at `/run-setup` (interactive territory entry + detection + policies + draft persistence).

### Datasets present — NATIONAL (Great Britain), imported + verified 2026-07-14
- **Imported + tiled to PMTiles** (served from `~/Data/aspectlead-geospatial/tiles`, symlinked into gitignored `public/map/tiles/`, never committed): OS Open Zoomstack national basemap (2.5GB, 18 layers), OS Open Roads national (322MB, 3,961,077 links, ALL classes), Code-Point Open (38MB, 1,747,841 postcode points), OS Open Greenspace (81MB), OS Open Rivers (126MB), Boundary-Line (331MB).
- **GB coverage verified** at geographic extremes (Shetland→Cornwall, Wales, East Anglia); evidence in `manifests/coverage-verification.json`. Checksums in `manifests/{checksums,tiles-checksums}.sha256`.
- Toolchain installed (gdal/tippecanoe/pmtiles); reproducible pipeline in `scripts/geo/`; `pmtiles@4.4.1` added to render tiles. National map at `/national-map`.
- The regional POC (`public/map/*.geojson`, A Road + Motorway only) is **superseded** as the production dataset.

### Datasets held but not yet tiled / still missing
- **Downloaded, not tiled** (Zoomstack already covers their map role nationally): OS Open Names (214MB — needed only for the place-search gazetteer), OS OpenMap Local (3.5GB — detailed buildings/functional sites).
- **Not acquired**: ONS Postcode Directory (ONS portal — for national area→district→sector expansion). **Licence-gated**: full-postcode-unit polygons (paid; points only from Code-Point). **Genuine gap**: Northern Ireland (OS Open* is GB-only; verified absent at Belfast).

### National map EXPERIENCE — complete + visually verified (2026-07-14)
- **Zoom-dependent labels** (glyphs generated via fontnik → gitignored `public/map/fonts`): cities/towns/villages/localities (Zoomstack `names` by type), motorway/A/B road numbers, road/street names, railway stations, and postcode area/district/sector labels (derived centroids from 1.75M Code-Point points → `public/map/postcode_labels.geojson`, **independent of leads**), full postcode on hover.
- **Full road hierarchy** styled by `road_function`: motorways (locked on), primary/all A, B (zoom+toggle), minor/local/local-access/restricted/secondary. Private roads/tracks **honestly marked unavailable** (not in free OS data).
- **Close-zoom detail**: OS OpenMap Local `functional_site` tiled (`funcsite.pmtiles`); Zoomstack buildings (15.2M national OpenMap Local buildings deferred as too heavy — Zoomstack covers them).
- **Controls drawer** with all sections (Roads, Places & labels, Postcodes, Transport, Environment) + honest availability; **feeder-road system** (model `src/lib/geo/feeder-roads.ts` + UI: org defaults empty, manual add, suggest-from-view accept/reject, priority, reason; highlights in orange — verified with A316). **National browsing** — run territory never restricts the map (chip + verified GB→street navigation).
- **Visually verified** in headless Chromium (Playwright, `scripts/geo/visual-test.mjs`) at all 7 zoom levels (GB → region → city → town → PC district → PC sector → street); screenshots in `~/Data/aspectlead-geospatial/screenshots`; **no console errors**.

### Discovery Run Builder first screen — COMPLETE + QA-passed (`/run-builder`)
Run identity (generated default name + last-saved) · pipeline navigator · territory · embedded national map (shared component, no iframe) · full taxonomies · exclusions · configurable large-chain registry · custom include/exclude terms · 23-field requested-data catalogue · result tags · live configuration summary · validation · draft recovery + restore-recommended-defaults · **DB-ready draft (schemaVersion 2)**. Default **Independent Foodservice** profile pre-selected. Discovery Sources step intentionally NOT built.
- **Final four items completed (2026-07-14):**
  1. **Business-taxonomy search** — case-insensitive partial-match, grouped filtering, empty groups hidden, clear restores, selections preserved (`searchBusinessTypes`).
  2. **Run-specific custom business types** — add (auto-selected), duplicate-prevented (case-insensitive vs standard + custom, diacritics folded), stable key, remove, persisted (`custom-config.ts`, `BusinessTypeOption`).
  3. **Advanced custom requested fields** — label, validated internal key (auto-suggested), data type, requirement, intended source (+ note when "Other"), visibility, export permission, notes; inline expandable editor; field-level + summary validation; committed fields only enter the draft (`CustomRequestedField`).
  4. **Accessible live status** — `aria-live="polite"` for save/restore/added; `role="alert"` for blocking errors (duplicate rejected, field validation) and the validation summary. No `window.alert()`.
- **Draft schema v2 + migration:** `migrateDraft()` upgrades v1 drafts (adds `customBusinessTypes`; upgrades `customFields` {id,label}→full `CustomRequestedField` with safe defaults) with no data loss; unknown/garbage input returns null (no crash).
- **QA (headless Chromium, blank draft):** search chicken → only Quick service/Chicken shop; toggle/clear work; custom type add + duplicate rejection; custom field with metadata + live key validation; **save→reload restores custom type AND custom field**; restore-defaults clears them; live summary shows Custom business types + Custom fields counts; **no console errors**; responsive clean at 1440/1024/768px. Tests: `test:custom-config` (33 assertions).

### Map is now EXTERNAL — AspectLead is a client of the independent platform (2026-07-15)
- **Canonical map source is the independent repo `zoi555/geospatial-platform`** (private), package **`@geospatial/map`**. AspectLead no longer holds a local canonical copy — `packages/geospatial-map/` has been **removed** from this repo.
- **Dependency (immutably pinned):** `"@geospatial/map": "git+https://github.com/zoi555/geospatial-platform.git#v0.1.0"`; the lockfile pins the exact commit **`e7d9761`** (tag `v0.1.0`). Next `transpilePackages: ["@geospatial/map"]` compiles the package's raw TS from `node_modules`.
- **AspectLead-specific adapters remain local** under `src/features/geospatial/` (`aspectlead-map-config.ts`, `aspectlead-coverage-overlays.ts`) — coverage overlays + the source/env adapter. None of this is in the package.
- **Production assets:** `aspectleadSourceConfig()` now calls the package's `createProductionSourceConfig()` → default **`https://assets.geospatmap.com/gb/2026-07-14`** (Cloudflare R2 + CDN); `NEXT_PUBLIC_MAP_ASSET_BASE_URL` overrides (e.g. `/map` for local dev). No runtime dependence on `~/Data/...`, `public/map` symlinks, or the R2 S3 API endpoint.
- **Verified:** external resolution genuine (`node_modules/@geospatial/map`); `/national-map`, `/run-builder` (no iframe), `/coverage-map` (overlays via adapters), `/map-component-demo` all render via the external package with **no console errors** (Playwright); AspectLead build + retained tests pass; independent repo typecheck + tests pass.
- **Deployment items (not code blockers):** (1) the CDN currently returns **no `Access-Control-Allow-Origin`** → browsers are blocked cross-origin; add CORS on the R2/Cloudflare asset domain. (2) npm resolves the private git dep via **git+ssh**, so Vercel needs read access to the private repo — add an SSH deploy key, or set `git config --global url."https://github.com/".insteadOf ssh://git@github.com/` + a `GITHUB_TOKEN` credential in the build.
- Generic package tests (`test:map`, `test:map-boundary`, `test:feeders`) were **removed from AspectLead** — they belong to and run in the independent repo. `test:geo` is retained as a client-integration test (external package road rules + AspectLead source manifest).

_History (2026-07-14): the package was developed in-repo as `packages/geospatial-map/` before extraction._

### (historical) Portable geospatial-map package — complete + verified (2026-07-14)
- **`packages/geospatial-map/` (`@geospatial/map`)** — reusable, application-independent map. Public API: `GeospatialMap`, `MapControlDrawer`, `FeatureInspector`, `MapSearch`, `MapStatus`, profile fns, road/label rules, feeder engine, adapters, full types. Boundary-tested: imports only react/react-dom/pmtiles (`test:map-boundary`).
- **iframe removed.** `/national-map` (workbench), `/run-builder` (embeds the component directly), `/coverage-map` (component + AspectLead coverage overlays via `src/features/geospatial/`), and `/map-component-demo` (package + generic config only) all render the **same** shared component. Old duplicated map libs (`national-map.ts`, `map-layer-config.ts`, `feeder-roads.ts`) deleted.
- **Generic overlay system** (`MapOverlayDefinition` + add/remove/setVisibility) — no hardcoded `addLeads()`/`addCustomers()`; AspectLead builds overlays in an adapter outside the package.
- **Serialisable `MapProfile`** (create/validate/merge/serialise/deserialise); locked invariants (motorways + motorway numbers) forced true; malformed profiles recovered.
- **Production glyphs**: Open Sans (SIL OFL 1.1) via `@expo-google-fonts/open-sans`, generated by `npm run geo:glyphs` — reproducible from a clean checkout; licence (`docs/data-sources/OFL-OpenSans.txt`), metadata + TTF checksums (`font-glyph-metadata.json`) recorded; glyph PBFs gitignored/deployed via asset pipeline.
- **Env-configurable assets**: `NEXT_PUBLIC_MAP_ASSET_BASE_URL` (no hardcoded localhost).
- **Supplemental-road policy** documented (`docs/data-sources/supplemental-road-sources.md`): OSM (ODbL) is the only open source with private/service/tracks — licence review required before merge; private/tracks honestly marked **unavailable** meanwhile.

### Build status
`npm run build` passes (`/national-map`, `/run-builder`, `/coverage-map`, `/map-component-demo` — all rendering via the **external** `@geospatial/map`). Retained AspectLead tests: `test:geo`, `test:run-draft`, `test:custom-config`, `test:scoring`, `test:telesales-safe` — **all pass**. (Generic package tests now run in the independent repo.) Four routes visually verified in headless Chromium via the external package (no iframe, canvas renders, no console errors).

### Next exact task
**Discovery Sources** (the next pipeline step) — not started. Before/independently: fix the two deployment items above (CDN CORS; Vercel private-dep git auth). Optional later: OSM supplemental private-road/track pipeline (after licence review); OS Open Names place-search gazetteer; ONSPD national postcode expansion; wire run-draft + map profile to Supabase persistence.

### Known limitations
National map is **Great Britain only** — Northern Ireland is an explicit, honest gap. Private roads/tracks are not in free OS data (marked unavailable; OSM pending licence review). Production tile/glyph hosting must be pointed at object storage via `NEXT_PUBLIC_MAP_ASSET_BASE_URL`. Visual verification used headless Playwright (the Claude Chrome extension was not connectable). **Run-builder is desktop/tablet-first: below ~640px the global AppShell sidebar (fixed ~260px, non-collapsing) causes horizontal overflow — a shell-wide behaviour, not a run-builder defect; not fixed here to avoid redesigning the app shell.** The four remaining first-screen items (taxonomy search, custom business types, advanced custom fields, accessible status) are now **built and QA-passed**. First screen is functionally complete; only Discovery Sources (the next pipeline step) remains, intentionally not started. Nothing has been staged, committed or pushed.

---

## (Historical) Current state

Planning / documentation prepared. No code should be built yet.

## Local path

`~/Projects/magna/lead-intelligence-system/`

## GitHub repo

Created. Remote: `https://github.com/zoi555/magna-lead-intelligence-system.git`
Documentation pack pushed to GitHub on `main`.

## Build status

Not started. No application code, package.json, database, or pipeline yet.

## Deployment

Not deployed.

## Database

Not created yet. Supabase UAT and production should be separate.

## What works

- Business case exists.
- Technical architecture exists.
- Process and operations document exists.
- Security, scale, and governance document exists.
- Field schema workbook exists with 102 fields.
- Starter documentation pack has been generated.
- Protocol pointer files added at repo root: `SPEC.md`, `ARCHITECTURE.md`, `DESIGN.md` (link to the numbered `docs/` pack, no duplicated content).
- `.claude/commands/wrap-up.md` end-of-session command added.
- Repo hygiene: untracked `docs/.DS_Store` junk removed from disk (already gitignored).
- No application build started — no app code, package.json, database, or pipeline.

## Map proof-of-concept (separate repo)

A real-data geospatial coverage map POC has been built and **visually accepted by Zoeb** as the map architecture direction (see **ADR-0011**). It is **not** part of the main app.

- Local: `~/Projects/magna/lead-intelligence-map-poc/`
- GitHub: `https://github.com/zoi555/magna-lead-intelligence-map-poc.git`
- Status: **visually accepted proof-of-concept — not yet integrated into the main app.**
- Stack: self-hosted **MapLibre GL JS** + **OS Code-Point Open** (derived postcode boundaries, feasibility) + **OS Open Roads**. No Google Maps, no Mapbox paid tiles, no paid hosted map service, no billing-enabled service.
- Proven: real postcode polygons, hover/click, coverage shading, delivery gaps layer, A-road display modes.
- Open before production: final boundary-accuracy standard still needs review; feeder routes must be configurable, not hardcoded.

## Data model & access control (design accepted, not built)

The data-model + permissions + Supabase RLS design has been **reviewed and accepted with corrections** (**ADR-0012**). Single-tenant MVP, RLS-first, restricted telesales view (`v_telesales_leads`), geometry stored as separate map assets, `coverage_summary` as a maintained table, hashed suppression/erasure, separate UAT project. **Design only — no SQL, no migrations, no Supabase set up.** Dedup/export tables remain blocked by ISS-0001/0002/0003. See `docs/03_DATA_MODEL.md` and `docs/06_SECURITY.md`.

## Brand: AspectLead (working direction, DRAFT — not implemented)

**Working product brand/domain direction: AspectLead · `aspectlead.app`** (draft; **not** legally
cleared — trademark/domain/social checks outstanding). **"Magna" is not the product brand** (Magna =
future first tenant only). Brand identity draft in `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md`; a
static **brand board** with three **wordmark-led** logo directions (Contour Line, Perspective Cut,
Route Stroke — no generic "A" icon), a new AspectLead palette, and a **dual dark/light theme** system
(Auto/Light/Dark, user override remembered) is at `docs/design-previews/aspectlead-brand-board.html`.
- **Logo / colour / theme design is in DRAFT** — **Route B *Perspective Cut* is now the carried-forward
  preferred wordmark direction** (not locked). A designer refinement brief for it is at
  `docs/20_ASPECTLEAD_WORDMARK_REFINEMENT_BRIEF.md` (spec only — no vector artwork, no legal clearance).
- **No app implementation has been done** — the running Next.js shell still uses the SaaS-neutral baseline
  tokens; nothing built, applied, or production-ready; no Supabase/real data.

## Branding: not locked — SaaS-neutral baseline + candidate directions

**The brand is NOT chosen.** Product name, logo, and final colour identity are still open.
- **Current official state:** the **SaaS-neutral baseline design tokens** (`docs/18_UI_BRANDING_GUIDELINES.md` §A) — what the running app shell uses today.
- **Candidate direction (under evaluation, NOT final):** **Signal Command** — a premium sales-intelligence command-centre look (dark command chrome + light work surfaces, cyan/violet signal accents). Static proof at `docs/design-previews/signal-command-preview.html` (Command Overview, Territory Map, Call Deck / Export Gate).
- **Rule:** final brand colours/logo/UI must be chosen **only after the brand name + logo direction are selected** (a 5-route brand exploration exists: Signal/Command, Vantage/Intelligence, Atlas/Territory, Beacon/Discovery, Grid/OS — all names unverified pending trademark/domain checks).
- **Signal Command design proof created as a candidate only — not final branding, not implemented in the app, not production, no Supabase, no real data.** The running Next.js shell (neutral baseline) is unchanged.

## UI / branding direction (design only, not built)

SaaS-neutral UI & branding guidelines created in `docs/18_UI_BRANDING_GUIDELINES.md`. The product is a **SaaS-ready** app — working name **"Lead Intelligence Platform"** (short: "Lead Intelligence"). **"Magna" is not the product brand** — Magna Foodservice is only the first internal tenant/example; tenant name/logo/accent are configurable (`APP_NAME` / `TENANT_NAME`). **Fixed token system**: sidebar `#111827`, main action blue `#2563EB`, intelligence purple `#7C3AED`, Inter typography, 260px sidebar, 12px cards; map colours consistent with the accepted POC (blue→purple coverage, amber gaps, purple expansion). Fixed nav (Overview, Coverage Map, Territories, Pipeline Runs, Leads, Telesales, Export Review, Settings, Admin), usability rules, and mock-data banner defined. Future SaaS domain undecided (placeholders only). **Design direction only — no app shell, no code, nothing built.**

## Territory model

Territory selection is a **flexible per-run configuration** (ADR-0009), not a fixed MVP scope. One run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists (`territory_sets` / `territory_items`). A single sector such as `UB1 2` is a manual-test input only. This resolves **ISS-0004**.

## What is blocked

- **ISS-0001** — Missing postcode file for existing customer records.
- **ISS-0002** — Delivery postcode list still needed.
- **ISS-0003** — CTO must validate the 102-field schema against Magna Sales Pro.
- ~~**ISS-0004**~~ — Resolved by ADR-0009 (territory is flexible per run).
- API accounts/secrets not yet configured.
- No manual one-business test has been completed.

## Immediate next action

1. Resolve remaining blockers **ISS-0001 to ISS-0003** before any build work.
2. Create the **first UI/UX screen map before app scaffolding** (see `DESIGN.md` for the screen list).
3. Create GitHub issues from `docs/11_ISSUES_LOG.md`.
4. Run the manual one-business end-to-end test (see `docs/modules/MANUAL_TEST_PROTOCOL.md`).
5. Do not build until blockers are resolved.

## Do not touch yet

- No automated CRM write to Magna Sales Pro.
- No production Supabase.
- No bulk scraping.
- No live lead generation.
- No runtime LLM in the MVP pipeline.

## Last verified

Date: 2026-07-09  
Verified by: ChatGPT file generation process  
Evidence: starter pack created and ZIP contents checked. This does not verify the app because the app has not been built.

### Discovery foundation continuation — 2026-07-17
- **@geospatial/map v0.3.0** (released): stable geography **UUIDs** (deterministic v5) + full named API (classifyGeographyInput, searchGeography, resolveGeographySelection, expandPostcodeArea/District, resolvePlaceToPostcodes, resolvePolygonToPostcodes, planSourceQueryUnits, getGeographyEntity/Children/Parents/Relationships). AspectLead pinned to v0.3.0.
- **Uber Eats + Deliveroo authorised-access audit + costed decision pack** (`docs/62`): neither has a lawful open discovery API; recommended **Apify pay-per-result** (Uber ~$3/1k, Deliveroo ~$5/1k) on Apify Scale $199/mo — exact costs per district/area/London/national; provider seam ready (`providers/apify-fetcher.ts`). **Nothing purchased.**
- **Consolidation persistence** (migration 0015): 9 tables (consolidated_candidates, candidate_source_links, candidate_field_values/provenance, match_evidence, conflicts, merge_decisions, completeness, source_comparison_snapshots), tenant RLS; `persistConsolidation()`; schema verified (insert/cascade/clean).
- Verified: typecheck; all tests + build green; migrations 0001–0015 applied.
- **Remaining (see docs/62 + final report):** national data ingestion (OS Open Names + ONSPD, A1); Just Eat 96-field parser + fresh run + duplicate marking (A4); Run Builder city/town search + live Vercel browser QA (A3); wire consolidation into the run/worker; live Uber/Deliveroo (awaiting provider approval + budget). Customer comparison NOT started.

### National place data (A1) + place-aware planning — 2026-07-17
- **OS Open Names ingested** (migrations 0015 consolidation + 0016 place columns): **43,268 places** (city/town/village/locality) + **43,268 place↔district links** from the already-downloaded OS Open Names GeoPackage (OGL v3). Real place→postcode-district associations (`source_defined`, confidence 0.9 — the primary district per place, honest POINT association, NOT boundary containment). 830 places carry aliases; place `capability_status='available'`. Pipeline/manifest in geospatial-platform (`scripts/geo/os-open-names/`); ingest via `npm run ingest:os-open-names`.
- **Place-aware planning wired**: `/api/geography/resolve` + run save resolve place names via the ingested data — "Southall, UB2" → UB1 (place) + UB2 (postcode); "Newport" → 10 ambiguous choices (no guess). GeographySelector shows place matches + ambiguity.
- **Still pending**: ONSPD (postcode→LA/region/ward), national boundary polygons (map-polygon stays centroid-based), Just Eat 96-field parser + fresh run + duplicate marking (A4), live Vercel browser QA (A3). Customer comparison NOT started.

### Just Eat completion + 3 live geography runs + consolidation wiring — 2026-07-17
- **96-field parser** (je-search-1.1.0): useful fields → structured columns + controlled `source_extra` JSONB + extra provenance (brand/description/delivery/promotions/media/ranking); phone/opening-hours/menu kept explicitly unavailable; response-level meta (RestaurantSets/CuisineSets/Dishes/promotedPlacement) captured to execution metrics.
- **Historical duplicates** (migration 0017): 718+ duplicates preserved, all `duplicate_of` correct (0 dangling); canonical counts (`duplicate_of IS NULL`) added to quality report; browser summary view restricted to canonical (duplicates admin/audit-only). Test added.
- **3 live geography runs** (bounded): UB1 (1/1), Southall→UB1 via OS Open Names (1/1), UB→**12-district expansion shown** + bounded 2/2. All attempts=1 (**no re-claim, no duplicate explosion**); coords 100%/rating ~88%/cuisine 100%/halal ~25%/phone 0%/menu 0%.
- **Consolidation wired** (`consolidateRun`): persisted 1,623 candidates + 1,778 source links + 10,668 provenance + 3 snapshots; statuses confirmed/probable/conflict; completeness enrichment_required/conflicting.
- **ONSPD pipeline** prepared (geospatial-platform, no download). **Uber/Deliveroo pilot readiness** (`docs/63`): Apify Free plan, ~$2.75 one-district pilot, exact actors/limits — **not executed/purchased**.
- Verified: typecheck; all tests + build green; migrations 0001–0017 applied.
- **Blocked/remaining**: live Vercel browser QA (production URL not in repo/MCP metadata — need URL); ONSPD download+ingest (go-ahead); Uber/Deliveroo pilot (approve ~$2.75 + APIFY_TOKEN). Customer comparison NOT started.

### Uber Eats pilot executed + parser calibrated — 2026-07-17
- **Executed the approved 10-result UB1 Apify pilot** (`sourabhbgp/ubereats-scraper`, ~$0.02, under the $0.25 cap; `APIFY_TOKEN` server-side only, never printed/committed). Ran twice (initial + calibrated rerun), both ~$0.02.
- **Parser calibrated → `uber-eats-parse-1.1.0`** (`docs/64`): mapped the real actor shape (`address.*`, `cuisineList`, numeric `rating`/`ratingCount`, `phoneNumber`, `{ url }` images, `supportedDiningModes`), backward-compatible with the old fixture, **UK-only postcode/phone gating** (US ZIPs/phones retained in `source_extra`, never coerced), HTML-entity decoding, controlled `source_extra` JSONB for all unmapped fields. Coverage calc now `source_extra`-aware (menu/hours/promotion/media/delivery_fee/eta). No DB migration (raw already immutable on the observation).
- **Finding (ISS-0018):** `discover` for `"UB1, United Kingdom"` returned **10/10 San Francisco, US** stores via a sparse `ld_json_fallback` path — the actor did **not** geolocate the UK district. Handled honestly (no fabrication); pilot prints a country distribution + `⚠ WARNING` on 0 UK postcodes. Product-owner decision needed on a UK-resolving input (no actor change per instruction).
- Tests: `test:uber-parse` (40 assertions, sanitised real-shape fixture) + `test:multi-source` green; typecheck + build green.
- **Not** done (per instruction): no actor change, no plan upgrade, no scaling, no customer comparison.

### Provider geography mismatch contained (ISS-0018) — 2026-07-18
- **Audit (DB authoritative):** both Uber runs returned 10 distinct US records → **10 distinct candidates each (clean 1:1, NOT candidates=1)**; consolidation did not over-merge (distinct phones/URLs, US ZIPs fail the UK full-postcode test, no coords → zero evidence links). The "candidates=1" premise did not match the recorded result.
- **Root cause found:** the actor's required `urls` field was omitted, so it used its US near-me default and ignored the GB address (verified vs the published input schema; no lat/lng fields exist).
- **Geography-validation gate** (`provider-geography-gate.ts`, docs/65): classifies each observation `valid_geography`/`out_of_scope_geography`/`unverifiable_geography` between capture and consolidation. Only valid records reach consolidation/coverage/exports; wrong-geography retained as immutable evidence. Run-level `provider_succeeded_validation_failed` HALTS before further paid sources.
- **Migrations 0018/0019:** append-only `provider_geography_validations`; `consolidated_candidates.geography_status` (default valid). Advisor-clean. **Backfilled/quarantined** the 2×10 historical US candidates (geography_status + 20 validations + 20 `candidate_merge_decisions` invalidations); 1,623 JE candidates untouched; raw observations immutable.
- **Diagnostic prepared, NOT run:** fetcher/pilot now send `urls`+full UB1 address; `npm run uber:diagnostic-plan` verifies the exact request dry (9/9), ~$0.02 < $0.25. Awaiting explicit approval to run `npm run uber:pilot`.
- Tests: `test:geography-gate` (10 required proofs) + `test:uber-parse` + `test:multi-source` green; typecheck + build + `git diff --check` clean. Migrations 0001–0019 applied.

### Apify execution provenance — 2026-07-18
- Replaced `run-sync` with the async run API (docs/66): create one run → persist run id immediately → poll by id → retrieve items from the exact returned dataset id. `apify-run.ts` (token in Authorization header only, never a URL/log/DB field), `apify-orchestrator.ts` (idempotent; resumes in-flight runs; `ResumableTimeoutError` starts no second run; actor failure ⇒ no ingest + halt), `provider-execution-store.ts`, migration **0020** `provider_executions` (advisor-clean). Actor technical status stored separately from business-validation status.
- Tests: `test:apify-provenance` (10 required proofs) + geography-gate + uber-parse + multi-source + typecheck + build + diff-check green. Migrations 0001–0020 applied.
- **Next:** execute exactly one approved 10-result UB1 diagnostic with the supported `urls`+full-address input (~$0.02, cap $0.25).

### Final Uber diagnostic executed — 2026-07-18
- **One paid run** (actor_run_id `1NY5EwEirCZi5h4s6`, dataset `xjn5ywNeQUvBtW7ws`, build 0.1.23, SUCCEEDED, charged 10, **actual $0.02**, cap $0.25; exactly ONE paid run — verified). Full provenance persisted in `provider_executions`.
- **Wrong-country RESOLVED:** the required `urls:["pizza"]` field fixed the US-default bug — actor now returns **GB** (10/10 valid UK postcodes). **But** results are **central London** (SE11/WC1X/WC2H/N1/EC4Y/SW8), **not UB1** — the actor does not bound discovery to the UB1 address. Gate quarantined all 10 (`postcode_out_of_area`), business status `provider_succeeded_validation_failed`, **0 operational candidates**, HALTED. 10 canonical obs, 0 duplicates, 0 dangling.
- A code bug (missing `finished_at` column) surfaced on the FIRST attempt AFTER the run was created; fixed via migration **0021** + a **resume-safe pilot** (reuses the same actor run via stored run id — NO second charge). Total paid Uber runs = **1**.
- **Recommendation:** district-precise UK discovery is not achievable with this actor via address; evaluate a tighter location input or an alternative actor. No larger Uber run; no Deliveroo; no customer comparison; no live Vercel QA (geography not valid UB1). Migrations 0001–0021 applied.

### Uber discovery actor rejected; borderline PPR replacement added (pre-run) — 2026-07-18
- Capability registry (`provider-registry.ts`, docs/67): `sourabhbgp/ubereats-scraper` **discovery REJECTED** / enrichment provisional (ISS-0018 evidence); rejected/unvalidated actors never auto-selected.
- New `uber_eats_borderline_ppr` (borderline/uber-eats-scraper-ppr, PPR $5/1k): tolerant parser, exact-input builder (hard maxRows cap, rental guard), location-fidelity classifier (evaluation-only; never relaxes the gate), `uber:pilot:borderline` + offline `uber:borderline:replay`, sanitised fixture. Reuses provenance/orchestrator/gate seam.
- Tests: `test:borderline-provider` (12 proofs) + all suites + typecheck + build + diff-check green. **Pre-run committed; one paid diagnostic pending.**

### Borderline PPR diagnostic PASSED + calibrated — 2026-07-18
- One paid run (jg2xJwXcMgvmggYnT, $0.05): **GB 10/10, 2 in UB1 → 2 candidates, 8 near_target, 0 unrelated** — the actor binds to the Southall delivery area. Parser calibrated → `uber-eats-borderline-parse-0.2.0` and verified by **offline replay** (no 2nd paid call). Registry: discovery=supported/GB/district precision, operationalStatus=**candidate** (not auto-promoted). Docs/68. 1 provider run; 10 canonical obs, 0 dup/dangling; 2 valid candidates.

### Broad Uber diagnostic — UB1 recall still incomplete — 2026-07-18
- One paid run (MrKoKg8322ZVzk449, **$0.20**, 40 charged): broad query lifted UB1 count **2 → 10** (7 physical restaurants; ghost-kitchen merge). Coverage strong (coords/phone/cuisine/hours/menu/url 40/40; postcode 38/40). Persistence 34 canonical / 6 cross-run dupes / 0 dangling / 7 candidates. But **0/7 known UB1 restaurants** in the broad run; only 2/7 across both runs — the actor is a proximity-ranked delivery **home feed, not a complete directory**. Docs/68.
- Next (not built): several UB1 anchors + `excludeStores` pagination; evaluate Uber search-URL mode; sitemap/store-URL enumeration for completeness. No Deliveroo; no customer comparison.

### GitHub Packages + Vercel deployment repair — 2026-07-18 (ISS-0019, docs/09 ADR)
- **Root cause fixed:** `@geospatial/map` was pinned as a private git+ssh dependency
  (`github:zoi555/geospatial-platform#v0.3.0`); Vercel's build container has no SSH key for that
  repo, so every build failed installing it. Switched to **`@zoi555/geospatial-map@0.3.0` published
  on GitHub Packages**, authenticated by a committed token-free `.npmrc`
  (`//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`) + `NPM_TOKEN` set in Vercel (Preview +
  Production) and locally. Updated `package.json`, `next.config.mjs`, all app + script imports (4
  leftover script imports found and fixed), regenerated `package-lock.json`. No remaining
  `ssh://git@github.com` / `github:zoi555/geospatial-platform` / `@geospatial/map` references in
  code or config (only in historical docs, left as an accurate record).
- **Verified:** clean `npm ci` locally and on Vercel resolves the package from
  `npm.pkg.github.com` with an integrity hash; typecheck, build, `test:geography-gate`,
  `test:uber-parse`, `test:multi-source`, `git diff --check` all green. Diff reviewed —
  mechanical renames only. Committed **`597044a`** (`fix(build): consume geospatial package from
  GitHub Packages`), pushed to `feature/mvp-vertical-slice-001`.
- **Deployment READY:** project `magna-lead-intelligence-system`
  (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`), deployment **`dpl_85AwBaHZvzsXZoF14S67EibBPEJ7`**
  (`https://magna-lead-intelligence-system-qyaz78cuh-zoeb-s-projects.vercel.app`). Build logs
  match the local build exactly (same routes, same pre-existing NFT-trace warning on
  `/api/tw-map-data`, no npm/auth errors). Vercel runtime-error/log tools show zero errors (and
  zero traffic — nothing has hit the deployment yet).
- **Not verified:** the live preview was not browser-tested this session — it sits behind Vercel's
  deployment-protection SSO wall (blocks `curl`) and the Claude Chrome extension was not
  connected. Home page / Run Builder / map / APIs / console errors remain **unverified in-browser**.
- **Open (ISS-0019, needs user decision):** a second Vercel project
  (`magna-lead-intelligence-system-pngu`) is connected to the same repo. Its earlier legacy
  SSH-rewrite install command / missing `NPM_TOKEN` failure has since been repaired (see the
  2026-07-18 overnight session below) — **both** Vercel projects now build successfully. The open
  question is not brokenness but **which project is canonical**; no deletion/rename without an
  explicit owner decision. See `docs/08_DEPLOYMENT.md`.
- No paid Uber actor run, no Deliveroo, no customer comparison this session, per instruction.

### Overnight autonomous session — Vercel dual-project record + Uber actor market research — 2026-07-18
- **Vercel topology recorded** (`docs/08_DEPLOYMENT.md` "Vercel deployment topology"): both
  `magna-lead-intelligence-system-pngu` (`prj_vxcbOvftT2CdzUmnxyCWhjF9f3U2`, deployment
  `dpl_DvJ49zyyhVdV5ND8Rzhv8USNcCSZ`, READY, Production) and `magna-lead-intelligence-system`
  (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`, deployment `dpl_7ZSr1BuoTYgef9njpnaTfAGsqPn8`, READY,
  Preview) deploy commit `2d6f4fb1...` successfully. Recorded as **intentional dual
  infrastructure**, not an accidental duplicate — new ADR in `docs/09_DECISIONS.md`; ISS-0019
  corrected (`-pngu` is no longer "stale/failing"); `docs/10_BUGS_AND_FIXES.md` updated. Canonical
  project remains an **open owner decision**; a possible future clean-up (retain one, migrate
  aliases/env vars, rename to `aspectlead-web`) is proposed but **not actioned**. No Vercel
  settings were changed this session (out of authorised scope) — this is a documentation pass
  recording state reported to be already true.
- **Uber Eats discovery-actor market research** (`docs/69_UBER_ACTOR_MARKET_RESEARCH_AND_BENCHMARK.md`):
  shortlisted 8 current Apify marketplace actors beyond the two already diagnosed
  (`sourabhbgp/ubereats-scraper` rejected; `borderline/uber-eats-scraper-ppr` candidate, recall
  incomplete per docs/68). Two new **primary geographic discovery candidates** identified:
  `memo23/uber-eats-scraper` (cheapest verified PPR price, best usage/rating evidence, genuine
  address/lat-lng/keyword discovery) and `piotrv1001/uber-eats-menu-scraper` (only actor offering
  true sitemap-shard enumeration, directly targeting the recall gap). `borderline/uber-eats-scraper-ppr`
  remains the strongest **enrichment/delivery-area-intelligence/supplementary-discovery** candidate.
  Designed a bounded (<$1, ~$0.42 expected/~$0.60 hard-capped) three-way UB1 benchmark plan against
  the 7-restaurant reference set (`ub1-reference-set.ts`) and a reusable scoring model
  (`benchmark-scoring.ts`, `npm run test:ub1-benchmark`) — **proposed only, not executed; two of the
  three candidates need a pre-flight schema/proxy check before any real spend.**
  `provider-registry.ts` wording corrected where it conflated district-precision (records that
  appear are correctly localised) with district-completeness (finding every restaurant) — see
  `docs/10_BUGS_AND_FIXES.md`.
- No paid actor run, no Deliveroo, no customer comparison, no Vercel/Supabase setting changes this
  session. Full detail: see `docs/69_UBER_ACTOR_MARKET_RESEARCH_AND_BENCHMARK.md` and
  `VERIFY_BEFORE_CLAIMING.md`.

### Canonical contract + Just Eat proof + Uber readiness + Deliveroo evaluation + new screens — 2026-07-21

- **Canonical `SourceOutlet` completed** to full `MarketplaceRestaurant` field parity (19 new fields,
  TypeScript-level only — no Supabase migration yet, that is the next deployment step). Populated
  honestly across all 3 parsers; nothing fabricated.
- **Just Eat proof, real UB1 sample:** live run (717 outlets delivering to UB1; 121 physically in
  UB1). Field-completeness: ID/URL/name/address/postcode/coords/cuisines/review-count/opening-status/
  delivery-fee/min-order/ETA/collection/logo 100%, rating 86.8%, phone/hours/offers/hygiene 0%
  (confirmed honest — not supplied by Just Eat's listing endpoint). Two new browser-verified,
  DB-backed screens: `/discovery-results` (list) and `/discovery-results/[id]` (detail — provenance +
  append-only rating history). Phone/address detail enrichment was **not** re-attempted — already
  proven blocked (Cloudflare 403, ISS-0016).
- **Uber Eats:** adapter now accepts authorised API / licensed JSON / controlled CSV import only (no
  live scraping) — `test:uber-import` (19 assertions) green. Registry status `pending_authorised_source`;
  Settings now shows adapter/authorisation/credentials/import/failure/records status distinctly.
- **Deliveroo:** `thirdwatch/deliveroo-scraper` evaluated (real actor, $0 spent, no paid run) and
  rejected — UK input needs neighbourhood slugs not an exact address, and it escalates to a
  residential proxy on block. Verdict `DELIVEROO_BLOCKED_PENDING_AUTHORISATION` (ISS-0021).
- **Screens:** 7 complete / 3 partial / 4 missing (run detail, data-quality exceptions, import
  screen, audit/evidence view — ISS-0020).
- Verified: typecheck, build, and 14 test suites all green; two screens confirmed rendering real
  data via a live dev-server fetch. No Vercel/Supabase production changes.

### Migration + Just Eat phone enrichment + Deliveroo public-flow test + 3 new screens — 2026-07-21 (follow-up)

- Pushed `e329a79` → `origin/feature/mvp-vertical-slice-001`.
- **Migration 0022** (additive, 14+2 new nullable columns, 2 indexes) written and verified against a
  disposable full-history local Postgres cluster (`npm run test:migration`) — **not applied to
  production**. Mapping: `docs/71`.
- **Just Eat phone: 0% → 26.2%** (28/107 real UB1 outlets, live paid Google Places calls, full
  provenance retained, 1 duplicate-phone conflict flagged not resolved). `docs/73`, ISS-0022 (77
  outlets remain — deliberate bounded batch, not a limit).
- **Deliveroo:** one bounded public-flow test — the assumed search URL returned Deliveroo's own
  honest 404, not a challenge (`docs/72`). Provider-neutral adapter completed (CSV/JSON import for
  both Uber and Deliveroo); found and fixed a real null→`0` fabrication bug in the Deliveroo parser.
  New `MarketplaceSourceStatus`: Just Eat `ACTIVE`, Uber/Deliveroo `PROVIDER_UNAVAILABLE`.
- **3 of 4 missing screens built**, real DB-backed, browser-verified: run detail
  (`/discovery-runs[/[id]]`), data-quality exceptions, audit/evidence (`/audit[/[id]]`). Import
  screen documented, not built (not required for the core scan workflow; backend ready).
- Verified: typecheck, build, 17 test suites green (no skips). No Vercel/production changes; no
  merge to main.

### Production migration + smoke test + JE phone completion + real Deliveroo discovery + import screen — 2026-07-21 (2nd follow-up)

- **Every push to `feature/mvp-vertical-slice-001` auto-deploys both Vercel projects** — confirmed
  directly via the Vercel API (not assumed). Production (`-pngu`) has no deployment protection;
  Preview remains behind Vercel SSO. See `docs/08_DEPLOYMENT.md`.
- **Migration 0022 applied to production Supabase**, with a real (not fabricated) backup
  confirmation — queried `pg_stat_archiver` directly, found continuous WAL archiving active and
  current. Full post-migration verification passed (columns/indexes present, RLS unchanged, row
  counts identical, transactional insert+rollback proved). `docs/09_DECISIONS.md`.
- **Production smoke test:** 9/9 reachable routes (Production deployment) returned 200 with real
  data, no server/column errors. `/data-quality` (as named in the instruction) 404s — the real
  route is `/data-quality-exceptions`, flagged as a naming mismatch. Preview not directly
  reachable (SSO, no browser session).
- **Just Eat phone: 26.2% → 93.5%** (100/107 UB1). Added real name+address match validation first
  (catching and fixing a self-referential no-op in an early draft). Duplicate-phone conflict
  resolved with evidence (shared premises). ISS-0022.
- **Deliveroo: real discovery source found and validated** (corrects the earlier
  `PROVIDER_UNAVAILABLE` verdict, which was drawn from one wrong URL guess). A real Playwright
  browser session found 150 restaurant records, 10 local to UB1, strong core-field coverage.
  `marketplaceStatus` → `PENDING_AUTHORISATION` (real path exists; production automation is a
  separate, unauthorised decision). `docs/74`.
- **Import screen built:** `/import` + `/api/discovery/import` — full dry-run validation flow
  (field mapping, invalid rows, duplicates, geography), honest about not persisting to a live
  table for either unauthorised source.
- Verified: typecheck, build, 19 test suites green (no skips).

### Internal-beta correction: real persistence, honest interface, Deliveroo pilot — 2026-07-21 (3rd follow-up)

- **Interface corrected:** the global "mock data / no integrations connected" banner (shown on
  every route, false for 8/10) replaced with a real per-source status banner. Live-data audit of
  all 10 named routes: `docs/75`.
- **`/import` now genuinely persists** — 2 new tables reusing the existing multi-source
  consolidation architecture (no duplicate schema), atomic via one `commit_import_batch()`
  Postgres function call, proven with a real mid-batch-failure rollback test. A production
  `pgcrypto`-schema bug was caught by the transaction safety itself (nothing persisted), fixed
  forward (migration 0024), and the local test harness fixed to catch this class of bug first
  going forward. Verified end-to-end against production.
- **Deliveroo pilot run:** 150/150 real discovery records, no challenge (twice). Detail
  enrichment: single request works; 3-concurrent triggered a genuine Cloudflare challenge —
  correctly stopped, not retried. 0 canonical records persisted this run (honest — postcode
  confirmation was blocked). `docs/76`.
- **Just Eat's 7 unresolved phones** now have a full audit trail on `/data-quality-exceptions`.
- **Backup wording corrected**: "WAL archiving verified; restore capability not independently
  proven" (not overclaimed as a confirmed backup).
- Verified: typecheck, build, 21 test suites green (incl. a live end-to-end persistence test).

### UB1 release audit + reusable full-territory orchestrator — 2026-07-23

- **UB1 release audit** (all 94 candidates reconciled, no duplicates, no cross-bucket
  contamination): all 14 Level 0 candidates recommended for release (0 downgraded); one
  audit-layer data-quality correction (2 candidates had a malformed website-extracted phone —
  a raw un-decoded `tel:` href — corrected to the already-verified Google phone in the
  release-facing outputs only; no checkpoint re-run or modified). 0 of 7 Level 1 candidates
  promotable (all held; "Queens Pharmacy" flagged for exclusion — Google's own category
  evidence identifies it as non-food-service). Telesales-ready 14, field-sales-ready 13, both
  13. Release pack: `/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T10-30-57Z-release-audit/`
  (outside this repo, per instruction — no external system-import file generated, schema not
  yet supplied). No candidate contacted; no file sent externally.
- **New reusable orchestrator**: `scripts/lead-production/run-full-territory.ts` — sequences
  the same 8-stage pipeline for any territory (never hardcodes UB1), one immutable timestamped
  directory per stage, checksum-verified `--resume`, `--checkpoint=<stage>=<dir>` overrides,
  `--from-stage`/`--to-stage` ranges, `--request-plan-only` (zero live calls), reuses
  `load-assignments.ts`'s duplicate-ownership rejection. `scripts/test-lead-production-full-territory.ts`
  (20 proofs, spawns the real CLI against synthetic ZZ1/KT9 fixtures) — territory-agnosticism,
  resume/corruption rejection, plan-only-makes-no-calls, duplicate-ownership rejection, stage
  ranges.
- **Fixed** (see `docs/10_BUGS_AND_FIXES.md`): `run-google-stage.ts` required an externally
  pre-placed population file, blocking reuse for any new territory — now self-derives from the
  FSA checkpoint via `--phase1-dir`. Orchestrator manifest was never written to disk when every
  in-range stage was a `--checkpoint` override (no stage actually executed).
- **UB1 replay validated**: orchestrator re-run of `public_profile → final_scoring` against
  UB1's own accepted checkpoints (via `--checkpoint` overrides, zero live calls) reproduces
  `ub1-authoritative-master.json` and `ub1-scoring-breakdown.json` with zero field-level
  differences across all 94 candidates.
- **Territory-assignments file validated**: `territory-assignments-tonight.csv` — 22 rows, 22
  unique territories, RM1→Nauman (field_sales, map required), KT1→Manraj (field_sales, map
  required), all 20 TW territories individually to telesales, TW15→Sharyar Ali,
  `required_lead_count=0` on all 22 rows.
- Verified: typecheck, build, all lead-production test suites green (one pre-existing,
  unrelated failure in `test:lead-production-google` — `types.ts` contains the literal string
  `level_0`..`level_4` as enum member names, confirmed present before this session's changes
  via `git stash`; not touched here).
- **No live RM1/KT1/TW discovery was started.** No new live API calls of any kind were made
  outside the UB1-checkpoint replay (which itself makes none — public_profile/group_rescreen/
  final_scoring are pure consolidation stages).
- Commits: `24a8727` (google-stage fix), `3114c86` (orchestrator + tests), pushed to
  `feature/mvp-vertical-slice-001`.
- **Next task**: get sign-off to run the orchestrator live for RM1 and/or KT1 (field-sales,
  map required) as the first real reuse beyond UB1 — orchestrator itself has not yet been run
  live against any territory other than UB1's replay.

### Qualification/scoring rules v2 locked, orchestrator wired to v2, RM1 dry-run — 2026-07-23 (follow-up)

- **v2 accepted as canonical** (commit `52c124a`): reconciliation re-proven via candidate-ID set
  arithmetic (94 = 47 usable + 11 held + 36 hard-rejected, zero overlap). Hard-gate reasons now
  always render as explicit `passed_*`/`failed_*` labels. Final 14-file operational release
  package built with programmatic safety checks (zero violations across all 47 usable
  candidates). `rules-versions.ts` locks 8 independently-versioned rule components;
  `rulesetVersion: "v2"` is the default for every new territory run going forward.
- **Orchestrator completed**: `run-full-territory.ts`'s `final_scoring` stage now calls v2 by
  default (v1 untouched, available only via `--use-v1-scoring`). Added real config-hash
  invalidation (customer-master/group-registry/scoring-version) on `--resume`, proven end-to-end
  against real fixtures. Fixed a genuine gap found while testing: v2 previously required a v1
  baseline to even run — a brand-new territory (RM1, TW1-20) had no v1 history and would have
  failed; terminal-exclusion buckets are now derived independently. UB1 replay still reproduces
  the accepted output byte-for-byte after every change.
- **RM1 dry-run**: assignment correctly resolved (Nauman, field_sales, map required);
  `--request-plan-only` correctly refuses at Phase 1 — RM1 has no discovery checkpoint yet, and
  this orchestrator never triggers discovery itself. No live RM1/KT1/TW work started.
- One pre-existing test failure (`types.ts` Level-0-4 naming regex) properly investigated (not
  dismissed) and logged as ISS-0028 — traced to two specific commits, confirmed unrelated to any
  of this session's or the prior calibration session's changes.
- Commit `89c3be3`, pushed to `feature/mvp-vertical-slice-001`.
- **Next task**: owner decision on whether to start live Phase 1 discovery for RM1 (the first
  territory with an actual assignment + map requirement) as the real first-use proof of the
  now-complete orchestrator, ahead of the full TW1-20 rollout.

### Schemas + assignment v2 versioned; full lead-production handover written — 2026-07-23 (Milestone 1)

- **Git continuity audit**: `docs/BRANCH_REGISTER.md` written — 3 branches (feature branch
  current/active, `main` stale 12+ days, `design/aspectlead-branding` superseded/parked, none
  deleted), full merged/ahead-behind status, "commits are not branches" made explicit.
- **Schema versioning**: located and converted all 4 CTO-approved spreadsheets
  (`~/Downloads`) into version-controlled JSON, validated exhaustively against the
  spreadsheets' own redundant columns: `config/lead-production/master-schema-v1.json` (107
  fields), `salespro-schema-v1.json` (108 columns, 20 existing CTO labels/order preserved
  verbatim + 88 new appended), `cto-existing-field-mapping-v1.json` (20 fields), plus
  human-readable `docs/77_LEAD_SCHEMA_V1_SUMMARY.md`. One genuine, deliberate spreadsheet
  feature found and correctly handled (not treated as an error): `assigned_representative`
  legitimately maps from both "Field Sales Rep" and "Sales Rep" CTO columns.
- **Assignment v2**: `config/lead-production/sales-territories-v2.json` — 13 representatives,
  112 postcode districts, matching the owner-supplied table exactly (incl. Wajahat's
  non-contiguous six districts, HA0 included). Old 22-rep CSV kept, not deleted, marked via a
  `.SUPERSEDED.md` companion file (confirmed zero code references first).
- **Honest gaps recorded, not hidden**: `load-assignments.ts` does not yet read
  `sales-territories-v2.json` natively (still reads tabular CSV/Excel) — wiring that in is
  required before district-level orchestration can run against the v2 structure. District-level
  orchestration itself (per-district checkpoints, cross-district dedup/combination), both
  exporters (Master 107-field, Sales Pro 108-column), and UB1 exporter validation are none of
  them started yet.
- **`docs/LEAD_PRODUCTION_HANDOVER.md`** written — full continuation record: 92-commit register
  (SHA/date/purpose per commit), accepted UB1 checkpoint paths, locked v2 ruleset detail,
  schema/assignment versions, honest orchestrator/exporter status, unresolved issues, exact
  continuation commands. Also confirms a stale plan-mode artifact surfaced this session
  describing a Just Eat geography-consolidation hotfix — that work is already complete and
  accepted (commits `fc5063b`/`d3f2dfc`/`3b80cfb`, 2026-07-22); no action was taken on the stale
  artifact.
- **Next task**: wire `load-assignments.ts` (or its caller) to consume
  `sales-territories-v2.json` directly, then build district-level expansion in the discovery
  orchestrator (raw Sales Territory → Postcode Districts → per-district discovery/checkpoint →
  cross-district combine/dedup).

### RM1-RM14 (Nauman's full Sales Territory) — live, accepted — 2026-07-24

- District/territory orchestration (Milestone 2), Master exporter (Milestone 3), Sales Pro
  exporter (Milestone 4), UB1 export proof (Milestone 5), and a full pre-production
  certification (Milestone 6, `docs/LEAD_PRODUCTION_PREPRODUCTION_CERTIFICATION.md`,
  **GO_FOR_RM1_LIVE**) were all completed this session before any live discovery was triggered.
- **All 14 RM Postcode Districts run live end-to-end and accepted**: 8542 raw = 855 geography-
  valid + 7687 rejected (exact, every district). 748 candidates → 25 genuine cross-district
  duplicates removed → 723 unique. Permanent `customer_master_exclusion` rule enforced (any
  confirmed Magna customer-master match, any lifecycle status, hard-excluded — reactivation
  retired as an operational lead category): 26 exclusions found across the territory, zero
  leakage into any rep-facing/Sales Pro/map output. Final: 388 usable (236 premium, 152
  releasable Level 1, 30 key accounts), 2 held for review, 231 hard-rejected, 76 excluded groups.
  Nauman's combined 107-field Master workbook and 108-column Sales Pro files generated; every
  Sales Pro Lead ID verified present in the Master.
- **Four real deterministic defects found live and fixed** (each committed separately,
  regression-tested with the exact real-world case as a fixture): (1) the orchestrator's phase1
  stage never passed `--assignments`/`--groups` through (caught before any live call); (2) a
  hardcoded UB1-specific "expected 84 candidates" FSA warning; (3) a duplicate live discovery
  run for RM2 (two independent triggers 4 minutes apart — compared in full, resolved, and
  `je-run.ts` given a duplicate-run guard); (4) the most significant — cross-district dedup was
  wrongly merging different chain/franchise branches sharing a corporate domain or phone line
  (81 of 748 candidates would have been wrongly collapsed; fixed to require same-postcode
  corroboration, corrected to 25 genuine duplicates).
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/nauman/combined-2026-07-24/RM1-RM14-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  KT1-KT24 (Manraj's territory) — this has since been granted and completed; see the new section
  below.

### KT1-KT24 (Manraj's full Sales Territory) — live, accepted — 2026-07-24

- All 24 KT Postcode Districts run live end-to-end and accepted, using the pipeline already
  accepted at the end of RM1-RM14 processing (commit `fbd2d61`) — **no new code changes were
  needed or made**.
- **All 24 KT Postcode Districts run live end-to-end and accepted**: 9586 raw = 969 geography-
  valid + 8617 rejected (exact, every district). 813 candidates → 25 genuine cross-district
  duplicates removed → 788 unique. Permanent `customer_master_exclusion` rule enforced: 29
  exclusions found across the territory, zero leakage into any rep-facing/Sales Pro/map output.
  Final: 364 usable (221 premium, 143 releasable Level 1, 21 key accounts), 6 held for review,
  290 hard-rejected, 99 excluded groups. Manraj's combined 107-field Master workbook and
  108-column Sales Pro files generated; all **exported** Sales Pro Lead IDs (343 new leads + 21
  key accounts + 29 customer-master exclusions = 393 of 788 total candidates — held/hard-
  rejected/excluded-group candidates exist only in the Master workbook by design) verified
  present in the Master workbook's Evidence Register (393/393); single representative owner
  ("Manraj") confirmed across all 788 rows in every Master sheet.
- **No new defect found or fixed during KT processing** — the RM1-RM14-era fixes (assignments/
  groups passthrough, FSA hardcoded-84 removal, duplicate-run guard, cross-district dedup
  false-merge fix) all carried over clean; both exporters independently agreed on the same
  25-duplicate count. One genuinely concurrent (not duplicate) live discovery execution was
  encountered at KT1 — the duplicate-run guard correctly blocked a fresh trigger against an
  already-running execution; the run was allowed to complete naturally and its output used as
  KT1's checkpoint. Expected guard behaviour, not a defect.
- Full test/build gate run clean: `test-lead-production-territory-v2.ts` all passed,
  `npm run typecheck` clean, `npm run build` succeeded.
- **Documentation-only reconciliation (2026-07-24, post-acceptance, no live calls)**: 12 items
  re-derived directly from the final exported files at the owner's request. All confirmed exact:
  788 unique post-dedup population; 343 new leads; 21 key accounts; 364 usable; 6 held; 290
  hard-rejected; 29 customer-master exclusions; 99 excluded groups; sum of usable+held+hard-
  rejected+customer-exclusions+excluded-groups = 788 exactly; Sales Pro CSV row counts (343/21/29)
  match their Master sheets exactly; all 393 exported Sales Pro Lead IDs found in both the
  Evidence Register and their respective Master sheet; zero overlap between held/hard-rejected/
  customer-excluded/group-excluded records and the representative-facing new-leads/key-accounts
  files. Corrected an earlier documentation wording error along the way — "every Sales Pro Lead
  ID (788/788)" should have read "every **exported** Sales Pro Lead ID (393/393)"; no exporter
  defect, the underlying numbers were always correct.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/manraj/combined-2026-07-24/KT1-KT24-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation required before starting NW1.

### Standardised handover packages, field provenance, progress register — 2026-07-24

- Three new reusable scripts (`scripts/lead-production/generate-field-provenance.ts`,
  `generate-territory-production-report.ts`, `generate-progress-register.ts`) built entirely
  from already-accepted checkpoints/exports — no new discovery or enrichment calls.
- Standardised 8-file handover packages produced for both accepted territories:
  `/Users/homemac/Data/aspectlead-lead-production/handover/nauman-rm1-rm14/` and
  `.../handover/manraj-kt1-kt24/`. Representative-facing files (Master, Sales Pro CSV, Map)
  verified to contain ordinary approved leads only — zero overlap with key accounts, customer
  exclusions, held, or hard-rejected candidates in either package.
- Field-level provenance generated for all 388 (Nauman) + 364 (Manraj) usable leads, mirroring
  `candidate-dossier.ts`'s real field-resolution logic line-for-line rather than guessed — see
  `docs/LEAD_PRODUCTION_HANDOVER.md` for the full methodology note and both territories' source-
  contribution summaries (e.g. Nauman: 105/388 phones from website vs 282/388 from Google;
  Manraj: 114/364 vs 245/364).
- `/Users/homemac/Data/aspectlead-lead-production/status/REPRESENTATIVE_PROGRESS_REGISTER.xlsx`
  (+ `.csv`) created, covering all 13 representatives: Nauman and Manraj ACCEPTED; Naseh
  in_progress (UB1 done, UB2-UB5 remaining); 10 representatives not_started.
- Permanent root-cause correction policy adopted and documented in `docs/11_ISSUES_LOG.md`,
  `docs/09_DECISIONS.md`, `docs/LEAD_PRODUCTION_HANDOVER.md`, and
  `docs/LEAD_PRODUCTION_PREPRODUCTION_CERTIFICATION.md`: no final-lead defect may be corrected
  only in an output file from Ayesha's territory (NW1) onward.
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` ALL PASSED,
  `npm run typecheck` clean, `npm run build` succeeded.
- **Next task (superseded, see below)**: owner authorisation was required before starting NW1 —
  this has since been granted and completed; see the new section below.

### NW1-NW10 (Ayesha's full Sales Territory) — live, accepted — 2026-07-24

- All 10 NW Postcode Districts run live end-to-end and accepted: 12198 raw = 1222 geography-valid
  + 10976 rejected (exact, every district). 525 candidates → 14 genuine cross-district duplicates
  removed → 511 unique. Permanent `customer_master_exclusion` rule enforced: 23 exclusions found,
  zero leakage into any rep-facing/Sales Pro/map output. Final: 238 usable (140 premium, 98
  releasable Level 1, 10 key accounts), 10 held for review, 200 hard-rejected, 40 excluded
  groups. Ayesha's combined 107-field Master workbook and 108-column Sales Pro files generated;
  all 261 exported Sales Pro Lead IDs (228 new leads + 10 key accounts + 23 customer-master
  exclusions) verified present in the Master workbook's Evidence Register.
- **One real deterministic defect found live and fixed (ISS-0030)**: the website enrichment
  stage crashed the entire orchestrator process on a real HTTP/2 GOAWAY connection error,
  reproduced twice identically against the same remote host during live NW3 processing. Root
  cause: undici emitting a connection-level failure as an `'error'` event outside the promise
  chain, bypassing the adapter's own try/catch. Fixed by forcing HTTP/1.1 for all website-crawl
  requests (commit `0cec029`), with `undici` added as an explicit dependency and two new
  regression tests. No final lead data was affected (NW3 hadn't produced output yet).
- **Two transient discovery failures (NW2, NW7)** resolved via an evidence-completeness
  procedure — 100% of each failed run's partial raw evidence confirmed as a strict subset of its
  bounded replacement run's evidence, audited via `app_audit_log`. NW7 also surfaced a real
  operational gap (`discovery_runs.status` can stay stuck at `"queued"` on a partial write
  failure) logged as **ISS-0031** for future root-cause work — not a lead-data defect, did not
  block acceptance.
- Standardised handover package produced:
  `/Users/homemac/Data/aspectlead-lead-production/handover/ayesha-nw1-nw10/` (8 files),
  representative-facing files verified to contain ordinary approved leads only, zero leakage.
- Representative Progress Register updated: Nauman, Manraj, and Ayesha now ACCEPTED.
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` ALL PASSED,
  `test-lead-production-website.ts` ALL PASSED (2 new ISS-0030 regressions), `npm run typecheck`
  clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/ayesha/combined-2026-07-24/NW1-NW10-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  TW1-TW10 — this has since been granted and completed; see the new sections below.

### ISS-0031 fix — reliable terminal status on discovery run failure — 2026-07-24

- Root-caused and fixed before starting TW1: `worker/loop.ts`'s failure-handling paths made two
  unguarded sequential writes (`finishExecution()` then `setRunStatus()`); if the first threw
  (as happened live for both NW2 and NW7, on the same flaky connection that triggered the
  failure), `discovery_runs.status` could stay stuck at `"queued"` forever.
- Fix: run-level and execution-level failure writes now attempt independently (each in its own
  try/catch, run-level first); new `repo.failRun()` retries with bounded backoff, preserves the
  original exception/timestamp, and never downgrades an already-accepted run; new
  `resumeGeographyProcessing()` resumes from a run's own retained raw evidence with no new
  discovery call when the query fully completed but a later step didn't; `scripts/je-run.ts`
  gained `--replaces=`/`--resume-from=`; `run-comparison.ts` now refuses to treat an incomplete
  run as a genuine zero-result.
- Regression suite: `scripts/test-discovery-run-recovery.ts`, 9 scenarios / 33 assertions
  against `MemoryRepository` (no network). Full existing discovery-engine and lead-production
  test suites, the real-database `test:je-supabase` integration test, typecheck, and build all
  re-verified passing.
- Commits: `bc5f965` (code), `ac0060f` (docs), both pushed to `feature/mvp-vertical-slice-001`
  before any TW1 live call was made.

### TW1-TW10 (Kunz's full Sales Territory) — live, accepted — 2026-07-24

- All 10 TW Postcode Districts run live end-to-end and accepted (first telesales territory this
  session): 6353 raw = 547 geography-valid + 5806 rejected (exact, every district). 458
  candidates → 8 genuine cross-district duplicates removed → 450 unique. Permanent
  `customer_master_exclusion` rule enforced: 76 exclusions found, zero leakage into any
  rep-facing/Sales Pro output. Final: 181 usable (118 premium, 63 releasable Level 1, 14 key
  accounts), 19 held for review, 132 hard-rejected, 42 excluded groups. Kunz's combined
  107-field Master workbook and 108-column Sales Pro files generated; all 257 exported Sales Pro
  Lead IDs (167 new leads + 14 key accounts + 76 customer-master exclusions) verified present in
  the Master workbook's Evidence Register.
- TW6 was a genuine small-result district (1 candidate, 0 usable) — confirmed `completed`
  status, fully reconciled (75 raw = 1 valid + 74 rejected), correctly distinguished from
  incomplete processing per ISS-0031's fix.
- No lead-data defect found. One session-local scratchpad-tooling fix (not a repository defect):
  the per-district runner helper hardcoded `map_required=true` regardless of role, incorrect for
  telesales — fixed before TW1 to derive it from role.
- Standardised handover package produced:
  `/Users/homemac/Data/aspectlead-lead-production/handover/kunz-tw1-tw10/` (8 files),
  representative-facing files verified to contain ordinary approved leads only, zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, and Kunz now ACCEPTED.
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` ALL PASSED,
  `test-discovery-run-recovery.ts` ALL PASSED, `npm run typecheck` clean, `npm run build`
  succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/kunz/combined-2026-07-24/TW1-TW10-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  TW11-TW20 — see the correction and Meer sections below.

### map_required fix + Kunz correction — 2026-07-24

- Real pipeline defect found and fixed before TW11: `run-full-territory.ts` resolved
  `map_required` from a hand-typed assignment CSV column, never cross-checked against
  `config/lead-production/sales-territories-v2.json`. Kunz's (telesales) already-built TW1-TW10
  package was found to incorrectly contain a map deliverable.
- Fix: new `resolve-map-required.ts` (single authoritative resolver), new
  `generate-representative-handover.ts` (reusable, tested package builder gating the map file on
  the resolved value), assignment wired into phase1's config-hash invalidation, and a standing
  cross-check in the progress-register generator. 27-assertion regression suite
  (`scripts/test-map-required.ts`). Commit `a8f94b4`.
- Kunz's package corrected retroactively from existing evidence only (no new discovery/
  enrichment calls): map file removed, Lead Production Report and progress register regenerated.
  Clean reconciliation re-derived directly from the final Master/Sales Pro files: 450 unique
  candidates = 181 usable (118 premium, 63 releasable L1) + 19 held + 132 hard-rejected + 76
  customer exclusions + 42 excluded groups; Sales Pro rows 167/14/76; zero leakage confirmed.
  Full detail: `docs/LEAD_PRODUCTION_HANDOVER.md`,
  `/Users/homemac/Data/aspectlead-lead-production/handover/kunz-tw1-tw10/README.md`.
- Full test/build gate re-verified clean: `test-map-required.ts`, `test-lead-production-territory-v2.ts`,
  `test-discovery-run-recovery.ts` ALL PASSED, `npm run typecheck` clean, `npm run build`
  succeeded.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  TW11-TW20 — see the Meer section below.

### TW11-TW20 (Meer's full Sales Territory) — live, accepted — 2026-07-25

- All 10 TW Postcode Districts run live end-to-end and accepted, using the fully-fixed pipeline
  (ISS-0030, ISS-0031, map_required resolver fix all already in place before TW11 started — no
  new code changes needed): 5178 raw = 466 geography-valid + 4712 rejected (exact, every
  district). 409 candidates → 11 genuine cross-district duplicates removed → 398 unique.
  Permanent `customer_master_exclusion` rule enforced: 40 exclusions found, zero leakage. Final:
  178 usable (97 premium, 81 releasable Level 1, 10 key accounts), 8 held for review, 116
  hard-rejected, 56 excluded groups. Meer's combined 107-field Master workbook and 108-column
  Sales Pro files generated; all 218 exported Sales Pro Lead IDs verified present in the Master
  workbook's Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced) — no
  retroactive correction needed, unlike Kunz's package.
- Standardised handover package produced:
  `/Users/homemac/Data/aspectlead-lead-production/handover/meer-tw11-tw20/` (7 files, no map
  deliverable), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, and Meer now ACCEPTED.
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts`,
  `test-discovery-run-recovery.ts`, `test-map-required.ts` ALL PASSED, `npm run typecheck`
  clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/meer/combined-2026-07-24/TW11-TW20-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  UB2-UB5 — see the Naseh section below.

### UB1-UB5 (Naseh's full Sales Territory) — live/reused, accepted — 2026-07-25

- UB1 reused from the accepted 2026-07-24 customer-master-exclusion-reprocess checkpoint after
  independently verifying compatibility (byte-exact customer-master SHA256, byte-exact
  group-registry MD5, rules version `v2`, and a direct DB re-verification of UB1's geography
  reconciliation — 646 candidates, 94 correctly carrying `geography_status='valid_geography'`,
  confirmed as the expected post-fix state of an already-resolved historical defect, not a new
  problem). A synthetic `.orchestrator-run-manifest.json` was built from UB1's existing immutable
  checkpoints so it could join the standard combination pipeline. Zero new live discovery or
  enrichment calls made for UB1 this session.
- UB2, UB3, UB4, UB5 each processed fully live, sequentially, using the fully-fixed pipeline
  (ISS-0030, ISS-0031, map_required resolver fix all already in place — no new code changes
  needed), each independently DB-reconciled and zero-leakage-verified before proceeding to the
  next district.
- Territory totals: 4246 raw = 402 geography-valid + 3844 rejected (exact, every district). 322
  candidates → 9 genuine cross-district duplicates removed → 313 unique. Permanent
  `customer_master_exclusion` rule enforced: 71 exclusions found, zero leakage. Final: 126 usable
  (89 premium, 37 releasable Level 1, 13 key accounts), 17 held for review, 74 hard-rejected, 25
  excluded groups. Naseh's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 197 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced).
- Source calls (corrected, stated separately per district-cap type): Google — 190 live this
  session (UB2-UB5: 50+68+65+7) + 83 reused/historical (UB1) = 273 combined total. Companies
  House — 504 combined requests live this session (UB2-UB5: 146+178+170+10) + 185
  reused/historical (UB1) = 689 combined total. No request exceeded its certified per-district
  cap (Google 800, Companies House 600 combined / 250 documents) on any of the 5 districts.
- Standardised handover package produced (**7 files**, not 6 — corrected from an earlier
  miscount): `/Users/homemac/Data/aspectlead-lead-production/handover/naseh-ub1-ub5/`
  (`Naseh_UB1-UB5_Representative_Master.xlsx`, `Naseh_UB1-UB5_SalesPro_New_Leads.csv`,
  `Naseh_UB1-UB5_Key_Accounts_Management_Review.xlsx`,
  `Naseh_UB1-UB5_Customer_Master_Exclusions_Audit.xlsx`,
  `Naseh_UB1-UB5_Lead_Production_Report.xlsx`, `Naseh_UB1-UB5_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, and Naseh now
  ACCEPTED (6/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts`,
  `test-discovery-run-recovery.ts`, `test-map-required.ts` ALL PASSED, `npm run typecheck`
  clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/naseh/combined-2026-07-25/UB1-UB5-TERRITORY-RECONCILIATION-REPORT.md`.
- **Documentation-only correction (2026-07-25, later):** the initial handover documentation
  mislabelled the package as "6 files" (it is 7 — 6 substantive files + `README.md`, matching the
  convention used for every other representative's package) and presented the source-call totals
  in a malformed, ambiguous table cell (Companies House combined-request and document counts
  concatenated as e.g. "185 (12 documents)" instead of stated separately). Underlying lead-data
  totals were re-verified against the DB/exports and found already correct (no exporter or
  reconciliation defect) — only the file-count label and the source-call table presentation were
  wrong. Corrected in `UB1-UB5-TERRITORY-RECONCILIATION-REPORT.md`, the handover `README.md`, the
  `Naseh_UB1-UB5_Lead_Production_Report.xlsx` (new "Source Calls Summary" sheet), and this
  document; `REPRESENTATIVE_PROGRESS_REGISTER.xlsx`/`.csv` were checked and found already correct
  (no change required). No code change — data-output and documentation only.
- **Next task (superseded, see below)**: owner authorisation was required before starting Saad's
  UB6-UB11 territory — see the Saad section below.

### UB6-UB11 (Saad's full Sales Territory) — live, accepted — 2026-07-25

- All 6 UB Postcode Districts (UB6-UB11) run live end-to-end, sequentially, each independently
  DB-reconciled and zero-leakage-verified before proceeding to the next, using the fully-fixed
  pipeline (map_required resolver, ISS-0030, ISS-0031 all already in place — no new code changes
  needed).
- Territory totals: 3878 raw = 417 geography-valid + 3461 rejected (exact, every district). 366
  candidates → 21 genuine cross-district duplicates removed → 345 unique. Permanent
  `customer_master_exclusion` rule enforced: 37 exclusions found, zero leakage. Final: 151 usable
  (99 premium, 52 releasable Level 1, 9 key accounts), 8 held for review, 105 hard-rejected, 44
  excluded groups. Saad's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 188 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced).
- Source calls (stated separately, all live this session): Google combined total 308
  (77+55+106+16+52+2). Companies House combined total 721 (189+140+228+44+116+4), documents
  total 37 (12+8+9+4+4+0). No request exceeded its certified per-district cap (Google 800,
  Companies House 600 combined / 250 documents) on any of the 6 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/saad-ub6-ub11/`
  (`Saad_UB6-UB11_Representative_Master.xlsx`, `Saad_UB6-UB11_SalesPro_New_Leads.csv`,
  `Saad_UB6-UB11_Key_Accounts_Management_Review.xlsx`,
  `Saad_UB6-UB11_Customer_Master_Exclusions_Audit.xlsx`,
  `Saad_UB6-UB11_Lead_Production_Report.xlsx`, `Saad_UB6-UB11_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, and Saad
  now ACCEPTED (7/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts`,
  `test-discovery-run-recovery.ts`, `test-map-required.ts` ALL PASSED, `npm run typecheck`
  clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/saad/combined-2026-07-25/UB6-UB11-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting Saif's
  HA0-HA5 territory — see the Saif section below.

### HA0-HA5 (Saif's full Sales Territory) — live, accepted — 2026-07-25

Preceded by a read-only verification of Saad's stored UB6-UB11 documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied — all confirmed correct, no corrective commit made.

- All 6 HA Postcode Districts (HA0-HA5) run live end-to-end, sequentially, each independently
  DB-reconciled and zero-leakage-verified before proceeding to the next, using the fully-fixed
  pipeline (map_required resolver, ISS-0030, ISS-0031 all already in place — no new code changes
  needed).
- Territory totals: 5392 raw = 873 geography-valid + 4519 rejected (exact, every district). 734
  candidates → 30 genuine cross-district duplicates removed → 704 unique. Permanent
  `customer_master_exclusion` rule enforced: 46 exclusions found, zero leakage. Final: 329 usable
  (223 premium, 106 releasable Level 1, 25 key accounts), 22 held for review, 257 hard-rejected,
  50 excluded groups. Saif's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 375 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced).
- Source calls (stated separately, all live this session): Google combined total 651
  (120+122+124+130+76+79). Companies House combined total 1556 (250+337+290+328+174+177),
  documents total 101 (10+33+16+22+10+10). No request exceeded its certified per-district cap
  (Google 800, Companies House 600 combined / 250 documents) on any of the 6 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/saif-ha0-ha5/`
  (`Saif_HA0-HA5_Representative_Master.xlsx`, `Saif_HA0-HA5_SalesPro_New_Leads.csv`,
  `Saif_HA0-HA5_Key_Accounts_Management_Review.xlsx`,
  `Saif_HA0-HA5_Customer_Master_Exclusions_Audit.xlsx`,
  `Saif_HA0-HA5_Lead_Production_Report.xlsx`, `Saif_HA0-HA5_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad, and
  Saif now ACCEPTED (8/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts`,
  `test-discovery-run-recovery.ts`, `test-map-required.ts` ALL PASSED, `npm run typecheck`
  clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/saif/combined-2026-07-25/HA0-HA5-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  Shahzaib's HA6-HA10 territory — see the Shahzaib section below (territory corrected to HA6-HA9
  during processing; see ISS-0032).

### HA6-HA9 (Shahzaib's full Sales Territory, corrected from HA6-HA10) — live, accepted — 2026-07-25

Preceded by a read-only verification of Saif's stored HA0-HA5 documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied — all confirmed correct, no corrective commit made.

- **ISS-0032 found and fixed mid-territory**: "HA10", part of Shahzaib's originally-configured
  "HA6-HA10" territory, is not a real UK postcode district (Harrow's HA postcode area only spans
  HA0-HA9, confirmed against the pipeline's own authoritative postcode reference). A live
  discovery run for "HA10" completed with genuinely 0 raw observations, cascading to 0 candidates
  and a deliberate pipeline refusal — no data was corrupted. Root-caused and fixed at the config
  level: `config/lead-production/sales-territories-v2.json` corrected to HA6-HA9 (4 districts,
  was 5); `totalDistricts` corrected 112 → 111; commit `47dc384`. A permanent regression guard
  was added to `scripts/test-lead-production-territory-v2.ts` validating every representative's
  every configured Postcode District against the reference — confirmed all 111 remaining
  districts (all 13 representatives) are valid, with HA10 confirmed absent. HA6, HA7, HA8, HA9 —
  already live-processed and verified before this was found — required no rework.
- All 4 real Postcode Districts (HA6-HA9) run live end-to-end, sequentially, each independently
  DB-reconciled and zero-leakage-verified before proceeding to the next, using the fully-fixed
  pipeline (map_required resolver, ISS-0030, ISS-0031 all already in place).
- Territory totals: 3447 raw = 408 geography-valid + 3039 rejected (exact, every district). 341
  candidates → 8 genuine cross-district duplicates removed → 333 unique. Permanent
  `customer_master_exclusion` rule enforced: 28 exclusions found, zero leakage. Final: 161 usable
  (101 premium, 60 releasable Level 1, 7 key accounts), 5 held for review, 105 hard-rejected, 34
  excluded groups. Shahzaib's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 189 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- Source calls (stated separately, all live this session): Google combined total 286
  (38+23+108+117). Companies House combined total 692 (90+54+274+274), documents total 46
  (2+4+20+20). No request exceeded its certified per-district cap (Google 800, Companies House
  600 combined / 250 documents) on any of the 4 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/shahzaib-ha6-ha9/`
  (`Shahzaib_HA6-HA9_Representative_Master.xlsx`, `Shahzaib_HA6-HA9_SalesPro_New_Leads.csv`,
  `Shahzaib_HA6-HA9_Key_Accounts_Management_Review.xlsx`,
  `Shahzaib_HA6-HA9_Customer_Master_Exclusions_Audit.xlsx`,
  `Shahzaib_HA6-HA9_Lead_Production_Report.xlsx`, `Shahzaib_HA6-HA9_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad,
  Saif, and Shahzaib now ACCEPTED (9/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` (including the new
  ISS-0032 postcode-reference-validity guard), `test-discovery-run-recovery.ts`,
  `test-map-required.ts` ALL PASSED, `npm run typecheck` clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/shahzaib/combined-2026-07-25/HA6-HA9-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  Tahira's WD3-WD7 territory — see the Tahira section below.

### WD3-WD7 (Tahira's full Sales Territory) — live, accepted — 2026-07-25

Preceded by a read-only verification of Shahzaib's stored HA6-HA9 documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied, plus HA10-containment checks (retained-evidence-only) and a re-run of the
111-district postcode-reference guard — all confirmed correct, no corrective commit made.

- All 5 Postcode Districts (WD3-WD7) — each pre-validated against the authoritative postcode
  reference before any live call (ISS-0032 guard) — run live end-to-end, sequentially, each
  independently DB-reconciled and zero-leakage-verified before proceeding to the next, using the
  fully-fixed pipeline (map_required resolver, ISS-0030, ISS-0031, ISS-0032 all already in place).
- Territory totals: 2083 raw = 217 geography-valid + 1866 rejected (exact, every district). 189
  candidates → 6 genuine cross-district duplicates removed → 183 unique. Permanent
  `customer_master_exclusion` rule enforced: 4 exclusions found, zero leakage. Final: 100 usable
  (61 premium, 39 releasable Level 1, 6 key accounts), 1 held for review, 49 hard-rejected, 29
  excluded groups. Tahira's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 104 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced).
- Source calls (stated separately, all live this session): Google combined total 156
  (61+14+12+59+10). Companies House combined total 385 (138+30+24+163+30), documents total 28
  (8+2+0+16+2). No request exceeded its certified per-district cap (Google 800, Companies House
  600 combined / 250 documents) on any of the 5 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/tahira-wd3-wd7/`
  (`Tahira_WD3-WD7_Representative_Master.xlsx`, `Tahira_WD3-WD7_SalesPro_New_Leads.csv`,
  `Tahira_WD3-WD7_Key_Accounts_Management_Review.xlsx`,
  `Tahira_WD3-WD7_Customer_Master_Exclusions_Audit.xlsx`,
  `Tahira_WD3-WD7_Lead_Production_Report.xlsx`, `Tahira_WD3-WD7_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad,
  Saif, Shahzaib, and Tahira now ACCEPTED (10/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` (111-district
  postcode-reference guard re-confirmed), `test-discovery-run-recovery.ts`, `test-map-required.ts`
  ALL PASSED, `npm run typecheck` clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/tahira/combined-2026-07-25/WD3-WD7-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  Wajahat's WD17/WD18/WD19/WD23/WD24/WD25 territory — see the Wajahat section below.

### WD17/WD18/WD19/WD23/WD24/WD25 (Wajahat's full Sales Territory) — live, accepted — 2026-07-25

Preceded by a read-only verification of Tahira's stored WD3-WD7 documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied — all confirmed correct, no corrective commit made.

- Before any live call, all six configured Postcode Districts (WD17, WD18, WD19, WD23, WD24,
  WD25 — a non-contiguous list, skipping WD20-WD22) were confirmed as real entries in the
  authoritative postcode reference (ISS-0032 guard applied proactively) — no invalid district
  found.
- All 6 districts run live end-to-end, sequentially, each independently DB-reconciled and
  zero-leakage-verified before proceeding to the next, using the fully-fixed pipeline
  (map_required resolver, ISS-0030, ISS-0031, ISS-0032 all already in place).
- Territory totals: 3622 raw = 382 geography-valid + 3240 rejected (exact, every district). 336
  candidates → 10 genuine cross-district duplicates removed → 326 unique. Permanent
  `customer_master_exclusion` rule enforced: 21 exclusions found, zero leakage. Final: 157 usable
  (106 premium, 51 releasable Level 1, 12 key accounts), 6 held for review, 109 hard-rejected, 33
  excluded groups. Wajahat's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 178 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found. The handover package was built correctly from the start
  (`mapRequired=false` resolved from `sales-territories-v2.json`, no map file produced).
- Source calls (stated separately, all live this session): Google combined total 292
  (107+55+24+27+58+21). Companies House combined total 707 (245+118+52+73+171+48), documents
  total 43 (14+6+2+6+15+0). No request exceeded its certified per-district cap (Google 800,
  Companies House 600 combined / 250 documents) on any of the 6 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/wajahat-wd17-wd25/`
  (`Wajahat_WD17-WD25_Representative_Master.xlsx`, `Wajahat_WD17-WD25_SalesPro_New_Leads.csv`,
  `Wajahat_WD17-WD25_Key_Accounts_Management_Review.xlsx`,
  `Wajahat_WD17-WD25_Customer_Master_Exclusions_Audit.xlsx`,
  `Wajahat_WD17-WD25_Lead_Production_Report.xlsx`, `Wajahat_WD17-WD25_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad,
  Saif, Shahzaib, Tahira, and Wajahat now ACCEPTED (11/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` (111-district
  postcode-reference guard re-confirmed), `test-discovery-run-recovery.ts`, `test-map-required.ts`
  ALL PASSED, `npm run typecheck` clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/wajahat/combined-2026-07-25/WD17-WD25-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  Hassan's EN1-EN5 territory — see the Hassan section below.

### EN1-EN5 (Hassan's full Sales Territory) — live, accepted — 2026-07-25

Preceded by a read-only verification of Wajahat's stored territory documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied, plus WD20/WD21/WD22 containment checks — all confirmed correct, no corrective
commit made.

- Before any live call, all five configured Postcode Districts (EN1-EN5) were confirmed as real
  entries in the authoritative postcode reference.
- All 5 districts run live end-to-end, sequentially, each independently DB-reconciled and
  zero-leakage-verified before proceeding to the next, using the fully-fixed pipeline
  (map_required resolver, ISS-0030, ISS-0031, ISS-0032 all already in place).
- **EN4 recovery (ISS-0031 procedure applied live)**: EN4's discovery run failed transiently
  (HTTP/2 stream timeout during a downstream provenance write) after the Just Eat query itself had
  already fully completed (460 raw observations retained, 0 failed queries). Its retained evidence
  (raw observations present, 0 geography validations, 0 candidates) confirmed the query had
  completed but geography validation/consolidation simply hadn't run yet. Recovered via the
  certified `--resume-from` procedure — zero new Just Eat call — exactly the recovery path
  ISS-0031 was built for. No data was fabricated, lost, or duplicated; this is the recovery
  procedure working as designed, not a new defect.
- Territory totals: 2428 raw = 382 geography-valid + 2046 rejected (exact, every district). 340
  candidates → 7 genuine cross-district duplicates removed → 333 unique. Permanent
  `customer_master_exclusion` rule enforced: 4 exclusions found, zero leakage. Final: 172 usable
  (107 premium, 65 releasable Level 1, 12 key accounts), 3 held for review, 116 hard-rejected, 38
  excluded groups. Hassan's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 176 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- Source calls (stated separately): Google combined total 300 (55+56+97+31+61). Companies House
  combined total 716 (123+130+247+70+146), documents total 39 (4+7+16+2+10). No request exceeded
  its certified per-district cap (Google 800, Companies House 600 combined / 250 documents) on any
  of the 5 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/hassan-en1-en5/`
  (`Hassan_EN1-EN5_Representative_Master.xlsx`, `Hassan_EN1-EN5_SalesPro_New_Leads.csv`,
  `Hassan_EN1-EN5_Key_Accounts_Management_Review.xlsx`,
  `Hassan_EN1-EN5_Customer_Master_Exclusions_Audit.xlsx`,
  `Hassan_EN1-EN5_Lead_Production_Report.xlsx`, `Hassan_EN1-EN5_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad,
  Saif, Shahzaib, Tahira, Wajahat, and Hassan now ACCEPTED (12/13 representatives complete).
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` (111-district
  postcode-reference guard re-confirmed), `test-discovery-run-recovery.ts`, `test-map-required.ts`
  ALL PASSED, `npm run typecheck` clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/hassan/combined-2026-07-25/EN1-EN5-TERRITORY-RECONCILIATION-REPORT.md`.
- **Next task (superseded, see below)**: owner authorisation was required before starting
  Haleema's EN6-EN11 territory — see the Haleema section below.

### EN6-EN11 (Haleema's full Sales Territory) — live, accepted — 2026-07-25 — 13th and FINAL representative

Preceded by a read-only verification of Hassan's stored EN1-EN5 documentation (manifest,
reconciliation report, Lead Production Report xlsx, progress register) against the exact figures
the owner supplied — all confirmed correct, no corrective commit made.

- Before any live call, all six configured Postcode Districts (EN6-EN11) were confirmed as real
  entries in the authoritative postcode reference.
- All 6 districts run live end-to-end, sequentially, each independently DB-reconciled and
  zero-leakage-verified before proceeding to the next, using the fully-fixed pipeline
  (map_required resolver, ISS-0030, ISS-0031, ISS-0032 all already in place).
- Territory totals: 1755 raw = 306 geography-valid + 1449 rejected (exact, every district). 261
  candidates → 6 genuine cross-district duplicates removed → 255 unique. Permanent
  `customer_master_exclusion` rule enforced: 2 exclusions found, zero leakage. Final: 155 usable
  (97 premium, 58 releasable Level 1, 11 key accounts), 1 held for review, 69 hard-rejected, 28
  excluded groups. Haleema's combined 107-field Master workbook and 108-column Sales Pro files
  generated; all 157 exported Sales Pro Lead IDs verified present in the Master workbook's
  Evidence Register.
- No new defect found.
- Source calls (stated separately): Google combined total 232 (51+5+87+34+20+35). Companies House
  combined total 570 (135+10+193+90+44+98), documents total 42 (12+0+10+10+0+10). No request
  exceeded its certified per-district cap on any of the 6 districts.
- Standardised handover package produced (**7 files**):
  `/Users/homemac/Data/aspectlead-lead-production/handover/haleema-en6-en11/`
  (`Haleema_EN6-EN11_Representative_Master.xlsx`, `Haleema_EN6-EN11_SalesPro_New_Leads.csv`,
  `Haleema_EN6-EN11_Key_Accounts_Management_Review.xlsx`,
  `Haleema_EN6-EN11_Customer_Master_Exclusions_Audit.xlsx`,
  `Haleema_EN6-EN11_Lead_Production_Report.xlsx`, `Haleema_EN6-EN11_Field_Provenance.csv`,
  `README.md`), representative-facing files verified to contain ordinary approved leads only,
  zero leakage.
- Representative Progress Register updated: **all 13 representatives now ACCEPTED (13/13
  complete)** — Nauman, Manraj, Ayesha, Kunz, Meer, Naseh, Saad, Saif, Shahzaib, Tahira, Wajahat,
  Hassan, Haleema.
- Full test/build gate re-run clean: `test-lead-production-territory-v2.ts` (111-district
  postcode-reference guard re-confirmed), `test-discovery-run-recovery.ts`, `test-map-required.ts`
  ALL PASSED, `npm run typecheck` clean, `npm run build` succeeded.
- Full reconciliation report (outside the repo, no lead data committed):
  `/Users/homemac/Data/aspectlead-lead-production/output/territories/haleema/combined-2026-07-25/EN6-EN11-TERRITORY-RECONCILIATION-REPORT.md`.

## CAMPAIGN COMPLETE — 13/13 representatives, PROVISIONAL pending commercial review (2026-07-25)

Live production is complete for all 13 representative Sales Territories (111 Postcode Districts).
Full campaign completion report with per-representative and campaign-wide totals and sum proofs:
`/Users/homemac/Data/aspectlead-lead-production/output/CAMPAIGN-COMPLETION-REPORT.md`.

**Campaign totals**: 68,708 raw observations -> 5,842 pre-dedup candidates -> 180 cross-district
duplicates removed -> 5,662 unique candidates -> 2,700 total usable (1,695 premium, 1,005
releasable Level 1) -> 2,520 ordinary new leads + 180 key accounts. 108 held for review, 1,853
hard-rejected, 407 customer-master exclusions, 594 excluded groups. Proof: 2,700 (usable) + 108
(held) + 1,853 (hard-rejected) + 407 (customer exclusions) + 594 (excluded groups) = 5,662 (unique
candidates). 3 field-sales representatives (Nauman, Manraj, Ayesha) each received an 8-file
package including a map deliverable; 10 telesales representatives each received a 7-file package
with no map — every count independently confirmed against the resolved `mapRequired` value for
that representative.

Four real defects were found and fixed during the campaign (ISS-0030 website HTTP/2 crash,
ISS-0031 discovery-run-recovery, the map_required resolver defect, ISS-0032 postcode-reference
validation) — every one root-caused at the pipeline or config source, regression-tested, and
never patched only in an output file.

**PROVISIONAL — DO NOT HAND OVER.** All 13 representative packages remain provisional pending a
final commercial review, not yet applied to any package:
- Exclusion of unwanted groups/chains (e.g. Chaiiwala).
- Exclusion of pharmacies and chemists.
- Exclusion of other irrelevant business types.
- Simplified representative workbook layout for end-user handover.
- Final CTO handover package (not yet assembled).
- Final regenerated campaign lists reflecting all of the above.

- **Next task**: application-development work (Phase 1-5, previously paused) remains paused per
  explicit instruction. No further lead-production work is authorised until the owner explicitly
  requests the commercial review pass described above. No new branch created, no merge to `main`,
  no deployment; all work remains on `feature/mvp-vertical-slice-001`.

## COMMERCIAL REVIEW v1 APPLIED — all 13 representatives regenerated (2026-07-26)

**SUPERSEDED by the release-verification fix below ("RELEASE VERIFICATION — pharmacy/chemist +
brand-matching gaps found and fixed") — the campaign totals in this section are the FIRST-PASS
numbers, before two real defects (pharmacy/chemist rule + two brand-matching gaps) were found and
fixed. Kept here for the historical record; do not treat these totals as current.**

The approved commercial-review decision files (141 brands reviewed: 28 kept, 113 excluded as
whole brands) were copied into
`config/lead-production/commercial-review-v1/` (`corrected_brand_decisions.csv`,
`brands_to_keep_final.csv`, `brands_to_exclude_final.csv`) and verified before use: 141/28/113
row counts confirmed, zero overlap between keep/exclude, union exactly matches
`corrected_brand_decisions.csv`, every row's own Decision label cross-checked against which file
it actually appears in. A permanent pharmacy/chemist exclusion (requires BOTH business-type/
category evidence AND name evidence) was added alongside the brand rule.

**Pipeline changes** (code commits `98e17ee`, `2f9a23a`, `70e3e38`):
- `scripts/lead-production/load-commercial-review.ts` — loads and fail-closed-validates the
  registry on every run (never trusts a stale/partial load).
- `scripts/lead-production/commercial-review-filter.ts` — normalised-name brand matching (exact
  match required for single-word brands to protect generic words — Flames/Phoenix/Premier/Shell/
  Aroma/Saffron/Georges — from false positives; multi-word brands additionally match a
  branch-name-variant prefix, e.g. "Village Pizza Hounslow"), explicit keep-list override checked
  first and unconditional, and the pharmacy/chemist dual-evidence rule.
- `generate-master-export.ts` / `generate-salespro-export.ts` — new exclusion buckets applied
  after existing rules (customer_master_exclusion, excluded_large_group) and before the
  usable/key-account split, so a key account matching an approved exclusion is also removed. Every
  exclusion recorded in `<prefix>-commercial-review-exclusion-audit.csv` (Lead ID, representative,
  business name, matched rule, match basis, previous status, final status).
- `generate-representative-handover.ts` — new Simplified Representative Workbook (the approved 20
  CTO fields, "Business Name" as the first column instead of "Shop Name") and a management-only
  Commercial Review Exclusions Audit workbook per territory.
- `generate-cto-existing-lead-form.ts` — formalises the 20-column CTO extraction (built ad hoc in
  the previous turn) into a tested, reusable pipeline component.
- Regression tests: `scripts/test-lead-production-commercial-review.ts` (15 assertions covering
  exact brand match, legal-company-name/group-identity match, explicit keep override, generic-word
  false-positive protection, pharmacy/chemist dual-evidence rule, unaffected-independent
  retention, and registry fail-closed behaviour) — ALL PASSED. Existing UB1/RM1 checkpoint tests
  in `test-lead-production-master-export.ts` / `test-lead-production-salespro-export.ts` updated
  for the new (correctly lower) usable counts and re-verified PASSING. `npm run typecheck` clean,
  `npm run build` succeeded.

**Reprocessing**: all 13 territories reprocessed from their existing `territory-run-manifest.json`
(the earliest compatible post-enrichment checkpoint) — zero new discovery/enrichment calls, only
the export/handover stages re-run against already-retained evidence. Every representative's
handover package, Simplified Representative Workbook, 108-column Sales Pro export, 20-column CTO
form, Lead Production Report, and (for Nauman/Manraj/Ayesha) New Leads Map regenerated. Zero
excluded-brand/pharmacy/chemist leakage verified independently across every new-leads CSV, CTO
file, and audit file; every surviving Lead ID re-verified against its territory's Master Evidence
Register (0 missing across all 13).

**Campaign totals (before -> after commercial-review-v1)**:
- Usable: 2,700 -> 2,294 (-406)
- Premium: 1,695 -> 1,496 (-199)
- Releasable Level 1: 1,005 -> 798 (-207)
- Ordinary new leads: 2,520 -> 2,118 (-402)
- Key accounts: 180 -> 176 (-4; 4 key accounts across Kunz/Saad/Saif/Hassan matched an approved
  exclude brand and were correctly removed, per "preserve key accounts unless separately excluded
  by an approved rule")
- Held: 108 -> 103 (-5), Hard-rejected: 1,853 -> 1,775 (-78)
- Customer master exclusions: 407 (unchanged — independent rule), Excluded groups: 594 (unchanged)
- New: Commercial-review brand exclusions: 489 (94 distinct brands matched, all genuine exact/
  branch-variant matches, zero false positives found on inspection); pharmacy/chemist exclusions: 0
  (no candidate in this Just-Eat-sourced dataset had both category and name evidence)
- Sum check: 2,294 (usable) + 103 (held) + 1,775 (hard-rejected) + 407 (customer exclusions) + 594
  (excluded groups) + 489 (commercial-review exclusions) = 5,662 (unique candidates, unchanged) ✓

**Still open / not addressed this turn**: "other irrelevant business types" beyond the named
brands and the pharmacy/chemist rule was not separately scoped or actioned this turn (no such
category was specified). A single combined "final CTO handover package" across all 13
representatives was not built — each representative's 20-column CTO form was regenerated
individually, per the explicit instruction not to create a combined file (Turn I). **Final human
sign-off is still required before any package is physically handed to a representative or the
CTO** — this turn applies and verifies the approved commercial-review decisions; it does not
itself constitute that sign-off.

## RELEASE VERIFICATION — pharmacy/chemist + brand-matching gaps found and fixed (2026-07-26)

A read-only release-verification pass (owner-requested, comparing production output against an
earlier manual commercial scan that had identified ~20 possible pharmacy/chemist records)
surfaced two genuine pipeline defects and one layout defect in the work above. Full technical
detail: `docs/10_BUGS_AND_FIXES.md` ("commercial-review-v1 pharmacy/chemist rule unfireable + two
brand-matching gaps"), `docs/09_DECISIONS.md` (matching-safety design record).

**Found**: 41 real pharmacy/chemist candidates (Church Pharmacy, Woods Chemist, Superdrug branches,
Pearl Chemist branches, etc.) that had NOT been excluded — pharmacy_chemist_exclusions was 0.
Root causes: (1) the pharmacy/chemist rule required category evidence that real FSA/Google data
almost never provides for pharmacies; (2) single-word brand "Superdrug" and multi-word brand
"Pearl Chemist Group" both had real-world naming patterns the original matching logic didn't
catch. Separately: the Simplified Representative Workbook used the wrong 20-CTO-field layout
instead of the approved 18-column layout.

**Fixed and reprocessed**: pharmacy/chemist rule now fires on name evidence alone (category is
corroborating, not required); single-word brands additionally match a dash-separated branch name
("Superdrug - Hornchurch") while remaining exact-only for a bare space (protecting "Phoenix Fried
Chicken"/"Premier Kebab House"); a generic "Group" suffix is stripped from the brand side before
multi-word comparison ("Pearl Chemist Group" now matches "Pearl Chemist Cobham"). Simplified
Workbook rebuilt to the correct 18-column layout. All 13 territories reprocessed again from the
same already-accepted checkpoints — no new discovery/enrichment call.

**Final corrected campaign totals (13/13 representatives, superseding the first-pass numbers above)**:
- Usable: 2,700 (original) -> 2,192 (final)
- Ordinary new leads: 2,520 (original) -> 2,016 (final)
- Key accounts: 180 (original) -> 176 (final, unchanged by this fix — the same 4 removed in the
  first pass remain removed; no additional key account was newly caught)
- Commercial-review exclusions: 489 (first pass) -> 702 (final) — 672 brand + 30 pharmacy/chemist
  (was 489 brand + 0 pharmacy/chemist)
- Independently-computed overlap between the brand rule and the pharmacy/chemist rule: 2
  candidates (both "Pearl Chemist" branches — matched by both rules; the brand rule wins in
  production since it is checked first, immaterial to the correct final exclusion outcome)
- Sum check: 2,192 (usable) + 101 (held) + 1,666 (hard-rejected) + 407 (customer exclusions) + 594
  (excluded groups) + 702 (commercial-review exclusions) = 5,662 (unique candidates, unchanged) ✓

**Verified after the fix** (all independently re-checked, not just exit-code-trusted): zero
leakage across every new-leads CSV / CTO file / Simplified Workbook / map for all 13
representatives; every surviving Lead ID re-traced to its Master Evidence Register (0 missing);
every one of the 41 originally-flagged pharmacy/chemist candidates now excluded by one rule or the
other (0 remaining unexcluded); 69 keep-listed-brand candidates confirmed still present/eligible
in final output; the 3 field-sales maps' row counts match their territory's final ordinary-lead
count exactly; all 13 Simplified Representative Workbooks confirmed to use the identical approved
18-column layout, Business Name first, Sales Pro Lead ID last.

**Residual, documented risk**: the dash-separator relaxation for single-word brands carries a
theoretical residual risk (an unrelated independent business coincidentally named "Word -
Location" where Word matches an exclude brand) — no such case was found across 702 real matches,
but it is not structurally impossible. "Other irrelevant business types" beyond the named brands
and pharmacy/chemist remains out of scope. **Final human sign-off is still required before any
package is physically handed to a representative or the CTO.**

Code commits: `98e17ee`, `2f9a23a`, `70e3e38`, `c59e93f`, `a178b97`, `f33f517`. Application-
development work remains paused; no merge to `main`, no deployment.

## CTO address section added — 26-column flat file + address companion file (2026-07-26)

The 20-column `*_CTO_Existing_Lead_Form_20_Fields.csv` file was found to be structurally
incomplete: it contains only the lead-level fields and omits the address section shown in the
Magna Sales Pro screenshots and import template. **This was an instruction defect (the 20-column
spec never asked for address fields), not a source-data defect** — the structured address fields
(Address Line 1, Address Line 2, Town/City, Postcode) already exist in the 108-column Sales Pro
export and were never re-parsed from a free-text address string.

Two new files were added per representative, alongside (never replacing) the existing 20-column
file, from `scripts/lead-production/generate-cto-with-address.ts` (commit `656c767`):
- `*_CTO_Existing_Lead_Form_With_Address.csv` — 26 columns (the 20 approved fields + Address Line
  1, Address Line 2, City, Address Postcode, Address Type, Default Address).
- `*_CTO_Addresses.csv` — 8-column address companion file (Import Reference ID, Address Sequence,
  Address Line 1, Address Line 2, City, Postcode, Address Type, Default Address), linked by
  Permanent Lead ID.

Zero new discovery/enrichment calls — built entirely from the already-regenerated, final-filtered
`*_SalesPro_New_Leads.csv` and the existing accepted 20-column file (cross-checked for row
alignment by Shop Name at every index before joining by position).

| Rep | Final ordinary rows | 20-col rows | 26-col rows | Address-file rows | Counts equal | 26 cols | 8 cols | Blank Addr1 | Blank City | Blank Postcode | Postcode mismatches | Excluded-record leak | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nauman | 293 | 293 | 293 | 293 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Manraj | 263 | 263 | 263 | 263 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Ayesha | 196 | 196 | 196 | 196 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Kunz | 140 | 140 | 140 | 140 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Meer | 125 | 125 | 125 | 125 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Naseh | 95 | 95 | 95 | 95 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Saad | 112 | 112 | 112 | 112 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Saif | 260 | 260 | 260 | 260 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Shahzaib | 128 | 128 | 128 | 128 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Tahira | 52 | 52 | 52 | 52 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Wajahat | 109 | 109 | 109 | 109 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Hassan | 129 | 129 | 129 | 129 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |
| Haleema | 114 | 114 | 114 | 114 | ✓ | ✓ | ✓ | 0 | 0 | 0 | 0 | 0 | PASS |

All 13 PASS. The existing 20-column file was confirmed untouched (file modification time
unchanged) — kept for comparison as instructed, not overwritten. All 13 README files updated with
a new "CTO Import Options" section explaining both import methods and their file tables extended
to list the 2 new files. `npm run typecheck` clean, `npm run build` succeeded, all 8 lead-
production regression suites (now including `test-lead-production-cto-with-address.ts`, 22
assertions) re-verified PASSING.

## FIVE-DISTRICT PILOT — mandatory corrections implemented and offline-tested; PILOT BLOCKED (2026-08-02)

**PILOT BLOCKED — see ISS-0033 (`docs/11_ISSUES_LOG.md`).** None of the 5 named pilot districts
(CM1, IG1, RM1, DA1, BR1) match their named representative's actual configured territory in
`config/lead-production/sales-territories-v2.json` (Kunz is TW1-TW10, Naseh is UB1-UB5, Saif is
HA0-HA5, Tahira is WD3-WD7, Hassan is EN1-EN5), and RM1 is already owned by Nauman from the
completed first campaign wave. **No territory config was changed and no live discovery has been
run against any of the 5 named districts.** This requires an owner decision before the pilot can
proceed — see ISS-0033 for the exact resolution options.

Every mandatory implementation and offline-test correction agreed ahead of the pilot IS complete:

- `config/lead-production/master-schema-v2.json` — 129-field Master schema (107 v1 fields
  preserved byte-for-byte + 22 new: CTO Business Type + metadata, Business Category Eligibility +
  evidence, Trading Status consolidation, `sic_code_descriptions`, restricted financials,
  Note 1/Note 2).
- New `business-category-eligibility.ts` engine (café/coffee-shop and bubble-tea
  "principal-operation" rules) and `cto-business-type-mapping.ts` engine (maps only to the CTO's
  exact 57-value approved allow-list, honest "Other" fallback, never invented).
- Mandatory-phone gate (`phone_resolution_exception` status; `isValidUkPhone()` consolidated as
  the single shared validator).
- SIC codes, filed-accounts financials, directors, PSCs wired into the candidate dossier.
- Note 1 (ownership/directors/decision-maker, paragraph form) and Note 2 (bullet-point sales
  intelligence) generated and populated.
- Territory fail-closed validation, website page-path traversal fix, website closure-text
  detection, named-brand exclusion union + matching-gap fixes — all from earlier this session,
  unchanged.
- Field provenance (`generate-field-provenance.ts`) extended to cover the 3 new decision fields.

**Verification, not just claimed:** `npm run typecheck` and `npm run build` clean; all 20
`test:lead-production-*` regression suites individually re-run, all pass. Two real bugs were found
and fixed during this verification pass (Sales Pro multi-value dropdown validation; a
`"not_available"` string leak into restricted-financial fields) — full detail
`docs/10_BUGS_AND_FIXES.md`, `VERIFY_BEFORE_CLAIMING.md` (2026-08-02 entries).

**Commits:** `c26c15d` (field population + Notes + 2 bug fixes), `b88cc03` (field-provenance
extension), `9a7c497` (docs), on top of this session's earlier `fdc9ee3`/`78d6c27`/`755cc82`/
`277e19e`/`becab64`/`a8469a2`/`3eed9d2`/`896c3ca`/`cadbb23`/`467c674`.

**Next action:** owner resolves ISS-0033 (which district/rep/RM1 pairing is correct). Once
resolved, the pilot can run using the already-implemented and already-tested pipeline — no further
code change is expected to be needed for the pilot itself.

Code commit: `656c767`. Docs commit: (this commit).

## Current state — 2026-08-03 (five-district pilot: owner-review corrections applied, files generated)

ISS-0033 (above) is resolved (2026-08-03) — the pilot ran using a new, additive campaign config,
`sales-territories-v2.json` untouched. This entry covers the owner's follow-up correction pass
after reviewing the pilot's first output.

- 3 real bugs found and fixed: Chaiiwala®/trademark-symbol brand matching (also caught a real
  UB1 leak, "Chaiiwala® - Southall"), a Black Sheep Coffee keep/exclude registry conflict, and a
  missing max-3 cap on the CTO Business Type mapper's Tier-1 cuisine loop.
- Note 1/Note 2 rewritten to the owner's detailed spec (people/ownership only vs. business sales-
  conversion intelligence, never generic filler); wires in website-extraction.ts fields that were
  already computed and persisted per candidate but never read downstream.
- Lead Urgency recalibrated — Hot Lead requires a key account or genuinely unusual evidenced
  opportunity, never qualification alone; "Cold Lead" (not an approved dropdown value) maps to
  "Standard Lead".
- All 15 owner-confirmed EXCLUDE decisions + the Da Raffaele Bistro retain verified correct
  against freshly regenerated real campaign-002 exports (zero live provider calls — reprocessed
  from already-stored, phone-fix-corrected checkpoints). Bobo & Cha correctly routes to
  `review_required_business_category`.
- Two new generator scripts: `generate-campaign-master-combined.ts` (merges the 5
  representatives' per-district Master workbooks into one canonical cross-campaign workbook —
  524 candidates, 7 disjoint buckets reconciling exactly) and `generate-cto-final-review.ts`
  (unified telesales/field-sales CTO review file — 177 rows, exact approved 28-column header).
- Generated to `/Users/homemac/Downloads/` (not committed, per locked policy — generated
  data workbooks are never committed): the combined Master workbook + CSV, the CTO final-review
  file + CSV, and a regenerated owner-review workbook (see `docs/15_AI_WORK_LOG.md` for the
  owner-review-pack regeneration detail).

**Verification, not just claimed:** `npm run typecheck`/`build` clean; all 25
`test:lead-production-*` suites individually re-run, all ALL PASSED. Full detail:
`VERIFY_BEFORE_CLAIMING.md`, `docs/09_DECISIONS.md`, `docs/10_BUGS_AND_FIXES.md` (all 2026-08-03
entries).

**Commits:** `e99eabc`, `892f3bc`, `f299edd` (pre-existing this session), `cd29b52`, `7fd4c6c`,
`e52a167`, `0f1ec29`, `0e3b8b9`, `74380a5`, `c4d34fd` (this correction pass) — none pushed to
`origin/feature/mvp-vertical-slice-001` yet.

**Next action:** owner reviews the regenerated Downloads deliverables; push the code/test/config
commits once approved.

## Current state — 2026-08-03 (board escalation: customer-suppression leak — resolved, verified)

A board review found existing Magna customers in the released pilot output. All other work
stopped. Full detail: `docs/11_ISSUES_LOG.md` ISS-0034, `docs/10_BUGS_AND_FIXES.md`,
`docs/09_DECISIONS.md`, `VERIFY_BEFORE_CLAIMING.md` (all 2026-08-03 entries).

- Root cause: the investigation's assumed customer-master file path was wrong (proved via MD5
  checksum, not assumed) — the pilot actually used `magna-customers.csv`. Independently
  re-verified all 177 previously-released usable leads and found exactly 2 real confirmed leaks
  (Al Qasr Restaurant IG1, Munchies Peri Peri BR1), traced to 3 concrete bugs (a postcode-
  normalisation defect affecting ~7% of real customer postcodes, unmapped alternate phone/email
  columns, and a hardcoded `domain: null`) plus 2 further over-exclusion-risk defects found while
  proving the fix.
- All 5 fixed. Built a genuinely independent pre-release leakage verifier
  (`verify-customer-leakage.ts`) that does not share logic with the main matcher. Reprocessed all
  5 districts from already-stored checkpoints (zero live calls) — **verifier result: PASS, 0
  confirmed leaks**, usable count 177 → 175.
- `npm run typecheck`/`build` clean; 27 `test:lead-production-*` suites individually re-run, all
  ALL PASSED, including 2 new suites (40 assertions) with both real leaked cases as permanent
  regression fixtures.
- Regenerated to `/Users/homemac/Downloads/` for owner review (not distributed to
  representatives): combined Master workbook, CTO final-review file, customer-leakage audit
  workbook (7 required sheets), zero-leakage certificate. The 15-sheet owner-review workbook was
  NOT regenerated this pass — flagged as outstanding in ISS-0034.

**Commit:** `fa97306` (code/tests/config only). Not pushed — awaiting owner review of the
leakage audit per the explicit instruction this pass operated under.

**Next action:** owner reviews the customer-leakage audit and zero-leakage certificate; confirm
which customer-master file (`magna-customers.csv` vs `magna-customers-master.csv`) is the
genuinely approved snapshot going forward; decide Franzos - Ilford and Chocoberry - Ilford
(currently held, not released); approve before any push or before the CTO file is used by the
team.

## Current state — 2026-08-03 (same day, follow-up: re-verified against the true authoritative customer file)

The customer-master file used above (`magna-customers.csv`) was NOT the owner's actually-
authoritative export. Located the real one (`CustomersProjects81.csv`, 8050 rows, 4558 active/
3492 inactive, SHA-256 `f1b23cce93d878f6fb6764e5dbce36812d579aaa6ac9d14c9342f8f2e6e683f1`),
confirmed via checksum it's genuinely different, built a versioned local customer-master package
(`/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/`), and reran
the full pilot against it. The released usable-lead-ID set came back byte-identical (same 175
leads, same 2 real leaks) — the prior PASS conclusion held, now formally proven against the
correct source. While extending the verifier's identifier coverage, found and fixed 3 new false-
positive defects in the new routes themselves before they ever reached a certificate (T/A-alias-
alone, address-alone, and domain-without-geographic-agreement all wrongly auto-confirmed). Final
result: **PASS** across Master, CTO, and all 5 Sales Pro exports — 0 confirmed leaks, 9 correctly-
held probable cases. Owner-review workbook regenerated — no longer outstanding.

**Commit:** `42d8eb7` (code/tests only), on top of `fa97306`/`49c03d6`. Not pushed.

**Next action:** owner reviews the 9 probable/held cases and approves (or rejects)
`CustomersProjects81.csv` as the permanent live customer-master snapshot before any push.

## Current state — 2026-08-04 (entity-resolution configuration audit; reconciliation-count contradiction resolved)

The owner flagged an apparent contradiction in the 2026-08-03 reporting ("2 confirmed leaks" vs
"0 confirmed, 9 probable... the 2 above" silently reusing "2" for a different pair) and required a
single unambiguous reconciliation table plus a full entity-resolution configuration/calibration
audit. Resolved the ambiguity: "2 confirmed leaks" = Al Qasr Restaurant + Munchies Peri Peri
(board-caught, 2026-08-03); "the 2 above" = Franzos - Ilford + Chocoberry - Ilford, a wholly
different, PROBABLE-tier pair — imprecise pronoun reuse in the prior report, now disambiguated.

While building the required reconciliation (counted by distinct lead, full 255-lead Usable +
Held-Review + Customer Master Exclusions population, independently re-derived rather than trusted
from any sheet's placement), found and fixed 3 further real defects: (1) probable matches were
report-only and never actually removed from the releasable population — fixed with
`hold-probable-customer-matches.ts` (Usable 175 → 170); (2) exact-postcode candidates with weak
name correspondence were silently dropped with no audit record — fixed by extracting a shared
per-pair evaluation function, zero behavioural change to release decisions; (3) a genuinely
CONFIRMED match ("Monster Burger", IG1-202F5195) was sitting in Held-Review, not Customer Master
Exclusions, held there by an earlier unrelated pipeline flag — fixed with
`exclude-confirmed-customer-matches.ts` (Held-Review 66 → 65, Customer Master Exclusions 19 → 20).

Built a 20-case hand-labelled entity-resolution calibration set run through the production
verifier itself: 100% precision/recall on confirmed decisions, 0 false positives/negatives
(explicitly not claimed as statistically powered). Added 9 sheets to the leakage-audit workbook
(now 18 sheets total) documenting every matching algorithm's actual implementation, every
phone/postcode/address/fuzzy-name trigger candidate considered, calibration results, and the final
reconciliation. Regenerated the zero-leakage certificate with the new documentation fields.

**Final reconciliation:** 20 confirmed found and removed (0 remaining anywhere releasable), 7
probable held (0 remaining anywhere releasable), 170 cleared, 170 final released.

`npm run typecheck`/`build` clean; all 31 `test:lead-production-*` suites (2 new this pass)
individually re-run, ALL PASSED.

**Commit:** `a21e3de` (code/tests/config only), on top of `42d8eb7`/`fa97306`/`49c03d6`. Not
pushed.

**Outstanding:** the owner-review pack's OWN regeneration for this correction pass was not re-run
(its Held-Review/Customer Master Exclusions row counts are one pass stale — 66/19 vs the corrected
65/20; Usable/CTO/Sales Pro are unaffected, unchanged at 170). 7 probable/held cases still require
a human decision. The permanent live customer-master pointer remains `pending_owner_review`.

**Next action:** owner reviews the reconciliation table, the entity-resolution configuration audit,
and the 7 remaining probable/held cases; approves (or rejects) `CustomersProjects81.csv` as the
permanent live customer-master snapshot before any push.

## Current state — 2026-08-04 (same day, second follow-up: component-address/fuzzy-name matching, canonical-Master annotation, expanded calibration, critical self-inflicted bug found and fixed)

Four owner-directed gaps closed: (1) component-level UK address matching
(`address-components.ts`) — unit/building-number/street/postcode compared separately, replacing
whole-string comparison that real data proved was over-matching different building numbers on the
same street (Kings Diner vs. its old assumed match, 439 vs 453 Downham Way); (2) Damerau-
Levenshtein fuzzy name matching (`fuzzy-name-match.ts`) — candidate-generation/corroboration-
support only, never confirms alone; (3) the canonical combined-Master workbook now carries
structured customer-match evidence on every held/excluded row (`annotate-canonical-master.ts`);
(4) the calibration set grew from 20 to 103 labelled cases (80 calibration / 23 holdout), 100%
precision/recall on both subsets.

**Critical self-inflicted bug found and fixed before any release:** the first version of the
canonical-Master annotation script wrote matched account codes into the "NetSuite Customer Account
Code" column, which the matcher also reads as an independent decisive matching input — creating a
feedback loop that silently upgraded probable (and already owner-cleared) leads to CONFIRMED, and
reached a real SalesPro export CSV before the independent verifier caught it
(`salesProResult: FAIL`). Fixed at the root (report evidence now uses a dedicated non-input
column) and at the data layer (32 corrupted Master rows + 2 corrupted SalesPro cells cleaned, the
full hold/exclude/clear/annotate chain re-run from the corrected state).

Re-running the improved matcher surfaced 5 genuinely new probable matches never caught by the
earlier matcher run; Spice Hut and PHAT Buns re-evaluated and cleared per the owner's explicit
rule with a permanent audit warning; the reconciliation gate is now override-aware (an explicit
release is reported, never silently blocked or silently hidden).

**Final reconciliation (255-lead full population):** 20 confirmed found/removed (0 remaining
releasable), 12 probable held (2 released under explicit owner override, 0 remaining
unaccounted for), 165 cleared, **167 final released leads**.

`npm run typecheck`/`build` clean; all 35 `test:lead-production-*` suites (6 new this pass)
individually re-run, ALL PASSED.

**Commit:** `05d4138` (code/tests/config only), on top of `a21e3de`/`bc9aebd`/`42d8eb7`. Not
pushed.

**Outstanding:** 12 probable/held cases require a human decision (7 unchanged + 5 newly
surfaced); the 2 explicit clearances (Spice Hut, PHAT Buns) are recorded with a permanent audit
warning and await owner sign-off on the underlying policy call, not further algorithmic review.
The permanent live customer-master pointer remains `pending_owner_review`.

**Next action:** owner reviews the final reconciliation, the entity-resolution documentation, the
override-released Spice Hut/PHAT Buns decisions, and the 12 held/probable cases; approves (or
rejects) `CustomersProjects81.csv` as the permanent live customer-master snapshot before any push.
