# AI Work Log — Magna Lead Intelligence System

## Session: 2026-07-16 (later still) — Geography Standard v1.0 (platform-wide)

Tool used: Claude Code
Human request: Establish a platform-wide Geography Standard v1.0 — canonical terminology/models
for 16 entities, postal + business hierarchies, explicit place↔postcode M:N, version-controlled
migrations, deterministic expansion, per-adapter geography levels + a planner, selection
provenance, rename "outcode"→"Postcode District", UI geography search/selection, tests + docs.
Do NOT fabricate boundaries. Decision (user): build full place schema now, populate later from
verified datasets; generic geography logic → the geospatial-platform package; AspectLead keeps
sales region/territory/coverage + run selections + planning adapters.
Audit: postcode_labels.geojson is a genuine NATIONAL enumeration (120/2,872/10,872) → area→
district→sector expansion is real; place data / ONSPD / national boundary polygons are NOT in
repo (honest gaps).
Package (`@geospatial/map` → **v0.2.0**, released+tagged+pushed): `src/geography/` — terminology,
postcode classify/expand over an injected reference, place + PlacePostcodeLink models + capability
(pending_data), resolveSelection/planSelections/planForSource, centroidsInPolygon. `test:geography`.
AspectLead: migrations 0012–0014 (postcode_reference seeded 13,864; place/admin empty pending_data;
business hierarchy + M:N; discovery_selection + query_unit; rename derived_outcodes→derived_query_units);
`seed-postcode-reference.ts`; DB-backed reference loader; planner (Just Eat district-only) wired into
run-service/API so areas EXPAND; `/api/geography/resolve`; GeographySelector UI (preview/type/count/
children/exclusions); user-facing "outcode"→"Postcode District" sweep; `test:geography-standard` (11
categories). Honest: place/admin expansion fails as pending_data (never guessed); map-polygon is
centroid-based; no fabricated boundaries.
Verified: package typecheck + full test suite green; AspectLead typecheck + all JE/retained/geography
tests green; `npm run build` green; migrations applied + advisors clean (2 accepted).
Docs: `docs/60_GEOGRAPHY_STANDARD.md`; ADR-0015; PROJECT_STATUS; ISS-0017.
Next action: acquire OS Open Names + ONSPD to populate place/admin + place↔postcode, then flip those
capabilities from pending_data to available.

## Session: 2026-07-16 (later) — JE Stage 1 progress-counter fix + outlet-detail capability audit

Tool used: Claude Code
Human request: (1) Fix the execution-progress defect (completed run shows 0/1); ensure
completed_queries increments once per successful query; represent failed/cancelled correctly;
prevent retry double-increment; add tests. (2) Capped ≤10-outlet Just Eat outlet-DETAIL
capability audit (lawful public routes only, no bypass); report field availability + recommend;
do NOT integrate. Verify UB1 execution intact. No Deliveroo/Uber/customer comparison/FSA/Google/CH.
Objective 1 — root cause: `claim` re-claim on lease expiry (no heartbeat during the 718-outlet
inner loop) + `finishExecution` never writing the `completed_queries` column. Fix: authoritative
+ ownership-guarded finish; intra-query heartbeat (every 25 outlets); migration `0011`
`heartbeat_je_execution` returns `(owned, cancel_requested)` so a lease-lost worker aborts;
counters count successful queries, resume-safe. Tests: 1/1, 0/1-failure, cancellation, retry,
ownership guard (test:je-stage1 now 61+ assertions; test:je-supabase asserts 1/1 on real DB).
Objective 2 — audited 10 real UB1 outlets: public restaurant pages are Cloudflare-blocked (403),
no public detail/menu endpoint (404) → detail (phone/menu/hours/description) NOT lawfully
retrievable. Recommendation: **option B** (later lawful enrichment for phone/menu, not JE detail).
Raw responses kept outside git; no fixtures committed (all responses were blocks/404).
Finding: UB1 execution intact (718 outlets, now 1/1) but DB holds 1,436 observations = 718 real
+ 718 duplicates from the pre-fix double-claim (ISS-0015; not deleted — real data, awaiting decision).
Verified: typecheck clean; all JE + retained tests green; `npm run build` green.
Docs: `docs/59`; `10_BUGS_AND_FIXES`, `11_ISSUES_LOG` (ISS-0015/0016), `PROJECT_STATUS`.
Next action: decide on pruning the 718 duplicate observations; then proceed per option B.

## Session: 2026-07-16 — Just Eat Discovery Stage 1 (first discovery-engine vertical slice)

