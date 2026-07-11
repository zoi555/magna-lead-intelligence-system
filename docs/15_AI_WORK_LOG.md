# AI Work Log — Magna Lead Intelligence System

## Session: 2026-07-11 — Brand board map replaced with POC-derived, GB-wide spatial preview (design only)

Tool used: Claude Code
Human request: The design preview's map was still a fake small-region blob. Replace it with the **accepted map POC** direction (`~/Projects/magna/lead-intelligence-map-poc`): MapLibre-style visual language, OS open-data direction, **GB/UK-wide framing** with local territory (UB1) only as a **focused lens**. Read the POC read-only; do not modify it, the app, or commit.
What was done (design-only):
- **Inspected the POC read-only.** Captured its exact visual system from `web/index.html` + docs: coverage ramp blue→purple `rgba(84,120,205,.32)…rgba(156,42,166,.82)` (no green), delivery fill `rgba(38,96,180,.10)` / outline `#2B6CB0`, gaps `rgba(232,150,25,.42)`, current/selected `#C85A00`, expansion dashed `#6A4A9A`, motorway `#123C66`, A road `#3A9E63`, thin grey postcode outlines `#9AA4AD`; controls granularity Area/District/Sector, colour-by Runs/Leads/Export, A-road modes (feeder/primary/all/custom), planning layers. **Data extent = Great Britain only** (OS Code-Point Open + OS Open Roads are GB; the rendered POC is clipped to West London — UB/HA/TW/W + SL expansion).
- **Derived a real static map asset** `docs/design-previews/assets/aspectlead-map-data.js` from the POC data (36 West London districts incl. 7 gaps + 7 expansion, 66 road segments M4/M25/M40 + feeders), simplified/projected. Regenerate from the POC; not production geometry.
- **Rebuilt the brand board map** (`docs/design-previews/aspectlead-brand-board.html`): main surface = **GB-wide base map impression** (GB silhouette, real postcode-AREA locators, London focus frame, **NI shown hatched + flagged**); **Territory Lens = real POC-derived West London detail** (UB1 focus) in POC colours. Removed the old fake jittered-tessellation map. Added a **"Map source direction"** section. Both light + dark themes.
- **Fixed the Signal Command candidate** (`docs/design-previews/signal-command-preview.html`): replaced its fake "coverage tiles" grid with the same POC-derived West London map + POC legend + GB/NI note.
Decisions/notes recorded: user **rejected fake map previews**; the **accepted map POC is the visual source of truth**; **full UK-wide map coverage is required** and must be verified before production; the static board map is **design-only**, not app integration; **current POC data is GB-focused — a Northern Ireland data source must be confirmed** (logged as an issue).
Guardrails: POC repo **not modified** (git clean); app/`package.json`/`src` untouched; no npm/Supabase/SQL/migrations/Vercel; **not committed**; 0 "Magna" in the board.
Next action: user visual review of the GB-wide map + lens; confirm NI data source before any production map work.

## Session: 2026-07-11 — Route B (Perspective Cut) carried forward + wordmark refinement brief (design only)

