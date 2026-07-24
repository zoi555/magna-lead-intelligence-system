# Lead Production — Handover

Generated: 2026-07-23. This document is the single continuation record for the lead-production
project so work can resume without reconstructing context from terminal archaeology. Update it
after every milestone (see `docs/09_DECISIONS.md` for the commit discipline this follows).

## Active branch and current HEAD

- **Branch:** `feature/mvp-vertical-slice-001` (per explicit instruction: do not create another
  branch, do not merge to `main`, do not deploy). See `docs/BRANCH_REGISTER.md` for the full
  branch audit — commits are not branches; this is 92 commits on one branch, not 92 branches.
- **Local HEAD at last push:** `d67279b7b1442cb4fe8a13d7356b3a58738885d0` — "docs: record v2 lock,
  orchestrator completion, and RM1 dry-run session" (2026-07-23 21:29).
- **Working tree at time of writing this document:** 4 new untracked paths not yet committed —
  `config/` (the 4 new schema/assignment JSON files, this session), `docs/77_LEAD_SCHEMA_V1_SUMMARY.md`,
  `docs/BRANCH_REGISTER.md`, plus this file. Two pre-existing untracked files remain deliberately
  uncommitted (`scripts/export-operational-leads.ts` — pre-existing, not part of this work;
  `scripts/lead-production/generate-release-review.ts` — v1-era, superseded by
  `generate-release-package-v2.ts`).

## Commit register (all 92 commits on this branch, oldest → newest)

Full purpose/detail is in each commit's own message (`git log --oneline main..HEAD`); this
register gives the reconstruction anchor points. Tests/build status: this branch's own commit
discipline required a passing typecheck/test/build before each commit (see individual commit
messages and `docs/15_AI_WORK_LOG.md` session entries for command/output records) — not
re-tabulated per-row here to keep this table usable; see "Continuation commands" below to
re-verify at any point.

