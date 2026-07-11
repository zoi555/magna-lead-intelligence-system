# MVP Vertical Slice 001 — Build Plan

**Branch:** `feature/mvp-vertical-slice-001`
**Mode:** Local. FSA live pull allowed (small, territory-limited). No paid calls, no secrets,
no scraping, no Supabase, no deploy.

**Goal:** produce the first real exported leads **only after** records pass a full, monitored,
resumable pipeline:

```
FSA pull → normalise → validate → territory filter → category filter → dedupe →
existing-customer exclusion → CH placeholder → Google placeholder → delivery placeholder →
score → export review gate → final CSV/JSON (+ telesales-safe)
```

Pilot territory: **UB1, UB2, UB6, HA0, HA9, W5**.

## Source strategy

| Source | Purpose | Build status | Adapter | Live? | Auth? | Cost risk | Legal risk | Next approval |
|---|---|---|---|---|---|---|---|---|
| **FSA FHRS** | Discovery of food businesses (name, type, rating, postcode, geo) | **Real, live-ready** (default enabled in the CLI run) | `src/lib/sources/fsa.ts` | Yes | No (open, OGL) | None (free) | Low (OGL attribution) | Confirm sustained pull size + attribution |
| **Companies House** | Company status (active/dissolved), incorporation | Placeholder, **key-ready, disabled** | `src/lib/sources/companies-house.ts` | No | Yes (`COMPANIES_HOUSE_API_KEY`) | None (free tier) | Low | Provision server-only key; set `CH_ENRICHMENT_ENABLED=1` |
| **Google Places** | Phone/website/status enrichment | Placeholder, **key-ready, DISABLED (paid)** | `src/lib/sources/google-places.ts` | No | Yes (`GOOGLE_PLACES_API_KEY`) | **Paid** — needs field-mask + per-run cap | Low | Cost sign-off + field-mask + cap before enabling |
| **Delivery presence** (Uber Eats / Deliveroo / Just Eat / Google Business) | Whether a business is on a delivery platform | Placeholder, **manual/import only** | `src/lib/sources/delivery-platforms.ts` | No | — | None | **Do NOT scrape** — legal/ToS risk | Choose an approved provider/import; never scrape |
| **Existing customers** | Dedup / suppression vs customer master | Placeholder (mock import), real match logic | `src/lib/sources/existing-customers.ts` | No | No | None | Low | Wire real import (NetSuite/Sales Pro) + hashed match |

Every enrichment returns a common **envelope**: `source`, `status`
(`not_configured|pending|found|not_found|error|manual_review`), `confidence`, `checked_at`,
optional `evidence_url`, `notes`. Delivery presence adds `platform`, `presence_status`,
`source_method`, `url`, `confidence`, `checked_at`, `notes`.

## Run model (resumable, local-file based)

State per run in `data/runs/`:
- `<run_id>.json` — `RunState` (status, current_stage, config, stages[], errors[], counters, output_files)
- `<run_id>.records.json` — working records (for resume)
- `<run_id>.result.json` — final projections for the app (leads, exportEligible, telesalesSafe, rejectionsByStage)

`RunStatus`: draft / running / paused / completed / failed / cancelled.
Pause/resume/retry are **file-based** tonight: a `<run_id>.pause` sentinel pauses at the next
stage boundary; `npm run leads:resume` clears it and continues from the first non-completed stage.

### Stages (each records status, counts, notes, errors)

1. configure_run 2. fetch_fsa 3. normalise_records 4. validate_postcodes 5. territory_filter
6. category_filter 7. dedupe_candidates 8. exclude_existing_customers
9. companies_house_enrichment_placeholder 10. google_places_enrichment_placeholder
11. delivery_platform_presence 12. score_candidates 13. export_review_gate
14. generate_final_exports

Standard error codes: `FSA_FETCH_FAILED`, `FSA_EMPTY_RESULT`, `POSTCODE_INVALID`,
`OUTSIDE_TERRITORY`, `CATEGORY_EXCLUDED`, `DUPLICATE_RECORD`, `EXISTING_CUSTOMER_MATCH`,
`ENRICHMENT_NOT_CONFIGURED`, `SCORING_FAILED`, `EXPORT_GATE_LOCKED`, `EXPORT_WRITE_FAILED`.
Each error carries `severity` (info/warning/error/fatal), `retryable`, and a `suggested_fix`.

## Scoring (explainable)

`src/lib/pipeline/scoring.ts` returns `score` 0–100, `grade` A/B/C/D, `score_reasons[]`,
`warnings[]`, `disqualifiers[]`, considering: business-type fit, territory fit, FSA rating +
rating age, new/changed FSA signal, coverage-gap placeholder, existing-customer exclusion,
delivery presence placeholder, Companies House placeholder, Google Places placeholder, and data
completeness. The numeric score is **internal**.

## Export

