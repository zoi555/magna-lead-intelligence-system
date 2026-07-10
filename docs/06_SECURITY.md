# Security — Magna Lead Intelligence System

## Data classification

Internal business-contact data. Contains names of directors/PSCs and public business contact numbers, so treat it as personal/business contact data under UK GDPR principles even if much of it is publicly available.

## Security controls

| Control | Requirement |
|---|---|
| API keys | Managed secrets store only; never code/spreadsheets |
| Database separation | UAT and production Supabase strictly separate |
| Data minimisation | Collect only fields needed for lead validation/scoring/outreach |
| Access control | Internal dashboard restricted to named users |
| CRM writes | Manual reviewed upload only in MVP |
| Audit trail | Every lead, ignored record, score, run, and export logged |
| Third-party exposure | No unnecessary bulk data export to vendors |
| RLS | Required before production |

## Roles

| Role | Access |
|---|---|
| Owner/Admin | Full internal dashboard, exports, audit, settings |
| Management viewer | Dashboard, ignored leads, telemetry, reports |
| Telesales viewer | CRM-exported lead fields only, not ignored logs or financial internals |
| Developer | UAT access only unless explicitly authorised |

## RLS policy direction

- No public access to lead tables.
- Server-side service role only for ingestion and processing.
- Dashboard users read according to role.
- Audit events append-only.
- Ignored leads visible to management/admin only.

## Legal/compliance areas to keep under review

- PECR/GDPR for WhatsApp/mobile outreach.
- Platform ToS for scraping or actor usage.
- Google Places API terms and quota use.
- Data retention and deletion policy.
- Legitimate business need for stored records.