| # | Date | SHA (short) | Purpose |
|---|---|---|---|
| 1 | 07-12 | 8d6919f | Monitored FSA pipeline, animated flow network, reusable map engine |
| 2 | 07-12 | 62c94bf | Refine lead quality scoring and customer matching |
| 3 | 07-12 | 75eb76b | Source registry and settings readiness dashboard |
| 4 | 07-12 | 7d386e9 | Source adapter readiness for enrichment/platform evidence |
| 5 | 07-12 | dd435bc | Refine pipeline monitoring, map usability, telesales-safe exports |
| 6 | 07-12 | 31ab4da | Final MVP validation report (docs) |
| 7 | 07-13 | 03afe34 | High-coverage acquisition infrastructure, national data model |
| 8 | 07-13 | 1309f74 | Google Places enrichment, source lineage reporting |
| 9 | 07-13 | bd97bcd | TW platform-first lead generation run |
| 10 | 07-13 | 31a47c9 | TW platform-first lead generation run (continued) |
| 11 | 07-14 | 2c0bf18 | Discovery run builder, portable geospatial foundation |
| 12 | 07-15 | db1e3a2 | Consume independent geospatial platform (refactor) |
| 13 | 07-15 | 1810951 | MapLibre from npm, drop /vendor dependency (geospatial v0.1.1) |
| 14 | 07-15 | d910c17 | Map functional interaction pass (@geospatial/map v0.1.2) |
| 15 | 07-16 | 2d694d8 | Just Eat Discovery Stage 1 (canonical Supabase persistence) |
| 16 | 07-16 | 8dc3418 | Fix worker UUID crash on empty queue + observation-delete FK |
| 17 | 07-16 | 4d7fd6d | Fix execution progress counter + lease-expiry double-processing |
| 18 | 07-16 | d11d6c8 | Geography Standard v1.0 (platform-wide) |
| 19 | 07-16 | 374801f | De-duplicate generic geography (refactor Part 1.4) |
| 20 | 07-17 | b0f0596 | Multi-source foundation — Uber Eats + Deliveroo adapters, consolidation |
| 21 | 07-17 | 388cd91 | Discovery package v0.3.0, provider decision pack, consolidation persistence |
| 22 | 07-17 | 238bc5c | OS Open Names place ingestion + place-aware run planning (A1) |
| 23 | 07-17 | 34c8ebe | JE 96-field parser, canonical duplicates, 3 live geography runs |
| 24 | 07-17 | 7bcf968 | Uber Eats pilot ready (Apify), guarded not executed |
| 25 | 07-17 | cb45798 | Calibrate Uber Eats parser to real Apify output |
| 26 | 07-18 | 790a253 | Quarantine provider geography mismatches |
| 27 | 07-18 | 282dccf | Persist Apify actor execution provenance |
| 28 | 07-18 | 34d23a3 | provider_executions timestamps, resume-safe pilot |
| 29 | 07-18 | db61cfa | Bounded replacement discovery provider (Uber) |
| 30 | 07-18 | af580de | Calibrate replacement actor payload |
| 31 | 07-18 | 1fb5d95 | Support broad borderline discovery (Uber) |
| 32 | 07-18 | b135db2 | Broad borderline diagnostic — UB1 recall incomplete (docs) |
| 33 | 07-18 | 5970442 | Consume geospatial package from GitHub Packages (build fix) |
| 34 | 07-18 | 2d6f4fb | Log GitHub Packages migration, Vercel status, ISS-0019 (docs) |
| 35 | 07-18 | bb2e268 | Record dual Vercel deployment topology (docs) |
| 36 | 07-18 | 8575514 | Distinguish district-localisation precision from recall (Uber) |
| 37 | 07-18 | 7389898 | Research discovery actors, define bounded UB1 benchmark (docs) |
| 38 | 07-18 | aab8764 | End-of-session update — Vercel topology + Uber wrap-up (docs) |
| 39 | 07-18 | a938900 | Reconcile Vercel deployment IDs (docs) |
| 40 | 07-18 | e44ad9d | Correct UB1 benchmark recall + actor prioritisation |
| 41 | 07-18 | cf463c4 | Make storefront entity signals evidence-based |
| 42 | 07-21 | e329a79 | Canonical marketplace contract, JE UB1 proof, Uber import path |
| 43 | 07-21 | 72990dc | Additive migration for canonical contract, JE phone enrichment |
| 44 | 07-21 | 0ba0f25 | Apply canonical-contract migration to prod, JE phone batch, import screen |
| 45 | 07-21 | d6fa38a | Honest internal-beta interface, real import persistence, Deliveroo pilot |
| 46 | 07-21 | ea85689 | Honest source status labels, homepage real-data finish-out |
| 47 | 07-21 | e5636d5 | Create New Run wizard (conflict/override/draft-reopen) |
| 48 | 07-21 | f8a5e02 | One shared AspectLeadMap component |
| 49 | 07-21 | 17bd008 | Settings defaults panel, Create New Run tests, derived_query_units fix |
| 50 | 07-21 | d0cae9c | Additive migration for auth bootstrap + shared audit log |
| 51 | 07-21 | 31a33e8 | Fix app_audit_log inert INSERT grant (missing RLS policy) |
| 52 | 07-21 | 266c2c6 | Supabase Auth Stage 1 — login, callback, bootstrap |
| 53 | 07-21 | da4ce16 | Auth Stage 2 route protection (proven with real browser sessions) |
| 54 | 07-22 | d97e89c | Additive migration for persisted, audited tenant settings |
| 55 | 07-22 | 1aba6e6 | Real, persisted, RLS-backed Settings (GET/PATCH + UI) |
| 56 | 07-22 | 08d23c2 | je-run.ts no longer silently defaults to 'magna' tenant |
| 57 | 07-22 | d8967b7 | Correct homepage/run-detail metric semantics |
| 58 | 07-22 | f811307 | Wire geography-validation gate into live Just Eat worker |
| 59 | 07-22 | e71ab83 | Map shows literal "Boundary geometry unavailable" message |
| 60 | 07-22 | 3b0911a | Full real-browser proof of Create New Run + mobile overflow fix |
| 61 | 07-22 | b686a4b | Wire consolidation into real execution-completion path; live JE proof run |
| 62 | 07-22 | b2f5ae4 | Update test-create-new-run.ts for protected APIs |
| 63 | 07-22 | f8ccd8b | Step 20 — production auth proof, bootstrap-path cleanup |
| 64 | 07-22 | fc5063b | **Enforce run-scoped geography before operational consolidation** (geography hotfix) |
| 65 | 07-22 | d3f2dfc | Geography hotfix handover (commit fc5063b, audit event 4be92d93) (docs) |
| 66 | 07-22 | 3b80cfb | Record geography hotfix rollback and migration debt (docs) |
| 67 | 07-22 | 15ee4c3 | Add audited lead customer-comparison bridge |
| 68 | 07-22 | fca4a80 | Customer-master preflight-only mode |
| 69 | 07-22 | e43124a | Support NetSuite customer export column aliases |
| 70 | 07-23 | 57ddb0b | Use NetSuite inactive flag for customer lifecycle |
| 71 | 07-23 | 8728c52 | Add FSA identity/premises verification stage |
| 72 | 07-23 | 74bd669 | Add Google Places identity/premises stage |
| 73 | 07-23 | e9753c8 | Count Google Places retries against run-wide request cap |
| 74 | 07-23 | c9e7c89 | Two real defects found in live UB1 Google Places run |
| 75 | 07-23 | f55ce66 | Zero-new-calls reprocessing pass for Google-stage postcode fix |
| 76 | 07-23 | 68398d1 | Retain Google zero-result evidence |
| 77 | 07-23 | 6be3706 | Google-stage checkpoint merge for supplemental no-match rerun |
| 78 | 07-23 | ed3890c | Add Companies House stage |
| 79 | 07-23 | 3a48839 | Correct company_name_conflict/registered_address_conflict mislabel |
| 80 | 07-23 | 4358f75 | Zero-new-calls reprocessing pass for Companies House relabel fix |
| 81 | 07-23 | 198f987 | Add website enrichment stage |
| 82 | 07-23 | 510a14e | Add decision-maker public-profile stage |
| 83 | 07-23 | bd3b019 | Add final ownership/group rescreen stage |
| 84 | 07-23 | adfa1d7 | Add final qualification, scoring, and UB1 output stage |
| 85 | 07-23 | 9b87f14 | Never trust Companies House status from a non-decisive match |
| 86 | 07-23 | 73d94ab | Record overnight lead-production bridge session (docs) |
| 87 | 07-23 | 24a8727 | Self-derive Google-stage population from FSA checkpoint |
| 88 | 07-23 | 3114c86 | Add reusable full-territory lead-production orchestrator |
| 89 | 07-23 | 411f5cc | Record UB1 release audit + full-territory orchestrator session (docs) |
| 90 | 07-23 | 52c124a | **Calibrate lead qualification and scoring rules (v2 baseline, accepted canonical)** |
| 91 | 07-23 | 89c3be3 | Lock qualification/scoring rules v2, wire into orchestrator |
| 92 | 07-23 | d67279b | Record v2 lock, orchestrator completion, RM1 dry-run session (docs) |

