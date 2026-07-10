# Deployment — Magna Lead Intelligence System

## Deployment status

Not deployed.

## Intended environments

| Environment | Purpose | Status |
|---|---|---|
| Local Mac | Development and docs | Not set up |
| Supabase UAT | Safe testing | Not created |
| Vercel Preview | Dashboard preview | Not created |
| Supabase Production | Live data | Do not create until UAT is proven |
| Vercel Production | Live dashboard | Not created |

## Deployment rule

No production deployment until:

- UAT schema exists.
- RLS policies exist.
- Secrets are configured outside repo.
- Manual one-business test passes.
- First postcode run passes in UAT.
- CRM field acceptance is confirmed.

## Environment variables

See `.env.example`.

## Rollback

MVP has manual CRM export, so rollback is simple: stop exports, pause runs, review audit logs, fix, rerun.
