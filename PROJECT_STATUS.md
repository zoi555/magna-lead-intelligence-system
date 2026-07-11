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

## Map proof-of-concept (separate repo)

A real-data geospatial coverage map POC has been built and **visually accepted by Zoeb** as the map architecture direction (see **ADR-0011**). It is **not** part of the main app.

- Local: `~/Projects/magna/lead-intelligence-map-poc/`
- GitHub: `https://github.com/zoi555/magna-lead-intelligence-map-poc.git`
- Status: **visually accepted proof-of-concept — not yet integrated into the main app.**
- Stack: self-hosted **MapLibre GL JS** + **OS Code-Point Open** (derived postcode boundaries, feasibility) + **OS Open Roads**. No Google Maps, no Mapbox paid tiles, no paid hosted map service, no billing-enabled service.
- Proven: real postcode polygons, hover/click, coverage shading, delivery gaps layer, A-road display modes.
- Open before production: final boundary-accuracy standard still needs review; feeder routes must be configurable, not hardcoded.

## Data model & access control (design accepted, not built)

The data-model + permissions + Supabase RLS design has been **reviewed and accepted with corrections** (**ADR-0012**). Single-tenant MVP, RLS-first, restricted telesales view (`v_telesales_leads`), geometry stored as separate map assets, `coverage_summary` as a maintained table, hashed suppression/erasure, separate UAT project. **Design only — no SQL, no migrations, no Supabase set up.** Dedup/export tables remain blocked by ISS-0001/0002/0003. See `docs/03_DATA_MODEL.md` and `docs/06_SECURITY.md`.

## Brand: AspectLead (working direction, DRAFT — not implemented)

**Working product brand/domain direction: AspectLead · `aspectlead.app`** (draft; **not** legally
cleared — trademark/domain/social checks outstanding). **"Magna" is not the product brand** (Magna =
future first tenant only). Brand identity draft in `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md`; a
static **brand board** with three **wordmark-led** logo directions (Contour Line, Perspective Cut,
Route Stroke — no generic "A" icon), a new AspectLead palette, and a **dual dark/light theme** system
(Auto/Light/Dark, user override remembered) is at `docs/design-previews/aspectlead-brand-board.html`.
- **Logo / colour / theme design is in DRAFT** — **Route B *Perspective Cut* is now the carried-forward
  preferred wordmark direction** (not locked). A designer refinement brief for it is at
  `docs/20_ASPECTLEAD_WORDMARK_REFINEMENT_BRIEF.md` (spec only — no vector artwork, no legal clearance).
- **No app implementation has been done** — the running Next.js shell still uses the SaaS-neutral baseline
  tokens; nothing built, applied, or production-ready; no Supabase/real data.

## Branding: not locked — SaaS-neutral baseline + candidate directions

**The brand is NOT chosen.** Product name, logo, and final colour identity are still open.
- **Current official state:** the **SaaS-neutral baseline design tokens** (`docs/18_UI_BRANDING_GUIDELINES.md` §A) — what the running app shell uses today.
- **Candidate direction (under evaluation, NOT final):** **Signal Command** — a premium sales-intelligence command-centre look (dark command chrome + light work surfaces, cyan/violet signal accents). Static proof at `docs/design-previews/signal-command-preview.html` (Command Overview, Territory Map, Call Deck / Export Gate).
- **Rule:** final brand colours/logo/UI must be chosen **only after the brand name + logo direction are selected** (a 5-route brand exploration exists: Signal/Command, Vantage/Intelligence, Atlas/Territory, Beacon/Discovery, Grid/OS — all names unverified pending trademark/domain checks).
- **Signal Command design proof created as a candidate only — not final branding, not implemented in the app, not production, no Supabase, no real data.** The running Next.js shell (neutral baseline) is unchanged.

## UI / branding direction (design only, not built)

SaaS-neutral UI & branding guidelines created in `docs/18_UI_BRANDING_GUIDELINES.md`. The product is a **SaaS-ready** app — working name **"Lead Intelligence Platform"** (short: "Lead Intelligence"). **"Magna" is not the product brand** — Magna Foodservice is only the first internal tenant/example; tenant name/logo/accent are configurable (`APP_NAME` / `TENANT_NAME`). **Fixed token system**: sidebar `#111827`, main action blue `#2563EB`, intelligence purple `#7C3AED`, Inter typography, 260px sidebar, 12px cards; map colours consistent with the accepted POC (blue→purple coverage, amber gaps, purple expansion). Fixed nav (Overview, Coverage Map, Territories, Pipeline Runs, Leads, Telesales, Export Review, Settings, Admin), usability rules, and mock-data banner defined. Future SaaS domain undecided (placeholders only). **Design direction only — no app shell, no code, nothing built.**

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