| 93 | 07-23 | a9b419a | Milestone 1 — schemas and assignment version |
| 94 | 07-23 | d09bd66 | Milestone 2 — district and Sales Territory orchestration |
| 95 | 07-23 | 5711941 | Refactor — extract shared candidate-dossier module (verified byte-identical) |
| 96 | 07-23 | 2a10065 | Milestone 3 — 107-field Master exporter |
| 97 | 07-23 | f410791 | Milestone 4 — 108-column Magna Sales Pro exporter |
| 98 | 07-23 | 386112a | Milestone 5 — UB1 export proof (docs only; no code change) |
| 99 | 07-23 | d3fe76e | Milestone 6 (1/2) — close ISS-0028, full 13-suite test/build gate green |
| 100 | 07-23 | 3c93e09 | Milestone 6 (2/2) — pre-production certification doc, GO_FOR_RM1_LIVE |
| 101 | 07-24 | ed56cbf | Milestone 7 — 2 deterministic defects found/fixed on first live RM1 run |
| 102 | 07-24 | 8be932d | Docs — record RM1 live discovery + district acceptance |
| 103 | 07-24 | 86ae836 | fix: enforce customer master exclusion rule |
| 104 | 07-24 | 02af5a3 | fix: duplicate-run guard; resolve RM2 duplicate discovery |
| 105 | 07-24 | db0cdfd | Docs — record RM2 district acceptance |
| 106 | 07-24 | df52f16 | fix: cross-district dedup false-merged different chain/franchise premises |
| 107 | 07-24 | (pending) | Docs — record RM1-RM14 full territory acceptance (RM3-RM14 + combination) |

