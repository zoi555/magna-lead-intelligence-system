# Handover — Magna Lead Intelligence System

## What this project is

A deterministic, serverless lead intelligence pipeline for Magna Foodservice outbound acquisition and reactivation.

## Where the code should live

`~/Projects/magna/lead-intelligence-system/`

## Where it is deployed

Not deployed yet.

## Database

Supabase PostgreSQL planned, with separate UAT and production.

## What is currently broken/blocking

- Missing postcode file.
- Delivery postcode list missing.
- CTO field validation outstanding.
- Exact MVP territory needs confirmation.
- No manual one-business test completed.
- No API accounts/secrets configured.

## What was fixed before

Design-level fixes:

- Google-only discovery replaced by platform-first discovery.
- Name-based matching replaced by address-based matching.
- DataLedger replaced by in-house Companies House parser.
- Manual review queue reduced using auto-ignore plus audit log.

## Next action

Set up local repo, commit docs, create GitHub issues, then resolve blockers before coding.

## AI/developer must read first

- `CLAUDE.md`
- `PROJECT_STATUS.md`
- `docs/00_PROJECT_CONTEXT.md`
- `docs/01_REQUIREMENTS.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_DATA_MODEL.md`
- `docs/04_WORKFLOWS.md`
- `docs/05_INTEGRATIONS.md`
- `docs/06_SECURITY.md`
- `docs/11_ISSUES_LOG.md`
