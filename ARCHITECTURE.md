# ARCHITECTURE

This project does **not** keep its architecture in this file. It uses the richer
numbered documentation pack under `docs/` as the single source of truth. This file
is a pointer only — do not duplicate content here.

## How the system is built

- [`docs/02_ARCHITECTURE.md`](docs/02_ARCHITECTURE.md) — stack, pipeline stages, key architecture decisions and risks.
- [`docs/03_DATA_MODEL.md`](docs/03_DATA_MODEL.md) — proposed Supabase tables, the 102-field schema, modelling rules.
- [`docs/05_INTEGRATIONS.md`](docs/05_INTEGRATIONS.md) — external integrations, credentials, integration blockers.
- [`docs/06_SECURITY.md`](docs/06_SECURITY.md) — data classification, controls, roles, RLS direction.
- [`docs/08_DEPLOYMENT.md`](docs/08_DEPLOYMENT.md) — environments, deployment and env-var expectations.

For requirements and design, see [`SPEC.md`](SPEC.md) and [`DESIGN.md`](DESIGN.md).
