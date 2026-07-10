# Integrations — Magna Lead Intelligence System

## Active / planned integrations

| Integration | Direction | MVP status | Notes |
|---|---|---|---|
| NetSuite | Read-only export | Required | Customer master for deduplication |
| Magna Sales Pro | Manual import/export | Required | No automated write in MVP |
| JustEat public endpoint | Read | Required | Primary discovery where available |
| Apify | Read | Required/secondary | Uber Eats + Deliveroo actors |
| FSA Food Hygiene Rating API | Read | Required | Free, no key, address match |
| Companies House API | Read | Required | Key required, free public data |
| Google Places API | Read fallback | Required with cap | £5/day cap per docs |
| Supabase | Read/write internal | Required | Leads, logs, telemetry, audit |
| Vercel | App hosting | Required if dashboard built | Internal UI |
| AWS Lambda | Processing | Required | Serverless pipeline stages |

## Credentials

All real secrets must live outside the repo:

- AWS Secrets Manager or equivalent.
- Vercel environment variables.
- Supabase secrets/server env.
- Local `.env.local`, never committed.

## Integration blockers

- Need completed customer postcode file.
- Need delivery postcode list.
- Need Magna Sales Pro field validation.
- Need API account setup and quotas.

## Compliance warning

No mass unsolicited WhatsApp messaging. Only publicly listed business-contact numbers or existing customer relationships should be used, and even then outreach rules must be followed.
