# Claude Project Instructions

## Read first

Before any code, read:

- `PROJECT_STATUS.md`
- `project_manifest.yml`
- `VERIFY_BEFORE_CLAIMING.md`
- `docs/00_PROJECT_CONTEXT.md`
- `docs/01_REQUIREMENTS.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_DATA_MODEL.md`
- `docs/04_WORKFLOWS.md`
- `docs/05_INTEGRATIONS.md`
- `docs/06_SECURITY.md`
- `docs/09_DECISIONS.md`
- `docs/10_BUGS_AND_FIXES.md`
- `docs/11_ISSUES_LOG.md`
- active files in `docs/modules/`

## Non-negotiables

- Do not start coding before checking requirements, architecture, data model, integrations, security, and project status.
- Do not introduce a new stack, package, service, database, queue, or architecture pattern without logging it in `docs/09_DECISIONS.md`.
- Do not remove existing functionality unless explicitly instructed.
- Do not commit secrets.
- Do not claim something works unless it has been tested or manually verified.
- If a bug is fixed, update `docs/10_BUGS_AND_FIXES.md`.
- If an issue remains unresolved, update `docs/11_ISSUES_LOG.md`.
- If workflows change, update `docs/04_WORKFLOWS.md`.
- If schema changes, update `docs/03_DATA_MODEL.md`.
- If deployment/env vars change, update `docs/08_DEPLOYMENT.md` and `.env.example`.

## End-of-session update

At the end of each session, update:

- `PROJECT_STATUS.md`
- `docs/15_AI_WORK_LOG.md`
- `docs/10_BUGS_AND_FIXES.md`, if bugs were fixed
- `docs/11_ISSUES_LOG.md`, if problems remain
- `docs/09_DECISIONS.md`, if decisions changed
