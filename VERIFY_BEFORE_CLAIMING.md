# Verify Before Claiming

No assistant, developer, or unfortunate human may claim the project works without evidence here.

## Required verification evidence

| Area | Required evidence | Status |
|---|---|---|
| Local setup | Command run and result | Not checked |
| Build | Command run and result | Not checked |
| Tests | Test command and result | Not checked |
| Database | Read/write or migration verification | Not checked |
| Auth/permissions | Role-based checks | Not checked |
| Deployment preview | Preview URL and manual checks | Not checked |
| Production | Production URL and smoke test | Not checked |
| Docs updated | Files updated | Checked — 2026-07-10, see log below |

## Verification log

### 2026-07-10 — Documentation-only setup corrections

- Change tested: Documentation edits only (repo status, protocol pointer files, wrap-up command, work log).
- Command/manual check: `git status --short` and `git diff --stat` reviewed; edits confirmed applied.
- Result: Documentation files updated as intended. **No app, build, test, database, or deployment was run or verified — those rows remain "Not checked".**
- Evidence link/screenshot: Git working tree diff for this session.
- Remaining risk: None for docs. Build/test/deploy remain entirely unverified; blockers ISS-0001 to ISS-0004 still open.

### 2026-07-18 — GitHub Packages migration + Vercel deployment (ISS-0019)

- Change tested: swap `@geospatial/map` (private git+ssh) → `@zoi555/geospatial-map@0.3.0`
  (GitHub Packages), regenerated lockfile, fixed 4 missed script imports.
- Command/manual check:
  - `npm install --package-lock-only` then `rm -rf node_modules && npm ci` — succeeded,
    `package-lock.json` resolves `@zoi555/geospatial-map` from `https://npm.pkg.github.com` with
    an integrity hash.
  - `grep -rn "ssh://git@github.com|github:zoi555/geospatial-platform|@geospatial/map"` across
    the repo (excluding node_modules/.git/.next) — no remaining code/config references; only
    historical docs (accurate record of past decisions, left as-is).
  - `npm run typecheck`, `npm run build`, `npm run test:geography-gate`,
    `npm run test:uber-parse`, `npm run test:multi-source`, `git diff --check` — all green.
  - `git diff` reviewed file-by-file before commit — mechanical import/comment renames only.
  - Committed `597044a`, pushed to `feature/mvp-vertical-slice-001`.
  - Vercel deployment `dpl_85AwBaHZvzsXZoF14S67EibBPEJ7` (project
    `prj_SNY6dJsXzfV6X145cynpqBACHnuT` / `magna-lead-intelligence-system`) inspected via
    `vercel inspect --logs`: default `npm ci` (no custom Install Command), no auth errors, build
    output identical to local (same routes, same pre-existing NFT-trace warning). State: READY.
  - `mcp__claude_ai_Vercel__get_runtime_errors` / `get_runtime_logs` for this project/deployment:
    zero errors, zero log lines (no traffic reached it yet).
- Result: dependency resolves from GitHub Packages; build/typecheck/tests pass locally and on
  Vercel; the app deployment is READY.
- Evidence link/screenshot: commit `597044a`; deployment `dpl_85AwBaHZvzsXZoF14S67EibBPEJ7`
  (`https://magna-lead-intelligence-system-qyaz78cuh-zoeb-s-projects.vercel.app`); Vercel build
  logs (via CLI `vercel inspect --logs`).
- Remaining risk: **the live preview was NOT browser-tested this session.** The preview URL sits
  behind Vercel's deployment-protection SSO wall (blocks `curl`); the Claude Chrome extension was
  not connected. Home page / Run Builder / map rendering / API responses / console errors are
  **unverified in-browser** — do not treat this as a full pixel/functional pass. A separate stale
  Vercel project (`magna-lead-intelligence-system-pngu`) fails its own build (legacy install
  command, no `NPM_TOKEN`) and shows `failure` on the commit's GitHub status alongside the real
  project's `success` — see ISS-0019.

### 2026-07-18 (overnight autonomous session) — Vercel dual-project docs + Uber actor research

- Change tested: documentation (Vercel topology record in `docs/08_DEPLOYMENT.md`, ISS-0019
  correction, new ADR, `PROJECT_STATUS.md`/`README.md` updates) + Uber Eats discovery-actor market
  research doc (`docs/69`) + a narrowly-scoped `provider-registry.ts` precision/recall correction +
  no-network dry-run benchmark fixtures/tests + `.env.example` (`NPM_TOKEN` documented).
