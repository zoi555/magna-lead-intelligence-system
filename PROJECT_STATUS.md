# Project Status — Magna Lead Intelligence System

## Current state

Planning / documentation prepared. No code should be built yet.

## Local path

`~/Projects/magna/lead-intelligence-system/`

## GitHub repo

Created. Remote: `https://github.com/zoi555/magna-lead-intelligence-system.git`
Documentation pack pushed to GitHub on `main`.

## Build status

Not started. No application code, package.json, database, or pipeline yet.

## Deployment

Not deployed.

## Database

Not created yet. Supabase UAT and production should be separate.

## What works

- Business case exists.
- Technical architecture exists.
- Process and operations document exists.
- Security, scale, and governance document exists.
- Field schema workbook exists with 102 fields.
- Starter documentation pack has been generated.
- Protocol pointer files added at repo root: `SPEC.md`, `ARCHITECTURE.md`, `DESIGN.md` (link to the numbered `docs/` pack, no duplicated content).
- `.claude/commands/wrap-up.md` end-of-session command added.
- Repo hygiene: untracked `docs/.DS_Store` junk removed from disk (already gitignored).
- No application build started — no app code, package.json, database, or pipeline.

## Territory model

Territory selection is a **flexible per-run configuration** (ADR-0009), not a fixed MVP scope. One run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists (`territory_sets` / `territory_items`). A single sector such as `UB1 2` is a manual-test input only. This resolves **ISS-0004**.

## What is blocked

- **ISS-0001** — Missing postcode file for existing customer records.
- **ISS-0002** — Delivery postcode list still needed.
- **ISS-0003** — CTO must validate the 102-field schema against Magna Sales Pro.
- ~~**ISS-0004**~~ — Resolved by ADR-0009 (territory is flexible per run).
- API accounts/secrets not yet configured.
- No manual one-business test has been completed.

## Immediate next action

1. Resolve remaining blockers **ISS-0001 to ISS-0003** before any build work.
2. Create the **first UI/UX screen map before app scaffolding** (see `DESIGN.md` for the screen list).
3. Create GitHub issues from `docs/11_ISSUES_LOG.md`.
4. Run the manual one-business end-to-end test (see `docs/modules/MANUAL_TEST_PROTOCOL.md`).
5. Do not build until blockers are resolved.

## Do not touch yet

- No automated CRM write to Magna Sales Pro.
- No production Supabase.
- No bulk scraping.
- No live lead generation.
- No runtime LLM in the MVP pipeline.

## Last verified

Date: 2026-07-09  
Verified by: ChatGPT file generation process  
Evidence: starter pack created and ZIP contents checked. This does not verify the app because the app has not been built.
