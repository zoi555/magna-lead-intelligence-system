# NOW Sprint #2 — Final Report

**Run:** `RUN-20260712-221751`  ·  **Date:** 2026-07-12  ·  **Branch:** `feature/mvp-vertical-slice-001`
**Territory:** West London pilot — UB1, UB2, UB6, HA0, HA9, W5

> ## Dataset verdict: RESEARCH / ENRICHMENT REQUIRED — not yet "sales-ready"
> Average data completeness is **65/100** (all 1,247 leads in the "usable" 60–79 band, **0 reach the 80 "ready" target**). The single blocker is **contact data**: phone and website coverage is **0%** because Google Places (the contact source) has no API key tonight. Everything else (identity, address, postcode, platform presence, customer exclusion, source evidence) is strong. **Exact next fix: set `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACES_ENABLED=true` + a call cap, then re-run — Google Places fills phone/website/review count and lifts most leads to "ready".**

Real, live end-to-end pipeline run with `COMPANIES_HOUSE_MAX_CALLS_PER_RUN=600`.
Commercial/financial values are **ESTIMATED / ASSUMPTION-BASED** and internal-only.
No data, imports, exports, customer files, or `.env.local` are committed.

---

## ⚠️ Territory — THIS RUN IS PILOT ONLY — NOT NATIONAL / NOT VP COVERAGE

| Metric | Value |
|---|---|
| Territory mode used | **`pilot`** (default) |
| Source file used | none (built-in pilot list) |
| VP / Magna coverage list loaded | **No** (no `imports/vp-postcodes.csv` etc. present) |
| National / full UK | No |
| Custom uploaded list | No |
| Raw postcode rows loaded | 0 (built-in) |
| Unique outcodes searched | **6** |
| Outcodes searched | UB1, UB2, UB6, HA0, HA9, W5 |
| FSA records fetched (this territory) | 1,200 |
| Just Eat records fetched (across searched outcodes) | 2,578 |
| — located inside target territory | 767 |
| — serves target territory | 0 |
| — outside-but-serves | 1,811 |
| — unknown location | 0 |

> **This is a pilot MVP test set, not Magna's real coverage.** Territory modes
> `vp_coverage`, `full_uk_outcodes`, and `custom_upload` are now implemented
> (`TERRITORY_MODE` env + `src/lib/pipeline/postcode-source.ts`) but were **not run**.
> To run VP coverage, drop `imports/vp-postcodes.csv` and set `TERRITORY_MODE=vp_coverage`.

---

## Headline

- **374 sales-eligible leads** (`New Prospect Candidate`, passed every hard gate) → `exports/tomorrow-sales-list.csv`.
- **74 excluded/held by hard gate** — 40 existing customers + 34 dissolved/insolvent-company holds.
- **833 held for manual review.**
- Live sources: **FSA 1,200** + **Just Eat 2,578** + **Companies House 424 calls used** (of 600).

---

## Sources & fan-in

| Metric | Value |
|---|---|
| FSA records fetched (live) | 1,200 |
| Just Eat live pull worked | **Yes** (0 outcode failures) |
| Just Eat records fetched | 2,578 unique (767 in-area) |
| FSA ↔ Just Eat matched | 235 |
| FSA-only | 965 |
| Just-Eat-only candidates added | 541 |
| Candidates after filters/dedupe | 1,247 |

## Customer exclusion

| Metric | Value |
|---|---|
| Customer list loaded | **Yes** — `imports/customer-list.csv` |
| Customer rows loaded | 7,925 |
| Strict exclusion applied | **Yes** |
| Excluded (existing accounts) | 40 |
| Possible Existing Account holds | 522 |
| New Prospect Candidates | 685 |

## Companies House (live, cap 600)

| Metric | Value |
|---|---|
| Key detected / enabled / max calls | Yes / Yes / 600 |
| **Calls used** | **424** (status 360 reserved + directors + financials; 176 unused) |
| Active company matches | **107** |
| Dissolved holds | 36 |
| Liquidation/administration holds | 3 |
| Low-confidence matches | 113 |
| No-match (kept as sole traders) | 66 |
| Not status-checked (budget/existing-customer skip) | 994 |
| FSA↔registered-office address match | exact 21 · same-area 21 · different-but-acceptable 103 |

## Directors & LinkedIn research

| Metric | Value |
|---|---|
| Leads with directors/officers | **21** |
| Directors/officers found | **54** |
| Director LinkedIn research rows | 34 |
| Business LinkedIn research rows | 1,247 |
| LinkedIn scraping/API used | **No** (public search URLs only) |

## Companies House financials

| Metric | Value |
|---|---|
| Accounts documents fetched (structured + PDF) | 14 |
| **Structured financials parsed (XBRL/iXBRL)** | **11** |
| PDF-only (manual review) | 4 |
| Financial ratios calculated | 17 |
| Financials unavailable | 1,232 |
| Financial health distribution | strong 5 · acceptable 4 · weak 2 · unknown 1,236 |
| Leads where financials affected commercial estimate | 11 |
| Raw financials internal-only | **Confirmed** — never in sales/telesales exports |