- Command/manual check:
  - Vercel project IDs and deployment status were **independently re-queried against the live
    Vercel API twice**: once before this session's commits were pushed (both projects confirmed
    `READY` on commit `2d6f4fb1...`, matching the task brief), and once **after** pushing (see
    below) — not just transcribed from the task brief.
  - **Consequence of the push, confirmed live, not assumed:** pushing this session's four commits
    to `feature/mvp-vertical-slice-001` auto-triggered a fresh build on **both** projects via their
    GitHub git integration. A follow-up `get_deployment` call on both new deployment IDs
    (`dpl_ASwCwfy6pA7BFrh5cpuiBSjq3rGX` for `-pngu`, `dpl_6ThJkny15TMmuDqKWvyb15vrvbX6` for the
    other project) confirmed both reached `READY` on the final commit
    (`aab8764ae79fa0fa527dd86b4b34d769723d7802`). `docs/08_DEPLOYMENT.md` updated with these newer
    deployment IDs (the pre-push IDs are kept as historical record, not deleted). No Vercel project
    setting was changed at any point.
  - Uber actor claims verified via live WebFetch of real Apify Store pages this session (cited by
    URL in `docs/69`); anything not confirmed there is marked "not verified" in the doc, not guessed.
  - `npm run typecheck`, `npm run build`, and `npm run test:ub1-benchmark`, `test:borderline-
    provider`, `test:geography-gate`, `test:uber-parse`, `test:multi-source`, `test:apify-
    provenance`, `test:geo`, `test:run-draft`, `test:custom-config`, `test:scoring`, `test:telesales-
    safe`, `test:geography-standard` — all green. `git diff --check` clean before every commit.
- Result: four commits on `feature/mvp-vertical-slice-001`, pushed (`bb2e268` Vercel topology,
  `8575514` provider-registry precision/recall fix, `7389898` Uber research + benchmark module,
  `aab8764` wrap-up docs + a `docs/08_DEPLOYMENT.md` follow-up correcting the deployment IDs to the
  post-push state). Both Vercel projects rebuilt this branch's new tip and reached `READY`.
- Evidence link/screenshot: commit hashes above; Vercel deployment IDs above, confirmed via live
  `get_project`/`get_deployment` API calls (not just the task brief).
- Remaining risk: neither Vercel deployment was browser-tested this session (SSO wall + no Chrome
  extension connection — ISS-0019, unchanged). The paid three-actor UB1 benchmark is proposed only,
  not run — two of the three candidates' exact input field names are sourced from marketing/docs
  pages, not this project's own live pre-flight verification, and must be schema-checked before any
  real spend (see docs/69). Vercel deployment state can change again after this session ends (any
  further push, or a manual redeploy, will move the "latest deployment" again) — treat the recorded
  IDs as a snapshot at session end, not a permanent fact.

### 2026-07-21 (second same-day follow-up session)

- Change tested: production Supabase migration 0022; production Vercel smoke test; Just Eat phone
  batch completion; real Deliveroo public-discovery test; `/import` screen.
- Command/manual check:
  - Verified Supabase project ref (`rubhjkgygauuixiqouza`) and name (`aspectlead-platform`) via
    `get_project` before any write. Confirmed backup coverage via a direct `pg_stat_archiver`
    query (continuous WAL archiving active, last archived ~1hr before the session) — no
    on-demand-backup tool exists in the available toolset, so this was an honest evidence-based
    confirmation, not a fabricated one.
  - Applied migration 0022 via `apply_migration`; verified via `list_migrations`, direct
    `information_schema.columns` queries for all 16 new columns, `pg_indexes` for both new
    indexes, `pg_class`/`pg_policies` for unchanged RLS, exact-match row counts before/after on 5
    tables, a `BEGIN...ROLLBACK` transaction proving a full canonical insert + a second
    `je_rating_history` row both work with zero residual rows, and `get_advisors` (no new issues).
  - Verified the Vercel auto-deploy claim independently via `get_project`/`get_deployment` — both
    projects' latest deployments carry `githubCommitSha: 72990dc...`, both READY.
  - Smoke-tested all 9 named routes directly against the live Production URL
    (`magna-lead-intelligence-system-pngu.vercel.app`, no deployment protection) via `curl`,
    checked for server/column-error markers, and grepped for real data (restaurant names, phone
    numbers, exception counts, content hashes) actually present in the response HTML.
  - `npm run je:phone-enrich -- "UB1" 79` — real, live, paid Google Places calls; DB writes
    verified via direct Supabase queries before/after.
  - Deliveroo: real Playwright/Chromium session (verified via screenshot, not just text-keyword
    matching, after catching a false positive) against the live consumer site; captured real
    `__NEXT_DATA__`, built and tested a calibrated parser against the real captured data.
  - `npm run typecheck`, `npm run build`, and 19 test suites (`test:je-stage1`,
    `test:multi-source`, `test:uber-parse`, `test:uber-import`, `test:deliveroo-import`,
    `test:deliveroo-real-parse`, `test:phone-match`, `test:geography-gate`,
    `test:borderline-provider`, `test:apify-provenance`, `test:geography-standard`,
    `test:run-draft`, `test:custom-config`, `test:scoring`, `test:telesales-safe`, `test:geo`,
    `test:ub1-benchmark`, `test:new-screens`, `test:migration`, `test:import-route`) — all green.
