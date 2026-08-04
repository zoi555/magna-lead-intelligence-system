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

## Temporary local production storage boundary (recorded 2026-08-04)

The CLI lead-production pipeline currently used for real campaign runs (Kunz campaign-003, Meer
campaign-004, and any future campaign) writes ALL lead, customer, provider-payload, and generated
workbook data to a local filesystem root, never to Git:

```
/Users/homemac/Data/aspectlead-lead-production/
  input/                    customer masters, group registry, identity indexes
  campaigns/<campaign-id>/  raw/, checkpoints/<district>/, working/, review/, audit/,
                            release/, manifests/ — one tree per campaign
  representatives/<name>/current-release/  final CTO delivery copies only
```

This is a deliberate, temporary structure for the current single-operator CLI pipeline — not the
live application's storage design. It is out of scope to redesign or implement here; this section
only records the boundary so a future migration knows what it is replacing:

- **Structured operational records** (leads, scoring, qualification state, audit trail) will move
  to **Supabase PostgreSQL**, not local JSON/XLSX checkpoints.
- **Files and evidence** (raw provider payloads, generated workbooks, screenshots) will move to
  **private object storage**, not the local filesystem.
- **Pipeline execution** will run as **background workers** against that database, not as CLI
  scripts invoked by hand against local directories.
- **Review and approval** will happen in **application screens**, not by opening generated XLSX
  files from a local folder.
- **Releases** will be **immutable online records**, not a `release/` folder plus a manually
  copied `~/Downloads` convenience copy.

The Git repository (`/Users/homemac/Projects/magna/lead-intelligence-engine`) holds only code,
configuration, tests, documentation, and metadata-only release manifests (`docs/release-
manifests/*.json` — hashes and counts, never record contents). Every campaign's actual lead and
customer data lives exclusively under the local data root above.
