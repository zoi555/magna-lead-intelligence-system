# APP_RESUMPTION_AUDIT

Branch: `feature/p4-app-runs-builder` · Base commit: `0858bd92ae51ed605f885eed6d4785950f9bfb27`
Audit date: 2026-08-10. Accepted by P4 control review with architecture amendments (same
date) — this document is the audit as accepted, updated with those control decisions and
this session's implementation status. See `docs/BRANCH_REGISTER.md` for the branch-split
record.

## A. Verified repository state

- Worktree/toplevel: `/Users/homemac/Projects/magna/worktrees/p4-app`
- Remote: `origin` → `https://github.com/zoi555/magna-lead-intelligence-system.git`
- Branch: `feature/p4-app-runs-builder`; base HEAD `0858bd92ae51ed605f885eed6d4785950f9bfb27`
- `git status` was clean at audit time
- Package: `lead-intelligence-app-shell` v0.0.0 (Next.js)
- Baseline evidence: `npm ci` succeeded, `npm run typecheck` passed, git clean.
  **6 high-severity npm dependency vulnerabilities are present and unremediated** — recorded
  as a standing risk (see L). `npm audit fix` was **not** run and dependency upgrades are
  **not** bundled into this vertical slice, per explicit control instruction.
- 30 Supabase migrations (`0001`–`0030`), sequential, no gaps, no TEMP-PIPELINE
  contamination in schema.
- `package.json` scripts are dominated by TEMP-PIPELINE (`lead-production:*`,
  `test:lead-production-*`); app-relevant scripts: `dev/build/start/lint`, `je:worker`,
  `seed:postcode-reference`, `test:run-draft`, `test:custom-config`, `test:je-stage1`,
  `test:je-supabase`, `test:je-enriched-adapter`, `test:discovery-run-recovery`,
  `test:geography-*`, `test:multi-source`, `test:uber-*`. Several relevant test *files*
  exist under `scripts/` without a matching `npm run` shortcut
  (`test-create-new-run*.ts`, `test-route-protection-playwright.ts`,
  `test-auth-bootstrap-playwright.ts`, `test-owner-bootstrap-idempotency.ts`,
  `test-settings-playwright.ts`) — run them directly with `tsx scripts/<file>.ts`.

## B. Existing relevant routes/components (as found, pre-implementation)

| Route | Status found |
|---|---|
| `/pipeline-runs` | Mixed: legacy file-based TW/FSA monitor + CTA to `/pipeline-runs/new` |
| `/pipeline-runs/new` | Live wizard, 6 steps, did not match the governing 9-stage names |
| `/run-builder` | Dead redirect stub → `/pipeline-runs/new` |
| `/run-setup` | Orphaned/legacy, localStorage-only, only step 1 built |
| `/discovery-runs`, `/discovery-runs/[id]` | Real, DB-backed run list/detail |
| `/`, `/territories` | Still read `src/lib/mock-data.ts` (ISS-0020) |

Stage-by-stage reality (pre-implementation): Identity/Geography/Exclusions/Review were
functional; Source Mode and Limits/Cost were partially built (cost stubbed at £0/null,
Uber Eats/Deliveroo hard-disabled); Scoring Profile, Assignment and Outputs did not exist
in code at all.

## C. Existing persistence/schema (as found)

`discovery_runs` had no per-run column for Limits/Cost, Scoring Profile, Assignment, or
Outputs — those would have had to live in untyped `target_filters`/`config_snapshot`
jsonb with no structured validation. RLS was enabled on every application table; only
`owner`/`admin` roles were enforced anywhere. `claim_je_execution`/`heartbeat_je_execution`
provided real claim/lease locking for **executions**, but **no DB-level constraint**
prevented two `discovery_runs` targeting the same territory concurrently — that was
100% application-code (`/api/discovery/runs/conflicts`), the same failure class that
caused the already-patched ISS-0031 (`status` stuck at `'queued'`).

