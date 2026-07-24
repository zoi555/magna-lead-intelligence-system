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
