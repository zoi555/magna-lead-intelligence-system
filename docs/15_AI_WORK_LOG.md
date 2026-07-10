# AI Work Log — Magna Lead Intelligence System

## Session: 2026-07-10 — Data model + RLS design accepted (documentation only)

Tool used: Claude Code
Human request: Record the accepted data-model + permissions + Supabase/RLS design proposal with six corrections. Documentation only — no SQL, no schema, no app code.
Files changed (main repo, docs only):
- `docs/09_DECISIONS.md` — added **ADR-0012** (single-tenant MVP, RLS-first, restricted telesales view).
- `docs/06_SECURITY.md` — added MVP access-control design: roles, permission matrix, RLS strategy, telesales secure-view rule + fallback, hidden fields, audit minimisation, service-role ops, blocked-by-issues.
- `docs/03_DATA_MODEL.md` — added proposed application schema catalogue + storage corrections (geometry as map assets, maintained coverage_summary, hashed suppression/erasure, single-tenant).
- `docs/13_ROADMAP.md` — data-model/RLS design step under Design; multi-org deferred to Phase 2.
- `PROJECT_STATUS.md` — data model & access control section (accepted, not built).
- `docs/15_AI_WORK_LOG.md` — this entry.
Corrections captured: (1) audit before/after JSON redacted/hashed; (2) existing_customers server-side, telesales never; (3) geometry stored as separate map assets, DB holds configs/coverage/codes/memberships; (4) coverage_summary maintained/rebuilt by service-role jobs; (5) suppression/erasure hashed/minimised, erasure hash-only + retained; (6) Developer-UAT = separate UAT project, not a broad prod role.
Decisions made: ADR-0012.
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: no SQL, no migrations, no Supabase, no Vercel, no APIs. Dedup/export tables blocked by ISS-0001/0002/0003.
Next action: resolve ISS-0001 to ISS-0003; first UI/UX screen map; then SQL/RLS only after design sign-off.

## Session: 2026-07-10 — Map POC accepted; recorded in main docs (documentation only)

Tool used: Claude Code
Human request: Record that the real-data map POC is visually accepted and preserved in its own repo. Documentation only — no app code.
Context: A standalone map POC (`~/Projects/magna/lead-intelligence-map-poc/`, GitHub `magna-lead-intelligence-map-poc`) was built and **visually accepted by Zoeb**. It uses self-hosted MapLibre GL JS + current OS Code-Point Open derived postcode boundaries + OS Open Roads. No Google Maps, no Mapbox paid tiles, no paid hosted map service, no billing-enabled service. Proven: real polygons, hover/click, coverage shading, delivery gaps layer, A-road display modes.
Files changed (main repo, docs only):
- `PROJECT_STATUS.md` — added a Map proof-of-concept section (accepted, separate repo, not integrated).
- `docs/09_DECISIONS.md` — added **ADR-0011** (self-hosted MapLibre + OS open data accepted as map architecture direction after POC).
- `docs/13_ROADMAP.md` — MVP now includes the lead-search coverage map with delivery boundary + remaining delivery gaps; Phase 2 shared-engine note references ADR-0011.
- `docs/03_DATA_MODEL.md` — note that the POC validated the joinable-by-postcode approach; adds delivery-membership + configurable feeder-route data needs.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: ADR-0011.
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: the main app is still not built, deployed, or connected to Supabase/Vercel/Magna Sales Pro. Map POC accepted for feasibility; final production boundary accuracy still requires review.
Next action: resolve blockers ISS-0001 to ISS-0003; produce the first UI/UX screen map; keep the map POC frozen until integration is scoped.

## Session: 2026-07-10 — Flexible territory model (documentation only)

