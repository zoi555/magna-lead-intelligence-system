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

- Change tested: documentation-only (Vercel topology record in `docs/08_DEPLOYMENT.md`, ISS-0019
  correction, new ADR, `PROJECT_STATUS.md`/`README.md` updates) + Uber Eats discovery-actor market
  research doc (`docs/69`) + a narrowly-scoped `provider-registry.ts` precision/recall correction +
  no-network dry-run benchmark fixtures/tests + `.env.example` (`NPM_TOKEN` documented).
- Command/manual check:
  - Vercel project IDs, deployment IDs, statuses **independently re-verified this session** via
    read-only Vercel API calls (`get_project`, `get_deployment` for both projects) — not just
    transcribed from the task brief. Both confirmed READY on commit `2d6f4fb1...`, matching the
    task brief exactly. No Vercel setting was changed.
  - Uber actor claims verified via live WebFetch of real Apify Store pages this session (cited by
    URL in `docs/69`); anything not confirmed there is marked "not verified" in the doc, not guessed.
  - `npm run typecheck`, `npm run build`, and `npm run test:ub1-benchmark`, `test:borderline-
    provider`, `test:geography-gate`, `test:uber-parse`, `test:multi-source`, `test:apify-
    provenance`, `test:geo`, `test:run-draft`, `test:custom-config`, `test:scoring`, `test:telesales-
    safe`, `test:geography-standard` — all green. `git diff --check` clean before every commit.
- Result: three commits (`bb2e268` Vercel topology, `8575514` provider-registry precision/recall
  fix, `7389898` Uber research + benchmark module), plus this wrap-up commit. See the terminal
  summary at the end of this session for full detail.
- Remaining risk: neither Vercel deployment was browser-tested this session (SSO wall + no Chrome
  extension connection — ISS-0019, unchanged). The paid three-actor UB1 benchmark is proposed only,
  not run — two of the three candidates' exact input field names are sourced from marketing/docs
  pages, not this project's own live pre-flight verification, and must be schema-checked before any
  real spend (see docs/69).
- Evidence link/screenshot: commit hashes on `feature/mvp-vertical-slice-001`, pushed this session.
- Remaining risk: Vercel-reported facts (project IDs/deployment IDs/statuses) are recorded as
  given, not re-verified against the live Vercel API this session — if they have changed since the
  brief was written, `docs/08_DEPLOYMENT.md` needs a refresh. No live/paid Uber actor benchmark was
  run — the benchmark proposal is unexecuted by design. In-browser verification of either Vercel
  deployment remains outstanding (ISS-0019).

### YYYY-MM-DD HH:mm

- Change tested:
- Command/manual check:
- Result:
- Evidence link/screenshot:
- Remaining risk:
