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

## Design (before app scaffolding)

- **Create the first UI/UX screen map before any app scaffolding.** Covers: login, role-based dashboard, territory selector, new pipeline run setup, upload customer postcode file, upload delivery boundary file, lead results dashboard, ignored leads audit view, reactivation list, expansion pipeline, run history, export/review screen, settings.

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

## Phase 2

- Off-platform business discovery.
- Menu classification.
- More territories.
- More business types.
- Reactivation list workflow.
- Dashboard enhancements.

## Later

- Automated CRM write after sustained reliability.
- Open Projects app integration.
- Quarterly scoring recalibration automation.

## Rejected / not now

- Google Places as primary discovery.
- Runtime LLM in core scoring.
- Mass WhatsApp outreach.
- Fully automated CRM write in MVP.