- Result: migration live in production; 9/9 reachable production routes verified with real data;
  Just Eat UB1 phone coverage 93.5% (100/107); Deliveroo `marketplaceStatus` corrected to
  `PENDING_AUTHORISATION` with real supporting evidence; `/import` screen functional end-to-end.
- Evidence link/screenshot: Supabase query outputs and Vercel API responses quoted in this
  session's transcript; `docs/09_DECISIONS.md`, `docs/73`, `docs/74` for full detail; Deliveroo
  screenshots retained at `/private/tmp/.../scratchpad/deliveroo-*.png` (session-local, not
  committed — no personal data, public page content only).
- Remaining risk: the Preview Vercel deployment was not directly smoke-tested (SSO wall, no
  connected browser session this session either) — same limitation as ISS-0019, unchanged. Mobile-
  width rendering was not visually verified for the same reason (new screens reuse existing
  responsive Tailwind patterns, not independently confirmed on a real small viewport). Deliveroo's
  validated discovery flow is a one-off manual research result, not a productionised, scheduled
  adapter — treating it as such would be a separate, larger, unauthorised decision.

### 2026-07-21 (third same-day follow-up session)

- Change tested: interface honesty (banner + audit), real import persistence (migrations 0023 +
  0024), Deliveroo real provider + UB1 pilot, Just Eat exception audit trail, backup-wording
  correction.
- Command/manual check:
  - Read every named route's actual data-loader source before classifying it (not HTTP status).
  - Applied 0023 to production; first real persistence attempt failed genuinely (`digest()`
    unresolved) — confirmed via the actual error, not assumed; nothing was left persisted
    (checked directly via SQL); fixed forward with 0024; re-verified the exact same real
    persistence call then succeeded.
  - `SMOKE_TEST_BASE_URL` live test posts a real record through `/import`, confirms it via SQL,
    confirms it is genuinely rendered on `/discovery-results` HTML (not just claimed by the JSON
    response), then deletes everything it created.
  - Ran the Deliveroo pilot twice; second run's "detail challenge" classification checked against
    a specific, well-known Cloudflare interstitial title pattern, not a loose keyword (the class of
    check that produced a false positive earlier this session) — accepted as genuine on that basis.
  - Backup: queried `pg_stat_archiver` directly (WAL archiving confirmed active/current). No tool
    in the available Supabase MCP toolset can list backups, confirm PITR retention, or test a
    restore — reported as "not independently proven," not guessed or assumed.
  - `npm run typecheck`, `npm run build`, 21 test suites (20 static + `test:import-route` against
    a live server) all green.
- Result: `/import` genuinely persists to production (verified, not claimed); interface no longer
  misrepresents 8/10 live routes as mock; Deliveroo pilot ran for real (150 discovery records, 0
  canonical — honestly reported, cause identified); JE's 7 unresolved phones now have a real audit
  trail.
- Evidence link/screenshot: `docs/75` (audit), `docs/76` (pilot), `docs/09_DECISIONS.md` (both
  migration ADRs), `docs/10_BUGS_AND_FIXES.md` (4 real bugs found and fixed this session, each
  caught by direct verification, not assumed away).
- Remaining risk: sequential (non-concurrent) Deliveroo detail enrichment was not attempted — doing
  so now would be a retry against the same site shortly after a challenge, which is explicitly
  excluded; whether it would avoid the challenge is genuinely unknown. Preview Vercel deployment
  and mobile-width rendering remain unverified (no connected browser session, unchanged limitation).

### 2026-07-26

- Change tested: commercial-review-v1 brand + pharmacy/chemist exclusion filter, applied to all
  13 already-accepted representative territories.
