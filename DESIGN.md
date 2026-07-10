# DESIGN

This project does **not** keep its design detail in this file. It uses the richer
numbered documentation pack under `docs/` as the single source of truth. This file
is a pointer only — do not duplicate content here.

## How the system behaves and is operated

- [`docs/04_WORKFLOWS.md`](docs/04_WORKFLOWS.md) — MVP workflow, trigger workflow, weekly/quarterly cadence, manual test protocol.
- [`docs/07_TEST_PLAN.md`](docs/07_TEST_PLAN.md) — how the system is tested and verified.
- [`docs/14_RUNBOOK.md`](docs/14_RUNBOOK.md) — operational runbook.
- [`docs/09_DECISIONS.md`](docs/09_DECISIONS.md) — architecture decision records (ADR-0001 onward).

For requirements and architecture, see [`SPEC.md`](SPEC.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Territory selection (ADR-0009)

Territory is a **flexible, per-run configuration**, not a hardcoded scope. A run selects one named `territory_set` made of `territory_items` that can mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion/out-of-area lists. A single sector (e.g. `UB1 2`) is a manual-test input only. See [`docs/09_DECISIONS.md`](docs/09_DECISIONS.md) and [`docs/03_DATA_MODEL.md`](docs/03_DATA_MODEL.md).

## First UI/UX screen map — TO DO before app scaffolding

Design task, not yet started. The first UI/UX pass must map these screens before any app is scaffolded:

- Login
- Role-based dashboard
- Territory selector (mixed outer / inner / uploaded / pasted / expansion)
- New pipeline run setup
- Upload customer postcode file
- Upload delivery boundary file
- Lead results dashboard
- Ignored leads audit view
- Reactivation list
- Expansion pipeline
- Run history
- Export / review screen
- Settings

Status: not designed, not built.
