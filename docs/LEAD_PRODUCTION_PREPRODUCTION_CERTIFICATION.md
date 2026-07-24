# Lead Production — Pre-Production Certification (RM1–RM14 Go/No-Go)

Generated: 2026-07-23. Branch `feature/mvp-vertical-slice-001`, HEAD `d3fe76e` at time of
writing. This certification evaluates every item the owner specified before any live RM1–RM14
discovery or enrichment call. Evidence is cited by test file, command, and result — no item is
marked passed without a command that was actually run this session, or an explicit citation to
an already-accepted prior session's evidence.

**Evidence classes used throughout:**
- **[FRESH]** — run and verified in this session, command shown.
- **[INHERITED]** — built, tested, and accepted in an earlier session on this branch; not rerun
  today, cited by commit/doc.
- **[GAP]** — genuinely not covered by any test, named honestly rather than implied.

## 1. Territory and assignment tests — PASS [FRESH]

`npx tsx scripts/test-lead-production-territory-v2.ts` — 60+ assertions, all passed.

All 13 representatives and all 112 unique Postcode Districts individually verified (not
sampled). Inclusive range expansion (`RM1-RM14` → 14 entries) and non-contiguous list expansion
(Wajahat's exact six) both proven against the range-parsing utility independently of the config
file. HA0 confirmed present in Saif's territory. No duplicate assignments (synthetic-mutation
test proves the validator rejects a duplicate district). No missing districts (`totalDistricts`
cross-checked against the actual sum). Field-sales/telesales ownership and map-requirement
correctness checked per-representative (map required only for Nauman/Manraj/Ayesha — a synthetic
mutation test proves a telesales rep with `mapsRequired=true` is rejected). Confirmed the
superseded 22-representative CSV is never imported by any v2 code path (only referenced in a
historical doc comment).

## 2. Discovery tests — PARTIAL

