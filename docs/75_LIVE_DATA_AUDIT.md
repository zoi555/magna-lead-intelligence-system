# 75 — Route-level live vs. mock data audit (2026-07-21, internal-beta correction)

Runtime audit of every route named in this session's instruction, based on direct inspection of
each route's actual data-loading code (not inferred from HTTP status).

| Route | Loader | Table(s)/API | Real row count (sample) | Mock/fallback | Actions persist? | Drill-down works? | Classification |
|---|---|---|---|---|---|---|---|
| `/` | none — imports `src/lib/mock-data.ts` directly | none | 0 (static object) | 100% mock (`kpis`, `latestRun`, `coverageProgress`, `setupBlockers`) | n/a | n/a | **DEMO_DATA** |
| `/discovery-results` | `fetchOutletResults()` | `je_outlets` | 107 (UB1) | none | read-only | → `/discovery-results/[id]` ✓ | **LIVE_REAL_DATA** |
| `/discovery-results/[id]` | `fetchOutletDetail()` | `je_outlets` + `je_field_provenance` + `je_rating_history` | 1 outlet + up to 20 provenance rows + N rating-history rows | none | read-only | back-link ✓ | **LIVE_REAL_DATA** |
| `/discovery-runs` | `fetchRecentRuns()` | `discovery_runs` | 10 (all runs, tenant-wide) | none | read-only | → `/discovery-runs/[id]` ✓ | **LIVE_REAL_DATA** |
| `/discovery-runs/[id]` | `fetchRunDetail()` | `discovery_runs` + `je_executions` + `je_execution_quality` + `provider_executions` + `je_raw_observations` (counts) + `provider_geography_validations` + `consolidated_candidates` (count) | 1 run + its real execution/quality/observation counts | none | read-only | evidence links ✓ | **LIVE_REAL_DATA** |
| `/data-quality-exceptions` | `fetchDataQualityExceptions()` | `je_outlets` + `consolidated_candidates` + `provider_geography_validations` + `candidate_source_links` + `je_raw_observations` | 2379 exceptions (tenant-wide) | none | read-only | → `/discovery-results/[id]` ✓ | **LIVE_REAL_DATA** |
| `/audit` | `fetchRecentAuditRecords()` | `je_raw_observations` | 30 (most recent) | none | read-only | → `/audit/[id]` ✓ | **LIVE_REAL_DATA** |
| `/audit/[id]` | `fetchAuditRecordDetail()` | `je_raw_observations` + `je_outlets` + `je_field_provenance` | 1 observation + linked outlet + provenance rows | none | read-only | → `/discovery-results/[id]` ✓ | **LIVE_REAL_DATA** |
| `/settings` | `SOURCE_REGISTRY` (static array in `source-registry.ts`) + live `process.env` presence checks + `getCompaniesHouseConfig`/`getGooglePlacesConfig`/`getDeliveryPlatformConfig` | none (config, not DB rows) | n/a — the registry describes real current status honestly, but is authored config, not queried data | the registry entries are hand-maintained, not fetched — flagged below | env-var presence is live and real | n/a | **LIVE_PARTIAL_DATA** (accurate, current, hand-maintained status — not a DB query, and not demo/fabricated either) |
| `/import` (before this session's fix) | `/api/discovery/import` route | validates via real `UberEatsAdapter`/`DeliverooAdapter` + real `provider-geography-gate`; returned `persisted: false` always | 0 rows ever written | none fabricated — but nothing persisted either | **no** | n/a | **EMPTY_BUT_OPERATIONAL** (validation is real; persistence did not exist) |

## What "every number traces to its source" means per route

Every `LIVE_REAL_DATA` route above traces every displayed number to a live Supabase query
executed at request time (`export const dynamic = "force-dynamic"` on all of them — no static
caching of stale numbers). `/` and the `/settings` registry array are the only places numbers are
authored in code rather than queried.

## Immediate corrections made this session (see below for full detail)

1. Global `PrototypeBanner` (shown on **every** route including the live ones) said "Prototype
   using mock data. No real customer data. No integrations connected." — false for 8 of 10 routes.
   Replaced with an honest, per-source internal-beta status banner (§ Interface).
2. `/import` persistence implemented for real (§ Import persistence).
