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

## Fix — Master exporter's physical-premises mapping never matched the real classification string (2026-07-23)

**Bug:** `master-field-resolver.ts`'s enum matcher for `physical_premises_status` used keyword
`"no_evidence"`, but `physical-premises.ts` actually returns `"no_physical_premises_evidence"` —
a superset string that does not contain `"no_evidence"` as a contiguous substring. 11 of 94 UB1
candidates silently got a blank `physical_premises_status` (a required Master field) instead of
the correct "No Evidence" value.

**Fix:** matched against the real returned strings (`premises_conflict`,
`virtual_or_shared_kitchen`, `probable_physical_premises`, `no_physical_premises_evidence`,
`permanently_closed_premises`, `temporarily_closed_premises`), verified directly against
`physical-premises.ts`'s source. Regression-tested with all 6 real values.

**See also:** `scripts/lead-production/master-field-resolver.ts`,
`scripts/test-lead-production-master-export.ts` — commit `2a10065`.

## Fix — Sales Pro exporter treated a numeric-range schema entry as a literal dropdown value (2026-07-23)

**Bug:** 4 Sales Pro columns (Commercial Priority Score, Telesales Score, Field Sales Score,
Enrichment Completeness) declare `allowedValues: ["0-100"]` — a range descriptor, not a single
legal literal. The dropdown validator treated any non-empty `allowedValues` array as an exact-
match set, so every real numeric score (e.g. `74.27`) was flagged as an invalid dropdown value
and the export refused to write (correctly refusing rather than shipping bad data, but for the
wrong reason).

**Fix:** added `parseNumericRange()` — a single `"min-max"` allowedValues entry is now validated
as a numeric range, not string-set membership. All other categorical columns are unaffected.

**See also:** `scripts/lead-production/generate-salespro-export.ts`,
`scripts/test-lead-production-salespro-export.ts` — commit `f410791`.

## Fix — ISS-0028 test false positive on `types.ts` (2026-07-23)

**Bug:** see ISS-0028 in `docs/11_ISSUES_LOG.md` — `scripts/test-lead-production-google.ts`
flagged `types.ts` for "assigning a numeric Level 0-4 score" when it only declares the shared
type vocabulary those levels are drawn from.

**Fix:** `types.ts` excluded from that one regex check (still checked for the separate
"never labels sales-ready" assertion). Closed as part of Milestone 6's full test/build gate —
required for every lead-production test to genuinely pass before the pre-production
certification could report GO.

**See also:** `scripts/test-lead-production-google.ts` — this session's Milestone 6 commit.

## Fix — orchestrator's phase1 stage never passed --assignments/--groups to run-comparison.ts (2026-07-24)

**Bug:** found live, on the very first real (non-UB1) Phase 1 execution — RM1 discovery
(Milestone 7). `run-full-territory.ts`'s `phase1` case only ever passed `--run`, `--customers`,
`--out` to `run-comparison.ts`, but that script has always required `--assignments` and
`--groups` too. Every prior Phase 1 checkpoint (UB1) was produced by a direct, manual
`run-comparison.ts` invocation predating the orchestrator (commit `3114c86`) — the orchestrator's
own phase1 branch had never actually been exercised end-to-end until this run. No live external
call was made before this failure (it fails at argument validation), so no cost/data impact.

**Fix:** added `assignments`/`groups` to the orchestrator's `Context`, reusing the existing
(previously display-only) `--assignments` CLI flag and adding a new `--groups` flag, both
plumbed into the `phase1` case's `run-comparison.ts` invocation. Regression-tested: full
`test:lead-production-full-territory` suite unaffected (existing tests only exercise phase1 via
checkpoint override, never a fresh execution).

**See also:** `scripts/lead-production/run-full-territory.ts` — this session's Milestone 7 work.

## Fix — run-fsa-stage.ts hardcoded a UB1-specific "expected 84 candidates" check (2026-07-24)

**Bug:** found live during RM1's FSA stage. `run-fsa-stage.ts` printed
`FSA population: 98 (expected 84)` and a spurious `WARNING: expected exactly 84 candidates,
found 98` — "84" was UB1's own incidental Phase 1→FSA population count, hardcoded as a magic
constant rather than derived per-territory. RM1's actual population (98 = 113 Phase 1 candidates
minus 14 excluded-large-group minus 1 active-customer) was correct; the warning was simply
wrong and would have fired on every future territory, undermining trust in genuine warnings.

**Fix:** removed the hardcoded comparison; the population count is self-derived from the Phase 1
checkpoint via `POPULATION_STATUSES` (already correct) and now logged honestly against the
Phase 1 total rather than a fixed constant. Also removed the same hardcoded value from the
stage's own summary JSON (`candidatesExpected: 84` → `phase1TotalCandidates`). Regression-tested:
`test:lead-production-fsa` unaffected (no test referenced the removed field).

**See also:** `scripts/lead-production/run-fsa-stage.ts` — this session's Milestone 7 work.

## Fix — added a duplicate-run guard to `scripts/je-run.ts` (2026-07-24)