Tool used: Claude Code
Human request: Carry forward **Route B — Perspective Cut** as the preferred AspectLead wordmark direction. Create a **refinement brief only** — no code, no app UI, no npm, no Supabase, no SQL, no migrations, no Vercel, do not mark branding final.
Files changed:
- `docs/20_ASPECTLEAD_WORDMARK_REFINEMENT_BRIEF.md` (new) — 10-section designer brief: exact wordmark direction; which letters to customise (`A` primary, `L` secondary, `t`/`d` optional); how the perspective cuts work (one shared angle, ~5–7° skew, clean geometric facets, tested at 16/24/240 px); subtle geographic cues allowed (contour whisper / facet-as-terrain) vs forbidden logistics cues (pins, routes, vans, Route C's node); light-theme colour use; dark-theme colour use; favicon derived from the cut (never a generic "A"); logo usage rules; what a professional must rebuild as vector; and the legal checks required before approval (UK IPO/EUIPO/USPTO classes 9/35/42, common-law, domain, social, typeface licensing, trade dress, tenant-conflict).
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — recorded Route B as the carried-forward preferred direction and pointed to the brief.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: preferred wordmark route = **B Perspective Cut** (working preference, not locked). No colours/geometry/artwork/legal locked.
Bugs fixed: none. Tests run: none. App code changed: none. npm/Supabase/SQL/Vercel: not touched.
Not built/verified: no vector artwork exists yet; brand not legally cleared; not implemented in the app; not production.
Next action: hand the brief to a professional designer; run trademark/domain/social clearance and typeface licensing in parallel; then review rebuilt vector before any promotion into docs/18 §A.

## Session: 2026-07-11 — AspectLead brand identity draft + brand board (design only)

Tool used: Claude Code
Human request: Move into proper product branding. Working brand = **AspectLead**, domain direction `aspectlead.app` (not legally cleared). Create a brand identity draft + a static brand board with three wordmark-led logo directions + dual dark/light theme. Design only — do not touch the app.
Key user decisions logged:
- **Rejected the generic standalone "A" logo mark** (previous AI concepts looked too generic).
- Wants a **wordmark-led** identity with a **geographic/map/perspective stroke** (hybrid: aspect/perspective/prism + dark command-centre/signal + map/territory/contour).
- Requires a **dual dark/light theme** system with **Auto / Light / Dark** user control; **default Auto (follows system)**; user override **remembered**; toggle in app shell + Settings; later daylight/time-based switching optional.
Files changed:
- `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md` (new) — brand name/domain, legal-not-cleared status, why wordmark-led, why the "A" icon was rejected, three wordmark routes (A Contour Line, B Perspective Cut [front-runner], C Route Stroke), dark/light theme strategy + behaviour rule, draft AspectLead palette (roles + refinements + accessibility guardrails), typography direction, logo usage rules, UI implications, open decisions, next steps, taglines.
- `docs/design-previews/aspectlead-brand-board.html` (new) — self-contained static board: working Auto/Light/Dark toggle (persisted), full palette swatches + contrast notes, typography specimen, three wordmark routes each with primary light/dark, compact, single-colour, white-on-dark, and a stroke-derived favicon (never an "A"), plus in-product samples (dark command rail, signal tile, territory chip, status badges, export gate, telesales card).
- `docs/18_UI_BRANDING_GUIDELINES.md` — AspectLead recorded as the working product brand (draft); baseline §A remains valid until AspectLead approved; Signal Command remains a candidate; AspectLead draft supersedes random palette exploration for future UI (not implemented).
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — recorded AspectLead as working brand/domain; branding stage added before UI redesign; logo/colour/theme in draft; no app implementation done.
- `docs/15_AI_WORK_LOG.md` — this entry.
Decisions made: brand *name* direction AspectLead adopted as working (not legally cleared); no colours/logo/theme locked.
Bugs fixed: none. Tests run: none. App code changed: none.
Not built/verified: no app-shell changes, no npm, no Supabase, no SQL/migrations, no Vercel, no real data. Not production. Not legally cleared.
Next action: review the brand board, pick a wordmark route, run domain/trademark/social clearance, then finalise wordmark+palette and promote into docs/18 §A before implementing the theme system.

## Session: 2026-07-11 — Signal Command reframed as a CANDIDATE direction (design only)

Tool used: Claude Code
Human request: Do not lock branding. Convert Signal Command into a candidate design route, not the official guideline. Keep the preview, but make docs/18 say the official state is the SaaS-neutral baseline and Signal Command is a candidate to evaluate; final colours only after brand name/logo chosen.
Files changed:
- `docs/18_UI_BRANDING_GUIDELINES.md` — restructured: **§A Current official baseline = SaaS-neutral design tokens (implemented)**; **§B Candidate direction = Signal Command (under evaluation, NOT final)**; **§C what must happen before any brand/colour is locked** (choose name+logo first, then final palette). Removed the "v2 final" framing.
- `docs/design-previews/signal-command-preview.html` — kept as a **candidate** preview; banner updated to "candidate direction — not final branding".
- `PROJECT_STATUS.md`, `docs/13_ROADMAP.md` — reframed to: Signal Command design proof created as a candidate direction only; not final branding; not implemented; not production; official baseline = SaaS-neutral tokens; brand not locked (5-route exploration, names unverified).
- `docs/15_AI_WORK_LOG.md` — this entry.
Context: a 5-route brand identity exploration (Signal/Command, Vantage/Intelligence, Atlas/Territory, Beacon/Discovery, Grid/OS) was produced in chat; recommendation was Intelligence-core with Territory-visual, name candidates Meridian/Cardinal/Vantage — all UNVERIFIED pending trademark/domain/social checks.
Decisions made: none locked (brand deliberately not chosen).
Bugs fixed: none. Tests run: none. App code changed: none.
Not built/verified: no app-shell changes, no npm, no Supabase, no SQL/migrations, no Vercel, no real data. Not production.
Next action: choose + clear a brand name/logo direction, THEN select the final palette and promote it into docs/18 §A; implement presentationally afterward, keeping IA and data contracts stable.

## Session: 2026-07-11 — SaaS-neutral UI & branding guidelines (documentation only)

Tool used: Claude Code
Human request: Before the app shell, create SaaS-neutral UI/branding guidelines. Correction: do NOT use "Magna" in product name/branding/colours/domain/UI — Magna is only the first internal tenant. Documentation only.
Files changed:
- `docs/18_UI_BRANDING_GUIDELINES.md` (new/refined) — SaaS design direction with a FIXED token system: product naming ("Lead Intelligence Platform"), product-vs-tenant branding model (`APP_NAME`/`TENANT_NAME`), domain placeholders, exact colour tokens (page `#F6F8FB`, sidebar `#111827`, action blue `#2563EB`, intelligence purple `#7C3AED`, cyan `#0891B2`, status greens/ambers/reds/slate), exact map colours (blue→purple coverage `#DBEAFE`→`#7C3AED`, gaps `#F59E0B`, expansion `#8B5CF6`, roads `#334155`/`#16A34A`, map bg `#F3F4F6`), Inter typography scale, layout (260px sidebar, 24px padding, 12px cards, 8px buttons), fixed sidebar nav, usability rules (what's happening / needs attention / do next), dashboard + table requirements, prototype banner copy, component/badge rules, accessibility, and Claude implementation rules ("use tokens exactly; never hardcode Magna").
- `PROJECT_STATUS.md` — added UI/branding direction section (SaaS-neutral, design only).
- `docs/13_ROADMAP.md` — recorded branding guidelines under Design; white-label/domain as later work.
- `docs/15_AI_WORK_LOG.md` — this entry.
Summary: established a SaaS-ready, brand-neutral visual direction; "Magna" removed from product identity (first tenant only).
Decisions made: none new (branding direction; not an ADR).
Bugs fixed: none. Tests run: none. App code created: none.
Not built/verified: no app shell, no code, no package.json, no Supabase/Vercel. Design direction only.
Next action: keep migrations/tests drafts under review; app shell to apply these tokens later, config-driven tenant identity.

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
