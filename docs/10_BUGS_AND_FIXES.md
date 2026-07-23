# Bugs and Fixes — Magna Lead Intelligence System

No implementation bugs yet because no code has been built.

## Historical design fixes from discovery phase

These are design corrections, not app bug fixes:

| ID | Problem | Fix |
|---|---|---|
| DESIGN-FIX-001 | Google Places-only discovery produced invalid/dead data | Platform-first discovery, Google fallback only |
| DESIGN-FIX-002 | Business-name matching produced false positives | Address-based FSA/Companies House matching |
| DESIGN-FIX-003 | Manual review queue risked becoming too heavy | 80%+ matches auto-ignored with full audit trail |
| DESIGN-FIX-004 | Paid enrichment could run too early | Free filters before paid calls |
| DESIGN-FIX-005 | Turnover data unavailable for many small firms | Review volume used as size proxy |

## 2026-07-11 — Vertical Slice 001 build fixes

- **BUG:** `scripts/export-project-summary.ts` had an unterminated string literal
  (`parts.join('` with a raw newline). Because `tsconfig` includes `**/*.ts`, this failed
  `next build` type-check. **Fix:** `parts.join('\n')`. Restores the script's intent; unblocks build.
- **BUG:** `listRunIds()` in `src/lib/pipeline/run-store.ts` matched `<run>.records.json`, so
  `leads:status` loaded the records array as a run state and crashed on `status.toUpperCase()`.
  **Fix:** also exclude `*.records.json` from the run-id listing. Verified `npm run leads:status`.

## 2026-07-15 — Map interaction functional pass (`@geospatial/map` v0.1.2)

- **BUG:** A roads rendered as fuzzy/dashed sub-pixel hairlines. **Fix:** raised road widths
  above ~0.9px per class and added casing+solid layer pairs for motorway/A/B with round
  caps/joins and no dash arrays (`roadRules.ts`, `createMapStyle.ts`). A roads now solid;
  hierarchy preserved (primary A split from other A by `primary_route`).
- **BUG:** Road labels stayed visible when their roads were disabled (decoupled). **Fix:**
  coupled `label-a-num` / `label-b-num` / `label-road-name` visibility to the road geometry
  setting in `layerVisibilityForProfile`. Motorway numbers remain the locked exception.
  Covered by new package tests.
- **BUG:** Postcode-sector checkbox had no visible effect (four independent postcode toggles
  fought each other). **Fix:** replaced with a single `postcodes.mode` study-mode selector
  (`off|area|district|sector|full`); only the active level's labels + point interaction show.
- **BUG:** Selection highlight was indistinguishable from the run territory. **Fix:**
  selection is now blue (`#2563eb`), territory stays orange (`#ea580c`), hover is dark —
  three visually distinct states. Escape clears the selection.
- Verified: package typecheck + tests green; AspectLead typecheck + retained tests + build
  green; routes 200; no asset 404s (`docs/56_MAP_INTERACTION_FUNCTIONAL_PASS.md`).

## 2026-07-16 — Just Eat worker first-execution bugs

- **BUG (root cause):** worker crashed with `invalid input syntax for type uuid: "null"`
  (22P02) on an empty queue. `claim_je_execution` was `RETURNS je_executions` (single
  composite); returning NULL made PostgREST materialise a **phantom row of all-NULL
  columns**. The mapper treated it as a claimed execution with `run_id = null`, the
  worker's `if (!execution)` guard missed it, and `getRun(null)` sent `id=eq.null` to a
  uuid column. **Fix:** migration `0009` changes the RPC to `RETURNS SETOF je_executions`
  (empty ⇒ zero rows); repository adds `isUuid` + `normaliseClaimedRow` (rejects the
  phantom/malformed row) and guards `getRun`/`getExecution` against non-UUIDs. No bad rows
  existed in the DB — `run_id` was already NOT NULL + FK.
- **BUG (found while fixing):** deleting a run's observations was blocked by NO-ACTION FKs
  from tenant-scoped outlets/history/provenance (would also block retention pruning).
  **Fix:** migration `0010` sets those references `ON DELETE SET NULL` (outlets are tenant
  assets that outlive any single observation).
