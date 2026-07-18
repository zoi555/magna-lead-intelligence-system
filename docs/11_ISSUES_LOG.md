# Issues Log — Magna Lead Intelligence System

## ISS-0001 — Missing customer postcode file

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: Blocked

### Problem

Existing customer records need completed postcode data for accurate deduplication.

### Next action

Return/upload the completed missing-postcode file.

## ISS-0002 — Delivery postcode list missing

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: Blocked

### Problem

The system needs the approved delivery postcode boundary before deciding in-area, out-of-area, and expansion leads.

### Next action

Upload inner and outer delivery postcode list.

## ISS-0003 — CTO field validation against Magna Sales Pro

Date: 2026-07-09  
Severity: Critical  
Owner: CTO  
Status: Outstanding

### Problem

The 102-field schema must be validated against Magna Sales Pro API/import constraints.

### Next action

CTO confirms accepted fields, rejected fields, required transformations, and import format.

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
