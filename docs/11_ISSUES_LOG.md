# Issues Log — Magna Lead Intelligence System

## ISS-0001 — Missing customer postcode file

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: **Superseded 2026-07-23** — the NetSuite customer master actually in use throughout the
lead-production bridge (`load-customers.ts`) carries a real `postcode` column, used directly for
customer-match materiality (exact-postcode-and-identity tier) and territory reconciliation.
Marked superseded, not formally closed, in case the owner is aware of a genuine remaining gap
this session's evidence doesn't cover — flagged explicitly in the Milestone 6 certification
rather than silently dropped.

### Problem

Existing customer records need completed postcode data for accurate deduplication.

### Next action

Return/upload the completed missing-postcode file. **If the owner confirms the current customer
master's postcode coverage is sufficient, this can be formally closed.**

## ISS-0002 — Delivery postcode list missing

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: **Superseded 2026-07-23** — this is exactly what `config/lead-production/sales-territories-v2.json`
now is: the approved 13-representative / 112-Postcode-District assignment, the current source of
truth for in-area vs out-of-area decisions. Marked superseded rather than closed for the same
reason as ISS-0001 — flagged explicitly in the Milestone 6 certification.

### Problem

The system needs the approved delivery postcode boundary before deciding in-area, out-of-area, and expansion leads.

### Next action

Upload inner and outer delivery postcode list. **If the owner confirms `sales-territories-v2.json`
supersedes this need, this can be formally closed.**

## ISS-0003 — CTO field validation against Magna Sales Pro

Date: 2026-07-09  
Severity: Critical  
Owner: CTO  
Status: **Superseded 2026-07-23** — `config/lead-production/salespro-schema-v1.json` (108
columns, 20 existing CTO fields exact label/order + 88 new, cross-validated against the CTO's
own `CTO_Lead_Import_Template.xlsx`) is exactly this validation, now built and exporter-tested
(Milestones 3-5). The original ask was framed as a CTO confirmation task; this session's
evidence is the schema itself, not a CTO sign-off — flagged explicitly in the Milestone 6
certification as a distinction worth the owner's attention.

### Problem

The 102-field schema must be validated against Magna Sales Pro API/import constraints.

### Next action

CTO confirms accepted fields, rejected fields, required transformations, and import format.
**The schema and exporter now exist and are tested; what may still be missing is the CTO's own
sign-off/import-side confirmation, not the schema-building work itself.**

## ISS-0004 — MVP territory conflict

Date: 2026-07-09  
Resolved: 2026-07-10  
Severity: High  
Owner: Zoeb  
Status: Resolved (see ADR-0009)

### Problem

Volume 4 says MVP is one outer code. Presentation says MVP is one inner postcode sector `UB1 2`.

### Resolution

The "outer vs inner" conflict is obsolete. Per **ADR-0009**, territory is a flexible per-run configuration: one run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists (`territory_sets` / `territory_items`). A single sector is only ever a manual-test input, never a hardcoded product rule. No fixed MVP scope needs to be chosen.

### Note

This is a resolved design conflict, not a verified feature. Nothing has been built.

## ISS-0005 — Dedup threshold conflict

Date: 2026-07-09  
Severity: Medium  
Owner: Zoeb  
Status: Needs decision

### Problem

Technical docs say 80%+ match auto-ignore/reactivation handling. Presentation mentions 70%+ for special cases.

### Next action

Use 80% as default unless owner explicitly confirms 70% for inactive customer reactivation.

## ISS-0006 — Retention fix is separate but urgent

Date: 2026-07-09  
Severity: High  
Owner: Sales Manager  
Status: Outstanding

### Problem

64.9% churn means new leads alone will not fix growth.

### Next action

Create retention diagnosis brief and onboarding process: first-order follow-up within 48 hours.

## ISS-0007 — 95% churn rep investigation

Date: 2026-07-09  
Severity: High  
Owner: Zoeb  
Status: Outstanding

### Problem

One rep shows anomalous 95% churn across 60 customers and should not receive new territory until investigated.

### Next action

Create separate investigation task.

## ISS-0008 — Claude Code cloud orchestration must be verified

Date: 2026-07-09  
Severity: Medium  
Owner: Zoeb  
Status: Research needed

### Problem

Architecture references Claude Code cloud routine for scheduling/orchestration. This operational dependency must be confirmed before implementation.

### Next action

Verify whether Claude Code can reliably run scheduled cloud routines for this use case, or replace with AWS EventBridge/GitHub Actions/n8n.

## ISS-0009 — No canonical delivery-coverage geometry

Date: 2026-07-15
Severity: Medium
Owner: Zoeb
Status: Open — contract wired, source missing

### Problem

Part 7 delivery-coverage overlay is wired, but the only geometry available
(`public/map/delivery_boundary.geojson`) self-describes as an *illustrative mock*. The map
labels it "Current delivery coverage (mock)" and `DELIVERY_COVERAGE_SOURCE_STATUS` records
the gap. A confirmed operational delivery boundary (routing/depot coverage export) is needed
to replace the mock.

## ISS-0010 — No postcode boundary polygons in the production map source

Date: 2026-07-15
Severity: Medium
Owner: Zoeb
Status: Open — honest point-based interaction shipped

### Problem

`assets.geospatmap.com` carries postcode **centroid points only** — no area/district/sector
boundary polygons. Postcode study-mode hover/selection is therefore point-based. The drawer
states "Boundary polygons unavailable" per level; polygons are not fabricated. A licensed
boundary source (e.g. ONS/OS postcode polygons) would enable polygon interaction. (The local
`pc_districts.geojson` feasibility layer is used only for the run-territory outline, not the
package map source.)

## ISS-0011 — In-browser pixel verification of the map not run

Date: 2026-07-15
Severity: Low
Owner: Zoeb
Status: Open

### Problem

The v0.1.2 map pass was verified headlessly (build, typecheck, tests, routes 200, no 404s)
but the Chrome automation extension was unavailable, so on-screen checks (solid A roads
rendered, live hover/selection, expand behaviour) were not performed. Recommend a manual pass
on `/run-builder`, `/coverage-map`, `/national-map` before relying on it in production.

## ISS-0012 — Supabase service-role key not yet in .env.local

Date: 2026-07-16
Severity: Medium (blocks live JE runs, not the build)
Owner: Zoeb
Status: Open — action on user

### Problem

The `aspectlead-platform` Supabase project is live and migrated, but the SECRET
`SUPABASE_SERVICE_ROLE_KEY` cannot be retrieved via tooling (by design). Until it is pasted
into `.env.local` (Project Settings → API), the worker and discovery API routes cannot write
to the DB, and `test:je-supabase` skips. URL + anon key are already set. Also set
`JUST_EAT_ENABLED=true` to run live discovery.

## ISS-0013 — Just Eat worker is local-only (deployment boundary)

Date: 2026-07-16
Severity: Low
Owner: Zoeb
Status: Open — by design for Stage 1

### Problem

The worker runs as a local Node process (`npm run je:worker`). Vercel request handlers can
queue executions but cannot run long discovery. The claim/heartbeat/lease contract is
production-safe, so moving to a deployed queue/cron later changes only the launcher — but no
paid worker infra is deployed yet (per instruction).

## ISS-0014 — Accepted Supabase security advisories (by design)

Date: 2026-07-16
Severity: Low
Owner: Zoeb
Status: Accepted

### Problem

Two `authenticated_security_definer_function_executable` advisories remain on
`app_current_tenant_ids` / `app_is_tenant_member`. They are required for RLS policy
evaluation and only ever return the caller's own tenant membership (no cross-tenant leak).
Documented as accepted rather than remediated.

## ISS-0015 — UB1 execution has 718 duplicate observations (pre-fix double-claim)

Date: 2026-07-16
Severity: Low–Medium (data hygiene; outlets unaffected)
Owner: Zoeb
Status: Open — decision needed (do not auto-delete real run data)

### Problem

Before the progress/heartbeat fix, the single UB1 execution's 60 s lease expired during the
7-minute 718-outlet inner loop and was re-claimed (`attempts=2`), so it was processed twice.
The DB holds **1,436 raw observations = 718 real + 718 duplicates** (each duplicate correctly
linked via `duplicate_of`). The 718 **outlets** are correct (upserted/deduped). The stored
data-quality report (computed from one worker pass) shows 718/0-duplicates and therefore
undercounts. The fix (intra-query heartbeat + ownership-guarded finish, migration 0011)
prevents recurrence.

### Next action

Decide whether to prune the 718 duplicate observations (`delete from je_raw_observations
where duplicate_of is not null` for that execution — safe now that migration 0010 sets the
referencing FKs to ON DELETE SET NULL) and recompute the quality report, OR retain them as an
immutable record and just note the duplicate count. Not actioned without approval — this is
real run data, not test data.

## ISS-0016 — Just Eat outlet detail not lawfully retrievable

Date: 2026-07-16
Severity: Medium (limits enrichment source options)
Owner: Zoeb
Status: Open — recommendation made (docs/59)

### Problem

A capped 10-outlet audit found the public restaurant page is Cloudflare anti-bot protected
(HTTP 403) and no public detail/menu JSON endpoint exists (404). Phone, opening hours, menu
categories/items/prices, description and extra reviews are therefore **not obtainable from
Just Eat** without prohibited circumvention or a commercial partner feed. Recommendation:
fill phone/menu via later lawful enrichment (Google Places / Companies House / websites),
not Just Eat detail (option B). See `docs/59_JUST_EAT_DETAIL_CAPABILITY_AUDIT.md`.

## ISS-0017 — Place & administrative geography data pending (Geography Standard v1.0)

Date: 2026-07-16
Severity: Medium
Owner: Zoeb
Status: Open — schema built, capability = pending_data

### Problem

Geography Standard v1.0 builds the place (`place`), place↔postcode (`place_postcode_link`)
and admin (`admin_area`) tables, but there is **no data to populate them** in-repo. So
city/town/locality/village discovery expansion is **disabled and reports `pending_data`**
(never guessed), and postcode→region/LA/ward is unavailable. Postcode area/district/sector
expansion works now from the seeded national enumeration. National postcode **boundary
polygons** are also absent (only 6 West-London areas), so map-polygon selection is
centroid-based.

### Next action

Acquire lawful national datasets — **OS Open Names** (place gazetteer) and **ONSPD**
(postcode→place/LA/region) — ingest into `place` / `place_postcode_link` / `admin_area`
with `source` + `source_version`, then flip the capability from `pending_data` to
`available` and enable place expansion.

## ISS-0018 — Uber Eats `discover` mode returns US (not UK) geography for a UK district

The authorised Apify actor `sourabhbgp/ubereats-scraper` in `discover` mode, given
`address: "UB1, United Kingdom"`, returned **10/10 San Francisco, US** stores (all
`address.country: "US"`, US ZIPs) via a sparse `scrapedFrom: "ld_json_fallback"` path — it did
**not** geolocate the UK postcode district. Confirmed on two runs (first pilot + calibrated
rerun), both ~$0.02, under the $0.25 cap.

Impact: UB1-by-name via this actor does not represent UK UB1 coverage. The parser handles it
honestly (US ZIPs/phones → not mapped to UK fields, retained in `source_extra`; no fabrication)
and the pilot prints a country distribution + `⚠ WARNING` when 0 valid UK postcodes are returned.

### Next action

Product-owner decision (no actor change per instruction): supply the actor a UK-resolving input
(UK lat/lng or a recognised UK city anchor) or a different input mode, then re-validate one UK
district. Do not scale until a run returns valid UK geography. See docs/64.

### ISS-0018 update — root cause found + contained (2026-07-18)

**Root cause (provider input):** the actor `sourabhbgp/ubereats-scraper` requires a `urls` field
(default `["https://www.ubereats.com/near-me"]`, which resolves to a US location). The pilot fetcher
**omitted `urls`**, so the actor ignored the GB `address` and returned its US near-me default (San
Francisco). Confirmed against the actor's published input schema (fields: urls, country, address,
mode, maxResults, includeReviews, proxyConfiguration — no lat/lng).

**Audit of both runs:** each returned 10 distinct US records → **10 distinct candidates (clean 1:1,
NOT candidates=1)**. Consolidation did not over-merge (distinct phones/URLs, US ZIPs fail the UK
full-postcode test, no coordinates → zero evidence links). The earlier "candidates=1" premise did
not match the recorded database result.

**Containment (this session):** added a provider-neutral geography-validation gate (docs/65) that
classifies every observation `valid_geography` / `out_of_scope_geography` / `unverifiable_geography`
between capture and consolidation. Wrong-geography records are retained as immutable evidence but
excluded from consolidation, exports, and coverage. The two historical runs' 20 US candidates were
quarantined (`consolidated_candidates.geography_status='out_of_scope_geography'`), with per-observation
verdicts in `provider_geography_validations` and invalidation records in `candidate_merge_decisions`.
Run-level business status `provider_succeeded_validation_failed` now HALTS before further paid sources.

**Still open (needs approval):** one supported-input diagnostic prepared (verified dry via
`npm run uber:diagnostic-plan`) using `urls:["pizza"]` + a full public UB1 address. NOT executed.

### ISS-0018 update — final supported-input diagnostic executed (2026-07-18)

One approved paid run (actor_run_id `1NY5EwEirCZi5h4s6`, dataset `xjn5ywNeQUvBtW7ws`, build 0.1.23,
SUCCEEDED, charged 10, **actual $0.02**, under the $0.25 cap; exactly ONE paid run). Input:
`{urls:["pizza"], country:GB, address:"Southall Town Hall, 1 High Street, Southall, UB1 3HA, United
Kingdom", mode:discover, maxResults:10, includeReviews:false}`.

**Result — progress but still not district-precise:** adding the required `urls` field **fixed the
wrong-country bug** — the actor now returns **GB** records (country `{"GB":10}`, 10/10 valid UK
postcodes) instead of US/San Francisco. **However** the records are **central London** pizza places
(SE11, WC1X, WC2H, WC2B, N1, EC4Y, SW8) — **not UB1/Southall**. The actor does not honour the
specific UB1 address to bound discovery to the district; it returns broad London results.

The gate correctly classified all 10 `out_of_scope_geography` (signal `postcode_out_of_area`),
business status `provider_succeeded_validation_failed`, **0 operational candidates**, and HALTED.
Raw observations immutable (10 canonical, 0 duplicates, 0 dangling). Sparse `ld_json_fallback` shape
again (phone/cuisines/media/isOpen present; rating/coords/delivery/eta/hours/menu absent).

**Status:** wrong-country is RESOLVED; **district-precise UK discovery is NOT achievable** with this
actor via address input. Recommend evaluating a tighter location input or an alternative actor for
district-level UK discovery. No larger Uber run; no Deliveroo; no customer comparison.

### ISS-0019 — dual Vercel project ownership unresolved; deployment-protection SSO blocks direct browser verification

**Status as of 2026-07-18 (overnight session):** the earlier framing of this issue — that
`magna-lead-intelligence-system-pngu` is "a stale duplicate that fails every build" — is **no
longer accurate** and must not be repeated. It has been corrected as follows:

- **GitHub Packages migration is complete.** The root cause of the `-pngu` project's earlier
  failures (legacy SSH-rewrite Install Command, no `NPM_TOKEN`) has been fixed by repairing that
  project's settings to match the working project: `NPM_TOKEN` added, custom Install Command
  removed, default `npm ci` install route restored.