Tool used: Claude Code
Human request: Build Just Eat Discovery — Stage 1. Persist a run canonically; execute Just
Eat discovery; retain immutable raw observations; normalise the maximum lawful data; expose
data-quality metrics; assess whether Just Eat alone gives sufficient coverage. Just Eat only;
no fake connector; no bypassing auth/CAPTCHA/anti-bot/rate-limits. Provision hosted Supabase.
Audit first. Do NOT start Deliveroo/Uber Eats/customer comparison/Companies House/FSA/Google.
Audit findings: no DB existed (local JSON + localStorage; draft SQL only); existing lawful JE
method = one public listing endpoint (listing-level only, no phone/menu/reviews).
Decisions (user-approved mid-session): provision hosted Supabase ($10/mo, eu-west-2); allow
capped live calls to build the field catalogue.
Work:
- **Field audit** from 6 capped live calls (4,904 records, 96 fields) → `docs/57`.
- **Supabase** `aspectlead-platform` created + 8 version-controlled migrations applied
  (tenancy+RLS, runs, executions+claim/heartbeat RPCs, immutable raw observations, outlets,
  rating history, provenance, quality; grant hardening). DB-level immutability/dedupe/cascade/
  claim/anon-isolation/raw-column-restriction verified via MCP; advisors clean bar 2 accepted.
- **Engine** (`src/lib/discovery-engine/`): catalogue, parser, UK phone normaliser, adapter
  (reuses the one lawful endpoint; `fetchJustEatSearchRaw` added to `src/lib/sources/just-eat.ts`),
  repository (Supabase + in-memory), config/run-service, worker (claim/heartbeat/lease), quality.
- **APIs**: runs / queue / status / cancel. **UI**: "Just Eat — Stage 1" Run Builder panel.
- **Worker CLI**: `npm run je:worker`. **Tests**: `test:je-stage1` (40+, green), `test:je-supabase`
  (integration, skips until service key). Fixtures sanitised; no raw committed.
Verified: typecheck clean; all retained + new tests green; `npm run build` green.
Not done (deliberate): Deliveroo, Uber Eats, customer comparison, Companies House, FSA, Google.
Pending on user: paste `SUPABASE_SERVICE_ROLE_KEY`, set `JUST_EAT_ENABLED=true` (ISS-0012).
Docs: `docs/57`, `docs/58`; decisions ADR-0014; issues ISS-0012/0013/0014.
Next action: run a live JE pull, read the data-quality report, then choose the Stage-1 gate
(A add platform / B validation+dedup / C improve connector).

## Session: 2026-07-15 — Map interaction functional pass + `@geospatial/map` v0.1.2

Tool used: Claude Code
Human request: One final **functional** map-interaction pass across `/run-builder` and
`/coverage-map` — fix controls that don't accurately control the visible map. Do NOT start
Discovery Sources, do NOT redesign the app, do NOT move AspectLead business logic into the
generic map package.
Package (`@geospatial/map`, independent repo) changes → released as **v0.1.2**:
- Solid A-road rendering (width bump + casing/solid layer pairs; primary vs other A split by
  `primary_route`); hierarchy preserved (`roadRules.ts`, `createMapStyle.ts`).
- Road labels coupled to road-geometry visibility (`layerRegistry.ts`).
- Single postcode **study mode** (`postcodes.mode`) replacing four independent toggles; only
  the active level shows labels + point interaction (`types.ts`, `createMapStyle.ts`,
  `layerRegistry.ts`, `defaultMapProfile.ts`).
- Honest postcode audit: production carries **centroid points only, no polygons** → point-based
  hover/selection; drawer states "Boundary polygons unavailable".
- Hover=light temp highlight; click=persistent **blue** selection (distinct from orange
  territory); new selection replaces previous; **Escape** clears (`GeospatialMap.tsx`).
- README documents study modes, boundary availability, label/road coupling, hover/selection.
- New tests: study-mode + label/road coupling invariants. Typecheck + tests green.
AspectLead (this repo) changes:
- Pinned `@geospatial/map` to **v0.1.2**.
- `ExpandableMap.tsx` — Expand control reusing the **same** GeospatialMap instance (CSS swap +
  `map.resize()`); embedded height 620→760px responsive.
- `aspectlead-territory.ts` — run outcodes → district polygons (local Code-Point feasibility
  layer) → `selectedTerritories` orange outline; recomputed from territory input only.
- `deliveryCoverageOverlay()` — teal operational overlay from the *mock* delivery boundary,
  labelled a mock; `DELIVERY_COVERAGE_SOURCE_STATUS` records the missing canonical source.