## D. Existing relevant tests (as found)

Real, structured coverage existed for both scope items the governing task specifically
named: auth/route-protection (`test-route-protection-playwright.ts`,
`test-auth-bootstrap-playwright.ts`, `test-owner-bootstrap-idempotency.ts`) and
conflict/override/queued-locking (`test-create-new-run-playwright.ts`,
`test-create-new-run.ts`). All live/Playwright suites are gated behind
`SUPABASE_SERVICE_ROLE_KEY` + `INITIAL_OWNER_EMAIL` and were **not executed** during the
audit or during this implementation session (no non-production environment was proven
safe — see H). `scripts/test-map-required.ts` is a false positive: it tests TEMP-PIPELINE
code (`scripts/lead-production/resolve-map-required.ts`), not the run builder.

## E–I. Implemented/verified/partial/missing/conflicts (audit findings, pre-implementation)

See the full pre-implementation gap analysis in the session transcript that produced this
document (E: Identity/Geography/conflict-detection/override-gate/auth were implemented and
covered by existing tests; F: all live test suites unexecuted this session; G: Source
Mode/Limits-Cost/Exclusions partial; H: Scoring Profile/Assignment/Outputs/DB-level
conflict constraint/paid-source approval schema/telesales-safe view were missing
entirely; I: `/pipeline-runs` naming collided with the legacy TW/FSA monitor, and the
9-stage names did not match the 6-stage wizard). These findings are the basis for the P4
control decisions in the next section, all of which have since been **implemented** (see
"Implementation status" below) except the conflict/queue atomicity migration, which is
**designed but deliberately not yet applied** pending explicit approval (see L).

## J. P4 control decisions (accepted 2026-08-10) and how they were applied

1. **Canonical routes** — `/pipeline-runs` is now the DB-backed Main Runs screen;
   `/pipeline-runs/new` is Create New Run; `/pipeline-runs/[id]` is canonical run
   detail/status; `/discovery-runs` is left untouched (source execution/attempt
   visibility). The legacy TW/FSA monitor was relocated **unmodified** to
   `/pipeline-runs/legacy-monitor` (`src/components/pipeline/LegacyPipelineMonitor.tsx`) —
   not deleted, not rewritten, just no longer the primary `/pipeline-runs` UI.
2. **Nine explicit Run Builder stages** — Identity, Source Mode, Geography, Limits/Cost,
   Exclusions, Scoring Profile, Assignment, Outputs, Review. Business-type/taxonomy
   targeting (business types, cuisines, service models, ownership, requested fields,
   tags) is not one of the nine named stages; it is kept inside **Exclusions**, since it
   defines in/out-of-scope exactly like the rest of that stage — a judgment call recorded
   here and in `docs/09_DECISIONS.md`. Anchors are likewise not a named stage — folded
   into **Geography** as supporting map context. Implemented in
   `src/app/pipeline-runs/new/page.tsx`.
3. **config_snapshot v3** — `src/lib/discovery/run-draft.ts`, `CURRENT_SCHEMA_VERSION = 3`.
   A strongly typed `RunDraft` now covers identity, sourceMode, geography (territory +
   anchors), exclusions (incl. targeting + forward-looking versioned-profile references),
   limitsAndCost, scoringProfile, assignment, outputs, and review/approval metadata.
   `migrateDraft()` upgrades v1/v2 (old flat `planning` bag) to v3 losslessly; unknown
   versions return `null` (caller starts fresh, never crashes). `describeConfigSnapshot()`
   tolerantly renders any snapshot version (including malformed ones) for the run-detail
   screen. Existing dedicated `discovery_runs` columns (`territory_mode`,
   `territory_input`, `derived_query_units`) are still used directly; `config_snapshot` is
   the complete immutable source of run configuration once queued. `target_filters` keeps
   its pre-existing flat shape unchanged for backward compatibility with
   `RunResultsMap.tsx` and the existing test scripts that read it directly.