`exports/first-fsa-leads.csv` (export-eligible), `exports/first-fsa-leads.json` (full bundle),
`exports/first-fsa-telesales-safe.csv`. Only candidates that passed filters, are not existing
customers, are scored, are not disqualified, and pass the gate are export-eligible.
**CRM push stays locked (ISS-0003)** — file export is the deliverable; nothing is sent to a CRM.
XLSX intentionally **skipped** (would add a heavier/riskier dependency; open the CSV instead).

### Telesales safe view/export
`business_name, postcode, phone, category, trigger_reason, assigned_rep, worked_status` only.
**No internal score, no matching internals, no financials.** Enforced at the type level
(`TelesalesSafeRow`) and at the single projection boundary.

## Commands

- `npm run leads:first` — fresh live FSA run through all 14 stages, writes state + exports.
- `npm run leads:resume` — resume the latest paused/failed run.
- `npm run leads:status` — print the latest run monitor.
- `npm run build` — Next build + type-check.

Dependency added: **tsx** (dev, TS script runner) — required for the `leads:*` scripts.

## App pages (read the run store)
`/pipeline-runs` = monitor (14 stages, counts, errors, counters, pause/resume/retry concept).
`/leads` = final scored candidates. `/export-review` = gate + export status. `/telesales` = safe
queue only. `/settings` = source configuration status (env presence only, never values).

## Out of scope (later)
Real CH/Google calls behind server-only keys + caps; approved delivery-presence provider; real
customer-master import + hashed matching; Supabase persistence + RLS; CRM export; map integration.

## Delivery-platform presence collector (`delivery_platform_presence`)

Not a placeholder-forever and **not a blocker**. A real, configurable stage that collects
**public, business-level** presence on Uber Eats / Deliveroo / Just Eat / Google Business.

- **Methods:** `manual` · `import` · `approved_public_collector` (placeholder) · (future `provider_api` / `official_api`).
- **Evidence-URL based**, **risk-labelled** per platform (`low`/`medium`/`high`). Uber/Deliveroo/Just Eat = medium ToS risk.
- **Tonight:** no automated collection → every platform returns `manual_review` unless a manual/import
  evidence URL is supplied. **No scraping, no login, no captcha/anti-bot bypass, no proxy evasion, no
  personal data, no menu/image/price/review bulk extraction.**
- **Per-record fields:** `platform`, `presence_status` (present/absent/unknown/manual_review),
  `source_method`, `evidence_url`, `confidence`, `checked_at`, `risk_flag`, `notes`.
- **Stage metrics:** `input_count`, `checked_count`, `present_count`, `absent_count`, `unknown_count`,
  `manual_review_count`, `error_count`.
- **Codes:** `PLATFORM_NOT_CONFIGURED`, `PLATFORM_PRESENCE_UNKNOWN`, `PLATFORM_CHECK_MANUAL_REQUIRED`,
  `PLATFORM_TERMS_RISK`, `PLATFORM_EVIDENCE_URL_MISSING`.
- **Non-blocking:** if presence is unknown, the lead still exports with a
  `DELIVERY_PLATFORM_NOT_CHECKED` warning (raised at the export gate).
- **UI:** shown as a stage in the pipeline monitor (with metrics + risk note), and as a
  presence/risk column in Leads and Export Review. Telesales safe view stays limited (no delivery internals).

## Coverage map (POC-derived)

`/coverage-map` renders a **POC-derived** territory map (OS Code-Point Open + OS Open Roads via the
accepted map POC) and plots **real lead coordinates** from the latest run export. No Google, no paid
map API, no fake blob. Components: `LeadCoverageMap`, `MapLayerControls`, `MapLegend`,
`SelectedTerritoryPanel`. Data asset `src/lib/map/west-london-map.data.ts` (derived from the POC,
regenerate; not production geometry). GB-only data — a GB frame + West London **pilot lens** is shown,
**Northern Ireland flagged (hatched), not faked** — NI source unconfirmed (ISS-0009 style). Production
uses the real vendored MapLibre POC implementation.

## Offline-first data entry (planned)

Users may lose WiFi; data entry must not be lost. Planned local/offline model (**placeholder — no
service worker, no PWA, no server sync yet**):

- **Save locally first**, then **queue** pending actions, **sync when the connection returns**, with
  **retry** and **conflict detection** (optimistic `base_version`).
- **UI sync states:** *Saved locally · Pending sync · Synced · Sync failed · Conflict needs review.*
- **Offline-capable actions:** lead notes, telesales worked status, call outcome, assigned-rep update,
  manual platform-presence note, export-review comment, lead correction note.
- **NOT offline-approved (require server confirmation):** final export approval, deleting records,
  bulk destructive changes, admin/security changes.
- **Security:** the browser queue **never stores secrets, API keys, or sensitive enrichment internals**
  (score, confidence, financials, CH/enrichment internals) — only user-entered operational fields.
  Enforced by `assertOfflineSafe()` (forbidden-key guard) in `src/lib/offline/offline-queue.ts`.
- **Types/queue placeholders:** `src/lib/offline/offline-types.ts`, `src/lib/offline/offline-queue.ts`
  (localStorage-backed, SSR-safe, status tracking + retry; real sync intentionally not implemented).