- `run-builder` layout: sticky pipeline stepper, sticky right rail, persistent Save Draft.
- `coverage-map`: grouped overlay panel (Operational / Lead coverage) + honest mock notice.
- `docs/56_MAP_INTERACTION_FUNCTIONAL_PASS.md` (new, Part 14 documentation).
Bugs fixed: 4 (see `10_BUGS_AND_FIXES.md`). Issues opened: ISS-0009/0010/0011.
Tests run: package typecheck+test ✓; AspectLead typecheck ✓, run-draft/custom-config/scoring/
telesales-safe/geo ✓, `npm run build` ✓, routes 200, no 404s.
Not verified: in-browser pixel checks (Chrome extension unavailable) — ISS-0011.
Next action: **Discovery Sources engine** (deliberately not started here).

## Session: 2026-07-11 — Route B (Perspective Cut) carried forward + wordmark refinement brief (design only)

Tool used: Claude Code
Human request: Carry forward **Route B — Perspective Cut** as the preferred AspectLead wordmark direction. Create a **refinement brief only** — no code, no app UI, no npm, no Supabase, no SQL, no migrations, no Vercel, do not mark branding final.
Files changed:
- `docs/20_ASPECTLEAD_WORDMARK_REFINEMENT_BRIEF.md` (new) — 10-section designer brief: exact wordmark direction; which letters to customise (`A` primary, `L` secondary, `t`/`d` optional); how the perspective cuts work (one shared angle, ~5–7° skew, clean geometric facets, tested at 16/24/240 px); subtle geographic cues allowed (contour whisper / facet-as-terrain) vs forbidden logistics cues (pins, routes, vans, Route C's node); light-theme colour use; dark-theme colour use; favicon derived from the cut (never a generic "A"); logo usage rules; what a professional must rebuild as vector; and the legal checks required before approval (UK IPO/EUIPO/USPTO classes 9/35/42, common-law, domain, social, typeface licensing, trade dress, tenant-conflict).
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — recorded Route B as the carried-forward preferred direction and pointed to the brief.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: preferred wordmark route = **B Perspective Cut** (working preference, not locked). No colours/geometry/artwork/legal locked.
Bugs fixed: none. Tests run: none. App code changed: none. npm/Supabase/SQL/Vercel: not touched.
Not built/verified: no vector artwork exists yet; brand not legally cleared; not implemented in the app; not production.
Next action: hand the brief to a professional designer; run trademark/domain/social clearance and typeface licensing in parallel; then review rebuilt vector before any promotion into docs/18 §A.

## Session: 2026-07-11 — AspectLead brand identity draft + brand board (design only)

Tool used: Claude Code
Human request: Move into proper product branding. Working brand = **AspectLead**, domain direction `aspectlead.app` (not legally cleared). Create a brand identity draft + a static brand board with three wordmark-led logo directions + dual dark/light theme. Design only — do not touch the app.
Key user decisions logged:
- **Rejected the generic standalone "A" logo mark** (previous AI concepts looked too generic).
- Wants a **wordmark-led** identity with a **geographic/map/perspective stroke** (hybrid: aspect/perspective/prism + dark command-centre/signal + map/territory/contour).
- Requires a **dual dark/light theme** system with **Auto / Light / Dark** user control; **default Auto (follows system)**; user override **remembered**; toggle in app shell + Settings; later daylight/time-based switching optional.
Files changed:
- `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md` (new) — brand name/domain, legal-not-cleared status, why wordmark-led, why the "A" icon was rejected, three wordmark routes (A Contour Line, B Perspective Cut [front-runner], C Route Stroke), dark/light theme strategy + behaviour rule, draft AspectLead palette (roles + refinements + accessibility guardrails), typography direction, logo usage rules, UI implications, open decisions, next steps, taglines.
- `docs/design-previews/aspectlead-brand-board.html` (new) — self-contained static board: working Auto/Light/Dark toggle (persisted), full palette swatches + contrast notes, typography specimen, three wordmark routes each with primary light/dark, compact, single-colour, white-on-dark, and a stroke-derived favicon (never an "A"), plus in-product samples (dark command rail, signal tile, territory chip, status badges, export gate, telesales card).
- `docs/18_UI_BRANDING_GUIDELINES.md` — AspectLead recorded as the working product brand (draft); baseline §A remains valid until AspectLead approved; Signal Command remains a candidate; AspectLead draft supersedes random palette exploration for future UI (not implemented).
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — recorded AspectLead as working brand/domain; branding stage added before UI redesign; logo/colour/theme in draft; no app implementation done.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: brand *name* direction AspectLead adopted as working (not legally cleared); no colours/logo/theme locked.
Bugs fixed: none. Tests run: none. App code changed: none.
Not built/verified: no app-shell changes, no npm, no Supabase, no SQL/migrations, no Vercel, no real data. Not production. Not legally cleared.
Next action: review the brand board, pick a wordmark route, run domain/trademark/social clearance, then finalise wordmark+palette and promote into docs/18 §A before implementing the theme system.

## Session: 2026-07-11 — Signal Command reframed as a CANDIDATE direction (design only)

Tool used: Claude Code
Human request: Do not lock branding. Convert Signal Command into a candidate design route, not the official guideline. Keep the preview, but make docs/18 say the official state is the SaaS-neutral baseline and Signal Command is a candidate to evaluate; final colours only after brand name/logo chosen.
Files changed:
- `docs/18_UI_BRANDING_GUIDELINES.md` — restructured: **§A Current official baseline = SaaS-neutral design tokens (implemented)**; **§B Candidate direction = Signal Command (under evaluation, NOT final)**; **§C what must happen before any brand/colour is locked** (choose name+logo first, then final palette). Removed the "v2 final" framing.
- `docs/design-previews/signal-command-preview.html` — kept as a **candidate** preview; banner updated to "candidate direction — not final branding".
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — reframed to: Signal Command design proof created as a candidate direction only; not final branding; not implemented; not production; official baseline = SaaS-neutral tokens; brand not locked (5-route exploration, names unverified).
- `docs/15_AI_WORK_LOG.md` — this entry.
Context: a 5-route brand identity exploration (Signal/Command, Vantage/Intelligence, Atlas/Territory, Beacon/Discovery, Grid/OS) was produced in chat; recommendation was Intelligence-core with Territory-visual, name candidates Meridian/Cardinal/Vantage — all UNVERIFIED pending trademark/domain/social checks.
Decisions made: none locked (brand deliberately not chosen).
Bugs fixed: none. Tests run: none. App code changed: none.
Not built/verified: no app-shell changes, no npm, no Supabase, no SQL/migrations, no Vercel, no real data. Not production.
Next action: choose + clear a brand name/logo direction, THEN select the final palette and promote it into docs/18 §A; implement presentationally afterward, keeping IA and data contracts stable.

## Session: 2026-07-11 — SaaS-neutral UI & branding guidelines (documentation only)

Tool used: Claude Code
Human request: Before the app shell, create SaaS-neutral UI/branding guidelines. Correction: do NOT use "Magna" in product name/branding/colours/domain/UI — Magna is only the first internal tenant. Documentation only.
Files changed:
- `docs/18_UI_BRANDING_GUIDELINES.md` (new/refined) — SaaS design direction with a FIXED token system: product naming ("Lead Intelligence Platform"), product-vs-tenant branding model (`APP_NAME`/`TENANT_NAME`), domain placeholders, exact colour tokens (page `#F6F8FB`, sidebar `#111827`, action blue `#2563EB`, intelligence purple `#7C3AED`, cyan `#0891B2`, status greens/ambers/reds/slate), exact map colours (blue→purple coverage `#DBEAFE`→`#7C3AED`, gaps `#F59E0B`, expansion `#8B5CF6`, roads `#334155`/`#16A34A`, map bg `#F3F4F6`), Inter typography scale, layout (260px sidebar, 24px padding, 12px cards, 8px buttons), fixed sidebar nav, usability rules (what's happening / needs attention / do next), dashboard + table requirements, prototype banner copy, component/badge rules, accessibility, and Claude implementation rules ("use tokens exactly; never hardcode Magna").
- `PROJECT_STATUS.md` — added UI/branding direction section (SaaS-neutral, design only).
- `docs/13_ROADMAP.md` — recorded branding guidelines under Design; white-label/domain as later work.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary: established a SaaS-ready, brand-neutral visual direction; "Magna" removed from product identity (first tenant only).
Decisions made: none new (branding direction; not an ADR).
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: no app shell, no code, no package.json, no Supabase/Vercel. Design direction only.
Next action: keep migrations/tests drafts under review; app shell to apply these tokens later, config-driven tenant identity.

## Session: 2026-07-10 — Data model + RLS design accepted (documentation only)

Tool used: Claude Code
Human request: Record the accepted data-model + permissions + Supabase/RLS design proposal with six corrections. Documentation only — no SQL, no schema, no app code.
Files changed (main repo, docs only):
- `docs/09_DECISIONS.md` — added **ADR-0012** (single-tenant MVP, RLS-first, restricted telesales view).
- `docs/06_SECURITY.md` — added MVP access-control design: roles, permission matrix, RLS strategy, telesales secure-view rule + fallback, hidden fields, audit minimisation, service-role ops, blocked-by-issues.
- `docs/03_DATA_MODEL.md` — added proposed application schema catalogue + storage corrections (geometry as map assets, maintained coverage_summary, hashed suppression/erasure, single-tenant).
- `docs/13_ROADMAP.md` — data-model/RLS design step under Design; multi-org deferred to Phase 2.
- `PROJECT_STATUS.md` — data model & access control section (accepted, not built).
- `docs/15_AI_WORK_LOG.md` — this entry.
Corrections captured: (1) audit before/after JSON redacted/hashed; (2) existing_customers server-side, telesales never; (3) geometry stored as separate map assets, DB holds configs/coverage/codes/memberships; (4) coverage_summary maintained/rebuilt by service-role jobs; (5) suppression/erasure hashed/minimised, erasure hash-only + retained; (6) Developer-UAT = separate UAT project, not a broad prod role.
Decisions made: ADR-0012.
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: no SQL, no migrations, no Supabase, no Vercel, no APIs. Dedup/export tables blocked by ISS-0001/0002/0003.
Next action: resolve ISS-0001 to ISS-0003; first UI/UX screen map; then SQL/RLS only after design sign-off.

## Session: 2026-07-10 — Map POC accepted; recorded in main docs (documentation only)

Tool used: Claude Code
Human request: Record that the real-data map POC is visually accepted and preserved in its own repo. Documentation only — no app code.
Context: A standalone map POC (`~/Projects/magna/lead-intelligence-map-poc/`, GitHub `magna-lead-intelligence-map-poc`) was built and **visually accepted by Zoeb**. It uses self-hosted MapLibre GL JS + current OS Code-Point Open derived postcode boundaries + OS Open Roads. No Google Maps, no Mapbox paid tiles, no paid hosted map service, no billing-enabled service. Proven: real polygons, hover/click, coverage shading, delivery gaps layer, A-road display modes.
Files changed (main repo, docs only):
- `PROJECT_STATUS.md` — added a Map proof-of-concept section (accepted, separate repo, not integrated).
- `docs/09_DECISIONS.md` — added **ADR-0011** (self-hosted MapLibre + OS open data accepted as map architecture direction after POC).
- `docs/13_ROADMAP.md` — MVP now includes the lead-search coverage map with delivery boundary + remaining delivery gaps; Phase 2 shared-engine note references ADR-0011.
- `docs/03_DATA_MODEL.md` — note that the POC validated the joinable-by-postcode approach; adds delivery-membership + configurable feeder-route data needs.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: ADR-0011.
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: the main app is still not built, deployed, or connected to Supabase/Vercel/Magna Sales Pro. Map POC accepted for feasibility; final production boundary accuracy still requires review.
Next action: resolve blockers ISS-0001 to ISS-0003; produce the first UI/UX screen map; keep the map POC frozen until integration is scoped.

## Session: 2026-07-10 — Flexible territory model (documentation only)

Tool used: Claude Code
Human request: Make territory selection fully flexible in the docs. One run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists. Add territory_sets / territory_items concepts and a UI/UX screen-map task. Documentation only — no app code.
Files changed:
- `docs/09_DECISIONS.md` — added ADR-0009: territory is flexible per-run configuration, not a hardcoded value.
- `docs/01_REQUIREMENTS.md` — MVP req 1 and 3 rewritten around a selected territory set; open conflict 1 marked resolved.
- `docs/03_DATA_MODEL.md` — added `territory_sets` and `territory_items` tables; `pipeline_runs` references a territory set; added a territory item-type table.
- `docs/04_WORKFLOWS.md` — run now starts from a selected mixed territory set.
- `docs/11_ISSUES_LOG.md` — ISS-0004 marked Resolved (design conflict only, nothing built).
- `docs/13_ROADMAP.md` — added a Design phase (first UI/UX screen map before scaffolding); territory line updated.
- `DESIGN.md` — added territory note and the first UI/UX screen-map task with the full screen list.
- `PROJECT_STATUS.md` — added territory model section; ISS-0004 removed from active blockers; UX screen-map added to next actions.
- `project_manifest.yml` — current_blocker, current_focus, and next_actions updated.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary of work: Replaced the "one outer vs one inner sector" MVP framing with a flexible per-run territory model, and recorded a UI/UX screen-map task to precede any scaffolding.
Problems found: None new.
Bugs fixed: None — no app code exists.
Decisions made: ADR-0009 (flexible per-run territory selection).
Tests run: None. No build, test, or deployment executed.
App code created: None.
Remaining blockers: ISS-0001, ISS-0002, ISS-0003 (ISS-0004 resolved by ADR-0009).
Next action: Resolve ISS-0001 to ISS-0003, produce the first UI/UX screen map, then run the manual one-business test before any build.

## Session: 2026-07-10 — Documentation-only setup corrections

Tool used: Claude Code
Human request: Correct stale setup facts and add missing protocol files. Documentation only — no app code.
Files changed:
- `PROJECT_STATUS.md` — GitHub repo marked created; remote URL and "pushed on main" recorded; new Build status section; blockers tagged ISS-0001 to ISS-0004; immediate next action rewritten.
- `project_manifest.yml` — `repo.github_url` corrected; `maintenance.last_ai_session` updated to this session.
- `SPEC.md`, `ARCHITECTURE.md`, `DESIGN.md` — added as thin pointer files to the numbered `docs/` pack (no duplicated content).
- `.claude/commands/wrap-up.md` — added end-of-session update command.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary of work: Fixed the stale "repo not created" claim across status and manifest, satisfied the file protocol with pointer files rather than duplicate docs, and added a wrap-up command.
Problems found: `docs/.DS_Store` was untracked junk on disk (not committed, already gitignored) — deleted from disk. README.md had no stale repo claim to fix.
Bugs fixed: None — no app code exists.
Decisions made: None new.
Tests run: None. No build, test, or deployment executed.
App code created: None.
Remaining blockers: ISS-0001, ISS-0002, ISS-0003, ISS-0004 (see `docs/11_ISSUES_LOG.md`).
Next action: Resolve blockers ISS-0001 to ISS-0004, then run the manual one-business end-to-end test before any build.

## Session: 2026-07-09 00:00

Tool used: ChatGPT  
Human request: Improve Project Operating System v1 into v2 and prepare a blank starter plus Magna Lead Intelligence starter.  
Files changed: Generated full starter pack and project-specific docs.  
Summary of work: Converted uploaded volumes, deck, and schema workbook into project-ready Markdown documentation pack.  
Problems found: MVP scope conflict, dedup threshold conflict, missing postcode file, missing delivery postcode list, CTO validation outstanding, retention track required.  
Bugs fixed: None, no app code exists.  
Decisions made: Docs-first, platform-first, deterministic pipeline, manual CRM upload, separate UAT/prod, address-based matching.  
Tests run: ZIP creation and file-count verification.  
Remaining issues: See `docs/11_ISSUES_LOG.md`.  
Next action: Set up local folder and GitHub repo, then resolve blockers before build.

## Session: 2026-07-16/17 — Multi-source discovery foundation (Parts 1, 6-9)

Tool used: Claude Code
Human request: Complete the discovery foundation — push geography work; finish national
geography; complete Just Eat; implement Uber Eats + Deliveroo; consolidate; comparison report.
Do not fabricate, bypass anti-bot/ToS, or silently purchase.
Done this session:
- Part 1: pushed @geospatial/map v0.2.0 (already on origin) + AspectLead d11d6c8; de-duplicated
  generic geography (aspectlead-territory → package classifier; legacy postcode-hierarchy/
  postcode-index marked SUPERSEDED). Pushed (374801f).
- Lawful acquisition AUDIT (web-researched): Uber Eats + Deliveroo have NO lawful open discovery
  API — official APIs are partner/own-store only; consumer sites anti-bot+ToS. Provider options
  + costs documented (docs/61); nothing purchased.
- Uber Eats + Deliveroo adapters (generic PlatformAdapter contract) — fixture/provider-driven,
  liveExecution:false, validation fails without a provider (no fake live). Sanitised fixtures +
  parsers → source-neutral SourceOutlet.
- Consolidation (Part 8): evidence-based cross-source matching (phone/URL/postcode+name/coords),
  never name-alone; confirmed/probable/ambiguous/separate_branch/source_conflict; retains all
  observations. Comparison + completeness report (Part 9): coverage, overlap, unique-per-source,
  honest per-candidate completeness (phone/menu = enrichment_required).
- Tests: test:multi-source green; all retained + JE + geography tests + build green.
NOT done (blocked/scope, see final report): live Uber/Deliveroo (needs authorised provider —
approval + cost); national data ingestion (OS Open Names + ONSPD, ISS-0017); stable UUID entity
identity (Part 3); Run Builder full selection-type UI + live Vercel browser QA (deployment
blocker); Just Eat 96-field parser extension + fresh live run + historical-duplicate marking
(Part 5); DB persistence of consolidation + multi-source worker (Part 10); Vercel deploy (Part 13).
Next action: get approval on a Uber/Deliveroo provider (cost) OR proceed to validation/dedup;
acquire OS Open Names + ONSPD; persist consolidation; extend JE parser.

## Session — Uber Eats parser calibration (real Apify output)

- Executed the approved 10-result UB1 Uber pilot (`sourabhbgp/ubereats-scraper`, ~$0.02, under
  the $0.25 cap; APIFY_TOKEN server-side only, never printed/committed). Two findings: (A) parser
  read wrong field paths; (B) `discover` returned US (San Francisco) stores for "UB1", not UK.
- Recalibrated parser → `uber-eats-parse-1.1.0`: real actor shape (`address.*`, `cuisineList`,
  numeric `rating`/`ratingCount`, `phoneNumber`, `{ url }` images, `supportedDiningModes`),
  backward-compatible with the old fixture, UK-only postcode/phone gating, HTML-entity decoding,
  controlled `source_extra` retention (no fabrication). Coverage calc made `source_extra`-aware
  (menu/hours/promotion/media/delivery_fee/eta). Pilot now prints a geography audit + warning.
- Added `test:uber-parse` (40 assertions, sanitised real-shape fixture: US-fallback + UK-rich).
  `test:multi-source` unchanged/green; typecheck + build green. Live rerun confirmed calibration.
- Docs: added docs/64 (calibration + geography finding); logged BUG (fixed), ISS-0018 (open —
  discover geography), ADR (UK-gating + no-migration `source_extra`).
- Not changing actor; not upgrading plan; not scaling; no customer comparison (per instruction).

## Session — Contain provider geography mismatch (ISS-0018)
- Audited both Uber pilot runs (DB authoritative): each returned 10 distinct US records → **10
  distinct candidates (1:1, NOT candidates=1)**; consolidation did not over-merge. The "candidates=1"
  premise did not match the recorded result — surfaced honestly with a per-UUID table.
- Root cause found: the actor's required `urls` field was omitted → actor used its US near-me default
  and ignored the GB address (confirmed vs the published input schema; no lat/lng fields exist).
- Built a provider-neutral geography-validation gate (`provider-geography-gate.ts`): classifies each
  observation valid/out_of_scope/unverifiable; only valid records reach consolidation/coverage/exports;
  run-level `provider_succeeded_validation_failed` HALTS before further paid sources (docs/65).
- Migrations 0018 (append-only `provider_geography_validations`) + 0019 (`consolidated_candidates.
  geography_status`); advisor-clean (fixed function search_path). Backfilled/quarantined the 2×10
  historical US candidates via geography_status + validations + candidate_merge_decisions; raw
  observations untouched (append-only). 1,623 JE candidates unaffected.
- Prepared (NOT run) the supported-input diagnostic: fetcher/pilot now send `urls` + full UB1 address;
  `npm run uber:diagnostic-plan` verifies the exact request dry (9/9), ~$0.02 < $0.25 cap.
- Tests: `test:geography-gate` (10 required proofs) + `test:uber-parse` + `test:multi-source` green;
  typecheck + build + `git diff --check` clean.

## Session — Apify execution provenance + one final approved diagnostic (ISS-0018)
- Replaced run-sync with the async run API: `apify-run.ts` (client, token in Authorization header
  only), `apify-orchestrator.ts` (idempotent create-once → persist run id immediately → poll →
  retrieve from the exact dataset id; resume in-flight runs; ResumableTimeoutError; actor failure ⇒
  no ingest + halt), `provider-execution-store.ts`, migration 0020 `provider_executions` (advisor-clean).
- Pilot rewired to capture full provenance; business-validation status kept separate from actor status.
- Tests: `test:apify-provenance` (10 required proofs) + geography-gate + uber-parse + multi-source +
  typecheck + build + diff-check all green. Diagnostic-plan dry 9/9.

## Session — Reject Uber discovery actor; add borderline PPR replacement (pre-run)
- Classified `sourabhbgp/ubereats-scraper` discovery=REJECTED / enrichment=provisional in a new
  provider capability registry (`provider-registry.ts`); rejected/unvalidated actors are never
  auto-selected (`selectDiscoveryProviders`). Adapter + observations retained. Docs/67.
- Added `uber_eats_borderline_ppr` (borderline/uber-eats-scraper-ppr, PPR $5/1k): tolerant initial
  parser (`parse-borderline.ts`, calibrated post-run), exact input builder with hard maxRows cap +
  rental guard, location-fidelity classifier (`location-fidelity.ts`: target_district/near_target/
  unrelated/unverifiable — evaluation only, does NOT relax the gate), pilot `uber:pilot:borderline`
  and offline `uber:borderline:replay`, sanitised fixture. Reuses the provenance/orchestrator/gate seam.
- Tests: `test:borderline-provider` (12 required proofs) + apify-provenance + geography-gate +
  uber-parse + multi-source + typecheck + build + diff-check all green. Offline replay verified.

## Session (cont.) — borderline diagnostic executed + parser calibrated
- One paid run jg2xJwXcMgvmggYnT ($0.05, cap $0.25): GB 10/10, coords 10/10, 2 in UB1 (→2 candidates),
  8 near_target (~2.8-3.5km), 0 unrelated → binds to the Southall delivery area. business geography_validated.
- Calibrated parser → uber-eats-borderline-parse-0.2.0 (rating, reviewCount string→num, cuisines,
  dining-mode OBJECT array → delivery/collection, UK phone E.164, eta from text; delivery_cost null
  as fareBadge is promo text). Verified by OFFLINE replay of the saved payload — no second paid call.
  Registry: discovery=supported, verifiedCountries=[GB], precision=district, still operationalStatus=candidate.
- Persistence: 1 provider run, 10 raw/10 canonical/0 dup/0 dangling, 10 validations (2 valid/8 out/0 unv),
  2 valid candidates, 1 snapshot. Docs/68. All suites + typecheck + build + diff-check green.

## Session — GitHub Packages + Vercel deployment repair (ISS-0019, docs/09 ADR)
- Continued a working tree that already swapped `@geospatial/map` (private git+ssh,
  `github:zoi555/geospatial-platform#v0.3.0`) for `@zoi555/geospatial-map@0.3.0` (GitHub Packages)
  across `package.json`, `next.config.mjs`, and all app imports, plus a token-free `.npmrc`.
  Completed the remaining work: regenerated `package-lock.json` (resolves from
  `npm.pkg.github.com` with an integrity hash); found and fixed 4 leftover
  `@geospatial/map` imports the earlier pass missed (`scripts/seed-postcode-reference.ts`,
  `scripts/test-geo-foundation.ts`, `scripts/test-geography-standard.ts`,
  `scripts/test-je-stage1.ts`); confirmed no remaining `ssh://git@github.com`,
  `github:zoi555/geospatial-platform`, or `@geospatial/map` references outside historical docs.
- Clean `npm ci` (after `rm -rf node_modules`) succeeded locally, authenticated via `NPM_TOKEN`.
  Typecheck, `next build`, `test:geography-gate`, `test:uber-parse`, `test:multi-source`, and
  `git diff --check` all green. Diff reviewed — every change is a mechanical import/comment rename
  plus the lockfile regeneration; no logic changes.
- Committed (`597044a`, `fix(build): consume geospatial package from GitHub Packages`) and pushed to
  `feature/mvp-vertical-slice-001`.
- **Deployment:** the correct project `magna-lead-intelligence-system`
  (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`) built and reached **READY**
  (`dpl_85AwBaHZvzsXZoF14S67EibBPEJ7`,
  `https://magna-lead-intelligence-system-qyaz78cuh-zoeb-s-projects.vercel.app`) — build logs show
  a default (non-custom) `npm ci` resolving `@zoi555/geospatial-map` cleanly, no auth errors, and
  the same route list/warnings as the local build. A separate, stale duplicate project
  (`magna-lead-intelligence-system-pngu`) still runs a legacy SSH-rewrite Install Command with no
  `NPM_TOKEN` and fails — logged as **ISS-0019**, not a defect in this app.
- **Not verified this session:** direct browser testing of the live preview (home page, Run
  Builder, map, APIs, assets, console errors). The preview sits behind Vercel's deployment-
  protection SSO wall (blocks plain `curl`), and the Claude Chrome browser extension was not
  connected. Vercel's own runtime-error/log tools show zero errors but also zero traffic (nothing
  has hit the deployment yet). See ISS-0019 for what would close this out.
- No paid Uber actor run, no Deliveroo, no customer comparison — none attempted, per instruction.
