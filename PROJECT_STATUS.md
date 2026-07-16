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