4. **Source Mode** — exactly two product modes (`just_eat_only`,
   `just_eat_uber_deliveroo`) represented honestly: Just Eat is `AVAILABLE`; the
   multi-platform mode is selectable as *intent*, labelled `NOT YET PRODUCTION APPROVED`,
   and never enables real Uber Eats/Deliveroo execution — those checkboxes remain
   hard-disabled exactly as before. Both modes share the same downstream
   geography/consolidation/exclusion architecture (already true in the existing engine).
5. **Limits/Cost** — per-source table: Just Eat shows a real volume estimate (existing
   `/api/discovery/estimate`) and a genuine `£0.00` (open lawful endpoint, not invented);
   Uber Eats/Deliveroo (shown only in multi-platform mode) show "Not available" for both
   volume and cost, with their real `SOURCE_REGISTRY` readiness label and "Blocked —
   provider not yet authorised". Spend ceiling persists in `config_snapshot`. A "Approve
   paid execution" control exists but is always off and disabled — no approved paid
   provider exists, so no silent paid execution is possible.
6. **Scoring Profile** — a single default profile referencing the one authoritative
   formula already in the repository (`docs/42_SCORING_AND_COMMERCIAL_FORMULA.md`,
   which supersedes `docs/42_COMMERCIAL_VALUE_MODEL_NOW.md`). No new commercial weights
   invented; no custom-weight editing UI. `defaultScoringProfile()` in `run-draft.ts`.
7. **Assignment** — policy-only stage (`manual_management_review` default,
   `territory_based`, `telesales`, `field_sales`, `both`). `territory_based` is shown but
   disabled (`territoryBasedAvailable: false`) because no rep/territory-assignment table
   is wired to runs today, despite `sales_region`/`sales_territory`/`delivery_coverage`
   existing in schema (migration 0013). No new CRM/salesperson model was created. Actual
   assignment remains downstream after qualification/scoring — this stage records intent
   only.
8. **Outputs** — five requested output types (`canonical_audit` required and locked,
   `representative`, `sales_pro`, `cto`, `maps`), each with an honest `ready`/
   `blockedReason`. Sales Pro and CTO are explicitly marked as owned by P4-EXPORTS — no
   field mappings were touched or rewritten here.
9. **Exclusions** — existing logic (default exclusions, chain registry, custom
   include/exclude terms, requested data fields) preserved unchanged. Existing-customer
   exclusion now carries an explicit `ready: false` (ISS-0001 unresolved) so the UI never
   claims it is operational. Commercial rule / brand-group decision / customer
   suppression profile fields exist in the v3 type as `VersionedProfileRef | null`,
   always `null` in this vertical slice, per the **TEMP-PIPELINE promotion addendum** —
   the app does not depend on `scripts/lead-production/**` or `config/lead-production/**`
   anywhere.
10. **Main Runs screen** — `/pipeline-runs` now reads `discovery_runs` via a new
    `fetchMainRunsOverview()` (extends the existing `run-detail.ts` reporting module —
    reused, not duplicated) showing run name/reference, best-effort owner label,
    territory, source mode, status, execution progress, candidate count, cost
    (estimated/actual, never fabricated), updated time, and a state-appropriate action
    link. Configured/empty/no-runs states are explicit; a link to the legacy monitor is
    kept visible, not hidden.
11. **Run detail/status** — `/pipeline-runs/[id]` reuses `fetchRunDetail()` and
    `RunResultsMap` from `/discovery-runs/[id]` directly (no forked business logic).
    Adds: saved immutable config-snapshot display, source-mode/readiness, conflict/
    override evidence, a cooperative-cancellation control
    (`CancelExecutionButton.tsx`, calls the existing `/api/discovery/executions/[id]/cancel`
    route), and audit/evidence links including a pointer back to `/discovery-runs/[id]`
    for source execution/attempt visibility.
