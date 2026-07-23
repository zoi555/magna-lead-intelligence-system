# AI Work Log — Magna Lead Intelligence System

## Session: 2026-07-23 (overnight) — lead-production bridge: Companies House through final UB1 scoring

Tool used: Claude Code, autonomous overnight execution mode (explicit user directive, bounded
request caps, listed stop conditions).
Human request: complete the Companies House stage of the offline `scripts/lead-production/`
bridge (legal-entity matching, filed accounts/financials, directors/PSC, related-company/group
analysis, customer-match resolution, decision-maker candidates), then continue autonomously
through website enrichment, decision-maker public-profile resolution, final group rescreen, and
final hard-gate qualification/scoring — producing the complete UB1 master evidence register and
Level 0-4 outputs, reconciled to the original 94 Phase-1 candidates.

**Built and live-executed, in order** (each stage: audited existing code first, reused where
solid, typecheck + new fixture tests + `test:lead-production-bridge` + build all green before
commit, dry-run before live where a live external call was involved):
- **Companies House stage** (`companies-house-adapter.ts`, `-match.ts`, `-population.ts`,
  `officers-and-psc.ts`, `financial-extraction-after-companies-house.ts` (reuses the existing
  `accounts-document-parser.ts`/`financial-analysis.ts` unchanged), `group-analysis-after-
  companies-house.ts`, `customer-resolution-after-companies-house.ts`,
  `decision-maker-candidates.ts`, `run-companies-house-stage.ts`). Eligible population (71 of 83)
  derived by real candidate-ID set operations, exclusion overlaps unioned not summed. Live run:
  185/600 combined + 12/250 document requests.
- **Website enrichment stage** — new (nothing existed before): bounded crawl (5 pages/domain, 3
  concurrent, real `robots.txt` fetched and honoured, 20s timeout + 1 retry, no login/CAPTCHA
  code anywhere), field extraction never guesses email/phone/halal-status, Magna product-fit
  indicators. Live: 36 domains, 30 crawled successfully, 1 correctly blocked by its own
  `robots.txt`.
- **Decision-maker public-profile stage** — ran on official-website evidence only (no lawful
  external search connector was budgeted this run — the spec's own explicit safe-fallback path,
  not a shortcut); 23 candidates checked, 0 matched.
- **Final group rescreen** — consolidates Google/Companies-House/website group signals into one
  classification; registry `default_outcome` remains the sole operational decision.
- **Final qualification/scoring stage** — the first and only point in this whole bridge where a
  numeric score or Level 0-4 is assigned (every earlier stage structurally tested to never do
  this). 14 hard-gate concepts, 9-component/100-point score, telesales (phone-gated)/field-sales
  (premises+postcode+coordinates-gated) channel suitability, Level 0-4 assignment. Traces every
  ORIGINAL Phase-1 candidate (not just the CH-eligible subset) through every checkpoint's
  exclusion evidence and refuses to write output if the final count doesn't reconcile to 94.

**Three real defects found in live data and fixed** (each: root-caused, fixed, regression test
added, and — where no new API calls were needed to correct already-fetched data — reprocessed
with a dedicated zero-new-calls script rather than re-spending budget):
1. A strong legal-name match whose registered office sat in a different postal district (a
   real, common pattern — registered office = accountant's/formation agent's address) was
   mislabelled `company_name_conflict`; fixed to `registered_address_conflict` (the name
   matched fine — the address is what conflicts). 30 of 71 live candidates relabelled, zero new
   Companies House calls.
2. The final-scoring stage let a NON-decisive Companies House match's status (an unrelated,
   unconfirmed company that happened to be dissolved) leak in as if it were the candidate's own
   trading status, wrongly hard-gating 10 candidates to Level 4. Fixed with
   `trustworthyCompaniesHouseStatus()` — only exact/strong-probable matches and the two conflict
   outcomes that specifically fire at the candidate's own postcode are ever trusted.
3. (Earlier the same night, Google-stage carryover) Two defects in the prior Google Places live
   run were found and fixed before Companies House began — see `docs/10_BUGS_AND_FIXES.md`.

