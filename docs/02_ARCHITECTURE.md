# Architecture — Magna Lead Intelligence System

## Architecture principle

Deterministic, serverless data pipeline. Not an AI-agent framework.

The scoring logic and matching rules must be auditable and derived from Magna evidence. Runtime LLM decisions are not part of the MVP.

## Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend / UI | Next.js on Vercel | Internal review dashboard |
| Database | Supabase PostgreSQL | Leads, ignored logs, telemetry, audit, scoring outputs |
| Processing | AWS Lambda | Pipeline stages and batch execution |
| Orchestration | Claude Code cloud routine or scheduled runner | Scheduling/orchestration, subject to verification |
| Discovery | JustEat public endpoint + Apify for Uber Eats/Deliveroo | Platform-first prospect discovery |
| Fallback data | Google Places API | Fallback only, capped |
| Company data | Companies House API | Directors, PSC, status, filings |
| Deduplication | RapidFuzz | Composite fuzzy matching |
| CRM | Magna Sales Pro | Manual reviewed import/export |
| ERP | NetSuite | Read-only customer master source |

## Pipeline stages

1. Platform discovery.
2. Postcode filter.
3. Address grouping.
4. Deduplication against Magna customer records.
5. FSA match by address.
6. Size proxy scoring.
7. Companies House enrichment.
8. Trigger and review mining.
9. Final scoring/tiering.
10. Export plus feedback.

## Key architecture decisions

- Delivery platforms are primary discovery source.
- Google Places is fallback only.
- FSA and Companies House matching is address-first.
- In-house Companies House parser replaces DataLedger.
- CRM upload is manual in MVP.
- Supabase UAT and production are separate.
- Trigger-flagged leads bypass weekly queue.

## Architecture risks

- Claude Code cloud routine as orchestration must be verified before relying on it.
- Apify actor reliability and ToS risk must be monitored.
- Supabase schema must not blindly mirror all 102 CRM fields without normalisation.
- Magna Sales Pro field/API constraints could force schema/export changes.

## Recommended build shape

Start with a CLI/batch pipeline and database tables before building UI polish. The dashboard exists to review outputs, not to cosplay as progress while the data layer is still mud.