- **Cleanup:** 1 run + 5 synthetic outlets + observations/history/provenance left by a
  failed integration test were removed after verification; DB confirmed empty (0 rows).
- Verified: `test:je-stage1` (61 assertions incl. claim-normalisation + empty-worker),
  `test:je-supabase` (FK, empty-claim, immutability, RLS, no-orphan cleanup) green;
  retained tests + `npm run build` green; worker reruns cleanly ("No queued executions.
  Exiting.") with no UUID error.

## 2026-07-16 — Execution progress counter (0/1) + lease-expiry double-processing

- **BUG:** a completed single-outcode execution showed **0/1 outcodes**. Two causes:
  (1) `finishExecution` never wrote the `completed_queries` **column** (only `metrics`), so
  the counter relied entirely on heartbeats; (2) the inner 718-outlet loop sent **no
  heartbeat**, so the 60 s lease expired mid-query and the execution was **re-claimed**
  (`attempts=2`); the original worker's end-of-loop heartbeat then no-oped on the
  `claimed_by` guard, leaving the column at 0. **Fix:** `finishExecution` now writes
  `completed_queries`/`planned_queries` authoritatively (ownership-guarded); the worker
  heartbeats every 25 outlets during a query; `completed_queries` counts **successful**
  queries only (failures tracked separately), incremented once per query and resumable
  without double-counting; migration `0011` makes `heartbeat_je_execution` return
  `(owned, cancel_requested)` so a worker that lost its lease **aborts** instead of
  clobbering. Tests: 1/1, 0/1-failure, cancellation, retry/resume, ownership guard.
- **DATA finding (not fixed — real run data):** the pre-fix double-claim left the UB1
  execution with **1,436 observations = 718 real + 718 duplicates** (`duplicate_of` linked).
  Outlets (718) and the fix are unaffected; logged as ISS-0015 for the user to decide on
  pruning. The new heartbeat/lease behaviour prevents recurrence.
- **Detail audit (docs/59):** Just Eat outlet **detail** pages are Cloudflare anti-bot
  protected (403) and no public detail/menu endpoint exists (404) — detail-level fields
  (phone, menu, opening hours, description) are **not lawfully retrievable**. Not integrated.
- **Uber Eats parser field-path mismatch (fixed — `uber-eats-parse-1.1.0`).** The first
  approved Apify pilot (`sourabhbgp/ubereats-scraper`, UB1, 10 results, ~$0.02) showed
  postcode/coords/rating coverage = 0. Root cause was **wrong field paths**, not missing
  data: the parser read `raw.location.*` / `raw.categories` / `raw.rating.score` and treated
  images as strings, but the real actor nests under `raw.address.*` and supplies `cuisineList`,
  numeric `rating` + `ratingCount`, a `phoneNumber` string, and `{ url }` image objects.
  **Fix:** recalibrated mapping (kept backward-compatible with the old fixture), UK-only
  postcode/phone gating (US ZIPs/phones retained in `source_extra`, never coerced), HTML-entity
  title decoding, `supportedDiningModes`→delivery/collection, and a controlled `source_extra`
  JSONB for all unmapped fields. Coverage calc now credits menu/hours/promotion/media from
  `source_extra`. Tests: `test:uber-parse` (40 assertions) + `test:multi-source` green; live
  rerun confirmed. See docs/64.

## 2026-07-18 — Vercel build failed: private git dependency has no SSH auth in CI

- **BUG:** every Vercel build failed installing `@geospatial/map` (pinned
  `github:zoi555/geospatial-platform#v0.3.0`), which npm resolves via `git+ssh://git@github.com/`.
  Vercel's build container has no SSH key/agent for the private `geospatial-platform` repo, so
  `npm ci`/`npm install` errored on that dependency before the build could start.
- **Fix:** the independent repo now publishes `@zoi555/geospatial-map` to GitHub Packages.
  AspectLead's `package.json` now depends on `@zoi555/geospatial-map@0.3.0`; a committed,
  token-free `.npmrc` (`//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`) authenticates the install;
  `NPM_TOKEN` is set as an environment variable in Vercel (Preview + Production) and locally. All
  imports and `next.config.mjs` `transpilePackages` updated to the new package name;
  `package-lock.json` regenerated. See ADR in docs/09_DECISIONS.md.
- **Verified:** clean `npm ci` (local + Vercel) resolves `@zoi555/geospatial-map@0.3.0` from
  `npm.pkg.github.com` with an integrity hash; typecheck, build, `test:geography-gate`,
  `test:uber-parse`, `test:multi-source`, and `git diff --check` all green; Vercel deployment
  `dpl_85AwBaHZvzsXZoF14S67EibBPEJ7` (project `magna-lead-intelligence-system`) reached READY with
  build logs matching the local build (same route list, same pre-existing NFT-trace warning on
  `/api/tw-map-data`, no npm/auth errors). Commit `597044a`.
- **Also repaired (separate project, same root cause):** `magna-lead-intelligence-system-pngu` — a
  second Vercel project connected to the same repo — had the same class of failure (legacy custom
  Install Command doing an SSH→HTTPS git rewrite, left over from an earlier stopgap, plus no
  `NPM_TOKEN`), giving `E401 unauthenticated` on the GitHub Packages fetch. **Fixed** by adding
  `NPM_TOKEN` and removing the custom Install Command, matching `magna-lead-intelligence-system`'s
  working configuration; the project now reaches `READY` on the default `npm ci` route. Both
  projects currently deploy successfully; which one is canonical remains an open owner decision —
  see ISS-0019 and `docs/08_DEPLOYMENT.md` ("Vercel deployment topology").

## 2026-07-18 — Provider registry conflated district PRECISION with district RECALL/completeness

- **BUG (documentation/metadata honesty, not a runtime defect):** `provider-registry.ts`'s
  `uber_eats_borderline_ppr` entry set `verifiedGeographyPrecision: "district"` with a comment
  referencing only the narrow pizza-query diagnostic (`jg2xJwXcMgvmggYnT`, 2/10 in UB1) and a
  registry `discovery` value of `"supported"`. Read together with `operationalStatus: "candidate"`,
  this could be misread as "this actor is a working district-discovery provider" — but the later
  broad-query diagnostic (`MrKoKg8322ZVzk449`, docs/68) found only **0/7** independently-verified
  UB1 reference restaurants (2/7 combined across both runs). Precision (records returned are
  correctly localised) and recall/completeness (finding most/all real restaurants) are different
  claims; the registry only tracked the former.
- **Fix:** added a separate `verifiedRecall: RecallStatus` field (`"unvalidated" | "inadequate" |
  "partial" | "adequate"`) plus `recallEvidence`, with explicit type-level comments distinguishing
  precision from recall. `uber_eats_borderline_ppr` now carries `verifiedRecall: "inadequate"` with
  the 2/7 evidence cited; its `warning` field states both dimensions explicitly and says it "must
  not be classified as a complete district-discovery provider on precision evidence alone." Doc
  `docs/67_PROVIDER_CAPABILITY_REGISTRY.md` corrected to match (also fixed a stale `discovery:
  unvalidated` line that no longer matched the code's `discovery: "supported"`). `docs/68`'s
  `excludeStores` mention corrected to flag its pagination behaviour as unverified, not proven.
- **Tests:** `test:borderline-provider` (`scripts/test-borderline-provider.ts`) gained 3 new
  assertions locking in `verifiedGeographyPrecision === "district"` AND `verifiedRecall ===
  "inadequate"` together, so precision can never again be recorded without recall alongside it.
- **Verified:** `npm run typecheck`, `npm run test:borderline-provider`, `npm run build` all green;
  no other file constructs a `ProviderCapability` object, so the new required fields did not need a
  backward-compatibility shim.

## 2026-07-18 (later, follow-up audit) — UB1 benchmark scorer recall bug + actor-prioritisation correction

- **BUG (real defect, would have produced a wrong recall number on a live diagnostic):**
  `benchmark-scoring.ts` matched the reference set against ALL raw returned outlets before
  geography filtering, not just business-geography-valid ones. A discovery actor returning a
  restaurant sharing a reference listing's name but located OUTSIDE UB1 would have earned recall
  credit it should not have. Caught in a follow-up audit before any paid diagnostic was approved.
- **Fix:** `scoreUB1Benchmark` now calls `partitionByGeography` FIRST and matches the reference set
  only against `part.valid`; raw totals/out-of-scope/unverifiable counts stay reported separately.
  New test in `test:ub1-benchmark` adds a synthetic out-of-UB1 record sharing a reference listing's
  exact name ("Spice Village Southall", located in Hayes/UB3) and proves it earns zero recall
  credit, while the same UNFILTERED match would have found it (demonstrating exactly why the gate
  matters).
- **Also corrected in the same audit:**
  - `uniquePhysicalUB1RestaurantCount` renamed to `uniqueValidUB1StorefrontCount` (a distinct
    `source_outlet_id` is a storefront, not a confirmed physical kitchen); a new
    `storefrontEntityBreakdown` tags known physical/virtual/chain/unknown entity types without ever
    merging distinct UUIDs.
  - Name matching's containment/substring fallback (false-positive risk for short/generic names)
    replaced with a strict order: exact UUID → canonical URL/URL-UUID → conservative normalised
    EXACT name match → a bounded, explicit alias list. New tests prove a 5-character generic name
    ("Kebab") no longer matches a longer outlet name containing it, and that alias matching is
    exact, not substring.
  - `ub1-reference-set.ts`'s two-value `active_presumed`/`unconfirmed` status split into
    `verified_active` / `active_presumed` / `unconfirmed` / `inactive` / `unknown`. Ali Baba's Pizza
    and Tops Pizza Southall upgraded to `verified_active` (real paid-run evidence); the other 5
    remain `unconfirmed`. Two separate recall metrics added: `verifiedActiveRecall`
    (verified_active-only denominator by default) and `candidateReferenceCoverage` (informational,
    full 7-listing set) — never blended into one score.
  - `piotrv1001/uber-eats-menu-scraper` reclassified from "primary geographic discovery candidate"
    to a fallback recall/completeness + sitemap-enumeration + enrichment-where-useful candidate,
    matching the product-owner's stated architecture preference (one direct discovery actor +
    enrichment; enumeration as fallback only). Four direct-geography candidates researched from
    live documentation (`memo23/uber-eats-scraper`, `jdtpnjtp/uber-eats-restaurant-scraper`,
    `sovereigntaylor/ubereats-scraper` — schema unfetchable this session, `scrapier/uber-eats-scraper`
    — flagged as near-identical in schema to the already-rejected `sourabhbgp/ubereats-scraper`).
  - The proposed paid benchmark no longer includes re-running the existing Borderline broad
    diagnostic. Its retained raw payload (run `MrKoKg8322ZVzk449`) was re-parsed with the real
    parser and re-scored offline through the corrected scorer
    (`npm run uber:borderline:benchmark-replay`, new script) — reproduced docs/68's manually-found
    result exactly (10 UB1 records, 0/7 known reference restaurants on the broad run alone), which
    cross-validates the corrected scorer against a known-real outcome.
  - Removed an invented city slug (`"southall-uk"`) from the withdrawn prior paid-benchmark
    proposal — no placeholder value is invented for a field whose real format is unconfirmed; it is
    now explicitly marked unverified instead.
- **Vercel docs:** added a "Deployment-ID discipline" note to `docs/08_DEPLOYMENT.md` — deployment
  IDs are point-in-time snapshots that change on every push; stable identity (project name/ID,
  environment role, production branch, alias, Git integration) is the durable reference, not a
  deployment ID. No separate commit was created solely to chase updated deployment IDs; the latest
  snapshot (verified after commit `a938900`) was folded into this same fix.
- **Verified:** `npm run typecheck`, `npm run build`, `npm run test:ub1-benchmark` (all new/updated
  assertions), `npm run test:borderline-provider`, `npm run test:geography-gate`,
  `npm run test:uber-parse`, `npm run test:multi-source`, `git diff --check` all green. See
  `docs/69_UBER_ACTOR_MARKET_RESEARCH_AND_BENCHMARK.md` ("Audit correction") for the full narrative.

## 2026-07-18 (second follow-up, same audit thread) — storefront entity signals over-claimed confidence

- **BUG (evidence-honesty defect, not a runtime crash):** the entity breakdown added in the first
  follow-up correction (above) auto-labelled any storefront sharing a non-null address+phone with
  another storefront as a "known virtual storefront." Shared address and phone are a shared-
  location/shared-operator SIGNAL — they do not by themselves prove every storefront in the cluster
  is a virtual brand (could be an unrelated coincidence, a serviced address, or an upstream data
  error). Separately, `knownPhysicalLocations` counted only reference-matched storefronts but its
  name implied an independently-derived physical-location count, which was never implemented.
- **Fix:** `benchmark-scoring.ts`'s `StorefrontEntityBreakdown` now reports six evidence-scoped
  fields: `uniqueValidUB1StorefrontCount` (distinct UUIDs), `sharedAddressPhoneClusterStorefronts`
  (the raw address+phone signal, reported independently of any classification),
  `confirmedVirtualBrandStorefronts` / `confirmedPhysicalStorefronts` / `confirmedChainBranchStorefronts`
  (ONLY from an explicit matched reference-set `entity_type` — real source/branding/menu/operator
  evidence), `suspectedVirtualBrandStorefronts` (cluster membership with NO reference confirmation —
  the corrected, honest label for what was previously auto-labelled "known"), and
  `unresolvedEntityTypeStorefronts`. Reference-set confirmation for one cluster member never
  promotes, demotes, or merges any other member — each storefront is classified independently.
- **Tests:** `test:ub1-benchmark` gained a dedicated synthetic two-storefront cluster test proving
  (a) two storefronts sharing address+phone with NO reference evidence are reported in the cluster
  signal but downgraded only to SUSPECTED virtual brand, never CONFIRMED; and (b) when one cluster
  member is independently reference-confirmed physical, that confirmation applies only to that
  storefront — its cluster-mate remains suspected, not reclassified by association. Existing
  fixture-based assertions updated to the new field names.
- **Docs:** `docs/69` updated (field names in "Scoring model" and the offline-baseline re-score
  block) — the real retained Borderline broad-run data now correctly reports
  `suspectedVirtualBrandStorefronts=3` / `confirmedVirtualBrandStorefronts=0` for the Loaded
  Burgers/Wings 100/Tasty Tenders cluster, rather than the previous over-confident
  `knownVirtualStorefronts=3`.
- **Verified:** `npm run typecheck`, `npm run build`, `npm run test:ub1-benchmark`,
  `npm run test:geography-gate`, `npm run test:uber-parse`, `npm run test:multi-source`,
  `git diff --check` all green. No actor run, no Apify call, no Vercel/Supabase changes.

## Fix — Deliveroo parser fabricated `0` for absent numeric fields (2026-07-21)

**Bug:** `src/lib/discovery-engine/deliveroo/parse.ts`'s `num()` helper did `Number(v)` without
first checking for `null`/`undefined`/`''`. Since `Number(null) === 0` and `Number('') === 0`, any
genuinely-absent rating/fee/ETA value from a Deliveroo CSV/JSON import was silently written as `0`
instead of `null` — a real fabrication risk (`0` implies "confirmed zero", not "unknown"). Caught by
a new test (`test:deliveroo-import`, "CSV blank cells map to null, never fabricated") when the
Deliveroo import path was built; the Uber Eats and Just Eat parsers already guarded against this
correctly, so it was Deliveroo-specific.

**Fix:** added the same `null`/`undefined`/`''` guard already used in `uber-eats/parse.ts` before
`Number(v)`. Verified: `test:deliveroo-import` (20 assertions) + `test:multi-source` green.

## Fix — field-completeness report used a `LIKE` prefix match on postcode outcode (2026-07-21)

**Bug:** `scripts/je-field-completeness-report.ts` filtered `outcode LIKE 'UB1%'`, which also matches
the genuinely distinct `UB10` and `UB11` postcode districts, inflating the reported UB1 restaurant
count (121 instead of the correct 107) and diluting field-coverage percentages. `outlet-results.ts`
(the `/discovery-results` screen's query) already used an exact match and was unaffected.

**Fix:** changed to `.eq("outcode", outcodePrefix)` (exact match). Re-verified against the live
UB1 dataset: 107 restaurants, corrected coverage figures recorded in docs/73.

## Fix — phone-enrichment match validation was a self-referential no-op (2026-07-21)

**Bug:** an early draft of the upgraded `scripts/je-phone-enrichment.ts` computed a "name match"
signal as `namesMatch(lead.businessName, lead.businessName)` — comparing the search query to
itself, which is always true and therefore validates nothing. Caught before any live calls were
made, while wiring up the required "exact name plus physical address/postcode matching" gate.

**Root cause:** `GooglePlacesResult` (`src/lib/sources/google-places.ts`) did not surface the
Google-returned place's `displayName`, even though the field mask already requested it — only
`formattedAddress` was exposed.

**Fix:** added `matchedName: string | null` to `GooglePlacesResult`, populated from
`place.displayName?.text`. The enrichment script now compares the outlet's own name against this
independently-returned name (token-overlap match) AND its postcode against the returned address —
a phone is written only when both signals agree; a single-signal match is rejected as "ambiguous"
and not written. `test:phone-match` (9 assertions) covers both functions directly. Verified live:
of 79 real UB1 enrichment attempts, 4 were correctly rejected as ambiguous (e.g. a Google Places
top-hit named "KULFI & JALEBI WALA" for a Just Eat listing "Falooda Village" at a matching address
— same premises, different signage — correctly not accepted as a phone match without corroborating
evidence).

## Fix — Deliveroo challenge-detection false positive during the real browser test (2026-07-21)

**Bug:** the first Deliveroo Playwright browser-test pass flagged a "CAPTCHA/challenge detected"
on the genuine, fully-rendered homepage load — a false positive from a loose keyword match (the
word "captcha" appears in hidden PerimeterX accessibility/boilerplate text present on many normal,
unblocked pages, the same false-positive class the earlier curl-based test hit with "captcha" text
in a script reference). A screenshot proved the page was the real, normal Deliveroo homepage with
no visible block. See docs/74.

**Fix:** verified via screenshot before trusting the keyword match; corrected the detection to
require a specific page-title pattern ("attention required" / "access denied" / "just a moment")
rather than any keyword appearing anywhere in the full DOM text, and completed the real UI
interaction. No actual bot challenge was encountered at any point.

## Fix — commit_import_batch() could not resolve digest() on production Supabase (2026-07-21)

**Bug:** the first production attempt to persist a real import via `commit_import_batch()` failed
with `function digest(text, unknown) does not exist`. `pgcrypto` (which provides `digest()`) is
installed by Supabase into a dedicated `extensions` schema, not `public` — but the function's
`SET search_path = public` did not include it. Caught by the transaction-safety design itself:
the failed call rolled back completely, nothing was persisted.

**Fix:** migration 0024 sets `search_path = public, extensions` on the function (fix-forward, not
an edit to the already-applied 0023). Also fixed `scripts/test-migration-local.sh`'s disposable
Postgres stub, which previously installed `pgcrypto` into `public` by default (vanilla Postgres
behaviour) — this is why the bug wasn't caught locally first. The stub now creates an `extensions`
schema and sets the test database's default `search_path` to match Supabase's real convention, so
this class of bug is caught before it ever reaches production again.

## Fix — Deliveroo detail-page fetch used `networkidle`, which never fires on Deliveroo (2026-07-21)

**Bug:** the first Deliveroo UB1 pilot attempt used `page.goto(url, { waitUntil: "networkidle" })`
for restaurant-detail pages. All 20 timed out after 20s. This was misread as a possible block at
first glance, but is not — Deliveroo's pages continuously poll analytics/tracking endpoints in the
background, so the page never reaches "no network activity for 500ms," regardless of whether the
content has actually loaded.

**Fix:** switched to `waitUntil: "domcontentloaded"` + a short fixed wait, the same approach
already proven to work for the single-restaurant detail fetch earlier in the session (docs/74).
On retry, discovery and the wait-strategy fix both worked correctly; a genuine Cloudflare
challenge was then encountered on the first 3-concurrent-request detail batch (docs/76) — a
separate, real finding, correctly not bypassed or retried.

## Fix — /discovery-results candidate query missed a new import (no ORDER BY, limit exhausted) (2026-07-21)

**Bug:** after wiring imported Uber Eats/Deliveroo records into `/discovery-results` (via
`consolidated_candidates`), a freshly-persisted test import did not appear on the page. The
underlying query had no `ORDER BY` and a `limit(200)` — with 1000+ historical `consolidated_candidates`
rows for the tenant (accumulated over months of prior Just Eat consolidation runs) returned in an
arbitrary order, the new row simply wasn't in the first 200 returned.

**Fix:** added `.order("last_seen", { ascending: false })` (newest first) and switched the
non-Just-Eat filter to a DB-level `candidate_source_links!inner(...)` + `.neq(...)` filter instead
of fetching everything and filtering client-side — both fixes verified against production by
confirming the test import appeared correctly after the change, then removing the test data.

## Fix — `run-detail.ts` read a renamed column, silently returning `[]` forever (2026-07-21)

**Bug:** migration `0014_rename_derived_query_units.sql` renamed `discovery_runs.derived_outcodes`
→ `derived_query_units` (2 months before this session). `run-detail.ts`'s `fetchRunDetail()` still
read `r.derived_outcodes` from its `select("*")` result — the column no longer existed under that
name, so `Array.isArray(r.derived_outcodes)` was always `false` and `RunDetail.run.derivedOutcodes`
silently returned `[]` for every run, forever, with no error (Supabase's `select("*")` just omits
unknown-named reads rather than throwing). Found while building the Create New Run conflict-check
endpoint, which needed this field to actually work.

**Fix:** read `r.derived_query_units` instead. One-line fix, no migration needed (the correct
column already existed).

## Gotcha — cancelling a queued execution doesn't finish it; it can still be claimed by another test (2026-07-21)

**Not a code bug** — a testing-process gotcha worth recording. `POST /api/discovery/executions/[id]/cancel`
only sets `cancel_requested = true`; the execution stays `status = 'queued'` until a worker actually
claims and processes it (the worker checks the flag mid-run and finishes as `'cancelled'`). A queued
execution created during manual/E2E testing and merely "cancelled" this way is **not** inert — it
remains claimable. This was discovered when a leftover queued-but-not-yet-claimed test execution
(from a Create New Run E2E proof) was claimed by `test:je-supabase`'s own `claimNextExecution()`
call ahead of that test's own freshly-queued execution (claimed_by matched the test's own worker
name), causing a cascade of unrelated-looking assertion failures in that test.

**Takeaway:** when manually creating+queueing a test run outside the normal worker flow, delete its
full cascade (`repo.deleteRunCascade`) once the proof is captured — don't just cancel and leave the
row — if there's any chance another test or the real worker could claim it first.

## Fix — Google Places postcode agreement always false; FSA-name query pollution (2026-07-23)

**Bug (1):** the live UB1 Google Places run's first pass returned zero exact/probable matches
out of 83 real candidates — an implausible result that triggered investigation instead of being
reported. Root cause: Places API (New) Text Search never populated `places.addressComponents`
in any of 83 real responses despite it being in the field mask (a real, undocumented API
behaviour) — postcode agreement was computed as always `false`, misclassifying 48 of 49 genuine
exact matches as conflicts.

**Fix:** added a `formattedAddress` regex fallback (standard UK postcode pattern) when
`addressComponents` is empty. Reprocessed the already-retrieved live data with a dedicated
zero-new-calls script — 49 outcomes corrected without spending any additional Google Places
budget.

**Bug (2):** the query builder was appending an FSA establishment's name even when the FSA
outcome was `multiple_fsa_matches` (ambiguous — the array's first entry is not a chosen best
match), polluting several Google queries with an unrelated business's name at the same dense
postcode and plausibly contributing to genuine `no_google_match` results.

**Fix:** `fsaOfficialNameForQuery()` only offers a name when the FSA outcome was itself decisive
(exact/strong-probable). A bounded, separately-approved supplemental live run (32 candidates,
the exact `no_google_match` bucket, `--no-fsa-name-in-query` + a `UK` locality hint) recovered 8
exact + 12 probable + 5 conflict matches from what had been 32 unresolved no-matches.

**See also:** `scripts/lead-production/google-adapter.ts`, `google-match.ts`,
`reprocess-google-results.ts`, `run-google-stage.ts` — commits `c9e7c89`, `f55ce66`, `68398d1`.

## Fix — Companies House company_name_conflict/registered_address_conflict mislabel (2026-07-23)

**Bug:** a STRONG legal-name match whose registered office sat in a different postal district (a
real, common pattern for small UK businesses — registered office = accountant's/formation
agent's address, unrelated to the trading premises) was labelled `company_name_conflict`, even
though its own evidence tag literally said `NAME_MATCHES_...` — the conflict is the address, not
the name. Affected 36 of 71 live UB1 candidates' primary Companies House outcome.

**Fix:** both the same-district and different-district strong-name/mismatched-address branches
now correctly return `registered_address_conflict`; `company_name_conflict` is reserved for the
opposite evidence pattern (address agrees, name does not). Reprocessed the already-retrieved
live data with zero new Companies House calls — 30 of 71 candidates relabelled (6 of the
original 36 were genuine `company_name_conflict` cases and correctly left unchanged).

**See also:** `scripts/lead-production/companies-house-match.ts`,
`reprocess-companies-house-results.ts` — commits `3a48839`, `4358f75`.

## Fix — non-decisive Companies House status leaking into the final hard gate (2026-07-23)

**Bug:** the final-scoring stage's `company_not_dissolved_or_in_liquidation` hard gate read
`companiesHouseStatus` directly off the Companies House result regardless of whether the match
itself was decisive. For a `registered_address_conflict` outcome — an UNRELATED, unconfirmed
company at a different registered address — that company's own status (e.g. `dissolved`) was
being treated as if it were the candidate's own trading status, wrongly hard-gating 10 of the
first live run's 25 Level-4 rejections (40%).

**Fix:** added `trustworthyCompaniesHouseStatus()` — a status is only trusted as the candidate's
own when the CH outcome genuinely identifies (exact/strong-probable match) or strongly
implicates (`dissolved_company_conflict`/`dormant_company_conflict`, which specifically fire on
a strong match at the candidate's OWN postcode) the same real business. Re-ran the final-scoring
stage (pure consolidation of already-fetched checkpoint data, zero new calls of any kind) —
Level 4 dropped from 25 to 15; Level 0 rose from 13 to 14.

**See also:** `scripts/lead-production/hard-gates.ts`, `run-final-scoring-stage.ts` — commit
`9b87f14`.

## Fix — Google stage required a pre-placed population file, blocking territory reuse (2026-07-23)

**Bug:** `run-google-stage.ts` was the only lead-production stage that could not derive its own
input population from the upstream checkpoint. It required `google-input-population.json` to
already exist in `--out` (originally written by a one-off manual extraction script during the
first UB1 run) — `run-fsa-stage.ts` and `run-companies-house-stage.ts` both already self-derive
their own populations. This silently blocked the new reusable orchestrator
(`run-full-territory.ts`) from processing the Google stage for any territory other than UB1.

**Fix:** added `--phase1-dir` and `derivePopulationFromFsaCheckpoint()`, which reads the Phase 1
population and excludes only candidates the FSA stage itself confirmed as an active Magna
customer (mirroring the FSA stage's own filter). Population resolution order is unchanged for
UB1: `--population` override, then an existing `google-input-population.json` in `--out`, then
self-derivation. UB1's existing checkpoint was never touched.

**See also:** `scripts/lead-production/run-google-stage.ts` — commit `24a8727`.

## Fix — orchestrator manifest never written when every in-range stage was a checkpoint override (2026-07-23)

**Bug:** `run-full-territory.ts`'s per-stage loop wrote `.orchestrator-run-manifest.json` to disk
only in the branch that actually executes a stage script. The `--checkpoint=<stage>=<dir>`
override branch updated the in-memory manifest object and logged success, but never called
`fs.writeFile`. A run whose entire `--from-stage`/`--to-stage` range consisted of overridden
stages (e.g. validating a supplied `phase1`/`fsa` checkpoint with no other stage in range) exited
0, printed a manifest path, but left no manifest file on disk — silently breaking `--resume` for
that run. Found via the new orchestrator test suite's stage-range proof.

**Fix:** the override branch now writes the manifest to disk immediately after recording the
stage, identical to the executed-stage branch.

**See also:** `scripts/lead-production/run-full-territory.ts`,
`scripts/test-lead-production-full-territory.ts` — commit `3114c86`.