**Result:** UB1's full 94-candidate population reconciled through Level 0-4: 14 sales-ready
(Level 0), 7 soft-gap (Level 1), 0 promising-incomplete (Level 2), 35 held for controlled review
(Level 3 — mostly unresolved genuine customer-name-overlap conflicts, deliberately never forced
to a score-based level), 15 hard-rejected (Level 4), plus 10 active-customer/3 inactive-customer/
5 excluded-group/2 permanently-closed/3 temporarily-closed (held, not discarded) accounted for
separately. Full detail, live request counts, top/bottom scored leads, and the exact next-owner
decisions: `/Users/homemac/Data/aspectlead-lead-production/OVERNIGHT_PROGRESS_2026-07-23.md`
(outside the repo — contains real UB1 business names).

**Not done tonight** (explicit, reasoned scope stop, not an oversight): Phase H (the reusable
multi-territory orchestrator) was not built — the user's own instructions gate the 22-territory
rollout (Phase J) behind Phase H's tests passing, so Phase J was correctly never attempted.
Every stage built tonight is already territory-agnostic (checkpoint-path + `--territory` args,
no hardcoded UB1 ID) — only the top-level chaining/resumption script remains.

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

## Session: 2026-07-18 (overnight, autonomous) — Vercel dual-project topology record + Uber actor market research

Tool used: Claude Code (autonomous overnight run, no owner available to answer questions).
Human request: (1) record both Vercel projects as intentional infrastructure with a canonical
topology doc, correcting ISS-0019's "stale duplicate" framing; (2) research the current Apify
marketplace for Uber Eats discovery actors, classify each, design a bounded (<$1) UB1 benchmark
against a 7-restaurant reference set, and propose (not run) a paid three-way comparison; (3) make
safe provider-registry corrections + dry-run fixtures/tests only; (4) verify + commit + push.
Absolute restrictions observed throughout: no paid actor execution, no actor API calls, no spend,
no Vercel/Supabase setting changes, no branch/merge/reset/clean, no deletions, no Deliveroo, no
customer comparison.

