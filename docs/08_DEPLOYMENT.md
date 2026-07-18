# Deployment — Magna Lead Intelligence System

## Deployment status

The app now builds and deploys successfully on Vercel from `feature/mvp-vertical-slice-001`.
**Two Vercel projects currently exist and both build successfully** — see "Vercel deployment
topology" below for the canonical record. This is the authoritative deployment doc; do not
create a separate topology document elsewhere.

## Intended environments

| Environment | Purpose | Status |
|---|---|---|
| Local Mac | Development and docs | Set up |
| Supabase (`aspectlead-platform`) | Canonical discovery-engine persistence | Live (see `docs/09_DECISIONS.md` ADR-0014); separate UAT/production split per ADR-0007 not yet actioned |
| Vercel Preview | Dashboard preview | **Live** — see topology below |
| Supabase Production | Live customer/lead data | Do not create until UAT is proven and ISS-0001–0003 are resolved |
| Vercel Production | Live dashboard | **Building successfully**, but "production" here currently means "deploys the feature branch" — no `main`-branch production cutover has happened; see topology below |

## Deployment rule

No production **customer-facing** deployment (i.e. real lead data, real CRM export) until:

- UAT schema exists.
- RLS policies exist.
- Secrets are configured outside repo.
- Manual one-business test passes.
- First postcode run passes in UAT.
- CRM field acceptance is confirmed.

The Vercel deployments described below are infrastructure/build verification only — no real
customer or lead data flows through the deployed app today.

## Environment variables

See `.env.example`. `NPM_TOKEN` (GitHub Packages read token for `@zoi555/geospatial-map`) must
be set in **both** Vercel projects' environment variables (Preview + Production) — see ADR
"Consume the geospatial package from GitHub Packages" in `docs/09_DECISIONS.md`.

## Rollback

MVP has manual CRM export, so rollback is simple: stop exports, pause runs, review audit logs, fix, rerun.

---

## Vercel deployment topology (dual-project state) — recorded 2026-07-18

Two Vercel projects are connected to the same GitHub repository
(`zoi555/magna-lead-intelligence-system`) and both currently build and deploy successfully from
`feature/mvp-vertical-slice-001`. **This is intentional infrastructure to be resolved by a formal
owner decision — neither project is an accidental duplicate to be silently deleted.** This
section is the canonical record; update it in place rather than creating a second topology
document.

### Project A — `magna-lead-intelligence-system-pngu`

- **Project ID:** `prj_vxcbOvftT2CdzUmnxyCWhjF9f3U2`
- **Apparent role:** deploys `feature/mvp-vertical-slice-001` as **Production**. Behaves as the
  working feature-branch deployment.
- **Latest successful deployment:** `dpl_DvJ49zyyhVdV5ND8Rzhv8USNcCSZ`
  - URL: `https://magna-lead-intelligence-system-pngu-egqkbl8fl-zoeb-s-projects.vercel.app`
  - Commit: `2d6f4fb158b5ed60f93db1081e6a9b0c5fbf4fda`
  - Status: `READY`
  - Environment: `Production`
- **Historical incident (now resolved):** earlier deployments `dpl_kT5umq1CWAEHPp4Zvijkw5VkAUqH`
  and `dpl_AWMDRJXfo5JyG7KtMqr4FoQoPdta` failed. Root cause: this project still used an obsolete
  custom Git SSH rewrite/install command from before the GitHub Packages migration, and lacked the
  `NPM_TOKEN` GitHub Packages authentication that the current `.npmrc` requires (see the GitHub
  Packages ADR and `docs/10_BUGS_AND_FIXES.md`). **Fix applied:** the project was repaired using
  `NPM_TOKEN` + the current project settings + the normal (default `npm ci`) install route, matching
  Project B's configuration. The clean redeployment reached `READY`.

### Project B — `magna-lead-intelligence-system`

- **Project ID:** `prj_SNY6dJsXzfV6X145cynpqBACHnuT`
- **Apparent role:** the original Vercel project. Deploys the current feature branch as
  **Preview**. May represent the future main-branch production project once `main` is promoted —
  **this is not yet decided.**
- **Latest successful deployment:** `dpl_7ZSr1BuoTYgef9njpnaTfAGsqPn8`
  - URL: `https://magna-lead-intelligence-system-a0fkf7l3h-zoeb-s-projects.vercel.app`
  - Commit: `2d6f4fb158b5ed60f93db1081e6a9b0c5fbf4fda`
  - Status: `READY`
  - Environment: `Preview`

### Current facts (verified)

1. Both projects currently exist **intentionally** — neither should be deleted or renamed
   without a formal owner decision.
2. Both are connected to the **same** GitHub repository.
3. They have **different environment roles** today (A = Production, B = Preview) — this is the
   opposite of what the naming suggests (`-pngu` sounds like the "extra" one, but it is the one
   currently tagged Production for this branch).
4. **Both currently deploy successfully** (both `READY`, same commit `2d6f4fb1...`).
5. **The canonical Vercel project remains undecided.** Do not treat either project as "the real
   one" in code, scripts, or documentation beyond what is recorded here.

### Future clean-up (not yet approved — do not action)

A future clean-up decision may retain **one** of the two projects, migrate its aliases/custom
domains and environment variables (including `NPM_TOKEN`) from the retained project, and rename
the retained project to **`aspectlead-web`** (matching the product's working brand direction,
`docs/00_PROJECT_CONTEXT.md`). This is a proposal only, not a plan being executed.

**Before any deletion happens**, the following must be audited and recorded for both projects:

- Domains / custom aliases attached to each project.
- All environment variables (name + which environments — do not print values).
- Git integration settings (production branch, deploy hooks, ignored-build-step config).
- Full deployment history (not just the latest deployment) for anything worth preserving as
  evidence or rollback capability.
- Rollback requirements — whichever project is discarded must not remove the only working
  rollback target.

Only after that audit is complete should a deletion/rename be carried out, and only by explicit
owner instruction — this session does not have authorisation to change Vercel project settings,
delete, or rename either project.

### Historical note

The earlier record in `docs/10_BUGS_AND_FIXES.md` / `docs/09_DECISIONS.md` describing
`magna-lead-intelligence-system-pngu` as "a stale duplicate Vercel project that fails every
build" is now **out of date** — see ISS-0019 in `docs/11_ISSUES_LOG.md` for the corrected status.
Both projects build; the outstanding question is ownership/canonicalisation, not brokenness.
