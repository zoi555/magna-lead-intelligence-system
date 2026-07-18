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
- **Not fixed here (separate stale project):** `magna-lead-intelligence-system-pngu` — a duplicate
  Vercel project auto-created at some point — still runs a legacy custom Install Command
  (`git config --global url."https://x-access-token:${GITHUB_TOKEN}@..." insteadOf ssh://...`) left
  over from an earlier stopgap, and has no `NPM_TOKEN`, so it fails with `E401 unauthenticated` on
  the GitHub Packages fetch. It is not the project this app deploys from. See ISS-0019.