12. **Conflict/queue atomicity** — **designed, not yet implemented**. See L below; this
    requires a migration and was deliberately held for explicit approval per the control
    instructions before any SQL is written or applied.
13–16. Documentation (this file + branch register), testing order, and implementation
    discipline — see D, H, L, M.

## Implementation status (this session)

Built and present on disk (uncommitted, not pushed, not merged):

- `src/lib/discovery/run-draft.ts` — config_snapshot v3 type + migration + tolerant
  summariser.
- `src/app/pipeline-runs/new/page.tsx` — nine-stage Run Builder wizard.
- `src/app/pipeline-runs/page.tsx` — DB-backed Main Runs screen.
- `src/app/pipeline-runs/[id]/page.tsx` + `CancelExecutionButton.tsx` — canonical run
  detail/status.
- `src/components/pipeline/LegacyPipelineMonitor.tsx` +
  `src/app/pipeline-runs/legacy-monitor/page.tsx` — relocated legacy monitor.
- `src/lib/discovery-engine/reports/run-detail.ts` — extended (additive only) with
  `fetchMainRunsOverview()` and new `run.reference` / `run.sourceConfig` /
  `run.configSnapshot` fields.

Not yet done, in order:

- Conflict/queue atomicity migration (H/L below) — design ready, awaiting approval.
- Full non-network + build verification (typecheck/build/tests) — run after this
  document is written.
- Local browser proof (desktop + mobile) — requires a running dev server and a proven
  non-production Supabase target; not attempted until the environment is confirmed safe.
- `scripts/test-create-new-run-playwright.ts` still encodes the **old 6-step** wizard
  navigation (hardcoded step indices/selectors) — it will need updating to the new
  9-step flow before it can pass again. Not modified in this pass to avoid touching a
  live-gated test file without also being able to run it; flagged here as a known
  follow-up.

## K. Files changed this session

`src/lib/discovery/run-draft.ts`, `src/app/pipeline-runs/new/page.tsx`,
`src/app/pipeline-runs/page.tsx`, `src/app/pipeline-runs/[id]/page.tsx` (new),
`src/app/pipeline-runs/[id]/CancelExecutionButton.tsx` (new),
`src/app/pipeline-runs/legacy-monitor/page.tsx` (new),
`src/components/pipeline/LegacyPipelineMonitor.tsx` (new),
`src/lib/discovery-engine/reports/run-detail.ts`, `docs/BRANCH_REGISTER.md`,
`docs/APP_RESUMPTION_AUDIT.md` (new, this file).

## L. Migrations, risks or owner decisions required

### Conflict/queue atomicity — design for approval (not yet applied)

**Race being prevented:** the Review step's conflict check
(`POST /api/discovery/runs/conflicts`) runs client-side, once, when the Review step
renders. Nothing re-checks it at the moment `confirmAndStart()` actually flips a run from
`draft` to `queued` (`queueJustEatExecution()` in `run-service.ts`, called from
`POST /api/discovery/runs/[id]/queue`). Two browser sessions can both pass the stale
client-side check and both queue on an identical, overlapping territory — the same class
of failure that produced ISS-0031 (`discovery_runs.status` stuck at `'queued'` after a
partial write). No DB-level constraint exists today to stop this.

**Why not a UNIQUE constraint on territory** (explicitly ruled out by the control
instructions, and independently wrong here): the business rule is not "no two runs may
ever share a query unit" — partial overlap is allowed with only a warning, and an
*identical* overlap is blockable but **bypassable via an acknowledged owner override**. A
UNIQUE constraint cannot express "block only if the exact same set AND an active status
AND no override", so it would either be too strict (blocking legitimate partial-overlap
runs) or not enforce the rule at all.

**Proposed design:**

1. A new `SECURITY DEFINER` Postgres function, e.g.
   `confirm_and_queue_run(p_run_id uuid, p_source text default 'just_eat')`, granted to
   `service_role` only (same pattern as `claim_je_execution`/`heartbeat_je_execution`).