## High-coverage acquisition (multi-agent sprint)

| Metric | Value |
|---|---|
| Platform evidence records collected | **2,590** (0 failures) |
| — Just Eat (live) | 2,578 |
| — Deliveroo / Uber Eats | evidence-only (search-URL/import — **not scraped**, anti-bot respected) |
| FSA ↔ platform matched | 235 |
| Google Places enriched | **0 — DISABLED** (no `GOOGLE_PLACES_API_KEY`); contact enrichment INCOMPLETE |
| Phone count | 0 |
| Website count | 0 |
| Address count (FSA trading address) | 1,200 |
| Rating/review present (Just Eat) | 235 matched + platform-only records |

### Data completeness (0–100)

| Metric | Value |
|---|---|
| Average completeness score | **65** |
| Ready (≥80) | 0 |
| Usable (60–79) | 1,247 |
| Weak (40–59) | 0 |
| Poor (<40) | 0 |
| Top missing field | phone / website (Google Places disabled) |

### Success-criteria check (docs/53)

| Target | Result |
|---|---|
| 95%+ business name | ✅ 100% |
| 90%+ address/location evidence | ✅ (FSA trading address + coords) |
| 85%+ postcode/outcode/sector | ✅ 100% classified |
| 80%+ phone/website/platform URL/Google URL | ⚠️ ~62% (platform URL only; **phone/website 0** — needs Google Places) |
| 80%+ activity signal | ✅ (FSA record + Just Eat presence) |
| 100% customer-exclusion checked | ✅ |
| 100% export records source-tagged + confidence | ✅ |
| 0 existing/dormant/former customer leaks | ✅ (40 excluded, verified) |

**Verdict: research/enrichment required** — enable Google Places to meet the 80% contactability target.

## Scoring & commercial

| Metric | Value |
|---|---|
| Scored | 1,247 |
| Grade distribution | A 35 · B 844 · C 368 · D 0 |
| Hard-gate distribution | proceed 650 · hold 523 · exclude 74 |
| Estimated monthly value band | HIGH 54 · MEDIUM 715 · LOW 478 |
| Estimated opportunity value band | HIGH 8 · MEDIUM 461 · LOW 778 |

## Sales list & safety

| Metric | Value |
|---|---|
| Final safe sales lead count | **374** |
| Telesales-safe validated row count | **374** (matches sales list — mismatch fixed) |
| Restricted-field leak | **NONE** |
| Phone count | 0 |
| Website count | 0 |

The telesales-safe test now validates the **current** `exports/tomorrow-sales-list.csv`
(374 rows, 28 columns) plus the bundle's `telesalesSafe` set — not stale data. The sales
file contains only bands + safe summaries (no score, exact values, ratios, directors, or LinkedIn links).

## Exports generated (all gitignored)

tomorrow-sales-list.csv/json/for-upload · manual-review-hold-list.csv · customer-exclusion-matches.csv ·
customer-exclusion-hold-list.csv · customer-exclusion-summary.json · just-eat-platform-candidates.csv ·
just-eat-fetch-summary.json · companies-house-status-summary.csv · companies-house-hold-list.csv ·
companies-house-directors-summary.csv · director-research-queue.csv · director-linkedin-research-queue.csv ·
business-linkedin-research-queue.csv · companies-house-financials-summary.csv ·
companies-house-financial-ratios.csv · companies-house-financial-health-report.csv ·
commercial-calculation-summary.csv · full-pipeline-audit-report.csv (+ delivery/report files).

## Validation

| Command | Result |
|---|---|
| `npm run leads:first` | Pass — full 19-stage run |
| `npm run leads:analyse` | Pass |
| `npm run test:scoring` | **Pass** — gates override score; ratio maths verified; missing fields never invented |
| `npm run test:telesales-safe` | **Pass** — 374 rows, no leaks |
| `npm run build` | **Pass** |

## Risks before giving sales the file

1. **No prospect phone/website** — the phone/website source (Google Places) is paid and disabled,
   so all 374 leads carry no direct number; suggested action defaults to "Research phone before calling".
   This is the main next unlock.
2. **Financial coverage is partial** — only 10 companies had structured (XBRL) accounts within budget;
   most food businesses are sole traders / file micro-entity or PDF accounts with no structured values.
   This is expected, not a fault; financials are a confidence input, not a gate.
3. Commercial figures are placeholder assumptions in `src/config/commercial-assumptions.ts` — replace
   with finance-approved Magna numbers before any real commercial use.

## Data retention

Every field retrieved/parsed/calculated from Companies House (raw values, ratios, health scores,
accounts/filing metadata, warnings, null indicators, commercial workings, score breakdown) is
persisted in `data/runs/<run_id>.records.json` and the internal audit exports. Future DB tables:
`companies_house_profiles`, `companies_house_accounts`, `companies_house_financial_values`,
`companies_house_financial_ratios`, `companies_house_directors`, `lead_financial_assessments`,
`commercial_calculation_workings`, `enrichment_events`, `source_sync_logs`.