RM3-RM14 were run live via a session-local convenience script
(`run-district.ts`, not committed — a thin subprocess wrapper reusing every existing, already-
tested repo script; no new pipeline logic). RM2's duplicate-discovery-run incident (found
mid-run, before RM3 started) is recorded above; RM3-RM14 each ran cleanly with no repeat.

**Next dependency:** RM1 is live, complete, district-accepted, AND reprocessed under the
customer_master_exclusion rule (see
`/Users/homemac/Data/aspectlead-lead-production/output/rm1/2026-07-23T23-19-07Z-live/RM1-DISTRICT-VERIFICATION-REPORT.md`
and `.../rm1-v2-customer-master-exclusion-reprocess/`, outside the repo). RM2 requires explicit
owner authorisation per-district, same as RM1.

## Accepted UB1 checkpoints (outside repo)

Located under `/Users/homemac/Data/aspectlead-lead-production/output/ub1/` (not committed —
generated operational data):

- `2026-07-23T12-00-00Z-v2-calibration/` — historically accepted v2 run (11 files).
- `2026-07-23T13-00-00Z-v2-calibration-with-json/` — byte-identical rerun + full JSON master.
- `2026-07-23T13-30-00Z-release-package-v2/` — **the accepted UB1 v2 release package** (14 files;
  this is the package referenced as canonical UB1 evidence for exporter validation, Section 10).
- `2026-07-23T14-00-00Z-orchestrator-v2-replay/` and
  `2026-07-23T14-30-00Z-orchestrator-v2-replay-final/` — orchestrator-driven replays, verified
  byte-identical to the accepted historical output.