- Command/manual check:
  - Registry verification before any code was written: manually re-derived row counts (141/28/113),
    keep/exclude overlap (0), union-vs-corrected match, and decision-label cross-check via an
    independent Python script reading the raw CSVs — not assumed correct from the filenames alone.
  - 15-assertion regression suite (`npm run test:lead-production-commercial-review`) — ALL PASSED,
    including registry fail-closed behaviour against a deliberately corrupted fixture.
  - Re-ran `test-lead-production-master-export.ts` / `test-lead-production-salespro-export.ts`
    against real UB1/RM1 checkpoints; manually inspected the resulting
    `commercial-review-exclusion-audit.csv` for UB1 (9 exclusions) and read every one of the 489
    campaign-wide exclusion rows' `match_basis` — confirmed each is a genuine exact or
    branch-name-variant match against an approved EXCLUDE brand (94 distinct real chains), zero
    generic-word false positives.
  - Independent zero-leakage check (Python, `csv.DictReader` — not the naive comma-split that
    produced a false "leak" on the first attempt, caught and corrected before being reported) across
    all 13 representatives' new-leads CSV, CTO 20-field file, and audit files: 0 leaked IDs, row
    counts match exactly.
  - Independent re-verification (separate script, not reused from the export scripts' own internal
    assertions) that every surviving Lead ID in each of the 13 new-leads CSVs appears in that
    territory's own Master Evidence Register sheet: 0 missing across all 13.
  - Verified the 3 regenerated field-sales maps (Nauman/Manraj/Ayesha) have exactly as many rows as
    their territory's new ordinary-lead count.
  - `npm run typecheck` clean, `npm run build` succeeded, both re-run after every batch of code
    changes (not just once at the end).
- Result: commercial-review-v1 genuinely applied and independently verified — not just exit-code-
  trusted. Campaign totals move from 2,700 usable / 2,520 ordinary new leads / 180 key accounts to
  2,294 / 2,118 / 176, with the sum check against the unchanged 5,662 unique-candidates total
  holding exactly for all 13 representatives and campaign-wide.
- Evidence link/screenshot: `docs/09_DECISIONS.md` (new commercial-review-v1 decision entry),
  `PROJECT_STATUS.md` ("COMMERCIAL REVIEW v1 APPLIED" section, full before/after table),
  `docs/15_AI_WORK_LOG.md` (2026-07-26 session entry), per-territory
  `<prefix>-commercial-review-exclusion-audit.csv` files.
- Remaining risk: 0 pharmacy/chemist matches were found in this dataset — the rule is applied and
  tested (fixture-proven to fire correctly when both category and name evidence are present) but
  has not yet fired against real production data, so its real-data behaviour is unproven beyond the
  fixture tests. "Other irrelevant business types" beyond the named brands and pharmacy/chemist was
  not scoped or actioned this turn. Final human sign-off before physical handover to any
  representative or the CTO has not been given — this verification covers correctness of the
  applied rule, not business sign-off.

### 2026-07-26 (same-day follow-up)

- Change tested: release verification of the commercial-review-v1 work above — specifically
  whether the reported "pharmacy/chemist exclusions = 0" was actually true, and whether the
  Simplified Representative Workbook's layout matched what was approved.