- **Both Vercel projects now build successfully.** `magna-lead-intelligence-system-pngu`
  (`prj_vxcbOvftT2CdzUmnxyCWhjF9f3U2`, deployment `dpl_DvJ49zyyhVdV5ND8Rzhv8USNcCSZ`, `READY`,
  Production) and `magna-lead-intelligence-system` (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`,
  deployment `dpl_7ZSr1BuoTYgef9njpnaTfAGsqPn8`, `READY`, Preview) both deploy commit
  `2d6f4fb158b5ed60f93db1081e6a9b0c5fbf4fda` successfully. Full topology recorded in
  `docs/08_DEPLOYMENT.md` ("Vercel deployment topology").
- **Browser verification remains incomplete where applicable.** Neither deployment's live pages
  have been directly browser-tested this session (see the SSO/extension limitation below, carried
  forward unchanged from the prior entry).
- **Dual-project ownership and canonical deployment architecture remain unresolved.** Two
  projects legitimately exist, connected to the same repo, with different environment roles
  (Production vs Preview) that do not obviously map to which one *should* be canonical. This is
  **not** a bug to auto-fix — it needs an explicit owner decision (see `docs/08_DEPLOYMENT.md` for
  the proposed future clean-up: retain one project, migrate aliases/env vars, rename to
  `aspectlead-web`, only after a domains/aliases/env-vars/Git-integration/history/rollback audit).
- **Owner decision is required later.** Nothing about either project's settings, domains, or
  existence was changed this session (out of authorised scope) beyond what is described above as
  already having been repaired.

**Original SSO/browser-verification note (still open):** the READY preview
(`dpl_85AwBaHZvzsXZoF14S67EibBPEJ7`,
`https://magna-lead-intelligence-system-qyaz78cuh-zoeb-s-projects.vercel.app`, an older deployment
of Project B) sits behind Vercel's **deployment-protection SSO wall** (redirects to
`vercel.com/sso-api`) — `curl` cannot reach the app without an authenticated Vercel session or a
protection-bypass secret (none configured). The Claude Chrome browser extension was also **not
connected** this session (same limitation noted in `PROJECT_STATUS.md`'s national-map history).
Result: home page / Run Builder / map / APIs remain **not directly browser-tested against either
live deployment**. Verification instead relies on: identical local `npm run build` output, all
required local test suites green, and Vercel build logs matching the local build exactly (same
routes, no npm/auth errors). **Needed to close this out:** either the user opens a preview URL
themselves (their browser already has an authenticated Vercel session) and confirms the pages/APIs
render, or reconnects the Claude Chrome extension so an agent can do it, or a
`VERCEL_AUTOMATION_BYPASS_SECRET` is added so `curl`/headless tools can reach protected previews
directly.

## ISS-0020 — Four product screens remain missing (screen completion matrix, 2026-07-21)

Date: 2026-07-21
Severity: Medium
Owner: Zoeb
Status: **Resolved (second same-day follow-up session)** — all 4 built: `/discovery-runs` +
`/discovery-runs/[id]` (run detail), `/data-quality-exceptions`, `/audit` + `/audit/[id]`
(audit/evidence), and `/import` (source selection, CSV/JSON upload, downloadable templates,
dry-run validation, field-mapping preview, invalid-row display, duplicate detection, geography
validation via the existing gate, confirm step with honest evidence-hash retention — does NOT
mark a source `ACTIVE` merely because import is supported). All real/live-backed, browser- and
API-verified, with loading/error/empty states. `test:new-screens` (15) + `test:import-route` (10).

### Problem

A screen completion matrix run against actual routes/source code found 4 of 14 required screens
missing entirely (not placeholder — no route exists): **run detail** (a page for a single
`discovery_runs` run's full execution/quality/consolidation history — only visible transiently inside
the Run Builder panel while a run is active), **data-quality exceptions** (no UI over
`provider_geography_validations` / quarantined candidates / duplicate observations — e.g. the 20
quarantined Uber US candidates from ISS-0018 have no browsable screen), **import screen** (the new
Uber Eats CSV/JSON import functions — `src/lib/discovery-engine/uber-eats/import.ts` — have no upload
UI; import is currently script/API-only), and **audit/evidence view** (raw provider payloads are
immutably stored but have no dedicated viewer; the new restaurant-detail screen surfaces field
provenance but not the full raw payload). 3 further screens are honest `PARTIAL`: dashboard (`/`) and
`/territories` still read from `src/lib/mock-data.ts`; `/pipeline-runs` only covers the legacy
TW/FSA file-backed pipeline, not `discovery_runs`.

### Next action

Data-quality exceptions, run detail, audit/evidence, and (second same-day follow-up session) the
import screen (`/import` + `/api/discovery/import`) are now all built — see the status line above.
Still open: wire the dashboard (`/`) and `/territories` off `src/lib/mock-data.ts` onto real
Supabase-backed data; `/pipeline-runs` still only covers the legacy TW/FSA file-backed pipeline.

## ISS-0021 — Deliveroo: real public discovery source found; production authorisation still needed

Date: 2026-07-21
Severity: Medium
Owner: Zoeb
Status: Open — a real path now exists; owner authorisation to productionise it does not

### Problem (original, 2026-07-21)

No live Deliveroo data could be acquired. Official API is merchant-only (not open discovery). The
one authorised third-party actor evaluated (`thirdwatch/deliveroo-scraper`, real and maintained,
$0 spent) was disqualified: its UK input requires city/neighbourhood slugs (not an exact
address/postcode), and it escalates to a residential proxy when blocked (proxy-rotation evasion,
excluded). One bounded public-flow test (docs/72) used a guessed static search URL, which returned
Deliveroo's own honest 404 — not a challenge, but not proof of unavailability either.

### Update — real discovery flow found (second same-day follow-up session, docs/74)

A genuine Playwright browser session (default Chromium, no evasion) used Deliveroo's own visible
postcode-search UI and found real, working discovery: 150 restaurant cards, 10 genuinely local to
UB1 (≤1 mile), 100% coverage on ID/URL/name/rating/review-count/image, phone confirmed absent
(same pattern as Just Eat), full address obtained from one permitted detail-page inspection. A
calibrated parser (`deliveroo-real-parse-0.1.0`, 16 assertions) was built from this real data.
Registry corrected: `marketplaceStatus: PENDING_AUTHORISATION` (was incorrectly
`PROVIDER_UNAVAILABLE` — that verdict was drawn from one wrong URL guess, not a genuine
unavailability finding).

Separately, the provider-neutral Deliveroo adapter is complete (`importJson`/`importCsv`,
`test:deliveroo-import` — 20 assertions, including a real bug fix: the parser's `num()` helper was
converting a blank/absent value to `0` instead of `null`).

### Next action

Owner decision: authorise wiring the validated public browser-flow discovery into a scheduled,
automated production adapter (a materially bigger decision than a one-off manual check — recurring
load on Deliveroo's site + an ongoing ToS/risk posture, not just "does discovery work"), or source
a licensed commercial feed instead. Until authorised, Deliveroo stays `PENDING_AUTHORISATION`, not
`ACTIVE` — a one-off manual research session does not make a source production-ready.

## ISS-0022 — Just Eat phone batch: 93.5% coverage reached; remaining 7 honestly unresolved

Date: 2026-07-21
Severity: Low
Owner: Zoeb
Status: **Resolved (second same-day follow-up session)** — full remaining batch run, with a
correctness upgrade added first (name+address match validation — see docs/10_BUGS_AND_FIXES.md).

### Original problem

`npm run je:phone-enrich -- "UB1" 30` enriched only 30/107 outlets, and blindly accepted every
Google Places top-hit with a hardcoded 0.7 confidence — no real name/address cross-check.

### Resolution

Before running the remaining batch, added a defensible match-validation gate (`namesMatch` +
`addressMatches`, `test:phone-match` — 9 assertions; both the outlet's Just Eat name AND its
postcode must independently corroborate the Google Places result, or the phone is rejected as
"ambiguous" and not written). This required extending `GooglePlacesResult` with a `matchedName`
field the runner's field mask already requested but never surfaced. Ran the remaining 79 eligible
outlets (dry-run cost estimate £2.02–£2.53, well under the £10 authorised cap): **72 found and
written** (name+address matched, confidence 0.85), 3 not found, **4 correctly rejected as
ambiguous** (preventing wrong-number writes — e.g. a Google Places top-hit for "Falooda Village"
returned "KULFI & JALEBI WALA" at a matching address; rejected despite the address match, since the
name did not corroborate it). 0 new duplicate-phone conflicts.

**Final: 100/107 UB1 outlets have a phone (93.5%),** up from the original 0%. The pre-existing
duplicate-phone conflict (`+447863189603` → "Tehzeeb" / "Roma Restaurant") was resolved with
evidence, not left open: both outlets share the exact same address, postcode, and coordinates (26
The Broadway, UB1 1PS) — a shared-premises/virtual-brand pattern, not a data error.

### Remaining (honestly unresolved, not further attempted)

7/107 outlets have no phone: 3 no Google Places match found, 4 rejected as ambiguous matches. Per
instruction, an ambiguous match was never accepted merely to raise the coverage number.

**Update (third same-day follow-up session):** each of the 7 now has a full audit-trail record —
reason, any candidate name/address considered, timestamp — written to `je_field_provenance`
(`field_key='telephone_enrichment_exception'`, value always null, never a fabricated phone) and
surfaced on `/data-quality-exceptions` under "Just Eat phone: unresolved (audit trail)" with a
`resolutionStatus: 'unresolved'` badge and a drill-down link to the outlet. **Fully resolved as a
tracking gap** — matching standards were not lowered; this only makes the existing rejections
visible and explainable rather than silent.

## ISS-0023 — Interface honesty audit: global banner corrected; dashboard demo data flagged locally

Date: 2026-07-21 (third same-day follow-up session)
Severity: Medium
Owner: Zoeb
Status: Resolved

### Problem

The global `PrototypeBanner` ("Prototype using mock data. No real customer data. No integrations
connected.") was shown on **every** route, including 8 of 10 routes that are genuinely
database-backed (docs/75 audit). This was misleading for anyone using the deployed app.

### Resolution

Replaced with `StatusBanner` — reads the same `SOURCE_REGISTRY` `/settings` already uses (one
source of truth), showing per-source status (`Just Eat: ACTIVE`, `Uber Eats: PENDING AUTHORISED
SOURCE`, `Deliveroo: PUBLIC SOURCE VALIDATED — PIPELINE INTEGRATION IN PROGRESS`, `Manual import:
AVAILABLE`, `Customer comparison: NOT STARTED`). The dashboard (`/`, still 100% `mock-data.ts`) now
carries its own explicit page-level "DEMO DATA" warning instead of relying on a global banner that
no longer makes that claim. `PROTOTYPE_NOTICE`/`PrototypeBanner` removed (fully unused after the
swap, not left as dead code).

### Next action

None — resolved. Full route-level classification in `docs/75_LIVE_DATA_AUDIT.md`. Wiring `/` and
`/territories` off `mock-data.ts` onto real data remains open (unchanged from ISS-0020) but is now
honestly labelled rather than silently misrepresented.

## ISS-0024 — `candidate_source_links.je_raw_observation_id`: unused schema field from migration 0030

Date: 2026-07-22
Severity: Low (tech debt)
Owner: Zoeb
Status: Open — deferred

### Problem

Migration 0030 (applied alongside the geography-consolidation hotfix, commit `fc5063b`) added
`candidate_source_links.je_raw_observation_id` (nullable, FK to `je_raw_observations`, indexed)
for future exact-observation traceability. The hotfix's actual join logic did not end up needing
it — `consolidateRun()` and the `c301cbbc` repair both resolve the exact observation via
`je_raw_observations.id` / `provider_geography_validations.observation_id` directly. Confirmed
in production: 3,285 `candidate_source_links` rows, 0 populated; no application code reads or
writes the column. See `docs/09_DECISIONS.md` for the decision to retain it as-is for now.

### Next action

If still appropriate later, remove via a **new additive migration** (drop column + index) —
never edit the already-applied 0030 file. Do this only after preview/staging testing confirms
nothing has started depending on it in the meantime. Not urgent — no observed operational impact.

## ISS-0025 — lead-production bridge: reusable multi-territory orchestrator (Phase H) not yet built

Date: 2026-07-23
Severity: Medium — blocks the 22-territory rollout
Owner: Zoeb
Status: **Resolved 2026-07-23** — orchestrator built, tested, and UB1-replay-verified; rollout
itself remains gated on separate explicit sign-off (see "Next action" below).

### Problem

The offline `scripts/lead-production/` bridge now has a complete, tested, live-verified UB1
pipeline (Phase 1 comparison → FSA → Google Places → Companies House → website enrichment →
decision-maker public-profile → final group rescreen → final qualification/scoring), reconciled
to the original 94 UB1 candidates. Every individual stage script is already territory-agnostic
(takes checkpoint directory paths + a `--territory` flag, never a hardcoded candidate ID), but
there is no single top-level orchestrator that chains them with checkpoint resumption, per-stage
manifests, and automatic reconciliation for a NEW territory. The user's own overnight directive
explicitly gates the 22-territory rollout (RM1/KT1/TW1-20) behind this orchestrator's own tests
passing — so the rollout was correctly not attempted, independent of any other consideration.

### Resolution

Built `scripts/lead-production/run-full-territory.ts` + `scripts/test-lead-production-full-
territory.ts` (20 proofs). Fixed two real bugs found while building it (see
`docs/10_BUGS_AND_FIXES.md`): `run-google-stage.ts`'s population self-derivation gap, and the
orchestrator's own manifest-not-written-on-override-only-run bug. Validated by replaying UB1's
own accepted checkpoints through `public_profile → final_scoring` (zero live calls) — reproduces
`ub1-authoritative-master.json` and `ub1-scoring-breakdown.json` exactly, all 94 candidates, zero
field-level differences — and by two synthetic-territory smoke tests (2 and 3 candidates).
Commits `24a8727`, `3114c86`. Full detail: `docs/15_AI_WORK_LOG.md` (session 2026-07-23).

### Next action

The orchestrator itself has never been run live against a real new territory (only UB1's replay
and synthetic fixtures). Get explicit sign-off before the first live run — recommended: RM1 or
KT1 (field-sales, small `required_lead_count` scope) as the first real-world proof, ahead of the
full TW1-20 telesales rollout.

## ISS-0026 — lead-production bridge: two known evidence gaps carried into UB1 scoring

Date: 2026-07-23
Severity: Low — documented, does not block current output
Owner: Zoeb
Status: Open — deferred

### Problem

1. Website-selection tier 3 ("strong tied candidate" via name+postcode+phone) is not
   implemented in `website-selection.ts` — no lawful discovery mechanism (e.g. a live web
   search) was budgeted for the website-enrichment stage. Only Google-verified and group-
   registry-verified domains are used; candidates without either are recorded as
   `no_website_available`, never a guessed domain.
2. `netAssetGrowth`/`turnoverGrowth` in `financial-extraction-after-companies-house.ts` are
   unconditionally `not_available` — only the latest filed-accounts period is fetched per
   company (a second, prior-year document fetch would double the per-company document-API cost,
   out of scope for the bounded overnight run).

### Next action

Both are intentional, documented scope decisions, not bugs — revisit only if/when a lawful
public-search connector and/or a larger document-API budget are explicitly approved.

## ISS-0027 — `website-extraction.ts` does not validate/decode `tel:`/`mailto:` href content

Date: 2026-07-23
Severity: Low — caught and corrected at the release-audit layer, not blocking
Owner: Zoeb
Status: Open — deferred

### Problem

Found during the UB1 release audit: `website-extraction.ts`'s `extractPhone()` takes a `tel:`
href's contents verbatim without validating it looks like a real phone number or URL-decoding
it first. 2 of 14 UB1 Level 0 candidates had a malformed value as a result (e.g.
`+44%2078854%2003976` — un-decoded percent-encoding; `+65.4566743` — non-UK garbage). Both
candidates already had a clean, independently-verified Google Places phone, used instead in the
release pack with the substitution explicitly noted. No enrichment checkpoint was modified.

### Next action

Fix `extractPhone()` (and the equivalent `mailto:` handling, unchecked but likely the same root
cause) to URL-decode href content and validate the result looks like a real UK phone number
before treating it as high-confidence evidence. Not applied this session — a code change to an
already-accepted, immutable-checkpoint-producing stage requires separate approval and a fresh
run to take effect for any candidate whose only phone source is the website.

## ISS-0028 — `test:lead-production-google` false-positive assertion on `types.ts`

Date: 2026-07-23
Severity: Low — cosmetic test-suite noise only, no production/data-quality impact
Owner: Zoeb
Status: **Closed 2026-07-23** — fixed as part of Milestone 6's full test/build gate (the
pre-production certification requires every lead-production test to pass; this was the one
outstanding failure, root-caused below, and the fix is exactly what "Next action" already
specified). `scripts/test-lead-production-google.ts`'s "no numeric Level 0-4 score" check now
excludes `types.ts` from that specific regex (types.ts is still checked for the separate
"never labels sales-ready" assertion) — `types.ts` legitimately declares the shared Level 0-4
type vocabulary without ever assigning a level itself. Verified: full 13-suite lead-production
test gate + typecheck + build all green after the fix.

### Investigation (not casually dismissed — full evidence)

- **Test name:** `types.ts never assigns a numeric Level 0-4 score`, in
  `scripts/test-lead-production-google.ts` (assertion block "16 & 17", line 325):
  `assert(!/level[_-]?[0-4]\b/i.test(text), ...)`.
- **Expected value:** the regex `/level[_-]?[0-4]\b/i` finds no match anywhere in
  `scripts/lead-production/types.ts` (assertion is `true` when `text` contains no such
  substring).
- **Actual value:** the regex DOES match — `types.ts` legitimately contains the type unions
  `RejectionLevel = "level_0" | "level_1" | "level_2" | "level_3" | "level_4"` and
  `MasterOutcomeBucket`'s `"level_0_sales_ready" | "level_1_soft_gap" | ... |
  "level_4_hard_reject"` members (`scripts/lead-production/types.ts:928,951-955`).
- **First commit where it fails:** `git log -S'"level_0"' -- scripts/lead-production/types.ts`
  shows these type members were added in `adfa1d7` ("feat: add final qualification, scoring,
  and UB1 output stage"). `git log -S'never assigns a numeric Level 0-4 score' --
  scripts/test-lead-production-google.ts` shows the assertion itself was added earlier, in
  `74bd669` ("feat: add Google Places identity/premises stage") — before the Level 0-4 types
  existed. The assertion passed correctly at the time it was written; it became a false
  positive the moment `adfa1d7` legitimately introduced the shared Level-0-4 vocabulary that
  every downstream stage (hard-gates.ts, scoring.ts, final-outcome.ts, and now
  qualification-v2.ts) imports from `types.ts` by design.
- **Connection to normaliseName()/customer-matching/scoring/territory-orchestration:** none.
  `types.ts` was not touched by any of this session's or the 2026-07-23 calibration session's
  changes (confirmed: not present in either session's diff). The regex is a pure static-text
  content check on one file, unrelated to runtime behaviour, name normalisation, customer
  matching, or the v2 qualification/scoring/orchestrator work.

### Why it does not block lead production

`types.ts` never actually assigns a Level 0-4 score to a candidate — it only *declares the
shared type vocabulary* that the one legitimate scoring stage (`final-outcome.ts`, and now the
v2 equivalent) uses to assign a level. The assertion's real intent — "no early evidence-
gathering stage (Google/FSA/website/etc.) pre-judges sales-readiness" — remains fully true and
is separately verified for every OTHER file in the same test loop (`google-adapter.ts`,
`google-match.ts`, `fsa-resolution-after-google.ts`, `customer-resolution-after-google.ts`,
`physical-premises.ts`, `group-rescreen-after-google.ts`, `run-google-stage.ts` — all pass).
Only the shared type-definitions file itself trips the regex, which is definitionally
impossible to avoid once the project has ANY Level 0-4 concept at all.

### Next action

The regex in `scripts/test-lead-production-google.ts` line 325 should be narrowed to exclude
`types.ts`'s own type-definition lines (or scoped to only the other 7 files in that loop) in a
future, separately-approved test-suite maintenance pass — not applied this session per
instruction to document rather than silently patch a test outside the current work's scope.

## ISS-0029 — `magna_customer_match_status` (descriptive field) can lag behind the authoritative `customer_master_exclusion` bucket

Date: 2026-07-24
Severity: Low — cosmetic/descriptive only, does not affect exclusion routing
Owner: Zoeb
Status: Open — worked around, not fixed

### Problem

`candidate-dossier.ts`'s `magna_customer_match_result` field is derived as
`chCustRes?.resolution_outcome ?? p1?.preliminaryStatus` — only the Companies-House-stage
resolution (or, failing that, Phase 1's raw status). If a candidate was confirmed at an EARLIER
stage (FSA or Google) but the Companies House stage's own resolution still reads "unresolved",
this descriptive field does not reflect the earlier confirmation, even though
`run-final-scoring-stage-v2.ts`'s `findConfirmedCustomerMasterMatch()` (checked across all 4
stages) correctly still routes the candidate to `customer_master_exclusion`.

### Impact and workaround

Exclusion routing itself is unaffected — verified correct against real RM1 data (3 of RM1's 4
`customer_master_exclusion` candidates were confirmed at Google Places or Phase 1, not Companies
House, and are all correctly excluded). `master-field-resolver.ts`'s `existing_customer_warning`
field was patched to check `dossier.v1Bucket === "customer_master_exclusion"` directly (the
authoritative signal) rather than relying solely on the descriptive field, so the one
REQUIRED/rep-facing field this could have affected is already correct. Only the free-text
`magna_customer_match_status` field itself (e.g. showing "Unresolved" instead of "Confirmed
Active Customer" for a candidate excluded via an earlier stage) can be cosmetically stale.

### Next action

Update `candidate-dossier.ts`'s `magna_customer_match_result` derivation to check all 4 stages
(mirroring `findConfirmedCustomerMasterMatch()`) in a future pass — out of scope this session
since `candidate-dossier.ts` is shared with the accepted, byte-identical-verified UB1 release
package generator and any change there requires re-verifying that byte-identical guarantee.

## POLICY — Permanent root-cause correction policy (2026-07-24)

Status: **Active, permanent, applies to every representative territory from RM1-RM14/KT1-KT24
onward.** Not an issue; a standing process rule. Also recorded in `docs/09_DECISIONS.md`,
`docs/LEAD_PRODUCTION_HANDOVER.md`, and `docs/LEAD_PRODUCTION_PREPRODUCTION_CERTIFICATION.md`.

### Rule

**No final-lead defect may be corrected only in an output file.** Patching a Master workbook,
Sales Pro CSV, or handover package by hand (or with a one-off script that edits exported rows
directly) to make a wrong value look right is prohibited — it leaves the reusable pipeline able
to produce the same wrong value again for the next candidate, the next district, or the next
territory. Every defect that affects a final lead's data must be fixed at its source.

### Required steps, every time

1. Create an issue ID (`docs/11_ISSUES_LOG.md`, `ISS-NNNN`).
2. Identify the source stage or shared rule responsible (Phase 1, FSA, Google, Companies House,
   website, public-profile, group-rescreen, final-scoring/qualification, dedup, exporter field
   resolution — name the exact script/function).
3. Fix the reusable pipeline code at that stage/rule — never the exported file.
4. Add a regression test that reproduces the real failing case as a fixture (not a synthetic
   case chosen to be easy to pass).
5. Bump the affected rules/schema/component version where the fix changes behaviour a future
   territory would otherwise rely on unchanged (e.g. `rulesetVersion`, Master/Sales Pro schema
   version, assignment version) — see `docs/09_DECISIONS.md`'s versioned-config decisions.
6. Reprocess all affected districts from the earliest valid checkpoint the defect could have
   touched (not just re-run the final export step) — using existing checkpoints/live data as
   appropriate, never fabricated data.
7. Regenerate every downstream Master workbook, Sales Pro export, map file, and report affected.
8. Document affected candidates and before/after outcomes (candidate IDs, what changed, why) in
   the relevant territory reconciliation report and in the fix's `docs/10_BUGS_AND_FIXES.md`
   entry.
9. Confirm in writing (in the same bugfix entry) why the defect cannot recur in a future
   territory — what the regression test now guards, and whether any other pipeline stage shares
   the same defect pattern and needs the same check.

### Precedent this policy formalises

Every real defect found during RM1-RM14/KT1-KT24 processing was already fixed this way in
practice (assignments/groups passthrough, FSA hardcoded-84 removal, duplicate-run guard,
cross-district dedup false-merge fix — see `docs/10_BUGS_AND_FIXES.md` and
`docs/09_DECISIONS.md`) — this entry makes that practice an explicit, permanent, checkable rule
rather than an informal habit, for every representative from Ayesha (NW1) onward.

## ISS-0030 — Website-crawl stage crashed the whole process on an HTTP/2 GOAWAY (2026-07-24)

Date: 2026-07-24
Severity: High
Owner: Zoeb
Status: **Fixed 2026-07-24** — see `docs/10_BUGS_AND_FIXES.md`.

### Problem

During live NW3 processing, the website enrichment stage crashed the entire orchestrator process
twice in a row — reproduced identically against the same remote host (148.72.87.238), at nearly
the same byte offset — with `SocketError: other side closed` / `HTTP/2: "GOAWAY" frame received`.
Node's default `fetch()` auto-negotiates HTTP/2; when a remote server closed a shared/reused H2
connection mid-response, undici emitted the failure as an `'error'` event directly on the
internal `ClientHttp2Stream` rather than as a `fetch()`/`res.text()` promise rejection — bypassing
`website-adapter.ts`'s own try/catch entirely (`fetchWithTimeout()` already wrapped every fetch
call in try/catch; the crash came from an EventEmitter path outside that promise chain). This
took down the whole district's website-enrichment stage for all candidates, not just the one
misbehaving domain.

### Next action

None — root-caused and fixed at the source (`scripts/lead-production/website-adapter.ts`), not
patched around. See `docs/10_BUGS_AND_FIXES.md` for the fix and `docs/09_DECISIONS.md` for the
new `undici` dependency this required.

## ISS-0031 — discovery_runs.status can stay stuck at 'queued' when finishExecution() fails (2026-07-24)

Date: 2026-07-24
Severity: Medium
Owner: Zoeb
Status: **Fixed 2026-07-24** — see `docs/10_BUGS_AND_FIXES.md`. Regression suite:
`scripts/test-discovery-run-recovery.ts` (`npm run test:discovery-run-recovery`).

### Problem

NW7's discovery run failed with a transient HTTP/2 stream timeout inside `insertRawObservation`/
`finishExecution` (`src/lib/discovery-engine/repository/supabase.ts`). The `je_executions` row
correctly recorded `status: "failed"`, but the `discovery_runs` row's own `status` column never
transitioned away from `"queued"` — because the same failure that killed the execution also
prevented whatever write is meant to update `discovery_runs.status` from completing. This left a
permanently "queued"-looking run that the duplicate-run guard in `scripts/je-run.ts` correctly
(from its own narrow perspective) treated as still in-progress, blocking a legitimate retry until
manually corrected (`discovery_runs.status` set to `"failed"` directly via a one-off script, same
session, same pattern as the NW2/NW7 evidence-completeness procedure recorded in
`docs/09_DECISIONS.md`).

### Next action

Root-cause fix (not yet done — logged for a future session, not blocking live NW1-NW10
production): make the `discovery_runs.status` transition to `"failed"` resilient to a partial
write failure — e.g. write it in the SAME transaction/request as the `je_executions` failure
update rather than a separate later call, or add a periodic reconciliation check that catches
`discovery_runs` rows stuck at `"queued"`/`"running"` whose `je_executions` row shows `"failed"`
and corrects them automatically. Must include a regression test reproducing a `finishExecution`
failure and asserting `discovery_runs.status` still ends up correct. Per the permanent root-cause
correction policy, the manual DB correction applied to unblock NW7 is a legitimate one-off
recovery (documented, audited), not a substitute for this fix — flagged here so it is not lost.

### Fix (2026-07-24)

Root-caused and fixed before starting TW1. Full detail in `docs/10_BUGS_AND_FIXES.md`; summary:
the run-level and execution-level terminal-failure writes are now attempted independently (each
in its own try/catch, run-level first) instead of two unguarded sequential awaits; the run-level
write (`repo.failRun()`) retries with bounded backoff and never overwrites an already-accepted
run; a companion `resumeGeographyProcessing()` lets a genuinely interrupted-but-fully-discovered
run resume from its own retained raw evidence with no new Just Eat call; `--replaces=`/
`--resume-from=` were added to `scripts/je-run.ts`; and `run-comparison.ts` now refuses to treat
an incomplete run's candidate count as a genuine zero-result. 9-scenario regression suite in
`scripts/test-discovery-run-recovery.ts`.

## ISS-0032 — Shahzaib's config included "HA10", which is not a real UK postcode district (2026-07-25)

Date: 2026-07-25
Severity: Medium
Owner: Zoeb
Status: **Fixed 2026-07-25** — see `docs/10_BUGS_AND_FIXES.md`. Regression guard added to
`scripts/test-lead-production-territory-v2.ts` (`npm run test:lead-production-territory-v2`).

### Problem

`config/lead-production/sales-territories-v2.json` assigned Shahzaib the Sales Territory
"HA6-HA10" (5 Postcode Districts: HA6, HA7, HA8, HA9, HA10). HA10 is not a real UK postcode
district — the HA postcode area (Harrow) only spans HA0-HA9, confirmed against the pipeline's own
authoritative postcode reference data (`loadPostcodeReference()`'s `districtsInArea("HA")`
returns exactly `["HA0",...,"HA9"]`; `entry("HA10")` returns nothing). Nothing in
`territory-assignment-v2.ts`'s config validation, nor `planTerritoryWithPlaces()`'s manual-input
handling, cross-checks a configured/typed Postcode District against the reference before treating
it as a valid query unit — `planTerritoryWithPlaces` returned `queryUnits: ["HA10"]` regardless.

Caught live: a bounded discovery run for "HA10" completed successfully (`discovery_runs.status =
"completed"`) with genuinely 0 raw observations (Just Eat found nothing to query against a
non-existent area), which correctly cascaded to 0 Phase 1 candidates, 0 FSA candidates, and then a
deliberate refusal in the Google stage (`REFUSING TO RUN LIVE: effective request cap is 0`),
halting the orchestrator with a `SHARED PIPELINE INTEGRITY FAILURE`. No data was fabricated or
corrupted at any stage — the pipeline's defensive refusals worked exactly as intended once the
error had already been made at the config level.

An audit of all 13 representatives' `postcodeDistricts` against the reference confirmed HA10 was
the *only* invalid entry in the entire config.

### Next action

None — root-caused and fixed at the source (the config), not patched around.

### Fix (2026-07-25)

`config/lead-production/sales-territories-v2.json`: Shahzaib's assignment corrected to HA6-HA9 (4
districts, `districtCount: 4`); top-level `totalDistricts` corrected 112 → 111; a `corrections`
array added recording the change and its cause. HA6, HA7, HA8, HA9 (already live-processed and
verified before this was discovered) required no rework — the defect never touched their data.
`scripts/test-lead-production-territory-v2.ts` gained a new check that resolves every
representative's every configured Postcode District against `loadPostcodeReference()` and asserts
it exists, plus an explicit assertion that HA10 itself is absent — the exact regression guard that
would have caught this before any live call was made. All 111 remaining districts (across all 13
representatives, including the 5 not yet processed) were confirmed valid by this same check.

## ISS-0033 — Five-district pilot's named districts don't match `sales-territories-v2.json`, and RM1 is already owned (2026-08-02)

Date: 2026-08-02
Severity: High — **blocked the pilot; live discovery could not start until resolved by the owner**
Owner: Zoeb
Status: **Resolved 2026-08-03.** The owner confirmed the CC's newly supplied district/
representative/region allocation (see below) is authoritative for a NEW, separate campaign
("campaign-002-five-district-pilot") — the completed first campaign's territory assignments
(`sales-territories-v2.json`) are explicitly NOT to be treated as current for this run, and must
not be overwritten, deleted, or rewritten. See "Resolution" below.

### Problem

The owner's instruction named five district→representative→region pairings for the pilot:
CM1→Kunz→East London, IG1→Naseh→East London, RM1→Saif→East London, DA1→Tahira→Southeast London,
BR1→Hassan→Southeast London. Cross-checked directly against the live
`config/lead-production/sales-territories-v2.json` (the same fail-closed-validated config
`assertDistrictIsConfigured()` — added this session, see `docs/10_BUGS_AND_FIXES.md` — checks
every candidate against): none of the 5 districts match their named representative's actual
configured territory.

- Kunz is configured for TW1-TW10 (West London), not CM1.
- Naseh is configured for UB1-UB5 (West London), not IG1.
- Saif is configured for HA0-HA5 (West London), not RM1.
- Tahira is configured for WD3-WD7 (a different area), not DA1.
- Hassan is configured for EN1-EN5, not BR1.

Additionally, **RM1 is already owned by Nauman** from the completed first campaign wave (109
usable leads already processed and delivered against RM1 as part of Nauman's real, accepted
territory) — running a fresh RM1 discovery under Saif's name would create a duplicate, conflicting
ownership of the same postcode district.

### Next action

Requires the owner to confirm one of: (a) the district list was correct and the rep/region
pairings need correcting in the message, (b) the rep/region pairings were correct and the district
list needs correcting, or (c) some other resolution for RM1 specifically (e.g. substitute a
different district, or explicitly reassign RM1 knowing it duplicates Nauman's existing territory).
No implementation work should touch `sales-territories-v2.json` or begin live discovery for any of
the 5 named districts until this is confirmed.

### Resolution (2026-08-03)

The owner supplied a new, explicit five-district allocation for a NEW campaign (CM1→Kunz,
IG1→Naseh, RM1→Saif, DA1→Tahira, BR1→Hassan, all with exact Sales Pro representative
values/emails and Region/Route), with an explicit RM1 special rule: Nauman's historical RM1
ownership and already-released leads remain completely unchanged; newly discovered RM1 leads
belong to Saif for this new campaign; any business already present in Nauman's previously-released
RM1 output must be deduplicated against and never released again under Saif.

Implemented as a new, additive, versioned campaign config —
`config/lead-production/campaigns/campaign-002-five-district-pilot/territories.json` — loaded and
validated by the new `scripts/lead-production/campaign-territory.ts` (fail-closed on any unlisted
district, exactly the same philosophy as `assertDistrictIsConfigured()`). `sales-territories-v2.json`
was NOT modified (verified byte-for-byte identical before/after, see
`scripts/test-lead-production-campaign-territory.ts`). Cross-campaign deduplication is a new
capability (`dedupeAgainstHistoricalCampaign()` in `district-reconciliation.ts`, loader in
`historical-campaign.ts`) that checks freshly-discovered RM1 candidates against Nauman's real,
already-released "Operationally Usable Leads" (read-only reference data, never itself modified)
using the same tiered identity-evidence hierarchy already used for cross-district dedup. 10/10
of the owner's required regression tests pass, including against real historical RM1 data (41 real
Nauman RM1 leads). Full detail: `docs/09_DECISIONS.md` (2026-08-03 entry).

## ISS-0034 — Existing Magna customers found in the released five-district-pilot output (board escalation)

Date: 2026-08-03
Severity: **Critical — real existing customers were released as "new leads" to representatives.**
Owner: Zoeb (escalated from a board review)
Status: **Resolved 2026-08-04 (entity-resolution configuration audit, second follow-up).** Full
reconciliation as of 2026-08-04: 20 confirmed customer matches found and removed, 0 remaining
anywhere releasable; 12 probable matches held total, 2 released under an explicit owner-directed
audit-warning override (Spice Hut, PHAT Buns), 0 remaining unaccounted for; 165 leads cleared;
**167 final released leads**. A critical self-inflicted account-code feedback-loop bug was found
and fixed before it ever reached a released output — see the second 2026-08-04 update below. Full
technical detail: `docs/10_BUGS_AND_FIXES.md` (2026-08-03 and both 2026-08-04 entries).

### Problem

The customer-suppression system exists specifically to guarantee this can never happen (`hard-
gates.ts`'s `not_an_active_magna_customer` gate, and the more comprehensive `customer_master_
exclusion` terminal-bucket rule added 2026-07-24 — `docs/09_DECISIONS.md`), yet 2 real, currently-
active-or-inactive Magna customers were released as ordinary new leads in the five-district-pilot
output that had already been reviewed by the board:
- IG1-21A3E429 "Al Qasr Restaurant" = customer A632 "Al Shukraan Ltd T/A Al Qasr Restaurant"
  (inactive lifecycle).
- BR1-0FA2C0D7 "Munchies Peri Peri- Bromley" = customer M289 "IH Trading Kent Ltd T/A Munchies
  Peri Peri" (inactive lifecycle).

### Investigation

First established the pilot's ACTUAL customer-master file (`magna-customers.csv`, verified via MD5
match to `configHashes.customers` in every district's `.orchestrator-run-manifest.json`) did not
match the file at the "expected path" the investigation brief named (`magna-customers-master.csv`
— a different, older file with no genuine Inactive lifecycle flag that the pilot never actually
read). The real file was then independently re-verified against all 177 previously-released usable
leads using a from-scratch comparison (not trusting the pipeline's own match result), surfacing
the 2 real leaks above plus 2 correctly-ambiguous cases (see below).

### Root cause (5 defects, all fixed — see `docs/10_BUGS_AND_FIXES.md` for full technical detail)

1. A trailing comma in ~7% of real customer postcodes (a NetSuite export artifact) silently broke
   postcode normalisation entirely.
2. The customer master's "Office Phone"/"Invoice WhatsApp Number"/"Invoice Email Address" columns
   were never loaded or compared — only the single primary "Phone"/"Email" columns were.
3. `run-final-scoring-stage-v2.ts` hardcoded `domain: null` in its materiality-check call, making
   an already-built domain-matching capability permanently dead code in production.
4. (found while proving the fix) The core matcher's phone-conflict floor could be cleared by a
   bare shared town/area word alone — an over-exclusion risk in the opposite direction, but
   explicitly required as a regression case by the audit brief.
5. (same category) Domain-alone matches were confirmed unconditionally, contrary to the explicit
   "domain plus corroborating name/postcode" rule.

### Resolution

All 5 defects fixed; 2 new regression-test suites added (40 assertions total, including both real
leaked cases as permanent fixtures — they can never be released again without a test failure). A
new independent pre-release leakage verifier (`scripts/lead-production/verify-customer-leakage.ts`)
was built specifically so a future bug in the main matching pipeline cannot also hide itself from
detection — it does not reuse the main matcher's logic. Run against the corrected, fully
reprocessed 5-district pilot (zero live provider calls throughout): **PASS, 0 confirmed leaks**,
2 correctly-flagged probable/held cases for human review (never silently excluded, never silently
released). Released usable count 177 → 175. Full audit workbook:
`/Users/homemac/Downloads/campaign-002-existing-customer-leakage-audit.xlsx`; certificate:
`/Users/homemac/Downloads/campaign-002-zero-leakage-certificate.json`.

### Outstanding

The owner-review workbook (15-sheet audit pack) and CTO-review file were regenerated to reflect
the corrected 175-lead population where already covered by existing generator scripts; the owner-
review pack's OWN regeneration for this specific correction pass was not re-run in this turn (out
of scope for the time available) — flagged so it isn't silently assumed current.

### Update (2026-08-03, same day, follow-up) — wrong authoritative source used for the original audit; re-verified

The owner flagged that the customer file used for the audit above
(`/Users/homemac/Data/aspectlead-lead-production/input/magna-customers.csv`, 7925 rows) was NOT
the file the owner had actually supplied as authoritative
(`CustomersProjects81.csv`, 8050 rows, 4558 active/3492 inactive). Confirmed via SHA-256 — the two
files are genuinely different (`86413f03...` vs `f1b23cce...`). The board-escalated result above
was therefore run against the wrong source file and had to be independently re-proven, not merely
assumed still valid.

**Re-verification result:** reran the full pilot against the authoritative
`CustomersProjects81.csv` (versioned snapshot, checksum-verified, see
`/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/`). The released
usable-lead-ID set came back byte-identical to the earlier (wrong-file) result — same 175 leads,
same 2 real leaks (Al Qasr Restaurant, Munchies Peri Peri- Bromley) correctly excluded. The
original PASS conclusion held, but had not been formally proven against the right file until this
pass.

**3 further real defects found and fixed** while extending the verifier's identifier coverage
(trading-name aliases, full address, company/legal name) to close remaining gaps the audit brief
required — all 3 were false-positive risks in the NEW routes themselves, caught before they could
ever reach a certificate: an exact T/A alias alone (e.g. "Spice Hut", shared by 5 unrelated
customers) was wrongly auto-confirmed; an exact address match alone (e.g. "Kings Diner" occupying
the same premises as an unrelated customer "Madoona's Ltd T/A Morley's") was wrongly auto-
confirmed; a shared brand-wide domain with no geographic agreement (e.g. "PHAT Buns - Romford" vs
a different-company, different-town franchisee "Cha Sha Hounslow Ltd T/A Phat buns hounslow") was
wrongly auto-confirmed. All 3 now correctly require the same corroboration/geographic-gate
discipline already used elsewhere in this codebase.

**Final result:** PASS across Master, CTO, and all 5 Sales Pro exports — 0 confirmed leaks, 9
correctly-held probable/review cases. The owner-review workbook (previously flagged Outstanding
above) was regenerated in this same pass — no longer outstanding. Full detail:
`docs/10_BUGS_AND_FIXES.md`, `VERIFY_BEFORE_CLAIMING.md` (2026-08-03 follow-up entries). Certificate:
`/Users/homemac/Downloads/campaign-002-zero-customer-leakage-certificate.json`.

### Update (2026-08-04) — reconciliation-count contradiction resolved; entity-resolution configuration audit; 3 further defects found and fixed

The owner flagged an apparent contradiction in the 2026-08-03 reporting: "2 confirmed leaks" (Al
Qasr, Munchies) was reported separately from "0 confirmed, 9 probable... the 2 above" — the second
"2" silently referred to a DIFFERENT pair (Franzos - Ilford, Chocoberry - Ilford) without ever
disambiguating the reuse of "2". Resolved by producing one reconciliation table, counted by
distinct lead (not by lead-customer candidate pair — a single lead can genuinely match several
customer records, e.g. real case "Morley's Downham" matches 14 separate NetSuite accounts) across
the FULL population every candidate ever passed through (Usable + Held-Review + Customer Master
Exclusions, 255 leads), independently re-derived rather than trusted from any sheet's placement.

**3 further real defects found and fixed** (full technical detail in
`docs/10_BUGS_AND_FIXES.md`'s 2026-08-04 entry):
- Probable matches were report-only and never actually removed from the releasable population
  (5 probable leads still present in "Operationally Usable Leads" at the time of the 2026-08-03
  report) — fixed with `hold-probable-customer-matches.ts`.
- Exact-postcode candidates with weak name correspondence were silently dropped with no record at
  all, rather than an explicitly-resolved "cleared" candidate — violating the "postcode is a
  mandatory trigger, never silently unresolved" rule (never release-blocking, but an audit-trail
  gap) — fixed by extracting a shared per-pair evaluation function, zero behavioural change to the
  release decision (all 30 then-existing test suites re-ran green immediately after the refactor).
- A genuinely CONFIRMED customer match (IG1-202F5195, "Monster Burger" — exact trading-name alias
  + exact postcode against inactive customer F362) was sitting in Held-Review, not Customer Master
  Exclusions, held there by an earlier unrelated pipeline stage's own "business-name-overlap"
  flag from before this session's alias+postcode confirmation rule existed. Never
  release-blocking, but a real categorisation defect — fixed with
  `exclude-confirmed-customer-matches.ts`, which scans BOTH Usable and Held-Review rather than
  trusting either sheet's placement.

**Entity-resolution configuration audit:** documented every matching algorithm's actual
implementation (source file, function, normalisation rules, thresholds — see the new "Entity
Resolution Configuration" sheet) and built a 20-case hand-labelled calibration set (7 real pilot
cases, 5 real true-negatives, 8 synthetic engineered cases) achieving 100% precision/recall on
CONFIRMED decisions, 0 false positives/negatives — explicitly caveated as a small hand-curated set,
not a statistically powered sample.

**Final reconciliation (distinct leads, highest tier wins, 255-lead full population
independently re-checked):**
1. Confirmed found: 20
2. Confirmed removed: 20
3. Confirmed remaining in any releasable output: 0
4. Probable held: 7
5. Probable remaining in any releasable output: 0
6. Cleared leads: 170
7. Final released leads: 170

The leakage-audit workbook now has 18 sheets (9 new this pass: Entity Resolution Configuration,
Phone/Postcode/Address/Fuzzy-Name Trigger Candidates, Calibration Results, False Positive/Negative
Controls, Customer Match Reconciliation, Confirmed & Probable Detail). Certificate regenerated
with the new documentation fields (trigger rules, algorithm/threshold summary, calibration
results, `zeroConfirmedOrProbableRemaining: true`). All 31 `test:lead-production-*` suites
individually re-run, ALL PASSED; `npm run typecheck`/`build` clean. The owner-review pack's OWN
regeneration for this specific correction pass was NOT re-run in this turn (Held-Review/Customer
Master Exclusions row counts in that workbook are one pass stale — 66/19 vs the corrected 65/20;
the Usable/CTO/Sales Pro population itself is unaffected, unchanged at 170) — flagged so it isn't
silently assumed current.

### Update (2026-08-04, same day, second follow-up) — component-level address/fuzzy-name matching added; a self-inflicted account-code feedback-loop bug found and fixed before reaching any released output; canonical Master clarified; calibration expanded to 103 cases

Four owner-directed gaps closed this pass: (1) component-level address matching, replacing whole-
string comparison, which real data proved was over-matching two genuinely different building
numbers on the same street ("Kings Diner" vs. its old assumed match, 439 vs 453 Downham Way — now
correctly not a material candidate on address alone); (2) Damerau-Levenshtein fuzzy name matching
(candidate-generation/corroboration-support only, never confirms alone); (3) the canonical Master
now carries structured customer-match evidence (Matched Customer Name, Matched Customer Account
Code(s), Customer Match Evidence, Customer Master Checksum) on every held/excluded row, and a
stale "Final Outcome" companion column is corrected; (4) the calibration set grew from 20 to 103
labelled cases (80 calibration / 23 holdout), 100% precision/recall on both subsets, thresholds
never adjusted after seeing holdout results.

**Critical self-inflicted bug found and fixed before any release:** the first version of the
canonical-Master annotation script wrote matched account codes into the EXISTING "NetSuite
Customer Account Code" column — which the matcher also reads as an independent, decisive
identity-matching INPUT. This created a feedback loop: the next trace run read its own annotation
back as genuine evidence, silently upgrading probable (and even already owner-cleared) leads to
CONFIRMED. The artifact reached a real SalesPro export CSV (PHAT Buns - Romford, already cleared
under this pass's own item-5 re-evaluation) and was caught by the independent verifier
(`salesProResult: FAIL`) before ever being handed to a representative. Fixed at the root (report
evidence now written to a NEW, non-input column only) and at the data layer (32 corrupted Master
rows and 2 corrupted SalesPro cells blanked, the full hold/exclude/clear/annotate chain re-run
from the corrected state).

**Re-running the improved matcher surfaced 5 genuinely new probable matches** never caught by the
earlier (weaker) matcher: "JK FRIED CHICKEN", "The Grill Bros" (component-address evidence —
same premises, different operator), "Grilled Peri Peri Ilford", "Chicken Hut Ilford", "Ben's
Fried Chicken" (fuzzy-name evidence) — all correctly held and removed from their SalesPro exports.

**Spice Hut and PHAT Buns re-evaluated and cleared** per the owner's explicit item-5 rule (generic
alias/shared-domain-only evidence, no postcode/phone/address/legal-identity match) — released back
to Operationally Usable Leads with a permanent, human-readable audit warning on the row. The
release-gate reconciliation is now override-aware: an explicitly audit-warned release is reported
as its own distinct measure, never counted as an unresolved leak, never silently hidden either.

**Final reconciliation (255-lead full population):** 20 confirmed found and removed (0 remaining
anywhere releasable), 12 probable held total — 2 released under explicit owner override, 0
remaining unaccounted for — 165 cleared, **167 final released leads**.

All 35 `test:lead-production-*` suites (6 new this pass) individually re-run, ALL PASSED; `npm run
typecheck`/`build` clean. Full technical detail: `docs/10_BUGS_AND_FIXES.md`, `docs/09_DECISIONS.md`,
`VERIFY_BEFORE_CLAIMING.md` (2026-08-04 second entries). Certificate:
`/Users/homemac/Downloads/campaign-002-zero-customer-leakage-certificate.json` — PASS across
Master/CTO/Sales Pro.

### Update (2026-08-04, third pass) — pre-push acceptance verification: derived-field isolation proven, owner overrides formally recorded, customer-master pin fail-closed validator built, full 524-candidate reconciliation

Pure verification pass (no new defects found) plus one new capability. Proved, with a dedicated
regression test (`test-lead-production-source-vs-derived-fields.ts`), that customer matching reads
only legitimate source identity fields — poisoned every derived/audit field (Matched Customer
Name, Matched Customer Account Code(s), Customer Match Evidence, Magna Customer Match Status,
Final Outcome, Customer Match Audit Warning, Customer Master Checksum) on a genuinely clear lead
with values that would be decisive evidence if read as input, reran the full matcher and hold/
exclude script chain plus an export-to-CSV-and-reimport round trip, and confirmed the decision
never changes; also statically confirmed none of the 5 production lead-mapping functions read any
derived field as a matching input.

Recorded the 3 explicit owner-override decisions as dedicated, structured, non-algorithmic-looking
columns (`record-owner-overrides.ts`): Spice Hut and PHAT Buns - Romford —
`released_with_owner_override`; Kings Diner — `held_with_owner_override` (its own current
algorithmic evidence is "clear (no material finding)" — the component-address fix already
established the two premises are different buildings; it remains held purely by explicit owner
instruction, honestly recorded as such, never dressed up as an algorithmic hold). Every override
now appears individually in the certificate JSON and a dedicated "Owner Override Decisions"
workbook sheet — Lead ID, independently re-derived original algorithm decision, owner decision,
reason, timestamp, checksum, reviewer, evidence retained.

Built a fail-closed validator (`validate-customer-master-pin.ts`) for the existing versioned
customer-master pointer (`campaign-002-customer-master-pointer.json`) — re-derives checksum, row
count, and active/inactive lifecycle totals from the file the pointer actually references and
refuses to certify it on any mismatch, or on any missing referenced identity-index/alias/manifest/
quality-report file. Real pointer validated clean: checksum, 8050 rows, 4558 active / 3492
inactive, all referenced files present.

Full population reconciliation: all 524 canonical pilot candidates across the 7 disjoint sheets
(167 released + 20 confirmed exclusions + 68 Held-Review [11 customer-match-related: 10
algorithmic + Kings Diner's owner-held override, 57 unrelated hold reasons] + 98 hard rejections +
67 group exclusions + 77 commercial/brand exclusions [including the 1 phone exception] + 27
business-category exclusions = 524). Verified by Lead ID (matched by trading name + postcode for
CTO, which carries no internal Lead ID field): all 20 confirmed exclusions and all 11 held/owner-
held cases are absent from CTO and every Sales Pro export; the 2 owner-released overrides are
present in both, individually listed in the certificate, retaining their original evidence.

All 39 `test:lead-production-*` suites (4 new this pass) individually re-run, ALL PASSED; `npm run
typecheck`/`build` clean. Commit `d5a454b`. Not pushed.

## ISS-0035 — Just Eat public discovery endpoint (`uk.api.just-eat.io/restaurants/bypostcode/{code}`) now returns 404 for every postcode — blocks all new live discovery (2026-08-04)

### Status
**UNRESOLVED / BLOCKING.** Discovered during the first live production call for campaign-003
(Kunz full allocation), district CM0. Confirmed provider-side, not local.

### Problem
`npm run je:run -- "CM0"` completed with `completed_with_warnings`: 1/1 outcode query failed, 0
outlets, 0 observations. The pipeline's own internal retry-on-failure (2 attempts, 750ms apart, on
403/429/5xx/network error — `fetchJustEatSearchRaw` in `src/lib/sources/just-eat.ts`) already ran
and still failed both times. A full second `je:run -- "CM0"` (a fresh execution — not blocked by
the 24h duplicate-run guard, since `completed_with_warnings` is not in its blocker-status list)
produced the identical result.

### Investigation
Direct `curl` against the live endpoint confirmed the true HTTP response: `404 {"message":"uri not
found"}` for **every** postcode tested — `CM0`, `CM1`, `UB1`, `TW1`, `RM1`, a full postcode
(`SW1A1AA`), and a percent-encoded full postcode. This is not district-specific: the exact endpoint
call that produced 94 real consolidated candidates for CM1 as recently as 2026-08-02 (discovery
run `ff0ad42a-65d5-49cb-9bb9-bf67826d93bd`, 170 raw observations, status `completed`) now 404s for
that same district. General internet connectivity confirmed working (`google.com` → 200); the
`uk.api.just-eat.io` domain itself is alive and Cloudflare-fronted (root → 302, real
`x-je-conversation` header present on the 404 responses) — only the specific
`/restaurants/bypostcode/{code}` path is gone. Regression window: worked 2026-08-02, broken by
2026-08-04.

### Separate defect noted, not fixed (out of scope for this pass — no pipeline redesign authorised)
`src/lib/discovery-engine/worker/execute.ts`'s failed-query branch (~line 108) increments the
`failed` counter but never persists `result.error` (the actual HTTP status/error string returned by
the adapter) anywhere — not to `je_executions.error`, not to `metrics`, not to console. The
`je_executions.error` column read back for CM0's execution was `null` despite a real, diagnosable
failure having occurred; the only trace was the generic `"N outcode query/queries failed"` warning
string. This made root-causing the CM0 failure from the database alone impossible — the actual
reason had to be independently re-derived via a direct `curl` against the live endpoint. Worth
fixing in a future pass (capture `result.error` into the execution record) — not attempted here per
the explicit "do not redesign the pipeline" constraint on this run.

### Impact
Just Eat is the only approved lead-discovery source for campaign-003 (Kunz full allocation) and
for the wider pipeline generally. With this endpoint down, **no new district can be discovered
live** — this blocks CM0 and, by the same mechanism, would identically block CM2–CM9. Established
safe-retry rules (internal adapter retry + a full fresh run) were exhausted before this was
recorded as a hard failure, per instruction not to fabricate an empty successful result. CM0's two
discovery runs (`cbc25500-9c15-4955-9a33-a8c0d88606c2`, `d64f1663-3716-41f7-838e-119577c7fe1d`)
remain in Supabase, `status=completed_with_warnings`, as an honest record — not deleted, not
resubmitted as if they succeeded.

### Update (2026-08-04, same day, recovery pass) — replacement endpoint independently verified, versioned adapter built, ISS-0035 error-persistence gap fixed, CM0 recovery pilot succeeded live

Owner explicitly authorised a narrowly-scoped recovery investigation (not a pipeline redesign).
Findings:

**Legacy endpoint reconfirmed dead.** `curl` matrix against `/restaurants/bypostcode/{code}` —
CM0, CM1, TW1, RM1, each as full postcode (with/without space) and bare outcode — 404 `"uri not
found"` in every case, timestamped 2026-08-04.

**Live site inspected via a real browser session** (no CAPTCHA/anti-bot bypass, no private
session tokens reused). The consumer site (`www.just-eat.co.uk`) geocodes a full address via
Google Places, then server-side-renders an `/area/{postcode}-{town}` results page — no client-
visible XHR for restaurant data (SSR), and the HTML site itself is Cloudflare-bot-protected
(confirmed via a deliberately-unauthenticated `curl`, which was correctly blocked — not
circumvented). This confirms the lawful, scriptable surface remains the separate
`uk.api.just-eat.io` API host, not the protected consumer HTML site — consistent with the
existing code's own documented acquisition method.

**Candidate endpoint verified live and materially equivalent.**
`https://uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode/{postcode-or-outcode}` —
HTTP 200, no auth, on the same lawful `uk.api.just-eat.io` host. Response headers show
`api-supported-versions: 3`, `api-deprecated-versions: 2` — direct provider-side confirmation
that this is a genuine, intentional API version migration, not an unrelated outage. Accepts a
bare outcode/district (e.g. `"CM1"`) and returns the FULL district set in one call
(`metaData.resultCount === restaurants.length`, verified up to 677 records for RM1, no
pagination observed) — the existing one-query-per-district planning strategy required no
change. **CM1 comparison against the stored campaign-002 pilot: 170/170 restaurant IDs match
exactly — 0 only-in-old, 0 only-in-new.** All required field equivalents present at 100%
completeness across the 170-record sample (id, name, address, postcode, coordinates, cuisines,
rating, rating count, delivery/collection, availability) except brand/is-brand, which has no
equivalent in the new schema at all (0/170) — recorded honestly as a permanent gap, never
inferred from the trading name. An unrecognised postcode returns HTTP 200 with
`canonicalName`/`location` both `null` — a distinguishable "not found" signal the new adapter
checks explicitly, never conflated with a genuine empty district.

**Versioned adapter built** (`JustEatEnrichedAdapter`,
`src/lib/discovery-engine/just-eat/adapter-v2.ts` + `parse-v2.ts`,
`src/lib/sources/just-eat.ts`'s new `fetchJustEatEnrichedRaw`) — a separate, additive class and
parser, not an in-place edit. The legacy `JustEatAdapter`/`fetchJustEatSearchRaw`/`parse.ts`
remain byte-for-byte unchanged and re-verified passing (`npm run test:je-stage1`) as the
historical record of what campaign-002's CM1 pilot actually called. `execute.ts`'s default
adapter now points at the new class (the only "swap" made — every other file additive).
14 fixture-driven regression tests added (`scripts/test-je-enriched-adapter.ts`, `npm run
test:je-enriched-adapter`) covering valid/empty/unrecognised-postcode responses, 400/401/403/
404/429/500/malformed-JSON/network-error, unrecognised-schema fail-closed, one-query-per-
district planning, cross-query-point deduplication, and postcode-outside-district
classification — all passing.

**ISS-0035's own error-persistence gap fixed.** `execute.ts` now builds a sanitised
`last_failure` object (endpoint version, request type, HTTP status, provider error code,
message, retry count, query point, timestamp — never headers/cookies/auth tokens) on every
failed query, surfaces it in `metrics.last_failure`, and persists it into the execution's own
`error` column at finish (previously always `null`). Proven by a dedicated regression test
that a 429 failure is retained in full, not discarded.

**CM0 recovery pilot run live, discovery + geography validation only** (`npm run je:run --
"CM0"`, new run `331414d5-5be2-41bb-9317-73089718e0d5`): `status=completed`, 1/1 outcode, 0
failed queries, 4 outlets discovered, 4 observations, 0 duplicates. Geography validation: 2
`valid_geography` (physically in CM0 — "Domino's - Burnham on Crouch", "Curry Cottage"), 2
`out_of_scope_geography` (serve CM0 but sit elsewhere) — the existing, unchanged geography gate
correctly separated them; only the 2 valid ones reached `consolidated_candidates`. Stopped here
as instructed — no Google/website/FSA/Companies House calls made, no enrichment run, CM1 not
combined, no Kunz files created.

`npm run typecheck`/`build` clean. All 41 suites individually re-run (39 `test:lead-production-*`
+ `test:je-stage1` + the new `test:je-enriched-adapter`), ALL PASSED.

### Not yet done
CM2–CM9 not yet run with the new adapter (owner review of this recovery pass requested first,
per the authorising instruction's step 8/10). Root cause of Just Eat's OWN reason for retiring
version 2 of this API was not investigated beyond the header evidence above (out of scope — no
access to Just Eat's internal systems). No new commits pushed (3 campaign-003 config commits
remain local as before; this pass's code/doc changes are also uncommitted, awaiting instruction).

### RESOLVED (2026-08-04, same day, owner approval) — endpoint recovery pushed; CM0–CM9 run live end-to-end using the new adapter

Owner reviewed and approved the recovery. Pushed to `origin/feature/mvp-vertical-slice-001`
(commit `50c59ea`, local=remote verified). Then ran the full campaign-003-kunz-full-allocation
population live using the new `JustEatEnrichedAdapter`: CM0 continued from its existing
discovery-only checkpoint (integrity re-verified, not rerun); CM2–CM9 discovered fresh and run
through the complete 8-stage `run-full-territory.ts` pipeline (Phase 1 comparison, FSA, Google
Places, Companies House, website, public-profile, group-rescreen, final scoring v2), all live,
all clean (no adapter errors, no fail-closed schema rejections). Full per-district results
recorded in the final report this pass produced (see `PROJECT_STATUS.md` for the summary).

Two further genuinely new findings from this run, both fixed before release:

1. **Discovered a real defect in my own campaign-003 export invocation, not the adapter**: passed
   the postcode-district list ("CM0, CM1, ...") as `--sales-territory=`, which flows straight
   into the CTO's "Region/Route" column — should have been "East London" (Kunz's actual named
   route, per `sales-territories-v2.json`/`territories.json`). Caught via a spot-check before
   release, not by any test (no test covers this specific field mapping) — worth a regression
   test in a future pass. Root cause: `generate-master-export.ts`'s `--territory-manifest=` mode
   silently overrides the CLI `--sales-territory=` with the manifest JSON's own `salesTerritory`
   field — the CLI flag is not a fallback, it is simply ignored whenever a manifest is supplied.
   Not fixed in the script itself (a genuine documentation/UX gap, not incorrect behaviour) — the
   manifest file itself was corrected instead, and both affected exports (CM1, CM0+CM2-CM9) were
   regenerated and re-verified.

2. **`generate-owner-review-pack.ts` was hardcoded to campaign-002-five-district-pilot's fixed
   5-representative/5-district shape** (`DISTRICT_REP`/`DISTRICT_TO_REP_DIR` constants, and an
   unconditional read of RM1's phase1 checkpoint for its own cross-campaign-dedup history) — it
   could not run at all for a representative owning 10 districts. Fixed with two small, additive,
   backward-compatible changes: (a) a repeatable `--district-rep=DIST:Name` CLI flag that extends
   `DISTRICT_REP`/`DISTRICT_TO_REP_DIR` at runtime (omitting it leaves campaign-002's own
   regeneration byte-for-byte unchanged — reverified via `npm run test:lead-production-owner-review-pack`,
   all assertions still pass, including the real 42-row RM1 Historical Duplicates recovery);
   (b) `buildHistoricalDuplicates()` now checks for the "RM1 Historical Duplicates" sheet's
   existence before reading it, rather than throwing when a later campaign's combined workbook
   (correctly) has no such sheet at all. `--rm1-phase1-dir=` is now optional or the same reason.

Also built one new, additive, campaign-003-specific glue script,
`generate-kunz-full-allocation-master.ts`: `generate-campaign-master-combined.ts` applies exactly
ONE `--campaign-id=` per invocation, but Kunz's final population genuinely spans two source
campaigns (CM1 = campaign-002, reused verbatim; CM0/CM2–CM9 = campaign-003). The new script does
the one remaining step — a read-only, row-preserving concatenation of two already campaign-tagged
combined workbooks (each produced by the existing, unmodified `generate-campaign-master-combined.ts`,
run once per source campaign) — re-deriving and re-scoring nothing. It also reconstructs a genuine
one-row-per-real-district "Representative Summary" sheet from the merged candidate rows' own
"Postcode District" values, since `generate-master-export.ts`'s own multi-district territory-
manifest mode collapses that into one joined-string row (not usable by the owner-review pack's
per-district Pilot Summary). Two sub-splits that the upstream disjoint sheets no longer retain
separately post-merge (Held-Review's Phone-Resolution-Exception/Business-Category-Review-Required
components; Commercial-Review-Exclusions' Brand vs Pharmacy/Chemist split) are reported as 0 in
that reconstructed sheet, honestly, per this codebase's established "leave blank rather than
guess" convention — the combined totals they roll up into are unaffected and fully accurate.

Final reconciliation (all 10 districts, CM0–CM9, 280 total candidates after within-campaign
cross-district dedup — 4 duplicates removed, all exact-phone matches within a single district's
own Just Eat listing, not genuine cross-boundary premises): 121 final released leads (83 Premium
Level 0 + 38 Releasable Level 1, 13 of which are also Key Accounts), 31 Held-Review, 46 Hard
Rejects, 5 Customer Master Exclusions, 44 Excluded Groups, 29 Commercial Review Exclusions, 4
Business Category Exclusions — sums to exactly 280. Independent customer-leakage verification:
0 confirmed leaks in Master or CTO (PASS), 3 probable/non-blocking matches reported for owner
review (all involving one CM2 candidate, "Kaspa's Desserts - Chelmsford", sharing only a website
domain — not a trading name, postcode, phone, or company number — with 3 unrelated customer
records; consistent with a shared ordering-platform domain, not common ownership, but not
independently confirmed either way by this pass).

All 41 suites (39 `test:lead-production-*` + `test:je-stage1` + `test:je-enriched-adapter`)
individually re-run, ALL PASSED; `npm run typecheck`/`build` clean. Full 24-item final report:
see this session's conversation record / `PROJECT_STATUS.md`.

### Owner-decision review completions (2026-08-04, same day) — Kaspa's customer-match resolved algorithmically, certificate corrected to lead-level, Hot-Lead audit found and fixed a genuine 7-lead urgency-classification defect

**Kaspa's Desserts - Chelmsford (CM2-36E572FF) resolved.** All 3 "probable" leakage findings trace
to one lead, three candidate customer records (D298/F458/S612), every signal limited to shared
`kaspas.co.uk` domain + differing trading name — no phone/postcode/address/legal-identity
corroboration; the 3 customer records are in three different UK regions (Norbury, Reading x2)
from the Chelmsford lead. Classified `cleared_non_customer_with_audit_warning` per the owner's
existing item-5 rule (never a confirmed exclusion, hold, or override). Master row annotated
(`Magna Customer Match Status`, `Customer Match Confidence`, `Existing Customer Warning`, new
`Customer Match Audit Warning` column) via the two campaign-tagged source workbooks, then
re-merged/re-exported. Commercial-chain check (stored evidence only, no live calls): no entry for
"Kaspa's"/"kaspas.co.uk" in the commercial-review-v1 brand registry or group-registry.json; the
pipeline's own stored Google/Companies House classification for this candidate is `Independent`/
`ownership_unresolved` — not confirmed as an excluded chain. Retained as released, no registry
entry added (would require owner confirmation beyond stored evidence).

**`verify-customer-leakage.ts` corrected to report at LEAD level, never candidate-record level.**
Exported `isOnlyGenericAliasOrUncorroboratedDomain` from `reevaluate-and-clear-probable-matches.ts`
(single source of truth, not duplicated) and added `groupFindingsByLead`/`classifyProbableLeads`
(both exported, both independently re-derive from the raw customer master every run — never trusts
a stored Master-row status field). Certificate now reports `probableMatchCount` (raw candidate-
record count), `probableLeadCount`, `clearedLeadCount`, `unresolvedProbableLeadCount`, and
individually-recorded `clearedMatches`/`unresolvedProbableLeads` arrays. `masterResult` now FAILs
on any unresolved probable lead remaining released, not only on a confirmed leak. 2 new regression
tests added (`test:lead-production-customer-leakage-verifier`, cases 12-13) reproducing the real
Kaspa's case and a mixed-evidence refusal case. All existing tests (including the real 5-district
campaign-002 certificate proof) re-verified unchanged.

**Hot Lead audit found a genuine classification defect.** Verified all 62 original Hot Leads
against the 5 owner-approved criteria (key account, major catering, multi-site/franchise, ≥300
Google reviews, exceptional financials) using the raw stored checkpoints (website-stage
`franchise_group_clues`/`branch_count`, Companies House group-rescreen `classification`), not
just the exported Master columns (which under-reported branch/franchise evidence for some leads).
55 of 62 confirmed genuinely evidenced. **7 had zero evidence for any criterion** (Suraya Tandoori
CM1-686B4496, El Chigre CM2-02B69364, Cucina Italiana CM5-4F19B4C2, The Ruby CM7-04851C50, Tamim's
Indian Takeaway CM7-9A34B84E, Moonlight Balti Express CM9-96D53B5E, Ruby's Indian Cuisine
CM9-881E1995) — all confirmed via raw checkpoints: Companies House `ownership_unresolved`, no
website franchise clues, branch_count <3, reviews <300, financial band "Insufficient Data", not a
key account. **Root cause not yet identified** — `master-field-resolver.ts`'s own urgency logic
(read in full, matches its documented intent exactly) should not have produced Hot for these 7
given this evidence; a field-mapping discrepancy between the dossier's internal scoring inputs and
what reaches the exported Master columns is suspected but not confirmed. Reclassified to Warm Lead
via the same source-workbook-patch mechanism as the Kaspa's fix (new `Urgency Reclassification
Note` column, audit trail preserved, nothing silently changed). Revised totals: 55 Hot / 66 Warm /
0 Standard (was 62/59/0). New "Urgency Decisions" sheet added to `generate-owner-review-pack.ts`
(16th sheet; existing 15-sheet regression test updated + extended, re-verified passing).

**Not yet done:** the root cause of the 7-lead Hot-classification discrepancy needs a follow-up
investigation (comparing the dossier's raw internal fields against what `generate-master-export.ts`
writes to the Master for `google_review_count`/`financial_strength_band`/`branch_list` specifically)
before this defect can be considered closed — currently patched at the output layer only, not fixed
at the source. Logged here for a future session.

All 41 suites (39 `test:lead-production-*` + `test:je-stage1` + `test:je-enriched-adapter`),
typecheck, build clean. No commits made this pass — `generate-owner-review-pack.ts`,
`reevaluate-and-clear-probable-matches.ts` (one function made exportable, no behaviour change),
`verify-customer-leakage.ts`, and the 2 updated test files remain uncommitted, awaiting report.

### Volume-classification audit and fix (2026-08-04, same day) — replaced a binary "high volume" threshold with evidence bands; fixed a genuine defect (2275-review lead labelled identically to a 126-review lead)

**Audit found two independent binary thresholds, both in `master-field-resolver.ts`, giving
inconsistent "high volume" language:** `hasHighVolumeEvidence` (feeds Hot-Lead urgency) used
`google_review_count >= 300`; Note 2's "High-volume indicator" bullet and its "position volume-
based pricing" call-approach line both independently used `>= 100`. Neither was banded — a lead
with 126 reviews and a lead with 2275 reviews received the byte-identical Note 2 wording
`"High-volume indicator: N Google reviews."`, and a lead with exactly 400 reviews and NOTHING
else became Hot purely off that one number (confirmed: "Angel - Chelmsford", 2275 Google
reviews, 0 other signal, was genuinely Hot before this fix). Just Eat's own `rating_count` (a
real, larger-magnitude, independent signal — confirmed via Supabase: some Kunz candidates have
2,700-3,700+ Just Eat ratings against under 150 Google reviews) was never captured into any
dossier field this resolver can read, so it was never mixed with Google's count — but also never
used at all.

**Fix (`master-field-resolver.ts`):** added `classifyReviewVolumeBand()` — 5 bands grounded in
the real observed distribution across Kunz's 121 released leads (min 1, median 132, p90 425, p95
541, max 2275): Low 0-49 (26 leads), Moderate 50-149 (39), Strong 150-399 (43), Very Strong
400-999 (9), Exceptional 1000+ (4). Added `isHighVolumeOperation()` — a genuinely stronger claim
than a review band alone: requires EITHER direct operational-scale evidence (catering/bulk-order,
or multi-site/franchise/group structure) OR at least 2 independent supporting signals together
(e.g. Very Strong/Exceptional review band + exceptional filed-accounts financials) — a review
count alone, however large, is never sufficient by itself, per the owner's explicit rule.
`hasUnusuallyStrongOpportunity` (Hot-Lead urgency) now uses `isHighVolumeOperation()` instead of
the flat `>=300` check. Note 2's bullet is now `"Review volume: <Band> (<N> Google reviews) —
supporting evidence only, not itself proof of bulk/wholesale purchasing volume."` (Low band not
called out at all — uninformative, most candidates start there); the call-approach line is gated
on the same band (Strong+) instead of a separate raw `>=100` threshold.

**Result on the real Kunz population (regenerated from source, not just patched at output):**
released membership, bucket placement, qualification, and Premium/Releasable/Key-Account tiering
are ALL unaffected (governed by separate scoring/qualification logic never touched) — 121 released
leads, same 280-candidate reconciliation, unchanged. Urgency: 62 Hot / 59 Warm (pre-fix) → 47 Hot /
74 Warm (code fix alone, before reapplying the still-open 7-lead patch from the earlier audit) →
**40 Hot / 81 Warm** (final, both fixes applied). 14 leads lost the "volume-based pricing" call-
approach line (100-149 review range, previously above the old flat `>=100` bar, now below the new
`Strong` (150+) bar) — listed in the session's final report. "Happy Gourmet" (126 reviews) and
"Mozza Pizza & Kebab" (126 reviews) remain Hot on independent, legitimate grounds (Key Account;
Companies House Group classification, respectively) — their Hot status was never actually caused
by review count, confirming the original "same label" complaint was specifically a Note 2 wording
defect for these two, not a urgency-classification defect.

9 new/updated regression tests (`test:lead-production-master-field-resolver`, direct unit tests
for both new functions plus updated Note 2/urgency scenarios proving a review count alone —
including a synthetic 2275-review, no-other-evidence case — no longer triggers Hot on its own, and
that Very-Strong/Exceptional-band + one more signal together do). All 41 suites, typecheck, build
clean. No commits made — `master-field-resolver.ts` and its test file added to the same
uncommitted set as the rest of this pass's changes.

### Terminology guardrail applied, Kunz release finalised (2026-08-04, same day)

Owner approved the corrected classification (121 released / 108 ordinary / 13 key accounts / 40
Hot / 81 Warm / 0 Standard) subject to one wording correction: review-count bands must never be
labelled "volume" (business/purchasing/wholesale) — a Google review count is consumer-review
evidence, not direct proof of wholesale purchasing capacity. Relabelled in
`master-field-resolver.ts`: Note 2's band bullet is now `"Google Review Activity: <Band> (<N>
Google reviews) — consumer review evidence only, does not by itself establish high-volume
operation."`; the call-approach line no longer says "volume-based pricing", now "reference strong
online consumer engagement... as a talking point — not itself evidence of high-volume operation."
The band type/threshold logic itself is unchanged (5 bands, same thresholds) — this was purely a
wording fix. "High-volume operation" is retained as approved terminology (per the owner's own
spec) for the SEPARATE, correctly-gated concept requiring direct evidence or 2+ signals — never
the review band alone. Verified: 0 occurrences of "business volume"/"purchasing volume"/
"wholesale volume"/"volume-based pricing" across all 121 released leads' Note 2 text. 2 new test
assertions added (forbidden-phrase check on both a Strong-band and an Exceptional-band lead) plus
an explicit literal-2275-reviews `isHighVolumeOperation` test. Regenerated from source (not
output-patched) — released membership, reconciliation, and certificate all unchanged (121
released, 280 total, PASS). All 41 suites, typecheck, build clean.

**Follow-up requirement recorded for before Meer**: capture Just Eat `rating_count` as its own
separate evidence field (source + retrieval date retained, displayed separately from Google
reviews, used only as supporting consumer-activity evidence, never alone as proof of wholesale
purchasing volume, never summed with Google's count). Not implemented this pass — explicitly
deferred with owner approval; does not block the Kunz release.

## ISS-0036 — RESOLVED (2026-08-04, same day) — `Lead_Data_Schema_and_SalesPro_Mapping_v1.xlsx`'s Pipeline Stage allowed-values list is stale against the locked operational value

**Non-blocking, documentation-only.** While independently re-verifying Meer's CTO "Lead Type"
dropdown against the primary source workbook (`~/Downloads/Lead_Data_Schema_and_SalesPro_
Mapping_v1.xlsx`), also checked its "Pipeline Status/Stage" entry against the actual value written
into every released row. The workbook's three sheets ("Master Field Schema", "CTO Existing
Mapping", "Final SalesPro Schema") all still list `Allowed Values: "1. Qualification | 2.
Contacting | 3. Engaged | 4. Opportunity | 5. Won | 6. Lost"`, with `Example Value: "1.
Qualification"` — matching `CTO_Lead_Import_Template.xlsx`'s own sample row. The pipeline's
actual, locked, operational default is `"1. Follow Up"` (`docs/09_DECISIONS.md`, "Sales Pro
'Business Types' column repointed" entry, 2026-08-04: *"`pipeline_stage`'s default changed from
`\"1. Qualification\"` to `\"1. Follow Up\"` (locked instruction)"*) — already implemented in
`generate-cto-final-review.ts` and already used identically and correctly in every row of both
Kunz's and Meer's delivered CTO exports. Confirmed NOT a defect in either release.

**What's actually wrong**: the mapping workbook itself was never updated after that locked
instruction, so anyone consulting it directly (rather than `docs/09_DECISIONS.md` or the code)
would see a stale, contradicted allowed-values list for this one field.

**Action taken (resolution)**: none against Kunz or Meer — both releases remain correct and
unchanged. Resolved the "which source of truth" ambiguity in code rather than by chasing an
updated workbook from the owner: `scripts/lead-production/master-field-resolver.ts` now exports
a single, explicitly-documented constant, `PIPELINE_STAGE_DEFAULT_FOR_NEW_LEADS = "1. Follow
Up"`, with a doc comment stating plainly that it — not the primary-source workbook's `Allowed
Values` cell — is authoritative for `pipeline_stage`, and citing this issue and `docs/
09_DECISIONS.md` for provenance. The single call site that previously hardcoded the literal
string now reads the constant instead, so there is exactly one place this value can ever be
defined or drift. New regression test (`test:lead-production-master-field-resolver`, case 20)
asserts the constant's value directly and that `resolveMasterFields()` actually writes it. The
stale workbook itself was intentionally left untouched (out of scope, not owned by this repo) —
future readers are now pointed at the code constant, not the workbook, by construction.

## ISS-0037 — RESOLVED (2026-08-04, same day) — final-output generators are not campaign-aware; every path is still hand-specified, and no release-manifest generator exists

**Blocking, before the next representative's release.** `run-full-territory.ts` and
`run-sales-territory.ts` gained an optional `--campaign-id=` default-path flag in the post-Kunz/
Meer storage restructure (this same pass). The generators that produce the actual final-review
artifacts were checked and do **not** have equivalent support — inspected directly, not assumed:

- `scripts/lead-production/generate-master-export.ts`, `main()` line 192-193: `arg("out")` is
  required with no fallback of any kind (`if (!outArg) { ...error...; process.exit(1); }`). No
  `--campaign-id`-aware default. (It does already accept `--campaign-id=` for provenance/
  cross-campaign-dedup labelling — just not for choosing its own output directory.)
- `scripts/lead-production/generate-owner-review-pack.ts`, `main()` line 391/400: `arg("out")`
  required, no fallback, no campaign-id awareness at all (doesn't accept `--campaign-id=` in any
  capacity).
- `scripts/lead-production/generate-cto-final-review.ts`, `main()` line 114-117: `arg("out-xlsx")`
  / `arg("out-csv")` both required, no fallback, no campaign-id awareness.
- `scripts/lead-production/verify-customer-leakage.ts`, `main()` line 448-454: `arg("out-json")` /
  `arg("out-xlsx")` required, no fallback; `--campaign-id=` IS already a required argument here
  (used for the certificate's own `campaignId` field), but it is never used to derive a default
  output path.
- **No release-manifest generator script exists at all.** Both Kunz's
  (`docs/release-manifests/campaign-003-kunz-full-allocation-2026-08-04.json`) and Meer's
  (`docs/release-manifests/campaign-004-meer-full-allocation-2026-08-04.json`) manifests were
  hand-authored (Python/direct JSON) this session, not produced by any script — there is nothing
  to make campaign-aware yet because the automation itself doesn't exist.

**What this means in practice**: none of the 4 generators above ever wrote directly into
`~/Downloads` or into a campaign's `review/`/`audit/`/`release/`/`manifests/` subdirectory on
their own — every single invocation this session specified an explicit working directory by hand
(`.../consolidation/...`), and the moves into `~/Downloads` and then into
`campaigns/<id>/release/` were separate, manual `cp` steps. The storage migration is **not**
automated end-to-end; it is currently: generate anywhere → manually copy to Downloads → manually
copy to the campaign `release/` directory → manually re-verify hashes at each step. This issue
records that explicitly rather than letting the restructure be read as "the pipeline now writes
straight to the campaign root" — it does not, yet.

**Action taken (resolution)**: option (a) implemented, generically, in this same pass — no
representative name hardcoded anywhere:

- New shared module `scripts/lead-production/campaign-output.ts` — `defaultCampaignOutputPath`/
  `defaultCampaignOutputDir` (campaign-id + kind + filename -> `campaigns/<id>/<kind>/<filename>`,
  never a rep name), `assertSafeToWrite` (refuses to write inside the Git repo; refuses to
  silently overwrite an existing file whose path is under a `release/`/`manifests/` segment —
  or is explicitly tagged `kind: "release"`/`"manifests"` — unless `--force-overwrite-release`
  is passed).
- All 4 generators updated additively: `generate-master-export.ts` (`--out` defaults to
  `campaigns/<id>/release/` via `--campaign-id`), `flatten-combined-master-to-csv.ts` (`--out-csv`
  defaults to `campaigns/<id>/release/<id>-master-combined.csv`),
  `generate-owner-review-pack.ts` (`--out` defaults to `campaigns/<id>/review/<id>-owner-
  review.xlsx` — this script had NO campaign-id awareness at all before), `generate-cto-final-
  review.ts` (`--out-xlsx`/`--out-csv` default to `campaigns/<id>/release/`),
  `verify-customer-leakage.ts` (`--out-json`/`--out-xlsx` default to `campaigns/<id>/audit/` —
  `--campaign-id` was already required here, just never used for this). Explicit `--out`/
  `--out-xlsx`/`--out-csv`/`--out-json` continue to always win, unchanged — every invocation this
  session used explicit paths, so no existing behaviour changed.
- New `scripts/lead-production/generate-release-manifest.ts` — the missing generator. Hashes every
  real file in a campaign's `release/` directory programmatically (`sha256`/byte count from the
  actual bytes on disk, never hand-typed), optionally folds in a certificate JSON and a customer-
  master checksum, writes to `campaigns/<id>/manifests/` by default. Generic — takes only
  `--campaign-id`, no representative-specific logic.
- 25 new regression assertions (`test:lead-production-campaign-output`) prove: the default paths
  are generic (no rep name in output), explicit `--out` always wins, the Git-repo write refusal,
  the release/manifests overwrite refusal (and that `--force-overwrite-release` lifts it), that
  audit/review/working directories stay freely overwritable (routine regeneration must not break),
  and that `buildReleaseManifest`'s hashes match an independently-computed SHA-256 of the same
  bytes.
- Kunz's and Meer's already-released files were NOT touched, moved, or regenerated by this fix —
  purely additive tooling for future campaigns.

## ISS-0038 — RESOLVED (2026-08-05) — three confirmed customer matches missed by the phase1 matcher, only caught by the independent verifier (Naseh owner-review control-closure pass)

**Found during Naseh's (campaign-005) owner-review reconciliation.** The independent verifier
found 3 confirmed customer matches (IG1-21A3E429 "Al Qasr Restaurant", IG3-5C1156E1 "MT
doughnuts (donuts) - Goodmayes", IG3-9D634F88 "Chicken House") that the district-level
customer-suppression pipeline (phase1's `match-customers.ts`, plus its post-enrichment re-check
stages) never excluded. Each root-caused individually against real stored data, not assumed:

1. **Al Qasr Restaurant (customer A632, IG1)** — matches via Office Phone, not the primary Phone
   column. This exact gap was already found and fixed generically on 2026-08-03
   (`load-customers.ts`'s `alternatePhones`, already covered by an existing passing regression
   test in `test-lead-production-customer-suppression-fix.ts`, case 1). IG1's own phase1
   checkpoint is dated 2026-08-02 — one day BEFORE that fix — and was reused verbatim (mirroring
   Kunz's CM1 precedent), carrying the stale pre-fix result forward. Not a current code defect;
   an inherent, accepted consequence of the "reuse verbatim, never rerun" policy for any
   checkpoint predating a fix. Nothing further changed in code for this one.
2. **Chicken House (customer C194, IG3)** — matched via an exact T/A-parsed trading-name alias
   ("Samsco Global Limited T/A Chicken House" -> "Chicken House"), a genuine identity match, but
   phase1's `match-customers.ts` had NO T/A-alias-parsing route at all — only the LAST-stage
   independent verifier (`verify-customer-leakage.ts`) did — so it scored only ~0.5 whole-string
   similarity ("probable"). **Fixed**: `extractTradingAsAlias` moved from a private function in
   `verify-customer-leakage.ts` into a shared, exported `normalize.ts` function; `match-
   customers.ts` gained a new confirmed-tier rule, `exact_trading_name_alias`, requiring alias
   match AND postcode agreement together — deliberately mirroring the verifier's own existing,
   owner-approved rule exactly ("alias alone is never enough"; real case: "Spice Hut" is an exact
   alias shared by 5 unrelated customers in different towns). An earlier draft of this fix
   confirmed on alias alone with no postcode gate — caught during self-review before landing,
   since it would have been a NEW false-positive source, more permissive than the verifier it was
   meant to match.
3. **Chicken House (customer C669, IG3, a second/different confirming match) and MT doughnuts
   (customer G210, IG3)** — both discoverable only via Google-enriched phone/full-address data
   that becomes available AFTER phase1 runs (Just Eat's own discovery has ~0% phone/address
   coverage). The post-enrichment re-check stages (`customer-resolution-after-google.ts` and its
   FSA/Companies House counterparts) only REFINE a match phase1 already suspected — by design,
   documented in `customer-resolution-after-google.ts`'s own header comment: *"It never opens a
   fresh search across the whole customer file — that would go beyond 'rerun resolution for the
   N unresolved' and risks pulling an already-cleared candidate back onto weak evidence."* This
   is a deliberate, already-documented risk tradeoff, not an oversight — MT doughnuts scored
   `matchTier: "none"` at phase1 (correctly: two completely differently-named businesses share no
   name/postcode signal at all). Not changed — the independent verifier, which runs against the
   fully-enriched final Master with no such restriction, is the correct, intentional final safety
   net for exactly this category of miss.

**Regression tests**: 3 new numbered cases (14-16) added to the existing real-case suite,
`test-lead-production-customer-suppression-fix.ts`, using the exact real lead/customer data from
this campaign — including an explicit test proving the alias-without-postcode false-positive risk
is NOT introduced (case 15).

**Also fixed in the same pass** (found while reconciling Naseh's 293-row Master total, which
initially only summed to 263 in the owner report — the missing 30 were the Held-Review sheet's
own phone-resolution-exception/business-category-review-required/pipeline-native-probable-hold
rows, never broken out as their own report line items; not a data defect, a reporting gap):
- `scripts/lead-production/generate-kunz-full-allocation-master.ts` renamed to `generate-full-
  allocation-master.ts` (owner instruction: "a Kunz-named script must not become the generic
  production consolidator") — logic was already fully generic, only the filename/comments/log
  text were Kunz-specific.
- `generate-release-manifest.ts` extended to scan `release/`, `review/`, and `audit/` (previously
  `release/` only, missing the owner-review workbook and both audit files) — never scans/includes
  `manifests/` itself.

**Verification**: all affected tests re-run and pass; Naseh's already-corrected, already-PASS-
certified release was not altered — none of the 3 leads above re-enter the release (all remain
correctly excluded/held from the prior correction pass); Kunz's and Meer's files untouched.

## ISS-0039 — RESOLVED (2026-08-05) — combined-master CSV side-artifact went stale after leakage corrections in two-source-merge campaigns

Found and fixed during the production batch (campaigns 006–012, Saad/Saif/Shahzaib/Tahira/
Wajahat/Hassan/Haleema). `apply-leakage-certificate-decisions.ts` only ever writes corrections to
the combined-master XLSX, never regenerates the companion `-master-combined.csv` written earlier
by `generate-full-allocation-master.ts` (the two-source merge used whenever a representative's own
prior pilot district is reused verbatim alongside newly-discovered districts). Affected Saif
(campaign-007), Tahira (campaign-009), and Hassan (campaign-011) — the three two-source-merge
campaigns this batch — whose release CSV briefly held pre-correction row counts while the XLSX,
CTO export, and delivered representative file were all already correct. No confirmed leak or
unresolved probable match ever reached a delivered file. Full root cause, fix, and the outstanding
process gap (no code enforces re-flattening the CSV after corrections — must be done manually,
every time, for any future two-source-merge campaign) recorded in `docs/10_BUGS_AND_FIXES.md`
(2026-08-05 entry).

## ISS-0040 — `run-sales-territory.ts --resume` can invalidate all district orchestrator stage bookkeeping despite valid underlying checkpoints (2026-08-08)

### Status
**UNRESOLVED / NON-BLOCKING.** Found during campaign-016 (Jahangir Alam, SM4–SM7), recovered live
with no data loss. Not fixed at the root cause — out of scope for this pass (no pipeline redesign
authorised).

### Problem
Running `run-sales-territory.ts --representative=Alam ... --resume --live` to consolidate 4
already-complete districts into a `territory-run-manifest.json` instead triggered
`run-full-territory.ts`'s own config-hash invalidation logic: it computed a different hash for the
"assignment" input (because the territory-level orchestrator resolves/passes assignment
information differently than a direct per-district `run-full-territory.ts` invocation with an
explicit `--assignments=<path>`), read this as "config input changed," and invalidated **every**
recorded stage for **every** district — deleting all 8 stage records from each of SM4/SM5/SM6/SM7's
`.orchestrator-run-manifest.json`. Each district then failed immediately at stage 1 (`phase1`, no
`--discovery-run-id` supplied at the territory level) and the failure handler wrote the now-empty
`stages: {}` back to disk (`run-full-territory.ts`'s "write manifest on failure so a future
`--resume` can pick up cleanly" behaviour — safe in the single-district case, not safe when the
config-hash invalidation itself was the spurious trigger).

### Impact and recovery
The underlying stage checkpoint **files and directories were never touched** — only the manifest's
bookkeeping index was cleared. Confirmed via direct inspection immediately after the failure.
Recovered by rebuilding each district's manifest with `run-full-territory.ts
--checkpoint=<stage>=<dir>` overrides pointing at the correct (already-good, post-Google-repair)
checkpoint directories for all 8 stages — this path only validates the anchor file and re-records
it, making zero additional live API calls. No rediscovery, no re-enrichment, no data loss. Combined
Master was then built by hand-authoring a minimal, correct `territory-run-manifest.json` directly
(schema: `representative`/`role`/`salesTerritory`/`districts: {DISTRICT: {status: "complete",
outDir: <checkpoint dir>}}`) rather than re-invoking the buggy script a second time.

### Recommended future fix (not attempted here)
`run-full-territory.ts`'s config-hash computation for the "assignment" dependency should be
insensitive to *how* the assignment was resolved (direct `--assignments=<path>` vs. the
territory-level orchestrator's own resolution), only to the resolved salesperson/role/mapRequired
values actually changing. Alternatively, `run-sales-territory.ts` could pass through the identical
`--assignments`/`--salesperson`/`--role` flags a direct invocation would use, so the hash matches.

## ISS-0041 — `apply-leakage-certificate-decisions.ts` corrects the combined Master but not the companion per-representative workbook, creating a stale-copy risk (2026-08-08)

### Status
**UNRESOLVED / NON-BLOCKING.** Found during campaign-016 (Jahangir Alam). Related to ISS-0039
(2026-08-05) — same root gap (leakage corrections are applied as a post-hoc overlay onto one
output file, not propagated to sibling artifacts derived from the same pre-correction data) — but
affects the `<rep>-master-representative.xlsx` workbook, not the combined-master CSV.

### Problem
`generate-master-export.ts` writes both `<rep>-master-combined.xlsx` and
`<rep>-master-representative.xlsx` from the same in-memory candidate buckets in one run.
`apply-leakage-certificate-decisions.ts` only ever edits the combined workbook afterward. For
campaign-016, the independent leakage verifier found 6 confirmed customer leaks in the initial
85-usable population; after correction the combined workbook and all downstream artifacts
(field-sales final-review, owner-review pack, Master CSV) correctly reflected 75 usable — but
`alam-master-representative.xlsx` still held the original 85-usable population, including all 6
confirmed leaks, in its "Usable"/"Premium"/"Key Accounts" sheets.

### Impact and recovery
This file is not one of the 8 required campaign deliverables and was never copied to a
representative's `current-release/` delivery folder (only the field-sales final-review XLSX/CSV
are copied, per the established storage protocol) — so no confirmed leak reached anything actually
delivered. Moved the stale file out of `release/` to
`working/pre-correction-superseded/alam-master-representative-PRE-LEAKAGE-CORRECTION-superseded.xlsx`
(preserved, not deleted) and regenerated the release manifest without it, rather than leave a
stale leaked-customer file sitting in a certified-PASS release directory.

### Recommended future fix (not attempted here)
Extend `apply-leakage-certificate-decisions.ts` to also correct the companion
`<rep>-master-representative.xlsx` (same bucket-membership changes), or have it regenerate that
file from the corrected combined workbook's buckets rather than leaving it as an untouched sibling
of the file it does correct.

## ISS-0042 — RESOLVED (2026-08-16) — field-sales batch (campaigns 017-020) certificate-FAIL: two real customer-match evidence gaps and one recall gap in `customer-match-materiality.ts`

**Found during pre-flight/independent leakage verification for the next field-sales batch**
(campaign-017 Ayesha EN4-EN9, campaign-018 Nauman, campaign-019 Alam, campaign-020 Manraj — none
yet run live at the time of this fix). Two real leaked leads, root-caused individually against
real candidate/customer data, not assumed:

1. **"BRIM Burgers - Barnet" (candidate EN5-4550C39D, campaign-017) vs customer F373 ("Fast Food
   Bros Trading Limited T/A Brim")** — postcode disagrees entirely (F373's registered billing
   address is Hemel Hempstead; the candidate trades in Barnet) and the trading names have no
   meaningful overlap. The only shared identifier is the website-verified email
   (`info@brimburgers.com`), which `customer-match-materiality.ts` never checked at all — the
   customer master's Email/Invoice Email Address columns were already loaded data, just never
   compared. **Fixed**: new unconditional `exact_email` confirmed-tier route, mirroring the
   existing `exact_phone` route (a shared, exact, hard-to-coincidentally-collide identifier).
2. **"Rooster Chicken Purley" (candidate CR8-17C07635, campaign-020) vs customer R176 ("ROOSTER
   POINT")** — trading names share only the generic word "rooster" (Jaccard similarity well below
   even the moderate postcode+name floor); no phone/email identifier is shared either. The only
   evidence is a component-level address match (same building number + street, "926 Brighton
   Road") at an exact matching postcode — a route that did not exist at all before this fix.
   **Fixed**: new `exact_address_same_postcode` confirmed-tier route, reusing
   `address-components.ts` unchanged (already used by `verify-customer-leakage.ts` — not a new
   parser), gated on exact full-postcode agreement (never merely same district) plus
   `compatiblePremises && !premisesIdentifierConflict`, so it cannot fire on a coincidental
   same-street-different-postcode-sector case.
3. **Structural recall gap** — both new evidence routes were useless without a wider fix: every
   customer-match check up to final-scoring only ever evaluates the ONE customer phase1's
   name-similarity search happened to suspect (`priorMatchedCustomerId`). A customer whose trading
   name bears no resemblance to the candidate's raw Just Eat listing name (case 2 above) is
   invisible to that chain no matter how good its own evidence is — it is never even considered.
   This is the same generic root cause the independent verifier (`verify-customer-leakage.ts`)
   already closes by doing a fresh full-index scan against the FINAL enriched record; the
   operational pipeline never did. **Fixed**: `run-final-scoring-stage-v2.ts` gained
   `scanFullCustomerIndex`, run unconditionally against every customer at final-scoring time (the
   first point where phone/email/address are all simultaneously available), using the same
   `assessCustomerMatchMateriality` evidence rules; only the more material of the chain-suspected
   result and the full-scan result is ever used, so an already-correct release/exclusion can never
   become less material. Kept structurally separate from `verify-customer-leakage.ts`'s own
   evaluator (deliberately — that script's header explains an independent release-gate check must
   not share logic with the pipeline it audits).

**Also closed in the same pass** (a documented, honestly-recorded matching-coverage gap from the
2026-08-09 owner chain/brand review, `docs/09_DECISIONS.md`, found again while pre-flighting this
batch's real candidate names): `commercial-review-filter.ts`'s single-word-brand protection did
not catch (a) qualifier-before-brand with no separator ("Little Waitrose - Cheam" vs brand
"Waitrose") or (b) brand-first bare-space branch suffix with no separator at all ("Londis
Beddington Gardens" vs brand "Londis"), plus one unrelated formatting quirk (no space after a
dash separator). Fixed via two additive alias-file entries (`Little Waitrose`, `Southern Co-op` /
`Southern Co-operative` — reusing the existing multi-word prefix match, no new logic) and a new
opt-in-per-brand `bareBranchSuffixApproved` flag (`Londis`, `Aksular`, `Sankalp` — distinctive,
non-generic brand words only; the single-word exact-match default, and its Phoenix/Premier/Flames
false-positive protection, is unchanged for every brand that has not opted in). `load-commercial-
review.ts`'s canonicalBrand guard widened from exclude-only to keep-or-exclude, since a KEEP
brand's naming-coverage gap is just as real and just as safe to close additively as an EXCLUDE
brand's.

**Regression tests**: `customer-match-materiality.ts` — cases 17-20 in
`test-lead-production-customer-suppression-fix.ts` (both real leaked leads, a false-positive guard
proving component-address-without-exact-postcode does NOT auto-confirm, and a backward-
compatibility proof that pre-existing call sites/fixtures with no email/address populated never
fabricate a match). `commercial-review-filter.ts` — section 13/14 in `test-lead-production-
commercial-review.ts` (all three 2026-08-09 gaps now close correctly, plus explicit false-positive
proofs that the new capabilities are opt-in per brand, never a blanket relaxation — including a
worst-case hypothetical proving the bare-branch-suffix matching primitive itself cannot match a
fused word like "Pretzel" even if a brand opted in).

**Verification**: `npm run typecheck` clean; `npm run build` clean; all 47
`test:lead-production-*`/`test:je-*` suites individually re-run, ALL PASSED (one transient
network flake on `test:je-supabase`'s live Supabase connection, unrelated to this fix — passed
cleanly on immediate re-run, and that suite does not exercise either changed file).

**Update (same day, later) — fix applied to the live campaigns via checkpoint-only reprocessing,
confirmed working, both real leaks now correctly excluded**: live discovery/enrichment for all
four campaigns (017 Ayesha EN4-EN9, 018 Nauman, 019 Alam, 020 Manraj) had already run on
2026-08-15 (phase1 through website-stage checkpoints, all dated 2026-08-15). After this fix
landed, `final-scoring` was re-run for every district of every campaign directly against those
existing checkpoints (a new `*-final-scoring-stage-2026-08-16T21-5x*` checkpoint alongside each
original 2026-08-15 one) — data-only reprocessing, no new live/paid provider call. Release files
and zero-leakage certificates were then regenerated from the reprocessed output.

Directly verified in the reprocessed checkpoint data (not assumed from the certificate alone):
- **BRIM Burgers - Barnet** (`EN5-4550C39D`, campaign-017): now correctly routed to
  `customer_master_exclusion` in `en5-v2-authoritative-master.json`/`en5-v2-customer-master-
  exclusions.csv`, and absent from the delivered
  `campaign-017-ayesha-field-sales-allocation-field-sales-final-review.csv`.
- **Rooster Chicken Purley** (campaign-020, CR8): now correctly routed to
  `customer_master_exclusion` in `cr8-v2-authoritative-master.json`, with
  `customerConflictReason` recorded verbatim as `"Full customer-index rescan (post-enrichment,
  ISS-0042) found a "confirmed" match no earlier stage ever suspected — customer R176: ..."` — the
  exact new code path, proven firing on the real record, not just the test fixture.

Regenerated certificates (`verifierCommitHash: 0858bd92...`, the last commit at the time — this fix
was still uncommitted then, so the hash reflected HEAD, not "pre-fix code"; the checkpoint
timestamps above are the actual evidence this ran post-fix): campaign-017 `masterResult: PASS`,
0 confirmed leaks. Campaigns 018/019/020 `masterResult: FAIL` — in every case from **unresolved
probable matches** (018: 1; 019: 14; 020: 2), `confirmedLeakCount: 0` in all three — the same
"held pending human review" population every prior campaign in this project has produced, not a
new defect and not something this fix (or any code fix) resolves automatically; needed the owner's
usual per-lead review.

**RESOLVED — 2026-08-17, commit `64cd5be`.** The owner (Zoeb) reviewed the fix and the 17 combined
unresolved-probable holds across 018/019/020, and made an explicit per-lead-ID clearance decision:
none of the 17 held leads had an exact shared phone, email, postcode, or address/premises identity
with their candidate customer match — evidence was limited to fuzzy/generic same-district name
similarity or the same brand appearing at different physical branches. This was applied through a
new, narrowly-scoped owner-authorisation channel added to `reevaluate-and-clear-probable-matches.ts`
and `verify-customer-leakage.ts`: a probable-tier match is released only when a human supplies the
exact lead ID, reason, and timestamp on the command line — never automatically, and a confirmed-tier
finding can never be overridden this way regardless of authorisation. The pre-existing algorithmic
safe-list (generic-alias/uncorroborated-domain-only evidence) is unchanged for every lead not
explicitly named.

All four campaigns' certificates now read `masterResult: PASS`, `ctoResult: PASS`,
`confirmedLeakCount: 0`, `unresolvedProbableLeadCount: 0`. Field-sales eligible leads released:
campaign-017 (Ayesha) 110, campaign-018 (Nauman) 20, campaign-019 (Jahangir Alam) 158, campaign-020
(Manraj) 82 — **370 total**. All four are copied into their representative's `current-release/`
folder (`representatives/{ayesha,nauman,jahangir-alam,manraj}/current-release/`); the prior
campaigns 013-016 for these same representatives are preserved under
`previous-release-archived-2026-08-17/`, not deleted. Committed as `64cd5be` and pushed — current
pushed HEAD on `feature/mvp-vertical-slice-001`. Full narrative: `PROJECT_STATUS.md` (2026-08-17
entry).

## ISS-0043 — OPEN — `test:je-supabase` fails at `deleteRunCascade` teardown with a Postgres statement timeout, not a functional regression (2026-08-21)

**Found during the field-sales batch (campaigns 021-024) post-batch test pass.** All 10 substantive
assertions in `test:je-supabase` pass every time (RPC claim, outlet/observation persistence,
data-quality report, execution counter, FK enforcement, empty-queue claim, append-only enforcement,
RLS tenant isolation, RLS raw-payload restriction). The test then fails at its own cleanup step —
`SupabaseRepository.deleteRunCascade` (`src/lib/discovery-engine/repository/supabase.ts`), a single
`DELETE FROM discovery_runs WHERE id = <run>` relying on `ON DELETE CASCADE` — with
`{"code":"57014", "message":"canceling statement due to statement timeout"}`. Reproduced 3 times in
a row (not a one-off flake): the plain run-to-run retry pattern that cleared this same test in the
2026-08-16 ISS-0042 session no longer clears it.

**Root cause (confirmed, not guessed):** this batch ran 12 live Just Eat discovery jobs (SE15,
BR1-BR5, EN5-EN10) in one session, growing the discovery tables enormously — checked directly via
`execute_sql`: `je_raw_observations` 138,978 rows, `je_field_provenance` 396,597 rows,
`je_rating_history` 138,862 rows, `je_outlets` 20,385 rows. A cascade delete keyed off
`discovery_runs.id` has to resolve through this much larger row volume than existed when this test
was last verified; the timeout is consistent with the cascade now taking longer than Postgres'
configured `statement_timeout`, not with any change in this session's code. No file this batch
touched (`generate-field-sales-final-review.ts`, `run-sales-territory.ts`, the two test files) is
anywhere near this code path.

**Not fixed here** — per explicit instruction, no pipeline/schema redesign this task (a real fix
would mean either an index on the cascading FK columns or a longer `statement_timeout` for this
specific delete, both migration-scope changes outside this batch's remit). Recorded as open,
infrastructure-scoped, not blocking: the substantive functionality this test protects (RLS,
append-only observations, claim/heartbeat, execution counters) is proven working on every run: only
its own teardown call is affected, and it never touches production data (the 4 released campaigns'
data lives entirely outside this test's fixture rows). typecheck and build both clean; all other
46 of 47 `test:lead-production-*`/`test:je-*` suites pass individually.