2. Inside one transaction, the function:
   a. Takes `pg_advisory_xact_lock(hashtext(tenant_id || ':' || source))` — serialises
      concurrent queue-transition attempts for the same tenant+source. The lock is
      transaction-scoped, so it is automatically released on commit, rollback, or a
      crashed connection — no orphaned-lock cleanup code needed.
   b. Re-reads the run's canonical `query_unit` rows (migration 0013 — already the
      authoritative, per-run-per-source-per-code unique table, not the
      `discovery_runs.derived_query_units` jsonb copy) and compares them against every
      other run's `query_unit` rows for the same tenant+source, exactly reproducing the
      existing `/api/discovery/runs/conflicts` overlap/identical logic, but now inside
      the same transaction as the state transition.
   c. If an identical, active-status (`draft`/`queued`/`running`) overlap exists **and**
      the run's own `config_snapshot.review.ownerOverride.acknowledged` is not `true`,
      the function raises an exception — the transaction rolls back, nothing is written,
      and the API returns 409 with the fresh conflict so the client can re-render Review
      honestly instead of silently double-queuing.
   d. Otherwise, it performs the existing `queueJustEatExecution` work (insert
      `je_executions`, set `discovery_runs.status = 'queued'`) atomically.
3. `POST /api/discovery/runs/[id]/queue` calls this function instead of the current
   two-step `getRun` → `createExecution` → `setRunStatus` sequence.

**Migration size:** smallest possible — one new function, no new tables, no column
changes, no data migration. Fully additive; existing rows are unaffected.
**Rollback:** `DROP FUNCTION confirm_and_queue_run;` reverts the queue route's one call
site back to the current (racy but functioning) two-step path with no data loss.
**Migration tests:** would be added alongside the migration (a script exercising two
concurrent queue attempts against the same territory and asserting exactly one succeeds)
— not written yet, pending approval of the design itself.

This design is reported here for owner/P4 review and **has not been implemented or
applied** — no SQL file exists yet.

### Other recorded risks / decisions needed

- **6 high-severity npm dependency vulnerabilities** — unremediated, recorded per
  section 15 of the control instructions; recommend a separate, reviewed dependency-update
  pass, not bundled into this slice.
- **ISS-0001/0002/0003** remain open — existing-customer exclusion and CRM export stay
  honestly non-operational regardless of Run Builder progress.
- **ISS-0021** (Deliveroo/Uber Eats provider authorisation) remains open — required
  before Source Mode B can execute anything beyond Just Eat.
- Owner decision still open: exact shape of a future controlled TEMP-PIPELINE →
  permanent promotion pass for customer-suppression/brand-group/commercial-rule
  profiles (next P4 milestone, per the addendum) — `VersionedProfileRef` fields are
  ready to receive it without another schema redesign, but nothing is implemented yet.

## M. TEMP-PIPELINE / P4-EXPORTS material — confirmed untouched this session

`scripts/lead-production/**`, `scripts/test-lead-production-*`,
`config/lead-production/**`, `docs/LEAD_PRODUCTION_HANDOVER.md`,
`docs/LEAD_PRODUCTION_PREPRODUCTION_CERTIFICATION.md`, `docs/77_LEAD_SCHEMA_V1_SUMMARY.md`,
`templates/`, `~/Data/aspectlead-lead-production/` (outside git), CTO/SalesPro field
mappings, and the independent `geospatial-platform` repository — none of these were read
for editing purposes or modified. `scripts/test-map-required.ts` was identified but not
touched (it tests TEMP-PIPELINE code despite its name). The legacy TW/FSA pipeline
(`src/lib/pipeline/*.ts`) was **relocated, not rewritten** — its logic is byte-for-byte
unchanged, only its page wrapper moved from `/pipeline-runs` to
`/pipeline-runs/legacy-monitor`.
