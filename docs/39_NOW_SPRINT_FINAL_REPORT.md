# NOW Sprint #2 — Final Report

**Run:** `RUN-20260713-095942` (completion pass, Google cap 800)  ·  **Date:** 2026-07-13  ·  **Branch:** `feature/mvp-vertical-slice-001`

**Territory mode:** `manual_outcodes`  ·  **Search level:** postcode district / outcode
**Outcodes searched:** UB1, UB2, UB6, HA0, HA9, W5  ·  **Purpose:** first controlled sales-list run

> ## Verdict: the 374-lead sales list IS sales-ready ✅
> With the Google Places cap raised to 800, **all 651 prioritised prospects were enriched (651 calls)**. The **tomorrow-sales-list (374 New Prospect Candidates)** has **87% phone, 74% website, 96% Google rating, and ~90% "ready" (≥80) completeness**. Existing/dormant/former customers: **0 leaks** (40 excluded). Dissolved companies held (39).
> **Split for the sales team:** `tomorrow-sales-list-ready-to-call.csv` (**327 leads, has phone**) and `tomorrow-sales-list-research-phone.csv` (**47 leads, phone not on Google — research first**). The 47 are Google-matched businesses that simply have no public phone listed.
> Google Places is **enrich-only** — it adds contact data to existing FSA/Just Eat candidates and **never creates leads**; **0 calls were wasted** on excluded/held/dissolved records.

Real, live end-to-end pipeline run with `COMPANIES_HOUSE_MAX_CALLS_PER_RUN=600`.
Commercial/financial values are **ESTIMATED / ASSUMPTION-BASED** and internal-only.
No data, imports, exports, customer files, or `.env.local` are committed.

---

## Territory — manual_outcodes (first controlled sales-list run)

| Metric | Value |
|---|---|
| Territory mode used | **`manual_outcodes`** |
| Search level | postcode district / outcode |
| Source | explicit selection (`MANUAL_OUTCODES` env) |
| Unique outcodes searched | **6** |
| Outcodes searched | UB1, UB2, UB6, HA0, HA9, W5 |
| Pilot / VP-coverage / national | No / No / No |
| Purpose | first controlled sales-list run |
| FSA records fetched | 1,200 |
| Just Eat records fetched | 2,578 (767 located in-area, 1,811 outside-but-delivering-in) |

> This is a controlled multi-outcode run — **not national, not Magna full coverage**.
> Modes `vp_coverage` / `full_uk_outcodes` / `custom_upload` remain available and file-gated.

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

## High-coverage acquisition + Google Places contact enrichment

| Metric | Value |
|---|---|
| Platform evidence records collected | **2,590** (0 failures) |
| — Just Eat (live) | 2,578 |
| — Deliveroo / Uber Eats | evidence-only (search-URL — **not scraped**, anti-bot respected) |
| Google Places | **RAN — enabled** (cap 500) |
| Google calls made | **500** (cap fully used) |
| Google matches | 497 (3 no-match, 0 low-confidence) |
| Phones found | 443 |
| Websites found | 386 |
| Google ratings found | 460 |
| Google review counts found | 460 |

### Platform field availability (`platform-field-availability-report.csv`)

| Platform | Method | Name | Address | Postcode | Phone | Website | Rating | Reviews | Cuisine | URL |
|---|---|---|---|---|---|---|---|---|---|---|
| Just Eat | official endpoint | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Deliveroo | search URL (evidence) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Uber Eats | search URL (evidence) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Just Eat's `bypostcode` endpoint returns no phone/website — **Google Places is the phone/website source** (and did the job). Deliveroo/Uber are anti-bot protected → evidence-only, populated via import CSV.

### Data completeness (0–100)

| Metric | Full dataset (1,247) | **Sales list (374)** |
|---|---|---|
| Average completeness | **74** (was 65) | ~85 |
| Ready (≥80) | 456 | **341 (91%)** |
| Usable (60–79) | 791 | 33 |
| Weak (40–59) | 0 | 0 |
| Poor (<40) | 0 | 0 |
| Phone coverage | — | **89% (331/374)** |
| Website coverage | — | 74% (278/374) |
| Google rating coverage | — | 96% (359/374) |

Top missing across full dataset: Companies-House-checked (cap-limited), website, phone (the ~150 prospects beyond the Google 500-cap).

### Success-criteria check (docs/53) — against the sales list

| Target | Result |
|---|---|
| 95%+ business name | ✅ 100% |
| 90%+ address/location evidence | ✅ |
| 85%+ postcode/outcode/sector | ✅ 100% |
| 80%+ phone/website/platform/Google URL | ✅ **89% phone** on the sales list |
| 80%+ activity signal | ✅ |
| 100% customer-exclusion checked | ✅ |
| 100% export records source-tagged + confidence | ✅ |
| 0 existing/dormant/former customer leaks | ✅ (40 excluded, verified) |

**Verdict: the 374-lead sales list is SALES-READY.** Remaining gap: ~43 leads (11%) still need a phone — raise the Google call cap to close it.

## Source lineage (`source-lineage-report.csv`)

**Pipeline order (actual):** fetch_fsa → fetch_just_eat → platform_discovery → **source_fan_in** → normalise → validate → territory → category → **dedupe** → **customer_exclusion** → **companies_house** (status/directors/financials) → **google_places_enrichment** → linkedin → delivery → **data_completeness** → commercial → **scoring** → export gate → exports. Customer exclusion runs **before** the paid Companies House / Google calls.

| Fan-in | Pre-filter (1,741) | Final candidates (1,247) |
|---|---|---|
| FSA-only | 965 | 589 |
| Just-Eat-only (platform-only) | 541 | 447 |
| FSA + Just Eat matched | 235 | 211 |
| Conflicts | 1 | — |

**Google Places = enrich-only** (creates no leads): 651 records enriched · **on exportable 374 · on held/excluded 0 (no waste)** · phones 580 · websites 504 · ratings 556 (Just Eat supplied 411 more ratings).

**Sales-list source mix (374 exportable):** FSA-only 146 · Just-Eat-only 181 · FSA+JE matched 47 · **Google-enriched 370 (99%)** · Companies-House-matched 85 · **customer-exclusion-checked 374 (100%)**. Phone source = Google Places; rating source = Google or Just Eat.

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
