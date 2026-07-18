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

### YYYY-MM-DD HH:mm

- Change tested:
- Command/manual check:
- Result:
- Evidence link/screenshot:
- Remaining risk:
