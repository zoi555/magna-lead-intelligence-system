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

### YYYY-MM-DD HH:mm

- Change tested:
- Command/manual check:
- Result:
- Evidence link/screenshot:
- Remaining risk:
