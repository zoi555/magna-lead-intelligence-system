# Roadmap — Magna Lead Intelligence System

## Immediate setup

- Create local folder.
- Create GitHub repo.
- Commit docs first.
- Create GitHub project issues.
- Collect missing postcode file.
- Collect delivery postcode list.
- Get CTO field validation.
- ~~Confirm exact MVP scope.~~ Resolved — territory is flexible per run (ADR-0009).

## Branding stage (before UI redesign)

1. **AspectLead brand identity draft** — `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md` + brand board (`docs/design-previews/aspectlead-brand-board.html`): wordmark-led logo directions, dual dark/light theme (Auto/Light/Dark, remembered), new palette. *(Draft; not final, not legally cleared.)*
2. **Brand board review** — choose a wordmark route; run domain/trademark/social clearance (classes 9/35/42).
3. **Finalise wordmark + palette** — designer pass; promote approved tokens into `docs/18` §A.
4. **Then implement** the app theme system + redesign (tokens/fonts → components → screens), IA and data contracts unchanged.

## Design (before app scaffolding)

- **Create the first UI/UX screen map before any app scaffolding.** Covers: login, role-based dashboard, territory selector, new pipeline run setup, upload customer postcode file, upload delivery boundary file, lead results dashboard, ignored leads audit view, reactivation list, expansion pipeline, run history, export/review screen, settings.
- **Data model + permissions + RLS design accepted (ADR-0012).** Single-tenant MVP, RLS-first, restricted telesales view, geometry stored as separate map assets, `coverage_summary` as a maintained table, hashed suppression/erasure, separate UAT project. Design only — no SQL/migrations yet; dedup/export tables blocked by ISS-0001/0002/0003. Multi-org is Phase 2.
- **SaaS-neutral UI & branding guidelines created** (`docs/18_UI_BRANDING_GUIDELINES.md`). Product is SaaS-ready ("Lead Intelligence Platform"); **not** Magna-branded — Magna is the first internal tenant only; tenant name/logo/accent configurable. **Fixed** colour/typography/layout/map tokens, sidebar nav, usability rules, component/badge rules, accessibility, and Claude implementation rules defined for the future app shell. Design direction only — no app code. White-label/multi-tenant branding + SaaS domain are later work.
- **Signal Command design proof — CANDIDATE direction only (not final branding).** A premium command-centre look (dual-surface dark chrome + light work; cyan/violet signal accents; Space Grotesk / Inter / JetBrains Mono; subtle motion) captured as a static proof at `docs/design-previews/signal-command-preview.html` (Command Overview, Territory Map, Call Deck / Export Gate). **Not adopted, not implemented in the app, not production.** The official baseline remains the SaaS-neutral tokens (`docs/18` §A). **Brand not locked:** final colours/logo/UI are chosen only after a brand name + logo direction is selected (5-route brand exploration; names unverified pending trademark/domain checks). Any implementation is a later, presentational pass; data contracts and the 9-page IA stay stable.

## MVP

- UAT Supabase schema (including `territory_sets`, `territory_items`, `pipeline_runs` referencing a territory set).
- Manual source test for one business.
- Territory-set platform discovery (mixed outer codes, inner sectors, uploaded/pasted/expansion lists).
- Deduplication against NetSuite customer master.
- FSA address match.
- Companies House enrichment.
- Scoring and triggers.
- Ignored leads log.
- Manual CRM export.
- Basic dashboard for review/telemetry.
- **Lead-search coverage map** — self-hosted MapLibre + OS open data (ADR-0011, accepted via POC). MVP map requirement now includes **delivery boundary** and **remaining delivery gaps**, not just coverage history. Feeder routes must be **configurable**, not hardcoded. Map POC accepted and preserved separately (`magna-lead-intelligence-map-poc`); still to be integrated into the app.

## Phase 2

- Off-platform business discovery.
- Menu classification.
- More territories.
- More business types.
- Reactivation list workflow.
- Dashboard enhancements.
- Multi-org / multi-tenant model (deferred from MVP single-tenant, ADR-0012); saved map layer presets; management aggregate customer overlays.
- **Shared map engine (future — see ADR-0010; stack accepted via ADR-0011).** Extend the Phase 1 lead-search coverage map into a single reusable map engine used across the system, not a separate map per feature. Same postcode-boundary, road, coverage and layer-control architecture, driven by swappable data overlays:
  - Lead search coverage history (Phase 1, built first).
  - Active vs inactive customer map.
  - Customer / prospect demographics map.
  - New route planning map.
  - Expansion territory map.
  - Not built or verified yet — architecture note only.

## Later

- Automated CRM write after sustained reliability.
- Open Projects app integration.
- Quarterly scoring recalibration automation.

## Rejected / not now

- Google Places as primary discovery.
- Runtime LLM in core scoring.
- Mass WhatsApp outreach.
- Fully automated CRM write in MVP.