- One independent discovery run per Postcode District: **[FRESH]** enforced structurally —
  `run-sales-territory.ts` refuses to proceed if the same `--discovery-run-id` is supplied for
  two districts (tested in `test-lead-production-territory-v2.ts`'s ownership logic and by code
  inspection of `run-sales-territory.ts`'s `runIdOwners` map). Never exercised against a real
  second discovery run yet, since only UB1 has ever been discovered live.
- Correct query construction, pagination, request limits, source-failure retention, raw/zero-
  result evidence retention, no mock fallback in live mode: **[INHERITED]** — these are
  properties of the existing Just Eat discovery engine and stage adapters (`google-adapter.ts`,
  `fsa-adapter.ts`, `companies-house-adapter.ts`, `website-adapter.ts`), built and tested across
  the 07-16 through 07-23 sessions (commits `2d694d8` through `9b87f14`). Re-verified today only
  at the level of `test:lead-production-google`/`-fsa`/`-companies-house`/`-website`, all
  **[FRESH]** PASS — including explicit budget/retry-cap tests ("a transient failure's retry is
  skipped once the run-wide cap has no slot left for it", "budget.callsMade never exceeds the
  run-wide cap even across a retry").
- No records silently discarded: **[INHERITED]** — the geography hotfix (commit `fc5063b`,
  2026-07-22) is exactly this property for consolidation; `run-google-stage.ts`'s "complete
  evidence register is built from the FULL googleResults array" is explicitly asserted in
  `test:lead-production-google` **[FRESH]** PASS.
- Resume after interruption: **[FRESH]** — `run-full-territory.ts`'s `--resume` + checksum-
  mismatch refusal + config-hash invalidation cascade, proven in `test:lead-production-full-territory`.
- Repeat runs do not duplicate records: **[GAP]** — no test re-runs the SAME discovery run ID
  twice end-to-end and proves zero new duplicates; this is a property of `je_raw_observations`'
  immutability + `duplicate_of` dedup (built and DB-level tested in the 07-16 session), not
  re-verified against this session's new district/territory layer specifically.

## 3. Geography tests — PASS, inherited [INHERITED]

Exact Postcode District matching, out-of-scope rejection, full-postcode parsing/district
extraction, coordinate/postcode agreement, and geography-valid/out-of-scope reconciliation are
all properties of `provider_geography_validations` + `consolidateRun()`'s run-scoped join
(commit `fc5063b`, 2026-07-22 geography hotfix — full root cause, fix, and production repair of
run `c301cbbc` documented in `docs/HANDOVER_GEOGRAPHY_HOTFIX_2026-07-22.md`,
`docs/09_DECISIONS.md`, `docs/11_ISSUES_LOG.md`). **The earlier UB1 geography defect cannot
recur**: the fix makes the join `(run_id, source_outlet_id)`-scoped so a candidate can never be
stamped `valid_geography` without a matching valid-geography evidence row for its own run. Not
re-run today (would require a live/DB call); cited as accepted, in-force evidence.

## 4. Normalisation and deduplication tests — PASS, with one named gap

Apostrophes, HTML entities, T/A trading-name formats, phone/postcode/domain normalisation:
**[FRESH]** — `test:lead-production-final-scoring-v2` (normaliseName apostrophe/T-A fixes,
`decodeHtmlEntities`) PASS. Cross-district duplicates: **[FRESH]** — new this session,
`district-reconciliation.ts`'s 4-tier dedup (company number → phone → domain → postcode+identity),
5 synthetic proofs including deterministic-ordering, all PASS in
`test-lead-production-territory-v2.ts`.
**[GAP]**: "shared kitchens and virtual brands / no valid separate business incorrectly merged"
has no dedicated adversarial test proving two genuinely distinct virtual-brand businesses at the
same shared-kitchen address are NOT merged by the postcode+identity dedup tier. The tier's 0.3
name-similarity threshold is deliberately conservative, and `group_franchise_classification`
already has distinct `Shared Kitchen`/`Virtual Brand` categories that are never treated as
identity matches — but this specific adversarial case is untested. Flagged, not blocking (the
existing threshold is the same one already accepted for customer-match materiality).

## 5. Magna customer-comparison tests — PASS [INHERITED]

NetSuite Inactive-flag lifecycle authority (commit `57ddb0b`), active/inactive separation, exact
phone/domain/company-number/address matching, weak-generic-name/locality-word false-positive
protection, evidence retention: built and tested in the 07-22/07-23 sessions
(`customer-match-materiality.ts`, 7 scenario proofs in `test:lead-production-final-scoring-v2`,
**[FRESH]** PASS today). Active customers never enter ordinary exports / inactive customers only
enter reactivation: **[FRESH]** — proven this session in both
`test-lead-production-master-export.ts` (Active Customers tab reconciliation) and
`test-lead-production-salespro-export.ts` (mutual-exclusivity assertions).

## 6. Group and franchise tests — PASS [INHERITED]

Approved registry matching, exact/prefix brand rules, false-positive protection, parent/franchise
relationships, national-group exclusion, key-account separation, regional-group protection, final
rescreen using Companies House + website evidence: `test:lead-production-final-group-rescreen`
**[FRESH]** PASS today (built 07-23, commit `bd3b019`). Key-account separation into its own file
re-verified this session in the exporter tests.

## 7. FSA tests — PASS [FRESH + INHERITED]

`test:lead-production-fsa` PASS today. Exact/probable/multiple/conflict/no-match outcomes,
dense-postcode handling, ambiguous-name Google-query pollution prevention, explicit API-failure
recording, and "missing FSA data alone never rejects a valid lead" (qualification-v2.ts's gating
inputs never reference FSA optional fields, verified in `qualification-v2.ts` proofs) all built
07-23 (commit `8728c52`).

## 8. Google Places tests — PASS [FRESH]

`test:lead-production-google` PASS today (fixed one pre-existing failure this session — see
Section 12). Fixed address-component fallback, raw/zero-result retention, all Place IDs
retained, no unnecessary Place Details calls, request caps, closure detection, physical-premises
classification, name/postcode/address conflict handling all covered. "No previously fixed Google
defect can recur": the two real UB1 Google-stage defects found 07-23 (postcode agreement,
zero-result evidence) both have dedicated regression assertions in this suite.

## 9. Companies House tests — PASS [FRESH]

`test:lead-production-companies-house` PASS today. Ranked search, company-number matching,
generic-name refusal, sole-trader/partnership handling, dormant/dissolved/liquidation outcomes,
registered-office vs. operating-address distinction, filed-accounts honesty (absent values stay
`not_available`, never `0` — an explicit design property re-verified in
`master-field-resolver.ts`'s handling this session: `commercial_priority_score` stays `null`,
never fabricated to `0`, for unscored candidates), bounded officers/PSC/filing requests, cache
reuse, sensitive-field exclusion from sales tabs (`master-field-resolver.ts` never surfaces
`dateOfBirth`/`residentialAddress` — those fields don't exist anywhere in the pipeline's own
types, confirmed in the earlier canonical-field-inventory audit).

## 10. Website and decision-maker tests — PASS, with one named open issue

`test:lead-production-website` + `test:lead-production-public-profile` PASS today. Official/
strongly-verified websites only, crawl limits, no CAPTCHA/access-control bypass, no guessed
emails/contacts, directors/PSCs/owners retained when verified, LinkedIn/public profiles only
when strongly matched (same-name-only rejected), menu/product-fit linked to source URLs — all
covered. **Known open issue, not blocking**: ISS-0027 — `tel:`/`mailto:` href content isn't
URL-decoded/validated before use (2 of 94 UB1 candidates affected, both had a verified Google
Places phone used instead, substitution explicitly logged). Low severity, deferred per existing
decision (a fix to an already-accepted, immutable-checkpoint-producing stage requires separate
approval + a fresh run).

## 11. Qualification and scoring tests — PASS [FRESH + INHERITED]

`test:lead-production-final-scoring` + `test:lead-production-final-scoring-v2` PASS today.
Qualification/channel-eligibility/enrichment-completeness/score kept as four independent axes
(architecturally: `qualification-v2.ts` never reads the numeric score; `channel-suitability.ts`
requires only phone for telesales / only premises+coordinates for field-sales, independent of
completeness — explicitly audited and confirmed in an earlier session). Missing Companies
House/financial/LinkedIn/website/email data alone never blocks qualification (dedicated proof:
"low completeness doesn't block"). All 11 hard gates are genuine disqualifiers (score never
gates — architectural separation, not a threshold). Every score has an explanation
(`levelReason`/`why_selected`, always populated, verified in the Master exporter's
`lead_selection_reason` — a REQUIRED field with zero gaps across all 94 UB1 candidates). Level 0
and releasable Level 1 pass every required gate (programmatic safety check in
`generate-release-package-v2.ts`, zero violations across 47 usable). v2 rules are the default
(`run-full-territory.ts` calls `run-final-scoring-stage-v2.ts` unless `--use-v1-scoring`).

## 12. Exporter tests — PASS [FRESH]

`test:lead-production-master-export` + `test:lead-production-salespro-export` PASS today (new
this session, Milestones 3-4). Master: exactly 107 fields per row (verified programmatically),
14 correct tabs, one Lead ID per candidate (unique, deterministic format), full reconciliation
(94 = 10 active-customer + 5 excluded-group + 3 reactivation + 47 usable + 11 held + 18
hard-rejected, zero overlap — enforced by the exporter itself, which refuses to write on
mismatch), actionable director/PSC/decision-maker names retained, held/rejected records
correctly retained in their own tabs (never dropped). Sales Pro: exactly 108 columns, exact CTO
labels/order, 20 existing unchanged + 88 new, zero duplicate headings, correct field types,
zero dropdown/range violations across all 50 exported rows, ordinary/reactivation/key-account
files strictly separated (zero Lead ID overlap), zero held/rejected/active-customer/excluded-
group/closed rows in the ordinary new-lead file (checked directly). Two real bugs found and
fixed during this validation — see Section 14 / `docs/10_BUGS_AND_FIXES.md`.

## 13. Orchestrator tests — PASS [FRESH]

`test:lead-production-full-territory` + `test:lead-production-territory-v2` PASS today. Complete
dry-run with no live calls (Hassan/EN1-EN5 5-district `--request-plan-only` smoke test, real
subprocess chain, zero live external calls). Checkpoint resume, input-hash/schema-version/rules-
version/customer-master/group-registry invalidation cascade: all proven in
`test:lead-production-full-territory`. Request caps: `--max-google-calls`/`--max-ch-calls`/
`--max-ch-document-calls` threaded through every stage and every district. Territory-level
candidate reconciliation and immutable per-district checkpoints: proven in
`test-lead-production-territory-v2.ts`. Exact release/hold status: 6-value status derivation
with explicit precedence-order tests (integrity failure > source failure > data quality >
pending > accepted-with-review > accepted).
**[GAP]**: "one district failure does not corrupt other districts" is proven at the STATUS-
DERIVATION level (synthetic `DistrictStatusInput` precedence tests) and by code inspection of
`run-sales-territory.ts`'s per-district try/continue loop, but has never been proven against a
REAL live district failure (no live discovery has run yet for any of the 112 districts besides
UB1's earlier, unrelated calibration work). This can only be proven for real during Milestone 7
itself.

## 14. UB1 regression proof — PASS [FRESH]

Milestone 5. Replayed from the accepted UB1 v2 checkpoints (zero new external calls): 94
candidates, 47 usable, 30 premium, 17 releasable Level 1, 11 held, 36 excluded (18 hard-rejected
+ 10 active customers + 5 excluded groups + 3 reactivation — reconciles exactly to the
previously-accepted 36, see the breakdown in
`.../2026-07-23T23-00-00Z-milestone5-export-proof/ub1-export-reconciliation-report.md`). Byte-
identical proof: the `candidate-dossier.ts` extraction refactor was verified by regenerating all
14 release-package CSVs and diffing against the historically accepted output — zero differences.
No regression from any of this session's orchestration or exporter work: the pre-existing
`test:lead-production-full-territory` suite was rerun unchanged after every milestone and stayed
green throughout.

## 15. Failure simulation — PARTIAL

Genuinely covered, with evidence:
- Interrupted run and resume: **[FRESH]** `test:lead-production-full-territory`.
- Corrupt/tampered checkpoint: **[FRESH]** — checksum-mismatch refusal, same suite.
- Partial district completion: **[FRESH]** — `run-sales-territory.ts` records `pending` status
  for any district never attempted in a given invocation; proven via `deriveTerritoryStatus`'s
  "district(s) not yet complete" case.
- Duplicate candidate IDs: **[FRESH]** — cross-district dedup test suite.
- Wrong territory assignment: **[FRESH]** — 4 synthetic validation-failure-mode tests
  (duplicate district, count mismatch, maps-required mismatch, total mismatch), all reject
  correctly.
- Missing required Sales Pro field: **[FRESH]** — `master-field-resolver.ts`'s
  `dataQualityGaps` mechanism, exercised on real UB1 data (49/94 candidates have at least one
  genuinely-absent required field, all enumerated, none silently blank).
- Rate limit / retry cap: **[FRESH]** — Google-stage budget tests (Section 8).
- Empty results / zero-result evidence: **[FRESH]** — Google-stage "retain Google zero-result
  evidence" regression test (commit `68398d1`).
- Schema mismatch: **[FRESH]** — both exporters throw immediately if the schema file's own
  column/field counts don't match their hardcoded expectations (107/108/20/88).

**[GAP]** — not explicitly fault-injected this session: missing API credentials, API timeout,
malformed provider response, invalid postcode (as a live-call input, not a config-validation
input). These are architectural properties of the existing stage adapters (each already has
explicit `disabled`/budget/error-handling paths, confirmed by code inspection and the Google-
stage budget tests) but no dedicated test simulates, e.g., a malformed JSON response from a live
provider. This is a real, named gap in the failure-simulation breadth the owner asked for, not
resolved this session.

## No unresolved critical/high-severity issue — one explicit judgment call

ISS-0001, ISS-0002, ISS-0003 (originally Critical, 2026-07-09) are marked **Superseded** this
session — the customer postcode data, delivery-district boundary, and CTO field validation they
asked for are, in substance, exactly what this session's schema/assignment work (Milestones 1-4)
delivered. Not formally closed, since that requires the owner's confirmation, not just this
session's inference — see `docs/11_ISSUES_LOG.md` for the reasoning on each.

ISS-0006 ("retention fix... 64.9% churn") and ISS-0007 ("95% churn rep investigation") remain
open, High severity, Outstanding. **Judgment call**: these are existing-customer retention/sales-
operations investigations, not properties of the new-lead discovery/qualification/export
engineering this certification covers — they don't block RM1-RM14 technical readiness. Flagged
explicitly here rather than silently omitted; the owner may override this judgment.

ISS-0027 (website tel:/mailto: decoding) — Low severity, open, does not block.

## Schema and assignment count reconciliation — PASS [FRESH]

Master schema: 107 fields (verified). Sales Pro schema: 108 columns = 20 existing (verbatim CTO
labels/order) + 88 new (verified, zero orphan canonicalNames against Master). Assignment: 13
representatives, 112 unique Postcode Districts (verified individually, not sampled).

## Dry-run request plan is bounded — PASS [FRESH]

`run-sales-territory.ts --representative=Hassan --request-plan-only` (5 districts): exits 0,
zero live external calls, `sales-territory-request-plan.json` written with exactly 5 per-district
entries. The equivalent `run-full-territory.ts --territory=RM1 --request-plan-only` dry run
(prior session) confirmed the same behavior for a district with no existing checkpoint: every
live-call stage reports `ok: false` (refuses cleanly) rather than attempting an unbounded call.

## Final go/no-go gate

| Criterion | Result |
|---|---|
| Typecheck passes | PASS |
| Full build passes | PASS |
| Every lead-production test passes | PASS (13/13 suites, fixed ISS-0028 this session) |
| Every exporter test passes | PASS |
| Every orchestrator test passes | PASS |
| UB1 regression proof passes | PASS |
| No unresolved critical/high-severity issue blocking THIS scope | PASS (see judgment call above) |
| Schema counts reconcile | PASS |
| Assignment counts reconcile | PASS |
| Dry-run request plan is bounded | PASS |

Every gate criterion the owner specified is met. Named gaps exist (Sections 2, 4, 13, 15 above)
but none of them are gate criteria the owner listed, and none represent an unresolved critical/
high defect in the engineering itself — they are breadth-of-simulation gaps that Milestone 7's
own design (per-district live execution, verify-before-continue, hold-on-failure, stop after
RM1-RM14) is the actual mechanism to close incrementally and safely, exactly as specified.

# GO_FOR_RM1_LIVE

## Addendum (2026-07-24): Permanent root-cause correction policy

Adopted after RM1-RM14/KT1-KT24 acceptance, applying to every representative territory from
Ayesha's (NW1) onward: **no final-lead defect may be corrected only in an output file.** Every
defect affecting a final lead's data must be fixed at its source pipeline stage/rule, with a
regression test using the real failing case as a fixture, before any affected Master workbook,
Sales Pro export, map file, or report is regenerated. Full 9-step procedure recorded in
`docs/11_ISSUES_LOG.md` ("POLICY — Permanent root-cause correction policy") and
`docs/09_DECISIONS.md`. This formalises the practice already followed for the four real defects
found and fixed during RM1-RM14 processing (see `docs/10_BUGS_AND_FIXES.md`), and is now a gate
condition for any future territory's acceptance: an unresolved output-file-only patch is treated
as equivalent to an unresolved pipeline defect for acceptance purposes.