- `/Users/homemac/Data/aspectlead-lead-production/output/rm1/2026-07-23T15-00-00Z-request-plan-dry-run/`
  — RM1 (Nauman's first district) `--request-plan-only` dry run; every stage `ok: false` because
  RM1 has no Phase 1 checkpoint yet and no live discovery has been run for it.

## Qualification rules v2

`rulesetVersion: "v2"` is locked as canonical (commit `52c124a`, explicitly confirmed by the
project owner as the accepted baseline — "do not alter the v2 qualification philosophy or
thresholds unless a new deterministic defect is proven"). Full version identifiers live in
`scripts/lead-production/rules-versions.ts` (`RULES_VERSIONS`): qualification-v2-2026-07-23,
final-scoring-stage-v1 (unchanged), hard-gates-v1 (unchanged), customer-match-materiality-v1-
2026-07-23, normalize-v2-2026-07-23, channel-suitability-v1 (unchanged), output-schema-v2-
2026-07-23. `run-full-territory.ts` defaults its `final_scoring` stage to
`run-final-scoring-stage-v2.ts` unless `--use-v1-scoring` is explicitly passed.

## Schema versions (this session)

- `config/lead-production/master-schema-v1.json` — 107 canonical master fields.
- `config/lead-production/salespro-schema-v1.json` — 108-column Magna Sales Pro schema (20
  existing CTO columns unchanged + 88 new, approved order).
- `config/lead-production/cto-existing-field-mapping-v1.json` — the CTO's 20-column import
  template, verbatim labels.
- Human-readable summary: `docs/77_LEAD_SCHEMA_V1_SUMMARY.md`.
- **Not yet built:** the actual exporter code that reads these config files and produces the
  Master workbook / Sales Pro CSV (Sections 8/9 of the current instruction — not started).

## Assignment version

- `config/lead-production/sales-territories-v2.json` — 13 representatives, 112 postcode
  districts (Nauman RM1–RM14, Manraj KT1–KT24, Ayesha NW1–NW10, Kunz TW1–TW10, Meer TW11–TW20,
  Naseh UB1–UB5, Saad UB6–UB11, Saif HA0–HA5, Shahzaib HA6–HA10, Tahira WD3–WD7, Wajahat
  WD17/18/19/23/24/25, Hassan EN1–EN5, Haleema EN6–EN11). `assignmentVersion: "v2"`.
- Historical predecessor (22-representative table) marked, not deleted:
  `/Users/homemac/Data/aspectlead-lead-production/input/territory-assignments-tonight.csv` +
  companion `.SUPERSEDED.md` marker.
- **Important, honest status:** `scripts/lead-production/load-assignments.ts` (the module the
  orchestrator actually calls) still reads a tabular CSV/Excel assignment file, NOT
  `sales-territories-v2.json` directly — the new JSON config exists and is fully validated, but
  the orchestrator has not yet been wired to consume it natively. This is required, un-started
  work before Section 4 (district-level orchestration) can run against the v2 assignment
  structure. Flagged here rather than left implicit.

## Orchestrator status

**Milestone 2 complete.** `scripts/lead-production/run-full-territory.ts` (unchanged) runs one
*Postcode District* end-to-end through all 8 stages. New this milestone:
`scripts/lead-production/territory-assignment-v2.ts` natively loads and validates
`sales-territories-v2.json` (inclusive range expansion, non-contiguous district lists, global
representative-ownership uniqueness, map-required-only-for-field-sales). New
`scripts/lead-production/run-sales-territory.ts` expands one representative's Sales Territory
into its Postcode Districts and runs `run-full-territory.ts` once per district (own run ID, own
immutable checkpoint dir) sequentially — an isolated district failure is recorded as
`held_for_source_failure` and does not stop or corrupt any other district. After all districts
are attempted it reconciles: per-district population invariant (raw/canonical vs. final-outcome
row count must match exactly), cross-district tiered-identity dedup (reuses the same
company-number/phone/domain/postcode+identity hierarchy as customer-match-materiality.ts, new
`scripts/lead-production/district-reconciliation.ts`), and derives one of the 6 required
territory statuses. Writes `district-summary.csv`, `district-reconciliation.csv`,
`territory-summary.csv`, `territory-reconciliation.csv`, `territory-run-manifest.json`,
`source-request-summary.csv`, `data-quality-warnings.csv`. Supports `--resume`,
`--request-plan-only` (zero live calls, proven via a real 5-district Hassan/EN1-EN5 smoke test),
and per-source request caps passed through to every district. 60+ assertions in
`scripts/test-lead-production-territory-v2.ts` cover all 112 districts/13 reps individually, the
range-expansion utility (incl. HA0, Wajahat's non-contiguous set), 4 synthetic
validation-failure modes, dedup tiers, invariant checking, and status-precedence rules.
**Not yet done:** live discovery has never been triggered by this orchestrator for any of the
112 districts — Phase 1 checkpoints only exist for UB1 and earlier calibration territories, so a
real (non-request-plan-only) run against, e.g., RM1 will still refuse at Phase 1 without a
supplied `--discovery-run-id`.

## Exporter status

**Milestones 3, 4, and 5 complete.** `scripts/lead-production/candidate-dossier.ts` (extracted
from the accepted UB1 release-package generator, verified byte-identical) joins every upstream
checkpoint into one Dossier per candidate. `scripts/lead-production/master-field-resolver.ts`
maps a Dossier + Sales Territory context to all 107 canonical Master fields — honestly: a field
is populated only when genuine pipeline evidence exists, otherwise left `null` and recorded in
a `dataQualityGaps` list, never guessed. `scripts/lead-production/generate-master-export.ts`
writes the 14-tab combined campaign workbook and 9-sheet per-representative workbook (xlsx).
`scripts/lead-production/generate-salespro-export.ts` writes the 108-column Sales Pro CSVs
(new-leads / reactivation / key-accounts, strictly separated), enforcing exact CTO label/order
and refusing to write any value outside a column's allowed dropdown/range set.

Two real bugs were found and fixed while validating against UB1: (1) the physical-premises enum
matcher didn't recognise `physical-premises.ts`'s actual `"no_physical_premises_evidence"`
string, silently leaving candidates' premises status blank; (2) the Sales Pro dropdown validator
initially treated `"0-100"` (a numeric-range descriptor on 4 score columns) as a literal
categorical value, flagging every real score as a violation. Both fixed and regression-tested
against the real values.

**UB1 export proof (Milestone 5)**, generated at
`/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T23-00-00Z-milestone5-export-proof/`
(outside the repo — no lead data is ever committed): combined + representative Master
workbooks, all 3 Sales Pro files, a 5-record controlled-test file, and
`ub1-export-reconciliation-report.md` proving every required count (94/47/30/17/11/36), full
Lead ID linkage both ways, exact 107/108 field counts, and zero dropdown violations. Automated,
repeatable versions of every check: `scripts/test-lead-production-master-export.ts`,
`scripts/test-lead-production-salespro-export.ts`.

**Not yet done:** the exporters have only ever been run in single-district (ad-hoc explicit
checkpoint dirs) mode against UB1. The `--territory-manifest` mode (reading a
`run-sales-territory.ts` output) is implemented but unproven — no real multi-district territory
has completed live discovery yet to test it against.

## Geography hotfix — already resolved, not re-opened

A stale plan-mode artifact for a "Just Eat geography consolidation hotfix" surfaced in this
session's environment; it describes exactly the work already completed and accepted in commits
`fc5063b`/`d3f2dfc`/`3b80cfb` (2026-07-22) — `consolidateRun()` now intersects against
`provider_geography_validations` scoped to `run_id`, `je-run.ts`'s redundant explicit
consolidation call was removed, and the production repair of run `c301cbbc` was applied (94 of
646 candidates retained as genuinely `valid_geography`; see
`docs/HANDOVER_GEOGRAPHY_HOTFIX_2026-07-22.md` and `docs/09_DECISIONS.md`/`docs/11_ISSUES_LOG.md`
for the accepted rollback SQL and migration debt). **No action taken on this stale artifact —
the work it describes is already done.**

## Unresolved issues (see `docs/11_ISSUES_LOG.md` for full detail)

- **ISS-0027** — website `tel:`/`mailto:` href decoding follow-up (open, non-blocking).
- **ISS-0028** — pre-existing `scripts/test-lead-production-google.ts` line-325 regex false
  positive on `types.ts` (documented, non-blocking, narrowly scoped fix deferred to a separately-
  approved test-maintenance pass — see full root-cause writeup in `docs/11_ISSUES_LOG.md`).
- Migration debt recorded from the geography hotfix (see `docs/09_DECISIONS.md`) — not reopened
  this session, tracked there.

## Continuation commands

Typecheck / full lead-production test suite / build (run from repo root):

```
npx tsc --noEmit
npx tsx scripts/test-lead-production-final-scoring-v2.ts
npx tsx scripts/test-lead-production-full-territory.ts
npm run build
```

Re-run the RM1 request-plan dry run (no live calls, safe):

```
npx tsx scripts/lead-production/run-full-territory.ts \
  --territory=RM1 --request-plan-only
```

Regenerate the accepted UB1 v2 release package (zero new external calls, reads existing
checkpoints only):

```
npx tsx scripts/lead-production/generate-release-package-v2.ts \
  --territory=ub1 \
  --final-scoring-dir=/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T13-00-00Z-v2-calibration-with-json
```

## Customer master exclusion rule (2026-07-24)

Permanent, unconditional hard exclusion for any candidate confirmed matching any Magna
customer-master record, of ANY lifecycle status (`customer_master_exclusion` — see
`docs/09_DECISIONS.md`). Reactivation retired as an operational lead category. UB1 and RM1 both
reprocessed from existing evidence (zero new external calls): UB1 20 exclusions (was 13 under
the old active+reactivation split), RM1 4 (was 3) — both territories' genuinely-qualified
populations unchanged (UB1 47, RM1 60). Full regression suite:
`scripts/test-lead-production-customer-master-exclusion.ts` (`npm run
test:lead-production-customer-master-exclusion`).

## KT1-KT24 — Manraj's full Sales Territory, ACCEPTED (2026-07-24)

All 24 Postcode Districts run live end-to-end and individually accepted, using the pipeline
already accepted at the end of RM1-RM14 processing (commit `fbd2d61` — no new code changes were
needed or made). Territory totals: 9586 raw = 969 geography-valid + 8617 rejected (exact, every
district). 813 raw candidates -> **25 genuine cross-district duplicates removed -> 788 unique
candidates** = 29 customer-master exclusions + 99 excluded groups + 364 usable (221 premium, 143
releasable L1, 21 key accounts) + 6 held + 290 hard-rejected. All **exported** Sales Pro Lead IDs
(343 new leads + 21 key accounts + 29 customer-master exclusions = 393 of the 788 total
candidates — held/hard-rejected/excluded-group candidates exist only in the Master workbook, by
design, and correctly have no Sales Pro row) verified present in the Master workbook's Evidence
Register (393/393). Zero customer-master leakage into any rep-facing/Sales Pro/map output,
verified explicitly. Single representative owner ("Manraj") confirmed across all 788 rows in
every Master sheet.

No new pipeline defect was found during KT processing — the already-fixed cross-district dedup
tiering and both exporters' independent 25-duplicate agreement carried over cleanly from
RM1-RM14. One concurrent (not duplicate) live discovery execution was encountered at KT1: the
RM2-era duplicate-run guard correctly blocked a fresh trigger against an already-running
execution; the run was allowed to complete naturally and its output used as KT1's checkpoint —
expected guard behaviour, not a defect.

**Documentation-only reconciliation (2026-07-24, post-acceptance, no live calls)**: re-derived
all 12 requested checks directly from the final exported files. Confirmed exact: 788 unique
post-dedup population; 343 new leads; 21 key accounts; 364 total usable; 6 held; 290
hard-rejected; 29 customer-master exclusions; 99 excluded groups; 364+6+290+29+99 = 788 sums
exactly; Sales Pro row counts (343/21/29) match their respective Master sheets exactly; all 393
exported Sales Pro Lead IDs present in both the Evidence Register and their respective Master
sheet; zero overlap between held/hard-rejected/customer-excluded/group-excluded records and the
representative-facing new-leads/key-accounts files. This pass also corrected an earlier
documentation wording error — "every Sales Pro Lead ID (788/788)" should have read "every
**exported** Sales Pro Lead ID (393/393)" — no exporter defect was found, the underlying numbers
were always correct. Full detail (including the per-item table):
`/Users/homemac/Data/aspectlead-lead-production/output/territories/manraj/combined-2026-07-24/KT1-KT24-TERRITORY-RECONCILIATION-REPORT.md`
(outside the repo, no lead data committed).

**Next territory (Ayesha, NW1...) requires separate owner authorisation.** No new branch
created, no merge to `main`, no deployment.

## RM1-RM14 — Nauman's full Sales Territory, ACCEPTED (2026-07-24)

All 14 Postcode Districts run live end-to-end and individually accepted. Territory totals:
8542 raw = 855 geography-valid + 7687 rejected (exact, every district). 748 raw candidates ->
**25 genuine cross-district duplicates removed -> 723 unique candidates** = 26 customer-master
exclusions + 76 excluded groups + 388 usable (236 premium, 152 releasable L1, 30 key accounts) +
2 held + 231 hard-rejected. Every Sales Pro Lead ID (358 new leads + 30 key accounts = 388)
verified present in the Master workbook. Zero customer-master leakage into any rep-facing/Sales
Pro/map output, verified explicitly.

A significant defect was found and fixed mid-combination: the original cross-district dedup
logic wrongly merged 81 of 748 candidates — mostly different branches of the same chain/
franchise sharing only a corporate website domain or phone line (Ember Inns, Pizza Hut Delivery,
Shell, Favorite Chicken & Ribs, Sizzling Pubs) — each a real, distinct sales opportunity that
would have been silently dropped. Fixed to require same-postcode corroboration (commit
`df52f16`) before the territory-level outputs below were finalised.

Full detail: `/Users/homemac/Data/aspectlead-lead-production/output/territories/nauman/combined-2026-07-24/RM1-RM14-TERRITORY-RECONCILIATION-REPORT.md`
(outside the repo, no lead data committed). Per-district reports:
`.../output/rmN/<timestamp>-live/RMN-DISTRICT-VERIFICATION-REPORT.md` for RM1/RM2 (RM3-RM14
verified inline via the same checks, not separately written up as files, given the volume — all
counts recorded in the combined territory report's per-district table).

**Next territory (Manraj, KT1-KT24) requires separate owner authorisation, same as every RM
district did.** No new branch created, no merge to `main`, no deployment.

## RM2 — live, complete, district-accepted (2026-07-24)

Discovery run `3a8d156e-334d-44b5-9594-d41ab6862414` (kept authoritative after a duplicate-run
comparison — see `docs/09_DECISIONS.md`): 639 raw → 46 valid + 593 rejected (639 total) → 39
candidates. Full 8-stage pipeline live: FSA 35, Google 35/800, Companies House 82/600 + 6/250
docs, website 17 domains. Reconciliation: 39 = 0 customer-master exclusions + 4 excluded groups +
21 usable (11 premium, 10 releasable L1, 1 key account) + 0 held + 14 hard-rejected. Zero
confirmed customer-master matches this district (genuinely 0, verified not assumed). Full
report: `.../output/rm2/2026-07-24T00-26-03Z-live/RM2-DISTRICT-VERIFICATION-REPORT.md`.

## RM1 — live, complete, district-accepted (2026-07-24)

Discovery run `e3f8e455-14bd-41cd-93a0-716147de5b4f` (tenant `magna`): 688 raw → 135 geography-
valid + 553 rejected (688 total, zero missing) → 113 consolidated candidates. Full 8-stage
pipeline run live end-to-end (FSA 98 calls, Google 98/800, Companies House 235/600 combined +
16/250 documents, website 55 domains) — all within certified caps, zero integrity failures.
Final reconciliation: 113 Phase 1 candidates = 113 final-scoring rows (self-verified). Master/
Sales Pro exports generated for Nauman (60 usable: 33 premium, 27 releasable L1, 3 key
accounts). Full detail:
`/Users/homemac/Data/aspectlead-lead-production/output/rm1/2026-07-23T23-19-07Z-live/RM1-DISTRICT-VERIFICATION-REPORT.md`
(outside the repo, not committed).

Two real deterministic defects found and fixed live (commit `ed56cbf`) — both were latent gaps
never exercised before this run (the orchestrator's phase1 branch had never run against a fresh
non-UB1 territory).

## Single genuine owner decision still open

RM2–RM14: each district requires the same explicit, scoped owner authorisation RM1 received
(live discovery is a real-cost, real-data action) — the orchestrator does not proceed to a new
district without it. See the RM1 verification report's "Proposed next command" for the exact
RM2 discovery command.
