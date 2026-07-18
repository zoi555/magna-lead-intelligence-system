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