- Command/manual check:
  - Did NOT trust the earlier "0 pharmacy/chemist exclusions" claim at face value — independently
    keyword-searched every candidate (all 6 buckets, all 13 territories, not just the excluded
    ones) for pharmacy/chemist/pharmaceutical/dispensary/Superdrug/Pearl Chemist. Found 41 real
    matches, confirming the earlier commercial scan's ~20-record estimate was directionally
    correct and the automated report's "0" was wrong.
  - Root-caused (not just patched around) two distinct defects before writing any fix, then wrote
    9 new regression assertions proving the fix works AND that the existing generic-word
    false-positive protection (Phoenix/Premier) still holds.
  - After the fix, re-ran the keyword search: all 41 originally-flagged candidates now excluded by
    one rule or the other (0 remaining) — checked programmatically, not sampled.
  - Read every one of the 213 newly-caught matches' business names campaign-wide (grouped by
    matched brand) to check for false positives before trusting the larger number — found 107
    distinct real UK chains (Shell, Londis, Wenzel's, Harvester, etc.), zero coincidental
    generic-word matches.
  - Independently recomputed brand/pharmacy rule overlap by evaluating BOTH rules against every
    flagged candidate (not trusting the production code's single recorded final_exclusion_status,
    which only records whichever rule fired first) — found 2 genuine overlaps.
  - Rebuilt the Simplified Representative Workbook against the actual approved 18-column spec
    (previously verified against nothing but the pipeline's own README-style comment) and added a
    dedicated regression test asserting exact column order, Business Name first, Sales Pro Lead ID
    last, and fail-closed behaviour on a missing source column.
  - Re-ran the full zero-leakage check, Master Evidence Register cross-check, and field-sales map
    row-count check for all 13 representatives after every regeneration (not just once at the
    end). `npm run typecheck` clean, `npm run build` succeeded, both re-run after every fix.
- Result: 2 real defects confirmed, root-caused, fixed, regression-tested, and the entire campaign
  reprocessed and re-verified — not just accepted the original "0 pharmacy/chemist" claim. Final
  corrected totals: 2,192 usable / 2,016 ordinary new leads / 176 key accounts / 702 commercial-
  review exclusions (672 brand + 30 pharmacy/chemist).
- Evidence link/screenshot: `docs/10_BUGS_AND_FIXES.md` (full defect writeup),
  `PROJECT_STATUS.md` ("RELEASE VERIFICATION" section), `docs/09_DECISIONS.md`,
  `docs/15_AI_WORK_LOG.md` (2026-07-26 follow-up entry).
- Remaining risk: the dash-separator brand-matching relaxation has a documented, accepted residual
  risk (no counter-example found in 702 real matches). Final human sign-off before physical
  handover to any representative or the CTO has not been given.

### 2026-08-02

- Change tested: five-district-pilot mandatory corrections — territory fail-closed validation,
  website page-path traversal + closure-text detection, named-brand exclusion union +
  matching-gap fixes, mandatory-phone gate (`phone_resolution_exception`), SIC/financials/
  directors/PSCs wired into the dossier, new Business-Category Eligibility engine, new CTO
  Business Type mapping engine (against the CTO's exact 57-value allow-list), Master schema v2
  (107 v1 fields preserved + 22 new, programmatically verified byte-for-byte), Note 1/Note 2
  generation, and field-provenance coverage for the 3 new decision fields.
- Command/manual check:
  - `npm run typecheck` — clean (0 errors) after every batch of edits, not just once at the end.
  - `npm run build` — succeeded (full Next.js production build, all routes).
  - All 20 `test:lead-production-*` regression suites run individually — every one exits 0, "ALL
    PASSED"/"All ... assertions passed" (bridge, business-category, commercial-review, companies-
    house, cto-business-type-mapping, cto-with-address, customer-master-exclusion,
    final-group-rescreen, final-scoring, final-scoring-v2, fsa, full-territory, google,
    master-export, public-profile, salespro-export, simplified-workbook, territory-v2, website,
    website-page-paths).
  - Real bug found and fixed during this pass: the Sales Pro exporter's dropdown/type validator
    rejected every multi-value "Business Types" cell (e.g. "Pakistani Restaurant, Afghan
    Restaurant, Kebab Shop") as a single invalid string, because `cto_business_type` is a
    comma-joined string (per the CTO's explicit comma-separated format requirement), not an array
    — the validator's array-only multi-value path never fired. Fixed by splitting "Multi Select"
    fieldType cells on comma for validation; re-ran the real-UB1-checkpoint end-to-end test, 0
    dropdown violations, 34/20/5 new-lead/customer-exclusion/key-account row counts unchanged.
  - `test-lead-production-salespro-export.ts`'s schema cross-check was still reading
    `master-schema-v1.json` (now stale — `cto_business_type` only exists in v2); updated to v2 and
    re-ran — "every Sales Pro column's canonicalName exists in the 129-field Master vocabulary (0
    orphan(s))".
  - `test-lead-production-master-export.ts` had a hardcoded "exactly 107 fields per row"
    assertion; updated to 129 (v2 = 107 v1 + 22 new) and re-ran — passes against real UB1
    checkpoint data (39 usable rows, 129 fields each).
  - Field-provenance coverage: no pre-existing automated test exists for
    `generate-field-provenance.ts` (none did before this session either). Verified two ways
    against real data: (1) a throwaway smoke script (`scripts/_tmp-smoke-provenance.ts`, deleted
    after use, never committed) loaded real UB1 dossiers and called
    `evaluateBusinessCategoryEligibility`/`mapCtoBusinessType` directly — 94 dossiers loaded, 77
    eligible_foodservice, 45 CTO-mapped, output inspected and correct (e.g. "Kebabish Original" →
    ["Pakistani Restaurant","Afghan Restaurant","Kebab Shop"], cuisine_specific, high confidence).
    (2) Ran the real CLI end-to-end against Naseh's already-accepted UB1-UB5 territory (real
    territory-run-manifest.json + real combined Master workbook, output written to the session
    scratchpad only, deleted after inspection) — 108 usable leads, 36 provenance rows each (33
    pre-existing + 3 new: Business Category Eligibility, CTO Business Type, Trading Status
    (Consolidated)), spot-checked one full lead's 36 rows, all populated correctly with no thrown
    errors.
  - Release-verification gate: no separate gate script was built — the two exporters already
    fail closed (Sales Pro: throws "Refusing to write Sales Pro export" on any dropdown/type
    violation or blank/invalid phone; Master: throws "Reconciliation FAILED" on any bucket-count
    mismatch) and both were exercised against real UB1 data above with zero violations. Building a
    second, separate gate would duplicate enforcement that already exists at the source.
  - Second real bug found and fixed while checking the new `turnover_gbp`/`gross_profit_gbp`/
    `net_assets_gbp`/`employee_count` fields against real data: `candidate-dossier.ts`'s
    `key_financial_values` (pre-existing code from earlier this session, not previously exercised
    end-to-end) read Companies House's `turnover_result`/`grossProfit_result`/`netAssets_result`/
    `employeeCount_result` verbatim with no `"not_available"` filter — unlike the adjacent
    `company_age_years`/`financial_strength_band` fields, which do filter it. Confirmed against
    real UB1 `filed-accounts-data.csv` (9 candidates with filed accounts): turnover/grossProfit
    is `"not_available"` for 9/9 (expected — UK micro-entities aren't required to file it), which
    would have leaked the literal string `"not_available"` into the Master export as a
    fake-looking financial value. Fixed by applying the same filter to all 4 sub-fields; re-ran
    `npm run typecheck` (clean) and the master-export/salespro-export/customer-master-exclusion
    regression suites (all still ALL PASSED).
- Result: every mandatory offline correction for the pilot is implemented, typechecked, built, and
  regression-tested against real UB1/RM1/Naseh-UB1-UB5 data — one real bug found and fixed during
  this verification pass (Business Types multi-value dropdown validation), not just accepted on a
  green exit code.
- Evidence link/screenshot: this session's file diffs (master-field-resolver.ts,
  generate-master-export.ts, generate-salespro-export.ts, generate-field-provenance.ts,
  candidate-dossier.ts, test-lead-production-salespro-export.ts,
  test-lead-production-master-export.ts); `/tmp/out-test:lead-production-*.log` (this session, not
  committed); `/tmp/build-out.log` (this session, not committed).
- Remaining risk: **the five pilot districts (CM1, IG1, RM1, DA1, BR1) do not match the current
  live `sales-territories-v2.json` configuration for the named representatives** (Kunz is
  configured for TW1-TW10, Naseh for UB1-UB5, Saif for HA0-HA5, Tahira for WD3-WD7, Hassan for
  EN1-EN5), and RM1 specifically is already owned by Nauman from the completed first campaign
  wave — this conflict was identified earlier this session, reported to the owner, and remains
  unresolved. No territory config was changed and no live discovery has been run against any of
  the 5 named districts. Note 1/Note 2 content is composed only from fields already covered
  elsewhere on the row (directors/PSCs/decision-maker/company age/group classification for Note 1;
  FSA/Google/financial-strength/cuisine evidence for Note 2) — real production data has not yet
  been visually reviewed by a human for tone/usefulness. `sic_code_descriptions` only covers the
  15-code food-service-relevant subset already in the pipeline's SIC lookup table; codes outside
  that subset are correctly left blank rather than guessed, but this means the field will be empty
  for some real candidates. `turnover_gbp`/`gross_profit_gbp`/`net_assets_gbp`/`employee_count`
  were checked against real UB1 filed-accounts data (see the bug fix above) —
  `net_assets_gbp`/`employee_count` do populate for real candidates (e.g. net assets -£99,705, 4
  employees); `turnover_gbp`/`gross_profit_gbp` were `null` for all 9 real UB1 candidates with
  filed accounts (expected: UK micro-entities filing abbreviated accounts aren't required to
  report turnover), so those two specific sub-fields remain functionally untested against a
  genuinely populated real example — the code path is correct, but no real candidate in the
  fixture data exercises it.

### 2026-08-03 — five-district-pilot owner-review corrections: brand registry, CTO Business Type
cap, Notes rewrite, Lead Urgency recalibration, cross-representative combined Master + CTO file

- Change tested: (1) `commercial-review-filter.ts` trademark-symbol brand matching fix (Chaiiwala®
  now matches) + Black Sheep Coffee added to the exclude registry (owner correction, resolving a
  duplicate-brand conflict with a stale "Keep" entry from the original 141-brand review). (2)
  `cto-business-type-mapping.ts` Tier-1 cuisine loop was missing the `selected.length < 3` cap
  that Tier 2 already had — fixed, capped at 3 total values on every tier. (3) Note 1/Note 2
  generation rewritten to the owner's detailed spec (Note 1 = people/ownership only; Note 2 =
  business-specific sales-conversion intelligence, never repeating dedicated columns) — wires in
  website-extraction.ts fields (productRangeTags, likelyMagnaProductRequirements, halalEvidence,
  branchList, franchiseGroupClues, centralPurchasingClues, publicTeamNames) that were already
  computed and persisted into every stored checkpoint but never read downstream. (4) Lead Urgency
  recalibrated: Hot Lead now requires a key account OR genuinely unusual evidenced opportunity
  (multi-site/group, major catering, an unusually high review count, or exceptional financial
  strength) — never qualification/score alone; confirmed the approved `salespro-schema-v1.json`
  allowedValues are `["Hot Lead","Warm Lead","Standard Lead","Low Priority"]` (no "Cold Lead") and
  mapped the "Cold" concept to "Standard Lead". (5) New `generate-campaign-master-combined.ts`
  merges N per-representative Master workbooks into one canonical cross-campaign workbook,
  correctly distinguishing the 7 mutually-exclusive candidate buckets from the 3 overlay/subset
  sheets (Premium Level 0, Releasable Level 1, Key Accounts) so reconciliation is never
  double-counted. (6) New `generate-cto-final-review.ts` builds the unified telesales/field-sales
  CTO review file (exact approved 20 headers + exact approved 6 address columns + Note 1/Note 2,
  28 columns, never renamed/reordered).
- Evidence: `npx tsc --noEmit` clean throughout. `npm run build` succeeds (all routes compile).
  25 lead-production test suites run individually, all ALL PASSED, zero failures: phone-validation,
  business-category, cto-business-type-mapping, commercial-review, master-export, salespro-export,
  master-field-resolver, campaign-master-combined, cto-final-review, cto-with-address,
  simplified-workbook, campaign-territory, customer-master-exclusion, bridge, fsa, google,
  companies-house, website, website-page-paths, public-profile, final-group-rescreen,
  final-scoring, final-scoring-v2, full-territory, territory-v2. Regenerated all 5
  campaign-002-five-district-pilot district exports (CM1/IG1/RM1/DA1/BR1) from the already-stored,
  phone-fix-reprocessed checkpoints (zero live provider calls — verified via each district's
  `postprocess-revision-manifest.json`) and confirmed by direct row lookup: all 15 owner-confirmed
  EXCLUDE decisions land in the correct Business Category Exclusions/Commercial Review Exclusions
  sheet; Da Raffaele Bistro (BR1-D6486F07) correctly remains usable (owner's explicit retain); Bobo
  & Cha (DA1-015ED52A) correctly lands in Held-Review with `review_required_business_category` and
  its full stored evidence. Combined Master workbook: 524 total candidates across 5 districts, 7
  disjoint buckets sum to exactly 524 (177 usable/62 held/98 hard-rejected/16 customer-master/67
  excluded-groups/77 commercial-review/27 business-category), 131 columns per row (129 Master + 2
  companion). CTO final-review file: 177 rows, 28 columns, all "Trading" status, all Lead Urgency
  values within the 4 approved dropdown values. A real pre-existing gap was found and fixed while
  verifying: the trademark-symbol fix also caught a real UB1 leak ("Chaiiwala® - Southall") that
  had been silently sitting in the usable population — updated the real-UB1 test assertions to
  match (36→35 usable, 25→24 premium) rather than treating the shift as a regression.
- Files: `scripts/lead-production/commercial-review-filter.ts`,
  `scripts/lead-production/cto-business-type-mapping.ts`,
  `scripts/lead-production/master-field-resolver.ts`,
  `scripts/lead-production/candidate-dossier.ts`,
  `scripts/lead-production/generate-campaign-master-combined.ts` (new),
  `scripts/lead-production/generate-cto-final-review.ts` (new), and matching test files; commits
  `cd29b52`, `7fd4c6c`, `f299edd` (pre-existing, verified), `e52a167`, `0f1ec29`, `0e3b8b9`,
  `74380a5`, `c4d34fd`. None pushed to `origin/feature/mvp-vertical-slice-001` yet.
- The owner-review workbook (`/Users/homemac/Downloads/campaign-002-five-district-pilot-owner-
  review.xlsx`, a 15-sheet bespoke audit pack, originally hand-built in an earlier turn with no
  committed generator) was regenerated by `generate-owner-review-pack.ts` (commit `c4d34fd`) and
  independently re-verified: typecheck clean, 33/33 real-checkpoint test assertions pass, all 15
  owner-confirmed exclusions + Da Raffaele's retention confirmed present with correct outcomes,
  Bobo & Cha confirmed in Review Required, Pilot Summary's per-district totals cross-checked
  byte-for-byte against the combined Master workbook's own Representative Summary. Hot Leads
  shrank 145→85 (the recalibrated urgency policy correctly narrows it); Exclusions grew 164→187
  (matches the exact sum of the 4 disjoint exclusion buckets). One deliberate content change (not
  a structural change — the same 5 columns) was reviewed and accepted: "Sales Pro Validation" now
  reports genuine missing-required-Master-field gaps from each district's already-existing
  `salespro-required-field-gaps.csv`, rather than the prior version's Note-blankness grading,
  which is now redundant with the separate "Note Quality Review" sheet. Three genuinely
  underivable values are honestly left blank rather than guessed (Pilot Summary's
  pre-consolidation raw-discovery count; the per-row source-provenance summary; "New Campaign Lead
  ID" for a historical duplicate that was dropped before Lead ID assignment).
- `sales-territories-v2.json`
  (Kunz=TW1-TW10, Naseh=UB1-UB5, Saif=HA0-HA5, Tahira=WD3-WD7, Hassan=EN1-EN5) still does not
  match the pilot's single-district assignments (CM1/IG1/RM1/DA1/BR1) — this is the already-
  resolved ISS-0033 (see `docs/11_ISSUES_LOG.md`, resolved 2026-08-03): the owner confirmed a
  separate, additive campaign config (`config/lead-production/campaigns/campaign-002-five-
  district-pilot/territories.json`) is authoritative for this pilot, `sales-territories-v2.json`
  is deliberately untouched, and RM1 candidates are cross-campaign-deduped against Nauman's real
  historical RM1 output (`--historical-usable-workbook`, used in this turn's RM1 export — 42 real
  historical duplicates correctly excluded). No live discovery run was made against any district
  this session — every export used only already-stored, already-phone-fix-reprocessed
  checkpoints.

### 2026-08-03 (same day, board escalation, ISS-0034) — customer-suppression leak: root cause, fix, independent proof

- Change tested: 5 real defects found and fixed in the customer-suppression system after 2
  existing Magna customers were found in the released five-district-pilot output (board review):
  (1) `normalisePostcode()` silently broke on a trailing comma present in 538/7762 (6.9%) of real
  customer postcodes; (2) "Office Phone"/"Invoice WhatsApp Number"/"Invoice Email Address" columns
  were never loaded/compared; (3) `run-final-scoring-stage-v2.ts` hardcoded `domain: null`,
  disabling an already-built domain-matching route; (4) the core matcher's phone-conflict floor
  could be cleared by a bare shared town/area word alone (a real over-exclusion risk found while
  proving the fix); (5) domain-alone matches were confirmed unconditionally, contrary to the
  explicit "domain plus corroborating name/postcode" rule.
- Evidence: first established the pilot's ACTUAL customer-master file
  (`/Users/homemac/Data/aspectlead-lead-production/input/magna-customers.csv`) via MD5 match
  against `configHashes.customers` in every district's `.orchestrator-run-manifest.json` — proving
  it, not assuming the "expected path" given in the investigation brief was correct (it was not;
  that path names a different, older, incomplete file the pilot never read). Independently
  re-verified all 177 previously-released usable leads against the real customer master using a
  from-scratch comparison (own logic, not the pipeline's own match result), finding exactly 2 real
  confirmed leaks (IG1-21A3E429 "Al Qasr Restaurant", BR1-0FA2C0D7 "Munchies Peri Peri- Bromley")
  and 2 correctly-ambiguous probable/held cases. Fixed all 5 code defects; `npm run typecheck`/
  `build` clean; 27 `test:lead-production-*` suites individually re-run, all ALL PASSED, including
  2 new suites (40 assertions, both real leaked cases as permanent regression fixtures). Built a
  new, independent, non-code-sharing pre-release leakage verifier
  (`scripts/lead-production/verify-customer-leakage.ts`) and ran it against the fully reprocessed
  5-district pilot (zero live provider calls throughout — every stage read from already-stored,
  phone-fix-reprocessed checkpoints): **RESULT: PASS, 0 confirmed leaks**, released usable count
  177 → 175 (exactly the 2 real leaks removed). Certificate:
  `/Users/homemac/Downloads/campaign-002-zero-leakage-certificate.json`. Findings workbook (all 7
  required sheets): `/Users/homemac/Downloads/campaign-002-existing-customer-leakage-audit.xlsx`.
- Files: `scripts/lead-production/normalize.ts`, `scripts/lead-production/load-customers.ts`,
  `scripts/lead-production/match-customers.ts`, `scripts/lead-production/customer-resolution-
  after-google.ts`, `scripts/lead-production/customer-match-materiality.ts`,
  `scripts/lead-production/run-final-scoring-stage-v2.ts`,
  `scripts/lead-production/verify-customer-leakage.ts` (new), matching test files; commit
  `fa97306`. Not pushed.
- Remaining risk: the 15-sheet owner-review workbook was NOT regenerated in this correction pass
  (out of scope for the time available, flagged explicitly rather than silently left stale — see
  ISS-0034's "Outstanding" section). 2 real candidates remain correctly held at "probable" rather
  than confirmed or cleared (Franzos - Ilford, Chocoberry - Ilford) and need a human decision. The
  customer master's "Office Phone"/"Invoice WhatsApp Number" fix widens matching coverage but the
  file still has NO company-number column and NO explicit website/domain column at all (domain is
  derived from email only) — company-number-based matching against this specific customer master
  remains structurally impossible regardless of code correctness, a genuine data-coverage gap, not
  a code defect. Per the explicit instruction this pass operated under: the CTO lead file was
  regenerated for audit-completeness only (matching the corrected 175-lead population) and is
  explicitly NOT cleared for release/import/team use pending owner review of the leakage audit.