**Found:** two independent live Just Eat discovery runs were triggered for RM2 within 4 minutes
of each other (once via this session's CLI invocation, once separately by the owner). Real API/
scrape cost was spent twice for the same real district. `je_raw_observations`'s own outlet-
identity-based dedup (`duplicate_of`) correctly prevented the second run from creating any
duplicate `consolidated_candidates` (verified: run B's 639 raw observations were ALL marked
duplicate of run A's; 0 canonical, 0 consolidated candidates) — no data-integrity defect, but no
guard existed to prevent the redundant live call in the first place.

**Fix:** `je-run.ts` now checks, before planning or making any live call, whether an accepted
run (queued/running/completed, not marked `duplicate_superseded_by_<id>`) already exists for the
same tenant + Postcode District + source within a 24h window, and refuses to start (fail-fast,
before any network call) unless `--force-duplicate-run` is explicitly passed. Verified live: a
repeat `npm run je:run -- "RM2"` is correctly refused, citing the existing run.

**Resolution of the specific incident:** the second RM2 run
(`3d640e28-29d9-43fa-ba6b-4881f5267d08`) was compared against the first
(`3a8d156e-334d-44b5-9594-d41ab6862414`) — raw/geography counts identical, run B contributed
zero unique candidates (fully subsumed by run A). Run A (created first, already verified,
already progressed through 5 pipeline stages) kept as authoritative; run B preserved (not
deleted) and annotated `reference = "duplicate_superseded_by_3a8d156e..."` plus a full
`app_audit_log` entry recording the comparison evidence and decision.

**See also:** `scripts/je-run.ts`, `docs/09_DECISIONS.md`.

## Fix — cross-district dedup false-merged different chain/franchise premises (2026-07-24)

**Bug:** found while combining Nauman's RM1-RM14 (748 candidates across 14 districts).
`dedupeAcrossDistricts()`'s company-number/phone/domain tiers required NO other corroborating
signal — a shared corporate website domain or central phone line across genuinely different
physical premises of the same chain/franchise was enough to wrongly merge them. Real cases: Ember
Inns' two different pubs (RM7/RM12, shared `emberinns.co.uk`), Pizza Hut Delivery's two branches
(RM7/RM13), Shell's two petrol stations (RM1/RM10), Favorite Chicken & Ribs' two locations
(RM5/RM13), Sizzling Pubs' two sites (RM6/RM8) — 81 of 748 candidates (10.8%) were being wrongly
collapsed into 667, each merge silently dropping a genuinely distinct sales opportunity.
Additionally, the weakest tier (`exact_postcode_and_identity`, floor 0.3) matched "Costa -
Romford" to "Wenzel's - Romford" — two unrelated chains — purely on the shared locality suffix.

**Fix:** company-number/phone/domain tiers now REQUIRE the same full postcode as a necessary
corroborating signal (the same real premises discovered near a district boundary genuinely
geocodes to the same postcode in both districts; two different branches of a chain do not). The
postcode+identity-only tier's name-similarity floor raised from 0.3 to 0.6 (dedup silently DROPS
a candidate on a match — a strictly worse failure mode than customer-matching's "hold for
review," so it needs a materially higher confidence bar). Re-run against the real 748-candidate
set: 25 genuine duplicates found (same postcode + same phone/company-number — consistent with
the known "dark kitchen"/virtual-brand pattern of one kitchen listing multiple JE storefronts),
zero false positives on manual inspection. Also wired `dedupeAcrossDistricts()` into
`generate-master-export.ts`/`generate-salespro-export.ts` (previously computed but never
actually applied to the exported rows) and fixed a field-name bug in the Sales Pro exporter's
dedup input (`resolved.fields.telephone`/`.website` don't exist — the resolved Master-schema
field names are `main_phone`/`website_url`; fixed to read the raw dossier fields, matching the
Master exporter's own correct usage).

Regression-tested with the exact real false-positive cases (Ember Inns, Costa/Wenzel's) as
fixtures in `test-lead-production-territory-v2.ts`.

**See also:** `scripts/lead-production/district-reconciliation.ts`,
`generate-master-export.ts`, `generate-salespro-export.ts`.

## Fix — website-crawl stage crashed the whole process on an HTTP/2 GOAWAY (ISS-0030, 2026-07-24)

**BUG:** `scripts/lead-production/website-adapter.ts`'s `fetchWithTimeout()` wrapped every
`fetch()` call in try/catch, but a specific class of connection-level failure (the remote server
closing a shared/reused HTTP/2 connection mid-response — `HTTP/2: "GOAWAY" frame received`) was
emitted by undici as an `'error'` event directly on the internal `ClientHttp2Stream`, not as a
promise rejection — this bypassed the try/catch entirely and crashed the whole Node process with
an unhandled exception. Reproduced twice, identically, against the same remote host during real
live NW3 website enrichment, taking down the entire district's website stage (not just the one
misbehaving domain) both times, including once after a `--resume` that skipped straight back into
the same crawl.

**FIX:** Forced HTTP/1.1 for all website-crawl requests via an explicit `undici` `Agent({
allowH2: false })`, passed as every request's `dispatcher`. HTTP/1.1 does not have HTTP/2's
connection-sharing/GOAWAY semantics that caused the crash — a per-request connection failure
under HTTP/1.1 surfaces as an ordinary `fetch()` promise rejection, caught exactly as designed.
Added `undici` as an explicit project dependency (previously only present transitively as Node's
internal fetch implementation) — see `docs/09_DECISIONS.md` for the dependency decision. Made the
fetch implementation an exported, reassignable binding (`fetchImpl`/`setFetchImplForTesting()`)
so the existing test suite's mocking pattern (previously reassigning `globalThis.fetch`, which
silently stopped working once the adapter switched to importing `undici`'s `fetch` directly)
continues to work without a module-mocking framework.

Regression-tested in `scripts/test-lead-production-website.ts`: (1) a connection-level fetch
rejection (mirroring the real GOAWAY error message) is now asserted to be caught and returned as
a graceful `{ ok: false }` result rather than left to crash the process; (2) a structural
assertion that `allowH2: false` remains wired in `website-adapter.ts`, so this fix cannot be
silently reverted by a future edit without the test suite catching it.

**See also:** `scripts/lead-production/website-adapter.ts`,
`scripts/test-lead-production-website.ts`, `docs/09_DECISIONS.md`, `docs/11_ISSUES_LOG.md`
(ISS-0030).

## Fix — discovery_runs.status could stay stuck at 'queued' after a partial write failure (ISS-0031, 2026-07-24)

**BUG:** `src/lib/discovery-engine/worker/loop.ts`'s failure-handling paths (the catch-all
handler and the disabled-source guard) made two unguarded, sequential `await` calls —
`repo.finishExecution(...)` then `repo.setRunStatus(run.id, "failed")` — with no independent
error handling. If `finishExecution()` itself threw (as it did live for both NW2 and NW7, on the
SAME flaky connection that triggered the failure path in the first place), the exception
propagated out of the catch block before `setRunStatus()` ever ran, leaving `discovery_runs.status`
permanently stuck at `"queued"`/`"running"`. This incorrectly kept the duplicate-run guard in
`scripts/je-run.ts` treating the district as still in-progress, blocking any retry until manually
corrected. Separately, nothing in the lead-production pipeline distinguished "this run's
geography processing genuinely never completed" from "this district genuinely has zero
candidates" — a downstream stage reading 0 candidates from an incomplete run would silently
treat it as a real empty-district result.

**FIX — five parts, all satisfying the explicit ISS-0031 requirements:**
1. **Independent, ordered writes.** `worker/loop.ts`'s new `failRunAndExecution()` helper
   attempts the run-level write FIRST, in its own try/catch, then the execution-level write in
   its own try/catch — a failure in either can never prevent the other from being attempted, and
   either failure is logged loudly (a `CRITICAL` line naming ISS-0031), never silently swallowed.
2. **`repo.failRun(id, reason)`** (new `DiscoveryRepository` method, implemented in both
   `SupabaseRepository` and `MemoryRepository`): retries the run-level write with bounded
   backoff (3 attempts, 300ms/900ms/2700ms — `SupabaseRepository`'s new `withRetry()` helper,
   also now wrapping `setRunStatus()`); preserves the original exception + timestamp by
   appending (never overwriting) a `failed_transient: <reason> (at <timestamp>)` note to the
   run's `reference` column; and — via a guarded `UPDATE ... WHERE status NOT IN
   ('completed','completed_with_warnings')` — never downgrades a run already in a terminal
   accepted state (requirement 8).
3. **`resumeGeographyProcessing()` / `checkResumableFromRetainedEvidence()`** (new
   `src/lib/discovery-engine/worker/resume-geography.ts`): re-derives a run's outlet set by
   re-parsing each retained `je_raw_observations.raw_payload` with the same Just Eat parser the
   original execution used, then runs the same geography-gate + persist + consolidate steps —
   with NO new discovery call — when a run's query fully completed but a later step didn't.
   Refuses (rather than duplicating validation rows) if geography validation already has data
   for that run. Goes entirely through the `DiscoveryRepository` interface (two new methods,
   `listCanonicalRawObservationsForRun`/`countGeographyValidationsForRun`, implemented in both
   repositories) so it is fully testable against `MemoryRepository`, no network required.
4. **`scripts/je-run.ts`**: `--replaces=<failed-run-id>` validates the referenced run is
   genuinely `"failed"` then writes a bidirectional `reference` annotation linking the two runs
   (append-only, never clobbering an existing failure note); `--resume-from=<failed-run-id>`
   invokes `resumeGeographyProcessing()` directly, skipping live discovery entirely. Also fixed
   a latent, related bug while touching this file: the territory-input parser only ever
   stripped `--tenant-slug=` out of `process.argv` before treating the remainder as the literal
   territory string — `--force-duplicate-run` (and now `--replaces=`/`--resume-from=`) were
   never excluded, so passing them would have silently corrupted the territory-input text.
5. **`scripts/lead-production/run-comparison.ts`**: refuses to proceed (clear error, not a
   silent 0-candidate result) when `--run=<id>` references a run whose status is not
   `"completed"`/`"completed_with_warnings"` — closing the exact gap that let the pipeline treat
   NW2's original incomplete run as if it had genuinely found nothing.

**Regression suite:** `scripts/test-discovery-run-recovery.ts` (`npm run
test:discovery-run-recovery`), 9 scenarios / 33 assertions, entirely against `MemoryRepository`
(no network): finishExecution network failure; failed status-update call; raw observations
retained but geography incomplete; queued-status recovery; explicit replacement-run linkage;
duplicate-run guard behaviour (including a regression guard proving the guard's correctness
genuinely depends on `failRun()` running, not luck); interrupted execution and resume from
retained evidence (including refusing a second resume against already-processed data); zero
candidate result vs. incomplete processing (proving the two cases can never share a status); and
a full end-to-end run through the real `runWorkerOnce()` production code path (not a simulated
mirror). Also re-ran the full existing discovery-engine and lead-production test suites plus the
real-database `test:je-supabase` integration test — all pass unchanged.

**See also:** `src/lib/discovery-engine/worker/loop.ts`,
`src/lib/discovery-engine/repository/{repository,supabase,memory}.ts`,
`src/lib/discovery-engine/worker/resume-geography.ts`, `scripts/je-run.ts`,
`scripts/lead-production/run-comparison.ts`, `scripts/test-discovery-run-recovery.ts`,
`docs/11_ISSUES_LOG.md` (ISS-0031).

## Fix — map_required resolved from a hand-typed CSV, never cross-checked against sales-territories-v2.json (2026-07-24)

**BUG:** `run-full-territory.ts`'s Stage 1 assignment resolution read `map_required` directly
from a raw column in the per-district assignment CSV (`(raw?.map_required ?? "").toLowerCase()
=== "true"`), never cross-checked against the authoritative
`config/lead-production/sales-territories-v2.json`'s own `mapsRequired` field. The CSV column
was hand-typed by the session's own per-district runner helper and was found hardcoded to
`"true"` for every representative regardless of role, including telesales. Nothing downstream
had ever consumed the resolved value for anything except a single log line, so a wrong value
had zero chance of being caught by any existing check. The consequence surfaced concretely:
Kunz's (telesales) already-built TW1-TW10 handover package incorrectly included a
`Kunz_TW1-TW10_New_Leads_Map.xlsx` deliverable.

**FIX:**
1. **`scripts/lead-production/resolve-map-required.ts`** (new) — the single authoritative
   resolver. Reads `sales-territories-v2.json` via the existing `loadSalesTerritoriesV2()` /
   `findRepresentative()` (`territory-assignment-v2.ts`, unchanged), returns the representative's
   real `mapsRequired` value. Fails closed (throws `UnknownRepresentativeError`) for an
   unrecognised representative rather than defaulting to `true` or `false`.
2. **`run-full-territory.ts`** — the assignment CSV's `map_required` column is now ignored
   entirely; `mapRequired` comes only from `resolveMapRequired()`. Also refuses (exits 1) if the
   CSV's `role` column disagrees with the canonical config's role for that representative,
   surfacing config drift instead of silently trusting either source. `assignment` (the resolved
   `{salesperson, role, mapRequired}`) is now wired into `STAGE_CONFIG_DEPENDENCIES`/
   `computeConfigHashes()` as a new dependency type for the `phase1` stage — a changed
   `sales-territories-v2.json` (different representative, different role, or different
   `mapsRequired`) now produces a different phase1 config hash, so `--resume` correctly
   invalidates phase1 and every downstream stage rather than silently reusing a checkpoint built
   under a stale assignment. Both `STAGE_CONFIG_DEPENDENCIES` and `computeConfigHashes()` are now
   exported for direct testability; `main()` is now guarded with `if (require.main === module)`
   so the file can be imported by tests without auto-executing the CLI.
3. **`scripts/lead-production/generate-representative-handover.ts`** (new) — a single reusable,
   tested handover-package builder replacing the four repeated ad-hoc packaging scripts written
   this session (Nauman/Manraj/Ayesha/Kunz). Produces the Representative Master, Sales Pro CSV,
   Key Accounts Management Review, and Customer Master Exclusions Audit files unconditionally,
   and the New Leads Map file **only** when `resolveMapRequired()` says the representative's role
   requires one. Coordinates remain in the Representative Master's own sheet regardless of role
   (they are Master-workbook evidence, never a channel-gated deliverable) — only the standalone
   map file is gated.
4. **`generate-territory-production-report.ts`** — the Overview sheet now records the resolved
   `Map Required` value and the Output Paths sheet only lists a map-file row when the
   representative's role requires one.
5. **`generate-progress-register.ts`** — added a runtime cross-check in `main()`: for every
   `ACCEPTED` representative, the register refuses to write if its own `mapPath` entry disagrees
   with `resolveMapRequired()` (a field_sales rep must have a real map-file path; a telesales rep
   must not reference one at all). This is a standing guard, not a one-off assertion — it will
   catch this exact class of drift automatically for every future representative.
6. **Kunz's package corrected retroactively, from existing evidence only** — no new discovery or
   enrichment calls. `Kunz_TW1-TW10_New_Leads_Map.xlsx` removed; the package regenerated via the
   new `generate-representative-handover.ts` (confirmed `mapRequired=false, map file
   produced=false`); `Kunz_TW1-TW10_Lead_Production_Report.xlsx` regenerated; the progress
   register's Kunz row corrected (`mapPath` now states the telesales/no-map rationale instead of
   a file path); `README.md` updated with a correction notice and a clean, independently
   re-derived reconciliation table (unique candidates 450; premium 118; releasable L1 63; usable
   181; ordinary new leads 167; key accounts 14; held 19; hard-rejected 132; customer exclusions
   76; excluded groups 42; sum proof 181+19+132+76+42=450 exact; Sales Pro row counts 167/14/76;
   zero leakage confirmed against held/hard-rejected/excluded-groups).

**Regression suite:** `scripts/test-map-required.ts` (`npm run test:map-required`), 27
assertions: field-sales representatives (Nauman, Manraj, Ayesha) retain `mapRequired=true`;
every telesales representative (all 10) resolves `mapRequired=false`; an unrecognised
representative throws rather than guessing; a telesales package produces no map file (and its
file list never references one) while a field-sales package does, using real synthetic Master
workbooks built for the test; the telesales package's Representative Master still carries real
Latitude/Longitude for every lead, proving coordinate presence never gates map production; a
changed representative or a changed `mapRequired` value (simulating an edited
`sales-territories-v2.json`) produces a different phase1 config hash while the unrelated
customers-file hash component stays identical; and 13 representatives resolved concurrently in
one process never cross-contaminate, including a targeted check of config-array-adjacent
representatives (Nauman/Manraj/Ayesha/Kunz) for an off-by-one class of bug. Full
lead-production/discovery-engine test suites, typecheck, and build all re-verified passing.

**See also:** `scripts/lead-production/resolve-map-required.ts`,
`scripts/lead-production/generate-representative-handover.ts`,
`scripts/lead-production/run-full-territory.ts`,
`scripts/lead-production/generate-territory-production-report.ts`,
`scripts/lead-production/generate-progress-register.ts`, `scripts/test-map-required.ts`,
`config/lead-production/sales-territories-v2.json`.

## Fix — Shahzaib's config included "HA10", a non-existent postcode district (ISS-0032, 2026-07-25)

**BUG:** `config/lead-production/sales-territories-v2.json` assigned Shahzaib the Sales Territory
"HA6-HA10" (5 Postcode Districts), but HA10 does not exist — the HA postcode area (Harrow) only
spans HA0-HA9. Nothing validated a configured Postcode District against the pipeline's own
authoritative postcode reference before treating it as a live query unit; a live discovery run for
"HA10" genuinely returned 0 raw observations (Just Eat had nothing to query), which correctly
cascaded through 0 candidates at every downstream stage and halted the orchestrator with a
`SHARED PIPELINE INTEGRITY FAILURE` at the Google stage's deliberate zero-candidate refusal. No
data was fabricated or corrupted — the pipeline's defensive refusals behaved correctly once the
config-level error had already been made. An audit of all 13 representatives confirmed HA10 was
the only invalid Postcode District anywhere in the config.

**FIX:**

1. `config/lead-production/sales-territories-v2.json` — Shahzaib's assignment corrected from
   `HA6-HA10` (5 districts) to `HA6-HA9` (4 districts, `districtCount: 4`); top-level
   `totalDistricts` corrected `112` → `111`; a `corrections` array added recording the change,
   its cause, and a pointer back to this entry and to ISS-0032.
2. `scripts/test-lead-production-territory-v2.ts` — new regression check: every representative's
   every configured Postcode District is resolved against `loadPostcodeReference()` and asserted
   present (111 checks across all 13 representatives, including the 8 not yet live-processed at
   the time of the fix), plus an explicit assertion that `HA10` itself is absent from the
   reference — the exact guard that would have caught this before any live call was ever made.
   `EXPECTED_COUNTS.Shahzaib` corrected `5` → `4`; all `112`-literal assertions updated to `111`.
   The test now also loads `.env.local`/`.env` (`loadDotEnv()`, same pattern used by every other
   script needing live Supabase access) since the new check calls `loadPostcodeReference()`,
   which requires service credentials.
3. **No output regeneration needed.** HA6, HA7, HA8, HA9 had already been run live and verified
   before this was discovered — the defect never touched their raw observations, candidates, or
   exports (HA10 produced zero raw records; there was nothing to prune from any accepted
   district). Shahzaib's territory simply becomes HA6-HA9 (4 districts) going forward.

**Regression suite:** `scripts/test-lead-production-territory-v2.ts`
(`npm run test:lead-production-territory-v2`) — full suite re-verified passing, including the new
111-district reference-validity check and the HA10-absence assertion. `npm run typecheck` and
`npm run build` both re-verified clean.

**See also:** `config/lead-production/sales-territories-v2.json`,
`scripts/test-lead-production-territory-v2.ts`,
`src/lib/discovery-engine/geography/reference.ts`.

## Fix — commercial-review-v1 pharmacy/chemist rule unfireable + two brand-matching gaps (2026-07-26)

**BUG:** A release-verification pass (owner-requested, comparing production output against an
earlier manual commercial scan that had identified ~20 possible pharmacy/chemist records)
found 41 genuine pharmacy/chemist candidates across the 13 territories that the
commercial-review-v1 filter had entirely missed:

1. The pharmacy/chemist rule required BOTH business-type/category evidence AND name evidence.
   Real FSA/Google category data for pharmacies in this dataset is almost always blank or a
   generic value ("Retailers - other", "Caring Premises") — never literally "pharmacy"/"chemist"
   — so the category-evidence requirement was practically unfireable. All 41 candidates had
   unambiguous name evidence ("Church Pharmacy", "Woods Chemist", "Superdrug - Hornchurch") but
   0 fired the rule.
2. "Superdrug - Hornchurch" (and 8 other Superdrug branches) never matched the approved EXCLUDE
   brand "Superdrug" — single-word brands were exact-match-only, by design, to protect against
   generic words (Phoenix, Premier, Shell) coincidentally appearing in an unrelated independent's
   name. "Pearl Chemist Cobham"/"PEARL CHEMIST BYFLEET" never matched EXCLUDE brand "Pearl
   Chemist Group" because real branches omit the word "Group".

Once these two brand-matching gaps were fixed (see below), applying them across the full
111-district dataset surfaced far more matches than the initial 41-candidate scan alone — 672
brand exclusions campaign-wide (up from 489), because several of the approved EXCLUDE brands
(Shell, Londis, Wenzel's, Harvester, Superdrug) are multi-hundred-branch UK chains present as
Just Eat convenience/grocery-delivery listings, not just food-service listings. Every new match
was individually inspected; zero false positives found (see `docs/09_DECISIONS.md`).

Separately, the first version of the Simplified Representative Workbook reused the 20 approved
CTO fields verbatim (Shop Name, Region/Route, Customer NetSuite Account Code, etc.) instead of the
actually-approved 18-column rep-facing layout (Business Name, Full Address, Postcode, Postcode
District, Business Type, Cuisine Type, Phone, WhatsApp, Email, Website, Contact Person, Contact
Position, Opening Hours, Lead Level, Commercial Score, Suggested Products, Sales Notes, Sales Pro
Lead ID) — found by the same release-verification pass.

**FIX:**

1. `scripts/lead-production/commercial-review-filter.ts` — pharmacy/chemist rule: name evidence
   (whole-word pharmacy/pharmacies/chemist/chemists/pharmaceutical/dispensary) is now sufficient
   on its own; category evidence is recorded as corroboration when present but no longer
   required. Brand matching: single-word brands additionally match when the candidate's RAW
   (pre-normalisation) name has an explicit dash separator right after the brand word
   ("Superdrug - X") — a bare space still does not match, so "Phoenix Fried Chicken"/"Premier
   Kebab House" remain protected. A small set of generic trailing corporate-qualifier words
   ("group") is stripped from the BRAND side only before multi-word prefix comparison.
2. `scripts/lead-production/generate-representative-handover.ts` — Simplified Representative
   Workbook rebuilt from the approved 18-column layout, sourced from the already-regenerated
   108-column SalesPro_New_Leads.csv; single sheet, Business Name first, Sales Pro Lead ID last.
3. Regenerated all 13 territories' Master/Sales Pro exports, handover packages, CTO forms, Field
   Provenance, Lead Production Reports, progress register, and the 3 field-sales maps from the
   same already-accepted checkpoints — no new discovery/enrichment call.

**Regression suites:** `scripts/test-lead-production-commercial-review.ts` (24 assertions, 9 new)
and `scripts/test-lead-production-simplified-workbook.ts` (new, 10 assertions) — ALL PASSED.
Existing UB1/RM1 checkpoint tests re-verified against the new (correctly higher) exclusion
counts. `npm run typecheck` clean, `npm run build` succeeded.

**Verification after the fix:** zero leakage re-confirmed across every new-leads CSV / CTO file /
Simplified Workbook / map for all 13 representatives; every surviving Lead ID re-traced to its
Master Evidence Register; independently recomputed overlap between the brand and pharmacy/
chemist rules (2 candidates, both "Pearl Chemist" branches, matched by both rules — the brand
rule wins in production since it is checked first, which is immaterial to the correct final
exclusion outcome); 69 keep-listed-brand candidates confirmed still present/eligible in final
output, confirming the explicit keep-override still functions correctly after the fix.

**See also:** `scripts/lead-production/commercial-review-filter.ts`,
`scripts/lead-production/generate-representative-handover.ts`,
`scripts/test-lead-production-commercial-review.ts`,
`scripts/test-lead-production-simplified-workbook.ts`, `docs/09_DECISIONS.md`, `PROJECT_STATUS.md`.

## 2026-08-02 — Five-district-pilot mandatory corrections: 2 real bugs found during release verification

Both found while independently verifying (not just typecheck/exit-code-trusting) the new CTO
Business Type / Business Category Eligibility / trading-status / restricted-financials fields
added to the Master (v2, 129 fields) and Sales Pro exporters this session.

**BUG 1 — Sales Pro "Business Types" multi-value dropdown validation rejected every valid
multi-value row.** `generate-salespro-export.ts`'s dropdown/type validator only split a cell into
individual members for validation when the underlying field value was a raw array
(`Array.isArray(raw)`). The new `cto_business_type` field is deliberately a single
comma-joined string (per the CTO's explicit "comma-separate multiple values" requirement for this
column), so the validator treated e.g. `"Pakistani Restaurant, Afghan Restaurant, Kebab Shop"` as
one invalid value instead of 3 valid ones, and the exporter refused to write ANY output (correctly
fail-closed, but would have blocked every real district export). Caught by the real end-to-end
UB1-checkpoint test, not a fixture.

**BUG 2 — restricted-financials fields could leak the literal string `"not_available"`.**
`candidate-dossier.ts`'s `key_financial_values` (constructed earlier this session) read Companies
House's `turnover_result`/`grossProfit_result`/`netAssets_result`/`employeeCount_result` verbatim
with no `"not_available"` filter — unlike the adjacent `company_age_years`/`financial_strength_band`
fields on the same object, which do filter it. Real UB1 `filed-accounts-data.csv` confirmed
`turnover_result`/`grossProfit_result` is `"not_available"` for 9/9 candidates with any filed
accounts (expected: UK micro-entities filing abbreviated accounts aren't required to report
turnover) — without the fix, the new `turnover_gbp`/`gross_profit_gbp` Master fields would have
shown the literal text "not_available" instead of a genuine blank whenever this was the case.

**FIX:**

1. `scripts/lead-production/generate-salespro-export.ts` — `buildRowAndValidate()`'s dropdown
   validator now also splits a string cell on comma (trimming whitespace) when the column's
   `fieldType === "Multi Select"`, validating each member independently — same outcome as the
   array path, without requiring the field itself to be an array.
2. `scripts/lead-production/candidate-dossier.ts` — `key_financial_values`'s 4 sub-fields
   (`turnover`/`grossProfit`/`netAssets`/`employeeCount`) each now check `!== "not_available"`
   before use, mirroring the existing `company_age_years`/`financial_strength_band` pattern.

**Regression suites:** re-ran `test:lead-production-salespro-export` (real UB1 checkpoint,
0 dropdown violations, unchanged 34/20/5 row counts), `test:lead-production-master-export`,
`test:lead-production-customer-master-exclusion` — ALL PASSED. `npm run typecheck` and
`npm run build` clean after every edit, not just once at the end.

**See also:** `scripts/lead-production/generate-salespro-export.ts`,
`scripts/lead-production/candidate-dossier.ts`, `scripts/lead-production/master-field-resolver.ts`,
`VERIFY_BEFORE_CLAIMING.md` (2026-08-02 entry, full verification detail).

## 2026-08-03 — Business Category Eligibility was informational-only, never actually excluded a candidate (found live, campaign-002 pilot)

**BUG:** `evaluateBusinessCategoryEligibility()` (`business-category-eligibility.ts`) was wired
into `resolveMasterFields()` on 2026-08-02 and correctly populated the "Business Category
Eligibility" Master field, but neither exporter's `classify()` ever filtered on its
`"excluded_non_food"` outcome — the locked instruction ("Conventional cafés/coffee shops excluded
when café/coffee is the principal operation... Exclude bubble-tea businesses only where bubble
tea/boba/milk tea is the principal operation") was an explicit RELEASE exclusion, not an
informational field. Found while gathering café/bubble-tea exclusion counts for the campaign-002
pilot report — checked real CM1/IG1/RM1 output and confirmed zero `excluded_non_food` candidates
had actually leaked into "usable" so far (lucky, not by design — no real candidate in those 3
districts happened to combine café/bubble-tea-principal evidence with otherwise-qualifying scoring
until this was checked).

**FIX:** Both `generate-master-export.ts`'s `classify()` and `generate-salespro-export.ts`'s
equivalent inline logic now filter out `business_category_eligibility === "excluded_non_food"`
BEFORE `usable`/`premium`/etc. are computed — same "filter before bucket classification" pattern
already used for commercial-review brand/pharmacy exclusion. Deliberately does NOT gate on
`"review_required_business_category"` or `"insufficient_category_evidence"` — per the engine's own
design, ambiguous evidence goes to human review (visible via its own field on usable rows), never
an automatic exclusion either way. New Master sheet "Business Category Exclusions" (13th->14th
sheet, now 15 total) and a new Sales Pro `<prefix>-business-category-exclusion-audit.csv`, mirroring
the existing commercial-review-exclusion-audit pattern.

**Regression test:** new fixture-driven block in `test-lead-production-master-export.ts` proving
`excluded_non_food` is excluded, `review_required_business_category`/`insufficient_category_evidence`
are NOT auto-excluded, and reconciliation holds. Required exporting `classify`/`RowBundle` from
`generate-master-export.ts` (previously private) and adding a `require.main === module` guard
around its `main()` call (previously ran on import, same class of gap already fixed in
`run-website-stage.ts`).

**Verification against real data:** re-ran CM1/IG1/RM1's exports after the fix — CM1 and IG1
unchanged (0 café/bubble-tea exclusions in either, confirming the earlier "lucky" zero-leak
reading was correct); RM1 gained exactly 1 café/bubble-tea exclusion, reclassified from what was
previously counted as an ordinary hard-reject (RM1's usable count is unchanged at 1 — the affected
candidate was never going to be released either way, only its recorded exclusion reason changed).
`npm run typecheck`/`build` clean; all 21 `test:lead-production-*` suites pass.

**See also:** `scripts/lead-production/business-category-eligibility.ts`,
`scripts/lead-production/generate-master-export.ts`,
`scripts/lead-production/generate-salespro-export.ts`,
`scripts/test-lead-production-master-export.ts`, `docs/09_DECISIONS.md`.

## 2026-08-03 — owner-review corrections: three real bugs found and fixed

- **BUG:** `commercial-review-filter.ts`'s raw-string separator regexes (brand-before/brand-after/
  @brand/bracketed-brand patterns) used `\s*` between the brand word and the separator, which does
  not consume a trademark symbol. Real leak: "Chaiiwala® - Ilford Lane" (IG1-34DC85F9) never
  matched the already-registered "Chaiiwala" exclude brand, and the same pattern was silently
  leaking a second real candidate, "Chaiiwala® - Southall" (UB1), into the usable population.
  **FIX:** added an optional `TRADEMARK_SYMBOL_CLASS = "[®™©]?"` into all 4 separator patterns.
  Real-UB1 regression: usable 36→35, Premium 25→24 (the leaked Chaiiwala® candidate correctly
  moved to Commercial Review Exclusions) — the real-checkpoint test assertions were updated to
  match, not silently left stale.
- **BUG:** adding "Black Sheep Coffee" to the exclude-brand CSVs triggered `load-commercial-
  review.ts`'s fail-closed duplicate-brand detection, because it was already present with an
  explicit "Keep" decision from the original 141-brand review (`brands_to_keep_final.csv` +
  `corrected_brand_decisions.csv`). **FIX:** removed the stale "Keep" entries, keeping only the
  owner's current "Exclude Whole Brand" decision as authoritative; corrected the registry's own
  documented counts (27 keep / 118 exclude / 145 reviewed — the README previously said 28/118/146,
  which double-counted the reclassification as a new addition rather than a move).
- **BUG:** `cto-business-type-mapping.ts`'s Tier-1 cuisine-tag loop was missing the
  `selected.length < 3` guard that Tier 2 already had, so a business with many website cuisine
  tags could emit far more than the approved 1-principal + up-to-2-secondary limit (a real case
  earlier this session, "Heernus Kitchen African Restaurant", produced 9 values). **FIX:** added
  the same cap Tier 2 already used. Regression tests (`test-lead-production-cto-business-type-
  mapping.ts` sections 9-10) prove no scenario, across any tier combination, can ever emit a 4th
  value.
- **Non-bug corrections (owner spec changes, not defects):** Note 1/Note 2 rewritten to the
  owner's detailed spec (see `docs/09_DECISIONS.md`); Lead Urgency recalibrated so Hot Lead
  requires a key account or genuinely unusual evidenced opportunity, never qualification alone.

**Verification:** `npm run typecheck`/`build` clean. All 25 `test:lead-production-*` suites
individually re-run, all ALL PASSED. All 15 owner-confirmed EXCLUDE decisions and the Da Raffaele
Bistro retain verified by direct Lead ID lookup against freshly regenerated campaign-002 exports
(built from already-stored, phone-fix-reprocessed checkpoints — zero live provider calls). Bobo &
Cha (DA1-015ED52A) verified landing in Held-Review with `review_required_business_category` and
its full stored evidence.

**See also:** `scripts/lead-production/commercial-review-filter.ts`,
`scripts/lead-production/cto-business-type-mapping.ts`, `config/lead-production/commercial-
review-v1/`, `scripts/test-lead-production-commercial-review.ts`,
`scripts/test-lead-production-cto-business-type-mapping.ts`, `scripts/test-lead-production-master-
export.ts`, `scripts/test-lead-production-salespro-export.ts`, `docs/09_DECISIONS.md`,
`VERIFY_BEFORE_CLAIMING.md` (2026-08-03 entry).

## 2026-08-03 (board escalation) — existing Magna customers leaked into the released pilot output: 5 bugs found and fixed

Severity: **Critical — real existing customers were released as "new leads" to representatives.**
See `docs/11_ISSUES_LOG.md` ISS-0034 for the full incident record; this entry is the technical
bug-by-bug detail.

Forensic audit first established the pilot's ACTUAL customer-master file did not match the
"expected path" it was assumed to be reading — see ISS-0034. Independently re-verifying all 177
previously-released usable leads against the real, actually-used customer master
(`magna-customers.csv`, own comparison logic, not trusting the pipeline's own match result) found
exactly 2 real, confirmed leaks: IG1-21A3E429 "Al Qasr Restaurant" (= inactive customer A632 "Al
Shukraan Ltd T/A Al Qasr Restaurant") and BR1-0FA2C0D7 "Munchies Peri Peri- Bromley" (= inactive
customer M289 "IH Trading Kent Ltd T/A Munchies Peri Peri").

**BUG 1 (root cause of leak #1 — Al Qasr Restaurant):** `normalize.ts`'s `normalisePostcode()`
passed the raw postcode string straight to `classifyPostcode()` with no punctuation stripping. A
trailing comma left over from NetSuite address-field concatenation — real, confirmed on 538/7762
(6.9%) of non-blank customer postcodes in the actual customer master, e.g. `"IG1 4BS,"` — made
`classifyPostcode()` return `level: "invalid"`, so BOTH the canonical postcode AND the coarser
district-level "outward" code came back `null`. This silently disabled postcode-based customer
matching entirely for those rows (not merely degraded it) across every stage that uses it,
including the district-level geographic gate in `customer-match-materiality.ts`. **FIX:** strip
leading/trailing non-alphanumeric junk before classification (only leading/trailing — never
internal characters, which could mask a genuinely different postcode).

**BUG 2 (the other half of leak #1):** `load-customers.ts`'s `CUSTOMER_FIELD_SPECS` only ever
mapped a single "Phone" column. The real customer master carries genuine alternate phone/email
columns ("Office Phone", "Invoice WhatsApp Number", "Invoice Email Address") that were never
loaded or compared at all — customer A632's matching phone was only present in "Office Phone".
**FIX:** `CustomerRecord` now carries `alternatePhones`/`alternateEmails`; compared alongside
(never instead of) the primary phone/email at every matching stage (`match-customers.ts`,
`customer-resolution-after-google.ts`, `customer-match-materiality.ts`).

**BUG 3 (root cause of leak #2 — Munchies Peri Peri):** `run-final-scoring-stage-v2.ts` hardcoded
`domain: null` in its `assessCustomerMatchMateriality()` call, making the module's own
`exact_domain` confirmation route permanently dead code in production — the code to catch this
exact case already existed and was simply never wired up. **FIX:** domain is now derived from the
matched customer's email + alternate emails (same pattern already used in
`customer-resolution-after-google.ts`).

**BUG 4 (found while proving the fix, real over-exclusion risk — the opposite direction from the
leak, but explicitly required by the audit's regression-case list):** `match-customers.ts`'s
`PHONE_CONFLICT_FLOOR` (0.15) could be cleared by nothing more than a shared TOWN/AREA word — real
case: "Franzos - Ilford" (a genuine new prospect) vs an unrelated inactive customer "Peri Peri
Chicken Bites (Ilford)" (a reused/reassigned phone number), sharing only the word "ilford", scored
0.2 similarity and would have been wrongly auto-confirmed as the same business, incorrectly
excluding a real prospect. **FIX:** a small, explicit, pilot-district-scoped location-word strip
applied only to this specific conflict check (never to the shared `nameSimilarity()` used
elsewhere, to avoid unintended blast radius).

**BUG 5 (same category as BUG 4):** `customer-match-materiality.ts` confirmed a domain match
unconditionally — contrary to the owner's explicit rule ("exact verified website/email domain
PLUS corroborating name/postcode"). **FIX:** domain alone, without corroboration, is now
`"probable"` (held for review), never `"confirmed"`.

**Verification:** Independent pre-release leakage verifier built
(`scripts/lead-production/verify-customer-leakage.ts` — deliberately does not reuse the main
matcher's tier logic) and run against the corrected, fully reprocessed 5-district pilot (zero live
provider calls — every stage read from already-stored, phone-fix-reprocessed checkpoints):
**RESULT: PASS, 0 confirmed leaks**, released usable count 177 → 175 (exactly the 2 real leaks
removed), 2 correctly-demoted probable/held cases surfaced for human review (Franzos - Ilford,
Chocoberry - Ilford — neither silently excluded nor silently released). `npm run typecheck`/
`build` clean; 27 `test:lead-production-*` suites individually re-run, all ALL PASSED, including 2
new suites (40 assertions total) with the real leaked cases as permanent regression fixtures.

**See also:** `scripts/lead-production/normalize.ts`, `scripts/lead-production/load-customers.ts`,
`scripts/lead-production/match-customers.ts`, `scripts/lead-production/customer-resolution-after-
google.ts`, `scripts/lead-production/customer-match-materiality.ts`,
`scripts/lead-production/run-final-scoring-stage-v2.ts`,
`scripts/lead-production/verify-customer-leakage.ts`,
`scripts/test-lead-production-customer-suppression-fix.ts`,
`scripts/test-lead-production-customer-leakage-verifier.ts`, `docs/11_ISSUES_LOG.md` (ISS-0034),
`docs/09_DECISIONS.md`, `VERIFY_BEFORE_CLAIMING.md` (2026-08-03 entry).

## 2026-08-03 (same day, follow-up) — wrong authoritative customer file used for the first audit; 3 new verifier false positives found and fixed

**BUG (process, not code):** the customer-suppression audit above was run against `magna-
customers.csv`, not the file the owner had actually supplied as authoritative
(`CustomersProjects81.csv`). Confirmed via SHA-256 that these are genuinely different files (7925
vs 8050 rows). Re-ran the full pilot against the authoritative file: the released usable-lead-ID
set came back byte-identical (same 175 leads, same 2 real leaks), so the PASS conclusion held, but
had not been formally proven against the correct source until this pass.

**BUG 6:** `verify-customer-leakage.ts`'s new exact-trading-name-alias route treated an alias match
as confirmed on its own. A T/A-parsed alias is exactly as reusable/generic as a bare trading name —
real case: "Spice Hut" is an exact alias shared by 5 completely unrelated customers in different
towns. The owner's own rule requires "exact trading-name alias + postcode" for confirmed — alias
alone is not enough. **FIX:** alias match now requires postcode agreement to confirm; without it,
held as probable.

**BUG 7:** the new exact-full-address route treated an address match as confirmed regardless of
name evidence. Real case: "Kings Diner" occupies the same premises as an unrelated existing
customer, "Madoona's Ltd T/A Morley's" — a flatly different business name (a genuine "different
operator moved into the old premises" case). The owner's rule explicitly lists "same address with
uncertain operator" as probable, never confirmed on address alone. **FIX:** address match now
requires the name not to conflict, plus postcode or name corroboration, to confirm.

**BUG 8:** the domain-confirmation route accepted name-similarity corroboration with NO geographic
agreement at all. Real case: "PHAT Buns - Romford" (legal entity "Phat Buns London Ltd") shares
only its brand-wide domain (phatbuns.co.uk) with "Cha Sha Hounslow Ltd T/A Phat buns hounslow" — a
different company, in a different town, using a location-prefixed email on the same shared brand
domain: a textbook multi-franchise-location pattern, not the same business. **FIX:** domain +
name-corroboration now also requires the same postal district, matching the "foundational
geographic gate" principle already used throughout this codebase
(`customer-match-materiality.ts`).

**Verification:** all 3 new bugs were caught by extending the verifier's own regression suite
before they ever reached a certificate. Final result against the authoritative source, across
Master, CTO, and all 5 Sales Pro exports: **PASS, 0 confirmed leaks**, 9 correctly-held
probable/review cases (2 previously known + 7 new). `npm run typecheck`/`build` clean; 27
`test:lead-production-*` suites individually re-run, all ALL PASSED.

**See also:** `scripts/lead-production/verify-customer-leakage.ts`,
`scripts/test-lead-production-customer-leakage-verifier.ts`,
`/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/` (versioned
authoritative customer-master package), `docs/11_ISSUES_LOG.md` (ISS-0034 follow-up),
`VERIFY_BEFORE_CLAIMING.md` (2026-08-03 follow-up entry).

## 2026-08-04 — probable matches were never actually removed from releasable outputs; a confirmed match sat in Held-Review instead of Customer Master Exclusions; entity-resolution configuration audit

**BUG 9 (critical, self-discovered):** `verify-customer-leakage.ts`'s PROBABLE tier was report-only
— it never removed a probable-matched lead from "Operationally Usable Leads" (or its Premium Level
0/Releasable Level 1/Key Accounts overlay subsets). Direct XLSX inspection proved all 5
probable-matched leads from the prior pass were still present in the releasable population.
**FIX:** new `scripts/lead-production/hold-probable-customer-matches.ts` moves every probable
match into Held-Review and strips it from the overlay sheets. Run against the real combined
workbook: Usable 175 → 170, Held-Review 61 → 66.

**BUG 10:** the UK phone comparison path (`normalisePhone`/`normaliseUkPhone`, used for ALL
customer matching) did not handle multiple phone numbers concatenated in one cell — unlike the
separate `resolveValidUkPhone()` used for candidate-phone export. Confirmed on 17 real "Office
Phone" cells in the authoritative customer master (e.g. "2045121102/Adnan- 07564235791").
**FIX:** new `extractAllUkPhoneComparisons()` in `normalize.ts` regex-extracts every embedded UK
number and normalises each independently; wired into `verify-customer-leakage.ts`'s customer
index. No new matches surfaced in the current population, but the phone index is now complete.

**BUG 11:** every exact-postcode candidate with only weak name correspondence was silently
dropped (`continue`, no record at all) rather than being logged as an explicitly-resolved "cleared"
candidate — violating the owner's "postcode must be a mandatory trigger, never silently
unresolved" rule, even though it never affected a real release decision. **FIX:** the per-pair
evaluation logic was extracted into a single shared `evaluateLeadCustomerPair()` (used by both the
unchanged release-decision path and a new audit-only `traceLeadCandidates()`), and the silent
`continue` was replaced with an explicit `tier: "clear"` result that the audit trail can report.
Zero behavioural change to the release path — all 30 then-existing `test:lead-production-*` suites
re-ran green immediately after the refactor, before any other change was made.

**BUG 12 (critical, self-discovered via the new entity-resolution candidate trace):** lead
IG1-202F5195 ("Monster Burger") independently resolves CONFIRMED (exact trading-name alias +
exact postcode IG1 4NF against inactive customer F362, "Food Villa Ltd T/A Monster Burger
(Closed)") but was sitting in Held-Review, not Customer Master Exclusions — held there by an
earlier, unrelated pipeline stage's own generic "business-name-overlap conflict" flag, from before
this session's alias+postcode confirmation rule existed. Never release-blocking (Held-Review is
not a releasable sheet), but a real categorisation defect the owner's reconciliation rules require
to be caught. **FIX:** new `scripts/lead-production/exclude-confirmed-customer-matches.ts` scans
BOTH Usable and Held-Review (never assumes a sheet's placement is already correct) and moves any
CONFIRMED-tier lead into Customer Master Exclusions. Run against the real workbook: Held-Review
66 → 65, Customer Master Exclusions 19 → 20; Usable unchanged at 170.

**Entity-resolution configuration audit:** built a 20-case hand-labelled calibration set
(`scripts/lead-production/run-entity-resolution-calibration.ts` + versioned CSV under
`/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/`) covering
every real pilot leak/probable case, 5 real true-negatives, and 8 synthetic engineered cases
(active/inactive customer controls, minor spelling difference, legal-name-only match, duplicate
NetSuite accounts). Result: 100% precision/recall on CONFIRMED decisions, 0 false
positives/negatives — explicitly caveated as a small hand-curated set, not a statistically powered
sample. New `scripts/lead-production/generate-entity-resolution-audit.ts` adds 9 sheets to
`campaign-002-existing-customer-leakage-audit.xlsx` (Entity Resolution Configuration, Phone/
Postcode/Address/Fuzzy-Name Trigger Candidates, Calibration Results, False Positive/Negative
Controls, Customer Match Reconciliation, Confirmed & Probable Detail) and regenerates the
zero-leakage certificate with the new documentation fields.

**Final reconciliation (by distinct lead, highest tier wins, across the full Usable + Held-Review
+ Customer Master Exclusions population, 255 leads independently re-checked):** 20 confirmed found
and removed (0 remaining anywhere releasable), 7 probable held (0 remaining anywhere releasable),
170 cleared, 170 final released.

**Verification:** all 31 `test:lead-production-*` suites (2 new this pass) individually re-run,
ALL PASSED; `npm run typecheck`/`build` clean.

**See also:** `scripts/lead-production/hold-probable-customer-matches.ts`,
`scripts/lead-production/exclude-confirmed-customer-matches.ts`,
`scripts/lead-production/generate-entity-resolution-audit.ts`,
`scripts/lead-production/run-entity-resolution-calibration.ts`,
`scripts/lead-production/verify-customer-leakage.ts`,
`scripts/test-lead-production-hold-probable-matches.ts`,
`scripts/test-lead-production-exclude-confirmed-matches.ts`,
`scripts/test-lead-production-entity-resolution-calibration.ts`,
`docs/11_ISSUES_LOG.md` (ISS-0034 follow-up), `docs/09_DECISIONS.md`,
`VERIFY_BEFORE_CLAIMING.md` (2026-08-04 entry).

## 2026-08-04 (same day, second follow-up) — component-level address matching, fuzzy-name matching, canonical-Master annotation, expanded calibration, and a self-inflicted account-code feedback-loop bug found and fixed before it ever reached a released output

**Four capability gaps closed**, all owner-directed (ISS-0034 follow-up item 2-4, 1):

1. **Component-level address matching** (`scripts/lead-production/address-components.ts`, new):
   parses unit/shop number, building number, building name, street, locality, town, postcode
   separately, instead of the prior flat whole-string Jaccard comparison. Real bug fixed while
   proving it against real data: the real Kings Diner lead (439 Downham Way) and its previously-
   assumed "same address" customer match (C1409, 453 Downham Way) are at DIFFERENT building
   numbers on the same street/postcode — the old whole-string comparison over-matched them purely
   because every other token overlapped. `compareAddressComponents()` now explicitly flags
   `premisesIdentifierConflict` (same postcode+street, different unit/building number = never a
   match) vs `compatiblePremises` (still requires name/phone corroboration to confirm, per the
   owner's "address similarity alone must not confirm" rule). A second real parser bug found via
   testing: customer address fields (Billing Address 1/2) never included the postcode, so
   `addressComponents.postcode` was silently always null for every real customer — fixed by
   appending the already-parsed canonical postcode before parsing.

2. **Fuzzy spelling/name-variation matching** (`scripts/lead-production/fuzzy-name-match.ts`,
   new): Damerau-Levenshtein edit distance, applied whole-string (joined/split-word tolerant, e.g.
   "Grill House"/"Grillhouse") and per-token best-match (misspelling tolerant, e.g. "Mohammed
   Grill"/"Mohamad Grill"), with singular/plural normalisation and a reported-only phonetic key.
   Never confirms alone — only supports an independent corroborating signal (≥0.85 similarity) or
   generates its own same-district-gated PROBABLE candidate (≥0.75). Real false positive found and
   fixed via the expanded calibration set: a single-token candidate name (e.g. "Chelmsford
   Takeaway" collapses to just "chelmsford" once the generic "takeaway" suffix is stripped)
   trivially scored a PERFECT token-best-match similarity against ANY customer containing that one
   word — wrongly confirmed against 3 unrelated Chelmsford-area customers. Fixed by requiring both
   sides to have ≥2 tokens before trusting the per-token comparison; the whole-string comparison
   (unaffected) still correctly catches genuine single-token spelling variants like
   "Rafiques"/"Rafique".

3. **Canonical-Master annotation** (`scripts/lead-production/annotate-canonical-master.ts`, new):
   corrects a stale "Final Outcome" companion column (rows moved between sheets by the hold/
   exclude scripts never had this column updated) and adds structured customer-match reporting
   columns (Matched Customer Name, Matched Customer Account Code(s), Customer Match Evidence,
   Customer Master Checksum) to every confirmed/probable row in the canonical combined-Master
   workbook — resolving the owner's flagged ambiguity between "the releasable Usable sheet" and
   "the canonical audit Master" (the full 7-sheet combined workbook, which already legitimately
   contains held/excluded rows).
   **CRITICAL BUG (self-inflicted, found and fixed before reaching any released output):** the
   first version of this script wrote the matched customer's account code into the EXISTING
   "NetSuite Customer Account Code" column — the same column `evaluateLeadCustomerPair()` reads as
   an independent, decisive MATCHING INPUT (an exact match there is an automatic CONFIRM, by
   design, for leads with a genuinely pre-supplied external account linkage). Writing report
   evidence into that exact input column created a self-confirming feedback loop: the very next
   trace run read its own annotation back as if it were independently-supplied evidence, silently
   upgrading genuinely PROBABLE (and even already explicitly CLEARED) leads to CONFIRMED. Real
   leads affected: "JK FRIED CHICKEN" and "The Grill Bros" (newly-discovered genuine probable
   matches, spuriously shown as confirmed), and — more seriously — the already owner-cleared
   "PHAT Buns - Romford" and "Spice Hut", whose stale annotated account codes survived a status-
   field patch and (for PHAT Buns specifically, since its match was to a single customer) were
   subsequently carried into a REAL SalesPro export CSV via `append-leads-to-salespro-export.ts`,
   where `verify-customer-leakage.ts`'s own independent re-check caught it as a genuine confirmed
   leak in a real distributable file (`salesProResult: FAIL`) before any release. Fixed by (a)
   never writing to "NetSuite Customer Account Code" — using a new report-only "Matched Customer
   Account Code(s)" column instead; (b) blanking the 32 already-corrupted rows in the real
   workbook and the 2 corrupted SalesPro CSV cells; (c) re-running the full hold/exclude/clear/
   annotate chain end-to-end from the corrected state, re-verifying `salesProResult: PASS`.

4. **Expanded entity-resolution calibration set** (`scripts/lead-production/generate-expanded-
   calibration-set.ts`, new): grew the labelled set from 20 to 103 cases (all 20 real confirmed
   exclusions, all 7 real probable/held cases, 24 real released true-negatives, and 52 synthetic
   engineered cases covering active/inactive controls, moderate-vs-strong name similarity, joined/
   split words, legal-name-vs-T/A, same-address-new-operator, reused phone numbers, shared
   franchise domains, generic-name controls, duplicate NetSuite accounts), split 80 calibration /
   23 holdout at authoring time. Final result: 100% precision/recall on BOTH subsets, 0 false
   positives/negatives, thresholds never adjusted after seeing holdout results. 6 real generator-
   authoring bugs were caught and fixed by the calibration run itself before ever reaching a
   report (mislabelled expected-difficulty name pairs, a real customer-master alias collision with
   a synthetic "The Kitchen" test case, an over-optimistic joined-word-confirms expectation,
   plus the single-token fuzzy false positive described in item 2 above).

**Reconciliation gate made override-aware:** a probable match released under an explicit, owner-
directed re-evaluation (item 5 below) is not an accidental leak — `generate-entity-resolution-
audit.ts`'s "remaining in releasable output" gate now excludes leads carrying a "Customer Match
Audit Warning" from the blocking count, while still reporting them transparently as a distinct,
separately-counted measure (never silently hidden).

**Two named probable cases re-evaluated and cleared** (owner item 5): Spice Hut (IG1-FA671913—
only a generic T/A alias shared by 5 unrelated customers, no postcode/phone/address/legal-identity
match) and PHAT Buns - Romford (RM1-015EC5DD — only a shared franchise domain at a different
district, no postcode/phone/address/legal-entity match) both meet the owner's explicit clearance
rule exactly — cleared back to Operationally Usable Leads with an explicit, permanent audit
warning recorded on the row (`scripts/lead-production/reevaluate-and-clear-probable-matches.ts`,
new — defensively re-derives full evidence and REFUSES to clear if any stronger signal is found,
never trusts a hardcoded "safe" list).

**Comprehensive re-hold with the improved matcher:** re-running `hold-probable-customer-matches.ts`
with the new component-address + fuzzy-name logic surfaced 5 genuinely new probable matches never
caught by the earlier (weaker) matcher run — "JK FRIED CHICKEN", "The Grill Bros" (both via
`exact_address_uncertain_operator` — the new component-address logic), "Grilled Peri Peri Ilford",
"Chicken Hut Ilford", "Ben's Fried Chicken" (all via `fuzzy_name_variation_same_district`) — held
and removed from their SalesPro exports.

**Final reconciliation (255-lead full population, independently re-checked):** 20 confirmed found
and removed (0 remaining anywhere releasable), 12 probable held total — 2 released under an
explicit owner-directed audit-warning override (Spice Hut, PHAT Buns), 0 remaining unaccounted for
— 165 cleared, 167 final released.

**Verification:** all 35 `test:lead-production-*` suites (6 new this pass) individually re-run,
ALL PASSED; `npm run typecheck`/`build` clean.

**See also:** `scripts/lead-production/address-components.ts`,
`scripts/lead-production/fuzzy-name-match.ts`,
`scripts/lead-production/annotate-canonical-master.ts`,
`scripts/lead-production/flatten-combined-master-to-csv.ts`,
`scripts/lead-production/reevaluate-and-clear-probable-matches.ts`,
`scripts/lead-production/append-leads-to-salespro-export.ts`,
`scripts/lead-production/generate-expanded-calibration-set.ts`,
`scripts/lead-production/verify-customer-leakage.ts`,
`scripts/lead-production/generate-entity-resolution-audit.ts`,
`scripts/test-lead-production-address-components.ts`,
`scripts/test-lead-production-fuzzy-name-match.ts`,
`scripts/test-lead-production-annotate-canonical-master.ts`,
`scripts/test-lead-production-reevaluate-clear-matches.ts`,
`scripts/test-lead-production-append-salespro-export.ts`,
`docs/11_ISSUES_LOG.md` (ISS-0034 follow-up), `docs/09_DECISIONS.md`,
`VERIFY_BEFORE_CLAIMING.md` (2026-08-04 second entry).

## 2026-08-05 — production batch (Saad/Saif/Shahzaib/Tahira/Wajahat/Hassan/Haleema): combined-master CSV side-artifact went stale after leakage corrections (ISS-0039)

**Bug (self-caught, found while auditing Saif's already-"complete" campaign-007 mid-batch):**
`generate-full-allocation-master.ts` (the two-source merge script used whenever a representative's
final population spans a reused-verbatim pilot district plus newly-discovered districts, e.g. RM1
+ RM2-RM10) writes BOTH `-master-combined.xlsx` and `-master-combined.csv` in one call. The
independent leakage verifier then runs, finds confirmed leaks / unresolved probable matches, and
`apply-leakage-certificate-decisions.ts` applies the corrections — but that script only ever
writes to the XLSX (`--out=<path>.xlsx`), never regenerates the companion CSV. Result: the CSV
sitting in `release/` silently kept the PRE-correction row counts and bucket assignments (e.g.
Saif's CSV showed 188 usable leads and 45 Held-Review rows after the certificate had already
corrected the XLSX to 175 usable / 53 held) while the XLSX, the CTO export (built from the XLSX),
and the delivered representative file were all correct. The release manifest had also hashed the
stale CSV.

**Root cause:** no step in the two-source-merge pipeline re-flattens the CSV after
`apply-leakage-certificate-decisions.ts` runs — the CSV write and the correction write are two
independent, unlinked script invocations with no ordering enforced by any wrapper.

**Impact:** Saif (campaign-007) and Tahira (campaign-009) and Hassan (campaign-011) — the three
representatives this batch whose final population required the two-source merge (own prior pilot
district reused verbatim + newly-discovered districts) — all had a stale `-master-combined.csv`
in `release/` at the point their leakage certificate first went PASS. Shahzaib, Wajahat, and
Haleema (single-source, no pilot district to reuse) were unaffected structurally, since their
Master export writes no separate combined CSV at all — `flatten-combined-master-to-csv.ts` was
run manually, and in each of those 3 cases it happened to be run only after corrections, so no
staleness occurred there by construction. No confirmed customer leak or unresolved probable match
was ever present in any DELIVERED CTO file or representative release copy — both are always built
from the (correct) post-correction XLSX. The stale artifact was the side-by-side `.csv` release
file only.

**Fix:** for Saif and Tahira, re-ran `flatten-combined-master-to-csv.ts --force-overwrite-release`
against the corrected XLSX immediately upon discovery, then regenerated both campaigns' release
manifests (`--force-overwrite-release`) to hash the corrected CSV. Hassan's CSV was regenerated
the same way as part of his normal flow (correction → immediate re-flatten), since this bug had
already been identified by that point in the batch. For Wajahat and Haleema (single-source, no
merge), `flatten-combined-master-to-csv.ts` was deliberately sequenced AFTER
`apply-leakage-certificate-decisions.ts` from the start, avoiding the bug by construction rather
than needing a later fix.

**Process rule going forward (not yet enforced in code — a genuine remaining gap):** any campaign
using the two-source merge pattern must re-run `flatten-combined-master-to-csv.ts
--force-overwrite-release` against the corrected XLSX, and regenerate the release manifest,
immediately after `apply-leakage-certificate-decisions.ts` — never rely on the CSV that
`generate-full-allocation-master.ts` wrote before corrections. Recorded here rather than silently
worked around because it is a real, repeatable process gap that will recur for any future
two-source-merge campaign unless a wrapper script enforces the ordering.

**Verification:** re-ran the independent leakage verifier against each corrected combined-master
XLSX after every fix (all PASS), and independently re-flattened + re-hashed the CSV in each
affected case; all 45 `test:lead-production-*`/`test:je-*` suites, typecheck, and build clean at
the end of the batch.

## 2026-08-16 — field-sales batch pre-flight (campaigns 017-020): customer-match-materiality.ts had no email or address evidence route, and never rescanned the full customer index after enrichment (ISS-0042)

**Bug:** two real candidates from the upcoming field-sales batch (Ayesha's campaign-017, Manraj's
campaign-020) would have leaked past every existing check. "BRIM Burgers - Barnet" only matches
its real Magna customer (F373) via a shared verified email — postcode and trading name both
disagree. "Rooster Chicken Purley" only matches its real Magna customer (R176, "ROOSTER POINT")
via a component-level street/building address match at an exact matching postcode — the names
share only the generic word "rooster". `customer-match-materiality.ts` had no email-comparison
route and no address-comparison route at all, and even if it had, nothing would have called it:
every customer-match check up to final-scoring only ever evaluates the one customer phase1's
name-similarity search happened to suspect, never the full customer index.

**Root cause:** `assessCustomerMatchMateriality` was built around phone/domain/postcode+name
evidence only — email and free-text address were both already-loaded customer-master fields
(Email/Invoice Email Address, Address 1/2/City) that nothing in this module ever read. Separately,
`run-final-scoring-stage-v2.ts` only ever refines a match phase1 already suspected — by design,
for the same reason `customer-resolution-after-google.ts` never opens a fresh search (documented
tradeoff, see ISS-0038) — so a customer with zero name-similarity overlap to the candidate is
structurally invisible to the whole operational pipeline, no matter how strong its own evidence
is once enrichment data exists.

**Fix:** added `exact_email` (unconditional confirm on a shared exact email, mirroring
`exact_phone`) and `exact_address_same_postcode` (component-level address match via the existing
`address-components.ts`, gated on exact full-postcode agreement and no premises-identifier
conflict) evidence tiers to `customer-match-materiality.ts`. Added `scanFullCustomerIndex` to
`run-final-scoring-stage-v2.ts`, run unconditionally against every customer at final-scoring time
(the first point candidate phone/email/address are all simultaneously available), using the same
evidence rules; only the more material of the phase1-chain result and the full-scan result is
used, so an already-correct outcome can never be made less material. Both new fields on
`MatchedCustomerRecord`/`CustomerMatchMaterialityInput` are optional — every pre-existing call
site and test fixture with no email/address populated degrades to "no evidence" exactly like any
other missing identifier, never a fabricated match (proven in test case 20).

**Also fixed in the same pass:** `commercial-review-filter.ts`'s single-word-brand naming-coverage
gap, honestly recorded but not fixed on 2026-08-09 (`docs/09_DECISIONS.md`) — see the full ISS-0042
detail in `docs/11_ISSUES_LOG.md` for the alias-file and `bareBranchSuffixApproved` fix.

**Impact:** neither leaked lead has been released — both belong to campaigns 017/020, which have
config only and have not yet been run live. Caught before any live discovery or paid enrichment
call for this batch, not after.

**Verification:** `npm run typecheck`/`build` clean; all 47 `test:lead-production-*`/`test:je-*`
suites individually re-run, ALL PASSED (one unrelated transient network flake on the live
`test:je-supabase` integration test, cleared on immediate re-run). Full detail, real-case
evidence, and regression test references: `docs/11_ISSUES_LOG.md` ISS-0042.