Tool used: Claude Code
Human request: Make territory selection fully flexible in the docs. One run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists. Add territory_sets / territory_items concepts and a UI/UX screen-map task. Documentation only — no app code.
Files changed:
- `docs/09_DECISIONS.md` — added ADR-0009: territory is flexible per-run configuration, not a hardcoded value.
- `docs/01_REQUIREMENTS.md` — MVP req 1 and 3 rewritten around a selected territory set; open conflict 1 marked resolved.
- `docs/03_DATA_MODEL.md` — added `territory_sets` and `territory_items` tables; `pipeline_runs` references a territory set; added a territory item-type table.
- `docs/04_WORKFLOWS.md` — run now starts from a selected mixed territory set.
- `docs/11_ISSUES_LOG.md` — ISS-0004 marked Resolved (design conflict only, nothing built).
- `docs/13_ROADMAP.md` — added a Design phase (first UI/UX screen map before scaffolding); territory line updated.
- `DESIGN.md` — added territory note and the first UI/UX screen-map task with the full screen list.
- `PROJECT_STATUS.md` — added territory model section; ISS-0004 removed from active blockers; UX screen-map added to next actions.
- `project_manifest.yml` — current_blocker, current_focus, and next_actions updated.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary of work: Replaced the "one outer vs one inner sector" MVP framing with a flexible per-run territory model, and recorded a UI/UX screen-map task to precede any scaffolding.
Problems found: None new.
Bugs fixed: None — no app code exists.
Decisions made: ADR-0009 (flexible per-run territory selection).
Tests run: None. No build, test, or deployment executed.
App code created: None.
Remaining blockers: ISS-0001, ISS-0002, ISS-0003 (ISS-0004 resolved by ADR-0009).
Next action: Resolve ISS-0001 to ISS-0003, produce the first UI/UX screen map, then run the manual one-business test before any build.

## Session: 2026-07-10 — Documentation-only setup corrections

Tool used: Claude Code
Human request: Correct stale setup facts and add missing protocol files. Documentation only — no app code.
Files changed:
- `PROJECT_STATUS.md` — GitHub repo marked created; remote URL and "pushed on main" recorded; new Build status section; blockers tagged ISS-0001 to ISS-0004; immediate next action rewritten.
- `project_manifest.yml` — `repo.github_url` corrected; `maintenance.last_ai_session` updated to this session.
- `SPEC.md`, `ARCHITECTURE.md`, `DESIGN.md` — added as thin pointer files to the numbered `docs/` pack (no duplicated content).
- `.claude/commands/wrap-up.md` — added end-of-session update command.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary of work: Fixed the stale "repo not created" claim across status and manifest, satisfied the file protocol with pointer files rather than duplicate docs, and added a wrap-up command.
Problems found: `docs/.DS_Store` was untracked junk on disk (not committed, already gitignored) — deleted from disk. README.md had no stale repo claim to fix.
Bugs fixed: None — no app code exists.
Decisions made: None new.
Tests run: None. No build, test, or deployment executed.
App code created: None.
Remaining blockers: ISS-0001, ISS-0002, ISS-0003, ISS-0004 (see `docs/11_ISSUES_LOG.md`).
Next action: Resolve blockers ISS-0001 to ISS-0004, then run the manual one-business end-to-end test before any build.

## Session: 2026-07-09 00:00

Tool used: ChatGPT  
Human request: Improve Project Operating System v1 into v2 and prepare a blank starter plus Magna Lead Intelligence starter.  
Files changed: Generated full starter pack and project-specific docs.  
Summary of work: Converted uploaded volumes, deck, and schema workbook into project-ready Markdown documentation pack.  
Problems found: MVP scope conflict, dedup threshold conflict, missing postcode file, missing delivery postcode list, CTO validation outstanding, retention track required.  
Bugs fixed: None, no app code exists.  
Decisions made: Docs-first, platform-first, deterministic pipeline, manual CRM upload, separate UAT/prod, address-based matching.  
Tests run: ZIP creation and file-count verification.  
Remaining issues: See `docs/11_ISSUES_LOG.md`.  
Next action: Set up local folder and GitHub repo, then resolve blockers before build.