- **Vercel topology** — independently re-verified both projects via the Vercel API (not just
  transcribed): `magna-lead-intelligence-system-pngu` (`prj_vxcbOvftT2CdzUmnxyCWhjF9f3U2`,
  `dpl_DvJ49zyyhVdV5ND8Rzhv8USNcCSZ`, READY, Production) and `magna-lead-intelligence-system`
  (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`, `dpl_7ZSr1BuoTYgef9njpnaTfAGsqPn8`, READY, Preview), both on
  commit `2d6f4fb1...`. Canonical record in `docs/08_DEPLOYMENT.md`; new ADR in
  `docs/09_DECISIONS.md`; ISS-0019 and `docs/10_BUGS_AND_FIXES.md` corrected (no longer "stale
  duplicate that fails"); `PROJECT_STATUS.md`, `README.md`, `VERIFY_BEFORE_CLAIMING.md` updated.
  Future clean-up (retain one project, migrate aliases/env vars, rename to `aspectlead-web`)
  proposed only, gated on a domains/env-vars/Git-integration/history/rollback audit. Committed
  `bb2e268`.
- **Uber actor market research** — live Apify Store fetches (WebSearch + WebFetch, not memory) of
  8 current actors, cross-checked against the two already diagnosed with real paid runs in this
  project (`sourabhbgp` rejected, `borderline/uber-eats-scraper-ppr` precision-confirmed/recall-
  inadequate). New primary-discovery candidates identified: `memo23/uber-eats-scraper` (cheapest,
  best usage/rating evidence) and `piotrv1001/uber-eats-menu-scraper` (sitemap-shard enumeration —
  targets the recall gap directly). Full shortlist, classification, and a bounded three-way UB1
  benchmark proposal (~$0.42 expected / ~$0.60 hard-capped, under the $1 ceiling) in
  `docs/69_UBER_ACTOR_MARKET_RESEARCH_AND_BENCHMARK.md`. **Not executed** — proposal only.
- **Provider-registry correction** — `verifiedGeographyPrecision: "district"` for the borderline
  actor was true but was read as if it meant complete district coverage; the broad-query diagnostic
  (docs/68) actually found only 2/7 known UB1 restaurants across both runs. Added a separate
  `verifiedRecall`/`recallEvidence` field so precision and recall/completeness can never be
  conflated again; corrected `docs/67`, `docs/68`'s `excludeStores` wording (accepted field, but
  pagination behaviour unverified — do not claim it), and `docs/10_BUGS_AND_FIXES.md`. 3 new
  assertions in `test:borderline-provider` lock the distinction in. Committed `8575514`.
- **Dry-run benchmark module** (no network/DB/Apify) — `benchmark-scoring.ts` (provider-neutral,
  reuses the existing geography gate + location-fidelity modules unmodified) and
  `ub1-reference-set.ts` (7 required restaurants, honestly marked `active_presumed` only where a
  real paid run confirmed them, `unconfirmed` elsewhere — no fabricated "active" status from an
  indexed/historic page). Tested against a clearly-labelled synthetic fixture
  (`npm run test:ub1-benchmark`). Committed `7389898`.
- Added `NPM_TOKEN` to `.env.example` (previously undocumented despite being required for the
  GitHub Packages install since the prior session's ADR).
- **Verified:** `npm run typecheck`, `npm run build`, and all retained test suites (`test:ub1-
  benchmark`, `test:borderline-provider`, `test:geography-gate`, `test:uber-parse`,
  `test:multi-source`, `test:apify-provenance`, `test:geo`, `test:run-draft`, `test:custom-config`,
  `test:scoring`, `test:telesales-safe`, `test:geography-standard`) all green; `git diff --check`
  clean.
- **Not done (per instruction):** no paid Apify actor run, no actor-API call, no spend, no Vercel/
  Supabase setting changes, no Deliveroo work, no customer comparison, no custom scraping actor
  built. Browser verification of either Vercel deployment remains outstanding (ISS-0019) — no
  Chrome extension connection this session either.

### Canonical contract completion + Just Eat proof + Uber readiness + Deliveroo evaluation + Discovery Results screens — 2026-07-21

- **Canonical contract:** extended `SourceOutlet` (not a new schema — see 09_DECISIONS ADR) with 19
  fields to reach full `MarketplaceRestaurant` parity, populated honestly (never fabricated) in all
  three parsers (`just-eat`, `uber-eats`, `deliveroo`). Typecheck + all 14 relevant test suites green
  before and after.
- **Just Eat proof:** live UB1 run executed (`npm run je:run -- "UB1"`, 149s, 717 outlets, 0 failed
  queries, 0 duplicates). New runtime field-completeness report (`npm run je:field-report`, docs in
  `scripts/je-field-completeness-report.ts`) against 121 real outlets physically in UB1 (outcode
  exact-match; the 717 figure includes delivers-to-UB1 outlets outside the district):
  ID/URL/name/address/postcode/coords/cuisines/review-count/opening-status/delivery-fee/min-order/
  ETA/collection/logo = **100%**; rating **86.8%**; phone/opening-hours/offers/hygiene-rating =
  **0%** (all confirmed-honest — Just Eat's listing endpoint does not supply them; phone/address
  detail enrichment was NOT re-attempted — already proven blocked, Cloudflare 403 + no detail
  endpoint, ISS-0016/docs/59; re-attempting would be retrying a known-blocked, anti-bot-protected
  endpoint).
- **New visible screens** (both DB-backed, browser-verified, no placeholder data): `/discovery-results`
  (real Just Eat records list — 121 UB1 restaurants confirmed rendering, e.g. "Ali Baba's", real
  Southall addresses) and `/discovery-results/[id]` (single-restaurant detail — full canonical
  record, field provenance, append-only rating history; verified against a real record showing 7
  historical rating observations and 20 provenance rows).
- **Uber Eats:** production adapter now accepts authorised API records / licensed provider JSON /
  controlled CSV import (`uber-eats/import.ts`, `templates/uber-eats-import-template.csv`, 19
  passing assertions in `test:uber-import`) — no live scraping. Registry status set to
  `pending_authorised_source`; Settings screen now shows adapter-implemented / source-authorised /
  credentials-available / latest-import / latest-failure / records-available distinctly (0 records
  operational — prior diagnostic runs proved recall-incomplete, not accepted as a production source).
- **Deliveroo:** evaluated `thirdwatch/deliveroo-scraper` (real, maintained actor) via the public
  Apify API — read-only, $0 spent — and rejected it before any paid run: UK domain requires
  city/neighbourhood slugs (not the exact UB1 address/postcode), and it escalates to a residential
  proxy when blocked (excluded proxy-rotation-to-defeat-blocking). Verdict:
  `DELIVEROO_BLOCKED_PENDING_AUTHORISATION`. Full reasoning in docs/09_DECISIONS.md, ISS-0021.
- **Screen completion matrix:** 7 complete / 3 partial / 4 missing (run detail, data-quality
  exceptions, import screen, audit/evidence view) — logged as ISS-0020.
- **Verified:** `npm run typecheck`, `npm run build`, and 14 test suites all green after every
  change; two live browser fetches (`curl` against the local dev server) confirmed real DB data
  rendering on both new screens.
- **Not done:** the 4 missing screens (logged, not built this session — scope decision, see
  ISS-0020); no Supabase migration applied (canonical contract extension is TypeScript-level only,
  per "no Supabase changes until local implementation and tests pass" — schema/DB columns for the
  new fields are the next deployment step, not yet written); no Vercel/production changes.

### Migration + Just Eat phone enrichment + Deliveroo bounded test + 3 new screens — 2026-07-21 (same-day follow-up)

- **Pushed** `e329a79` to `origin/feature/mvp-vertical-slice-001` (source backup only, no merge/deploy).
- **Migration 0022** written (14 new nullable `je_outlets` columns + 2 new `je_field_provenance`
  columns, 2 indexes, additive-only, rollback documented) and verified by applying the full 0001–0022
  migration history against a disposable local Postgres cluster (`npm run test:migration`, 10
  assertions: backward-compat insert, full-canonical insert, null-not-fabricated defaults, index
  presence, rating-history multi-timestamp retention, enrichment-provenance columns). **Not applied
  to production Supabase.** Schema mapping: `docs/71_MARKETPLACE_SCHEMA_MAPPING.md`.
- **Just Eat phone enrichment:** inspected existing evidence first (field catalogue, docs/59) —
  confirmed nothing was overlooked, the field genuinely doesn't exist in the lawful listing response.
  Reused the existing, already-live `GooglePlacesRunner` (no new acquisition logic) to enrich a
  bounded 30-outlet batch: 28/30 found and written (real paid Google Places calls), 1 duplicate-phone
  conflict flagged. Full real-sample (107 outlets, corrected exact-outcode match) acceptance test:
  phone 26.2% (was 0%), full-address/postcode 100%, rating 85.0%, review-count 100%. Fixed a real bug
  in the field-completeness report along the way (`LIKE 'UB1%'` wrongly included UB10/UB11). Full
  detail: `docs/73_JUST_EAT_PHONE_ENRICHMENT.md`, ISS-0022 (remaining 77 outlets not yet enriched —
  deliberate scope bound).
- **Deliveroo:** one bounded public-flow test performed (docs/72) — assumed search URL returned
  Deliveroo's own honest 404, not a bot challenge; correct URL still unconfirmed, not re-attempted
  (one-test limit). Completed the provider-neutral adapter (`importJson`/`importCsv` for both Uber
  and Deliveroo, `test:uber-import` + `test:deliveroo-import`, 39 assertions) — found and fixed a real
  fabrication bug in the Deliveroo parser (`num()` converting null/blank to `0`). New honest
  `MarketplaceSourceStatus` vocabulary added to the source registry (`ACTIVE` for Just Eat,
  `PROVIDER_UNAVAILABLE` for Uber and Deliveroo).
- **3 of 4 missing screens built** (real DB-backed, loading/error/empty states,
  `test:new-screens` — 15 live-integration assertions, browser-verified against real data):
  `/discovery-runs` + `/discovery-runs/[id]` (run detail), `/data-quality-exceptions`,
  `/audit` + `/audit/[id]`. Import screen deliberately not built — not required for the core scan
  workflow; backend ready, exact route/blocker documented in ISS-0020.
- **Verified:** `npm run typecheck`, `npm run build`, and 17 test suites (all pre-existing suites
  plus every new one) green, no silent skips. Live dev-server fetches confirmed real data on all
  screens (e.g. 717 raw observations on the real run-detail page, 68 real geography mismatches on
  the exceptions page, a real content hash + provenance on the audit page).
- **Not done:** migration not applied to production; import screen UI not built (documented); Vercel
  untouched; no merge to main.

### Production migration + smoke test + JE phone completion + real Deliveroo discovery + import screen — 2026-07-21 (second same-day follow-up)

- **Verified before touching anything:** independently confirmed (not just trusted) both the
  Supabase project ref (`rubhjkgygauuixiqouza` — matches `.env.local`, project `aspectlead-platform`)
  and the Vercel auto-deploy claim (queried the Vercel API directly: both projects' latest
  deployments carry `githubCommitSha: 72990dc...`, both READY).
- **Production migration 0022 applied.** Could not trigger an on-demand backup (no such tool in the
  available Supabase MCP toolset) — confirmed a real recoverable backup mechanism instead by
  querying `pg_stat_archiver` directly (continuous WAL archiving active, last archived ~1 hour
  before the session). Full post-migration verification: migration recorded, all 16 new
  columns/2 indexes present, RLS unchanged, row counts identical before/after
  (1005/20128/5189/5109/10 across the 5 affected tables), a transactional insert+rollback proved a
  full canonical row + a second rating-history observation both work, `get_advisors` showed no new
  issues. Full detail in `docs/09_DECISIONS.md`.
- **Production smoke test:** the Preview deployment remains behind Vercel's SSO wall (not directly
  testable without a browser session — none connected). The Production deployment
  (`magna-lead-intelligence-system-pngu.vercel.app`) has no protection — smoke-tested all 9
  requested routes directly (`/data-quality` genuinely 404s — the real route is
  `/data-quality-exceptions`, flagged as a route-name mismatch in the instruction, not a bug).
  9/9 reachable routes returned 200 with real data and no server/column errors (717 raw
  observations, 2379 real exceptions, real content hashes, `ACTIVE`/`PROVIDER_UNAVAILABLE` status
  badges — all confirmed live on production, not just locally). Mobile-width visual rendering not
  independently verified (no connected browser this session either) — the new screens reuse the
  same responsive Tailwind patterns as the rest of the verified app.
- **Just Eat phone: 26.2% → 93.5%** (100/107 UB1 outlets). Added a real match-validation gate
  first (extended `GooglePlacesResult` with `matchedName`, since the runner requested but never
  surfaced it) after catching a self-referential no-op in an early draft of the validation logic.
  Ran the remaining 79 eligible outlets (£2.02–£2.53 estimated, well under the £10 cap): 72 found
  + written, 3 not found, 4 correctly rejected as ambiguous. Resolved the pre-existing
  duplicate-phone conflict with evidence (identical address+coordinates — shared premises, not an
  error). ISS-0022, docs/73 updated.
- **Deliveroo: real discovery flow found and validated.** The prior `PROVIDER_UNAVAILABLE` verdict
  (drawn from one guessed URL's 404) was corrected: a genuine Playwright/Chromium session (no
  evasion) used Deliveroo's own visible postcode-search UI, found 150 real restaurant records (10
  local to UB1, 100% ID/URL/name/rating/review-count/image coverage, phone confirmed absent, full
  address from one detail-page inspection). Caught and fixed my own false-positive "challenge
  detected" bug along the way (verified via screenshot before trusting a keyword match). New
  calibrated parser `deliveroo-real-parse-0.1.0` (16 assertions) built from the real captured data.
  `marketplaceStatus` corrected to `PENDING_AUTHORISATION` — a real path exists, productionising it
  as a scheduled adapter is a separate, larger decision not made this session. docs/74.
- **Import screen built:** `/import` + `/api/discovery/import` — source selection, CSV/JSON
  upload, downloadable templates, dry-run validation, field-mapping preview, invalid-row display,
  duplicate detection, geography validation (reuses the existing provider-geography-gate), confirm
  step with a real content-hash evidence reference (honestly reports `persisted: false` — neither
  source has a live outlets table yet). Does not mark a source `ACTIVE` from import support alone.
  `test:import-route` (10 live assertions).
- **Verified:** `npm run typecheck`, `npm run build`, and 19 test suites (18 static + the
  server-dependent `test:import-route`) all green, no skips.
- **Not done:** Preview deployment not directly smoke-tested (SSO wall, no browser session);
  mobile-width rendering not visually verified (no browser session); Deliveroo production
  automation not authorised or built (deliberately, per instruction); no merge to main.

### Internal-beta correction: real persistence, real Deliveroo pilot, honest interface — 2026-07-21 (third same-day follow-up)

- **Live-data audit** (`docs/75`): every named route classified from its actual loader code, not
  HTTP status. `/` = `DEMO_DATA` (100% `mock-data.ts`); 8 routes = `LIVE_REAL_DATA`; `/settings` =
  `LIVE_PARTIAL_DATA` (real env checks, hand-maintained registry); `/import` (before this session's
  fix) = `EMPTY_BUT_OPERATIONAL`.
- **Interface corrected:** replaced the global "Prototype using mock data... No integrations
  connected" banner (shown on every route, false for 8/10) with `StatusBanner` reading the same
  `SOURCE_REGISTRY` `/settings` uses. Dashboard now carries its own explicit DEMO DATA warning.
- **Import persistence — real, not claimed.** Two new tables (`import_batches`,
  `provider_raw_observations`) plus one additive evidence-traceability column on two existing
  consolidation tables — everything else reuses migration 0015's existing multi-source
  architecture, per instruction (no duplicate schema). Transaction safety via
  `commit_import_batch()` — one Postgres function call is one transaction; proved with a real
  mid-batch-failure test (record 1, inserted before record 2's deliberate failure, is confirmed
  NOT left behind). **Production correction mid-session:** migration 0023's first real persistence
  attempt failed (`digest()` unresolvable — Supabase installs `pgcrypto` in an `extensions` schema,
  not `public`) — the transaction safety caught it correctly (nothing persisted); fixed forward
  with migration 0024, and fixed the **local** test harness (previously didn't mirror this Supabase
  convention, which is why the bug wasn't caught first). Verified end-to-end against production:
  a real record posted through `/import` is genuinely visible on `/discovery-results` and its
  detail page — not just claimed by the API. `/discovery-results` extended to merge
  `consolidated_candidates` (imports) alongside `je_outlets` (a follow-up bug — no `ORDER BY` +
  `limit(200)` meant a fresh import could be pushed past the page by 1000+ historical rows — was
  found and fixed the same way, verified against production).
- **Deliveroo real provider + pilot:** `DeliverooAdapter.importRealDiscovery`/`.importRealDetail`
  wired onto the calibrated real parser. Ran the bounded UB1 pilot twice: first attempt's detail
  step used `networkidle` (never fires on Deliveroo — fixed to `domcontentloaded`, not a block);
  second attempt captured 150/150 real discovery records with no challenge, but 3-way concurrent
  detail-page requests triggered a genuine Cloudflare challenge on the first batch — correctly
  stopped, not bypassed, not retried. Net result: 150 raw records, **0 canonical records persisted
  this run** (postcode confirmation blocked by the challenge — reported honestly, not disguised).
  Full detail: `docs/76`.
- **Just Eat's 7 unresolved outlets** now have a full audit trail (`je_field_provenance`,
  `field_key='telephone_enrichment_exception'`) — reason, candidate considered, timestamp — surfaced
  on `/data-quality-exceptions`. Matching standards were not lowered; this only makes existing
  rejections visible.
- **Backup wording corrected** per instruction: recorded as "WAL archiving verified; restore
  capability not independently proven" — retention window, PITR availability, restore permissions,
  and last-successful-backup are NOT independently verifiable via the available Supabase MCP
  toolset (no `list_backups`/`get_backup_status` tool exists) and are reported as such, not guessed.
- **Verified:** `npm run typecheck`, `npm run build`, 21 test suites (20 static + the
  server-dependent `test:import-route`, which proves real persistence end-to-end against a live
  server) all green.
- **Not done:** sequential (non-concurrent) Deliveroo detail enrichment not attempted (would be a
  retry against the same site after a challenge — explicitly excluded); Deliveroo production
  automation not authorised; mobile-width visual verification and Preview-deployment smoke test
  still blocked by no connected browser session (unchanged limitation, ISS-0019).

## Session: 2026-07-23 — UB1 release audit + reusable full-territory orchestrator

Tool used: Claude Code, continuation of the same day's overnight session (`73d94ab`).
Human request, two parts: (1) a release-quality audit of the completed UB1 pipeline before any
real business is contacted — full reconciliation proof, per-candidate Level 0/Level 1 audit
against explicit removal/promotion criteria, a release pack in a new immutable directory, no
contact/external send; (2) a reusable `run-full-territory.ts` orchestrator that runs the same
8-stage pipeline for any territory (never hardcoding UB1), with resume/checkpoint-override/
request-plan-only/stage-range support, validated by replaying UB1's own existing checkpoints
(no live calls) and two synthetic-territory smoke tests. Hard constraints: do not restart any
completed enrichment stage; do not make new live API calls; treat all accepted checkpoints as
immutable; do not start live RM1/KT1/TW discovery.

**Part 1 — UB1 release audit** (all outputs written outside this repo, under
`/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T10-30-57Z-release-audit/`,
per instruction):
- Reconciled all 94 original Phase 1 candidates into the 9 expected buckets with zero
  duplicates and zero cross-bucket contamination (`UB1_RELEASE_VALIDATION.json`).
- Audited all 14 Level 0 candidates against every stated removal criterion — 14/14 released, 0
  downgraded. Found and corrected (at the audit-output layer only, no checkpoint touched) a
  real data-quality issue: 2 candidates' website-extracted phone was an un-decoded `tel:` href
  artifact; both already had a clean, independently-verified Google Places phone, used instead
  in the release-facing files with the correction explicitly noted. Filed a follow-up
  recommendation to fix `website-extraction.ts`'s `tel:`/`mailto:` href decoding (not applied —
  out of scope for tonight's release).
- Audited all 7 Level 1 candidates — 0/7 promotable (none had an unresolved
  customer/ownership/identity conflict, which would have made them Level 2/3 candidates, not
  Level 1). Flagged "Queens Pharmacy" for exclusion — Google's own category evidence identifies
  it as non-food-service, likely upstream Just Eat discovery noise.
- Wrote the full 6-file release pack plus the 2 retained (unchanged) system-import files. Did
  not generate the external-system import file (schema still not supplied, per instruction).
- Final decision: 14 Level 0 released, 0 downgraded, 0/7 Level 1 promotable, 7/7 held,
  telesales-ready 14, field-sales-ready 13, both-channels 13, neither 0. No candidate
  contacted; no file sent externally.

**Part 2 — reusable orchestrator**:
- Built `scripts/lead-production/run-full-territory.ts` (8-stage sequencer, spawns each
  existing already-tested CLI script — never reimplements stage logic) and
  `scripts/test-lead-production-full-territory.ts` (20 integration proofs spawning the real
  CLI against synthetic ZZ1/KT9 fixtures).
- While testing `--request-plan-only` across a chained stage range, found a real architectural
  gap: `run-google-stage.ts` required an externally pre-placed population file rather than
  self-deriving from the upstream checkpoint like every other stage. Fixed with `--phase1-dir`
  + `derivePopulationFromFsaCheckpoint()` — confirmed working against both synthetic
  territories (2 and 3 candidates respectively) before and after wiring the orchestrator to
  pass the new flag.
- The orchestrator's own test suite then surfaced a second real bug: the run manifest was never
  written to disk when every in-range stage was a `--checkpoint` override (no stage actually
  executed) — fixed by writing the manifest in that branch too. Both bugs documented in
  `docs/10_BUGS_AND_FIXES.md`.
- **UB1 replay validation** (the required proof that the orchestrator is faithful to the real
  pipeline): ran the orchestrator from `public_profile` through `final_scoring` with
  `--checkpoint` overrides pointing at UB1's own accepted phase1/fsa/google/companies_house/
  website directories (per `ub1-final-run-manifest.json`'s recorded `sourceCheckpoints`) —
  zero live external calls (these three stages make none, live or not). Diffed the resulting
  `ub1-authoritative-master.json` and `ub1-scoring-breakdown.json` against the original
  2026-07-23T04-51-13Z-final-ub1 checkpoint: **zero field-level differences across all 94
  candidates** (bucket counts, channel classifications, and every scoring-breakdown field
  identical).
- Validated `territory-assignments-tonight.csv` directly against the orchestrator's own
  `load-assignments.ts` loading path: 22 rows, 22 unique territories, RM1→Nauman (field_sales,
  map_required=true), KT1→Manraj (field_sales, map_required=true), all 20 TW territories
  individually to telesales, TW15→Sharyar Ali, `required_lead_count=0` on all 22 rows.
- **Verified:** `npm run typecheck`, `npm run build`, all lead-production test suites
  (companies-house, website, public-profile, final-group-rescreen, final-scoring, bridge, fsa,
  google, and the new full-territory suite) green. One pre-existing failure in
  `test:lead-production-google` (`types.ts` legitimately contains the string `level_0`..
  `level_4` as `RejectionLevel`/bucket enum members, tripping a naming-convention regex check)
  confirmed present on the base commit via `git stash` before these changes — not caused by,
  and not fixed as part of, this session's work.
- Commits `24a8727` (google-stage self-derivation fix) and `3114c86` (orchestrator + tests),
  pushed to `feature/mvp-vertical-slice-001`.
- **Not done / explicitly out of scope this session:** no live RM1, KT1, or TW discovery was
  started; the orchestrator has been proven correct only via the UB1 checkpoint replay and two
  synthetic-territory smoke tests — it has not yet been run live end-to-end against a real new
  territory. That is the recommended next step, gated on explicit sign-off.

## Session: 2026-07-23 — Lock qualification/scoring rules v2, wire orchestrator, RM1 dry-run

Human request: accept commit `52c124a`'s qualification/scoring rules v2 as canonical; final
file-level reconciliation of the v2 output; clean pass/fail hard-gate terminology; investigate
(not dismiss) the one remaining pre-existing test failure; produce the final UB1 operational
release package; lock v2 as the reusable standard; resume and complete the paused
`run-full-territory.ts` orchestrator wired to v2 by default with config-hash invalidation;
orchestrator tests; RM1 dry-run request plan. No v2 philosophy/threshold change unless a new
deterministic defect was proven (none was).

- **Reconciliation proven** (candidate-ID set arithmetic, not aggregate counts): 94 unique
  candidates = 47 usable + 11 held + 36 hard-rejected, zero overlap.
- **Test failure investigated properly**: `types.ts never assigns a numeric Level 0-4 score`
  traced via `git log -S` to two commits (`74bd669` added the assertion before Level 0-4 types
  existed; `adfa1d7` later legitimately added them) — a stale test regex, unrelated to
  normalisation/customer-matching/scoring/orchestration. Documented as ISS-0028 with full
  evidence rather than silently dismissed or silently patched.
- **Clean gate terminology**: every hard-gate reason now renders as `passed_<gate>` or
  `failed_<gate>` (two given the owner's exact requested labels), never a bare gate name.
- **Final release package** (`generate-release-package-v2.ts`, 14 files): full per-candidate
  dossier for all 94 candidates, programmatic release-safety checks (territory, hard gates, no
  terminal exclusion, telesales phone, field-sales coordinates) that fail closed on any
  violation — zero found for all 47 usable candidates.
- **Rules locked**: `rules-versions.ts` — single source of truth for 8 independently-versioned
  rule components; `rulesetVersion: "v2"` is now the default for every new territory run.
- **Orchestrator resumed and completed**: `run-full-territory.ts`'s `final_scoring` stage now
  calls `run-final-scoring-stage-v2.ts` by default (v1 untouched, available via
  `--use-v1-scoring` for explicit historical replay only). Real config-input invalidation added:
  a changed `--customers`/`--registry`/`--scoring-rules-version` hash invalidates the stage(s)
  that depend on it and every later pipeline stage on `--resume`; stages pinned by
  `--checkpoint` (tracked persistently in the manifest) are never invalidated. Found and fixed a
  real bug during testing: `--v1-final-scoring-dir` was a hard requirement in
  `run-final-scoring-stage-v2.ts`, meaning a brand-new territory with no prior v1 run could
  never be scored — terminal exclusions (active/inactive customer, excluded group, closed) are
  now derived independently from Phase1/FSA/Google evidence exactly as v1's own script derives
  them, so v2 works standalone for RM1/TW1-20 with no v1 history required.
- **Verified**: orchestrator's UB1 replay (`public_profile → final_scoring`, zero live calls)
  reproduces the accepted v2 output byte-for-byte, both before and after every change this
  session. New regression suite covers config-hash invalidation cascades end-to-end against real
  fixture checkpoints (not mocked), plus the no-v1-baseline scoring path.
- **RM1 dry-run**: `--request-plan-only` for territory RM1 (salesperson Nauman, field_sales,
  map_required=true — correctly resolved from the assignment file) correctly refuses at Phase 1
  (`ok: false` for every stage) because RM1 has no existing Phase 1 checkpoint and no
  `--discovery-run-id` was supplied — this orchestrator never triggers discovery itself, exactly
  as designed. No live discovery was started for RM1 or any other of the 22 territories.
  Estimated request counts/cost for RM1 cannot be honestly stated until Phase 1 discovery has
  run and produced a real candidate population — reported as such, not guessed.
- Commits: `52c124a` (calibration fixes, prior turn), `89c3be3` (rules-lock + orchestrator wiring
  + release package + tests), pushed to `feature/mvp-vertical-slice-001`.
- **Not done**: no live RM1/KT1/TW discovery; FSA/Companies House reclassification with the
  fixed `normaliseName()` (still only Google is reclassified, documented in
  `scoring-rules-v2.json`'s `notApplied` list).
