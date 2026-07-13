# 49. Platform Public-Evidence Collector

Sprint #49. Compliant, public-evidence collectors for the three delivery
platforms — Just Eat, Deliveroo and Uber Eats — feeding a single normalised
record shape into the pipeline.

The guiding rule: **collect only what is genuinely public, and never pretend we
collected something we didn't.**

---

## 1. Compliance boundary (what we will and won't do)

This collector sits on a legal / Terms-of-Service boundary. We stay firmly on
the compliant side.

**We do NOT, under any circumstances:**

- Log in to any platform.
- Bypass captchas.
- Use proxies or any anti-bot / bot-detection evasion.
- Fetch anti-bot-protected pages (Deliveroo and Uber Eats sit behind
  Cloudflare / DataDome respectively).
- Collect full review text or reviewer names.
- Bulk-copy menus or prices.

**We DO:**

- Read the one **public JSON endpoint** that Just Eat's own consumer site uses
  to list restaurants serving a postcode (already built and unchanged in
  `src/lib/sources/just-eat.ts`). This is genuine live data.
- Generate **public search URLs** for Deliveroo and Uber Eats as manual-research
  evidence links — human-openable pointers, never fetched by us.
- Accept a **manually-collected evidence CSV** as a fallback, so a human can do
  the compliant research and hand the results back to the pipeline.
- Record **aggregate rating + review_count only** — never review text or names.
- Return a **clear status** for every record, so nothing is ever mistaken for
  live-collected data when it isn't.

### Why Deliveroo and Uber Eats are evidence-only

Both sites are protected by anti-bot systems. Fetching their HTML programmatically
would require evasion techniques that breach their Terms of Service. So their
collectors deliberately **do not** fetch anything. They emit one evidence record
per area carrying a public search URL and a warning that live evidence must be
imported.

---

## 2. Collector layers (methods)

The orchestrator runs a layered set of methods. Each layer has an honest status.

| Method | Name                | Platforms            | What it does                                                                 | Status today                     |
|-------:|---------------------|----------------------|------------------------------------------------------------------------------|----------------------------------|
| 1      | `official_endpoint` | Just Eat             | Reads Just Eat's public JSON endpoint. **Real live business facts.**         | active if `JUST_EAT_ENABLED=true`, else `disabled` |
| 2      | `public_page`       | Deliveroo, Uber Eats | Fetch a public HTML page. **SKIPPED — anti-bot protected. We never fetch.**  | `blocked` (by design)            |
| 3      | `public_search_url` | Deliveroo, Uber Eats | Generates a public, human-openable search URL as manual-research evidence.   | active                           |
| 4      | `imported_csv`      | any                  | Merges manually-collected evidence supplied via CSV.                         | active when a CSV is supplied     |
| 5      | `google_fallback`   | any                  | Noted for completeness; handled by the Google Places source elsewhere.       | external                         |

---

## 3. The normalised record (`PlatformRecord`)

Defined in `src/lib/pipeline/platform-normalisation.ts`. It is **self-contained**
— it does not import from the main pipeline `types.ts`, so this layer can evolve
independently.

**Rule:** any field that cannot legitimately be obtained is `null` (arrays default
to `[]`). We never guess.

| Field                     | Type                 | Notes                                                        |
|---------------------------|----------------------|-------------------------------------------------------------|
| `platform`                | `"just_eat" \| "deliveroo" \| "uber_eats"` | Which platform.                        |
| `platform_business_id`    | string \| null       | The platform's own id for the business.                     |
| `platform_url`            | string \| null       | Public listing / search URL.                                |
| `business_name`           | string \| null       | Listed name.                                                |
| `trading_name`            | string \| null       | Trading name if distinct.                                   |
| `brand_name`              | string \| null       | Parent brand/chain if any.                                  |
| `address_text`            | string \| null       | Full displayed address.                                     |
| `address_line_1`          | string \| null       | First line of the address.                                  |
| `postcode`                | string \| null       | Normalised postcode.                                        |
| `postcode_area`           | string \| null       | Leading letters of the outward code, e.g. `SW`.             |
| `postcode_district`       | string \| null       | Full outward code, e.g. `SW1A`.                             |
| `postcode_sector`         | string \| null       | Outward + space + first inward digit, e.g. `SW1A 1`.        |
| `latitude` / `longitude`  | number \| null       | Coordinates.                                                |
| `phone_number`            | string \| null       | Contact number.                                             |
| `website`                 | string \| null       | Business website.                                           |
| `cuisine_categories`      | string[]             | Cuisine tags.                                               |
| `primary_cuisine`         | string \| null       | First / main cuisine.                                       |
| `tags`                    | string[]             | Other public tags.                                          |
| `halal_flag`              | boolean \| null      | `true` if a halal tag is present; `null` if unknown.        |
| `vegetarian_flag`         | boolean \| null      | `true` if a vegetarian/vegan tag is present; `null` if unknown. |
| `rating`                  | number \| null       | **Aggregate** rating only.                                  |
| `review_count`            | number \| null       | **Aggregate** count only.                                   |
| `opening_status`          | string \| null       | e.g. `open`, `closed`, `temporarily_offline`.               |
| `delivery_available`      | boolean \| null      | Delivery offered.                                           |
| `collection_available`    | boolean \| null      | Collection offered.                                         |
| `delivery_fee`            | number \| null       | If publicly shown.                                          |
| `minimum_order`           | number \| null       | If publicly shown.                                          |
| `estimated_delivery_time` | string \| null       | If publicly shown.                                          |
| `serves_selected_area`    | boolean \| null      | Whether it serves the searched area.                        |
| `source_search_area`      | string \| null       | The outcode we searched under.                              |
| `evidence_url`            | string \| null       | The evidence link backing this record.                      |
| `evidence_type`           | enum                 | `public_api` \| `public_search_url` \| `public_page` \| `imported_csv` \| `none`. |
| `fetched_at`              | string (ISO)         | When the record was produced.                               |
| `collector_method`        | enum                 | See method table above.                                     |
| `collector_status`        | `CollectorStatus`    | See statuses below.                                         |
| `collector_warning`       | string \| null       | Plain-English caveat, e.g. "anti-bot protected; not fetched". |
| `confidence_score`        | number \| null       | 0..1 confidence in the record.                              |

### Collector statuses (`CollectorStatus`)

`collected` · `partially_collected` · `not_found` · `blocked` · `rate_limited` ·
`captcha_or_login_required` · `disabled` · `imported` · `manual_review_required`

- **Just Eat** live records → `collected`.
- **Deliveroo / Uber Eats** search-URL evidence → `manual_review_required`.
- **Imported CSV** rows → `imported`.
- Just Eat off (`JUST_EAT_ENABLED` not `true`) → `disabled` (recorded as a failure per area).
- Just Eat transport problems → `rate_limited` (HTTP 429), `blocked` (HTTP 403), or `not_found`.

---

## 4. Files

| File | Responsibility |
|------|----------------|
| `src/lib/pipeline/platform-normalisation.ts` | `PlatformRecord`, status/method vocabularies, `normalisePlatformRecord`, and the postcode helpers (`postcodeArea` / `postcodeDistrict` / `postcodeSector`, plus `outwardCode` / `inwardCode` / `normalisePostcode`). |
| `src/lib/sources/deliveroo-public.ts` | `collectDeliverooEvidence(outcode)` + `deliverooSearchUrl(postcode)`. Evidence-only. |
| `src/lib/sources/uber-eats-public.ts` | `collectUberEatsEvidence(outcode)` + `uberEatsSearchUrl(postcode)`. Evidence-only. |
| `src/lib/sources/platform-public-collector.ts` | `collectAllPlatforms(outcodes, opts)` — orchestrates all layers, maps Just Eat live data, parses the imported CSV, and returns `{ records, failures, summary }`. Never throws. |
| `src/lib/pipeline/platform-evidence-store.ts` | `stagePlatformRaw` / `stagePlatformNormalised` — write raw + normalised evidence to the local run directory. Internal audit trail (not committed). |
| `src/lib/pipeline/platform-discovery-stage.ts` | `runPlatformDiscovery(runId, outcodes, opts)` — the pipeline-stage wrapper: runs the collector, stages evidence, writes exports, returns records + summary. |

The existing Just Eat collector `src/lib/sources/just-eat.ts` is **unchanged**;
the orchestrator imports `getJustEatConfig`, `pullJustEatForOutcodes` and
`JustEatRestaurant` from it.

---

## 5. Postcode derivation

From a postcode string we derive three levels (UK postcode structure):

- **Area** = the leading letters of the outward code — `SW1A 1AA` → `SW`.
- **District** = the full outward code — `SW1A 1AA` → `SW1A`.
- **Sector** = outward code + space + first inward digit — `SW1A 1AA` → `SW1A 1`.

When only an outcode is supplied (e.g. `BS1`), area and district resolve but
sector is `null` (there is no inward part to read a digit from).

---

## 6. Outputs

### Exports (in `exports/`, gitignored)

- `platform-public-evidence.csv` — all normalised records, one row each, columns
  in the fixed `PLATFORM_RECORD_COLUMNS` order. Arrays are flattened with `; `;
  fields are RFC-4180 escaped (quoted when they contain commas, quotes or newlines).
- `platform-public-evidence-summary.json` — counts by platform and status, the
  Just Eat enabled flag and record count, imported-record count, and the layered
  method statuses.
- `platform-collection-failures.csv` — `platform, area, status, reason` for every
  captured failure (e.g. Just Eat disabled per area, rate limits, cap reached).

### Internal staging (in `data/runs/<runId>/`, gitignored — DO NOT COMMIT)

- `raw/platform/<platform>-<area>-<ts>.json` — raw payloads / audit notes.
- `staged/platform/normalised.json` — the full normalised record set for the run.

Both `exports/` and `data/` are already in `.gitignore`. This is run-local
working state and must never be committed.

---

## 7. Imported evidence CSV (method 4)

Supply `opts.importedEvidenceCsv` (raw CSV text) or `opts.importedEvidenceRecords`
(pre-parsed). The parser (`parseImportedEvidenceCsv`) reads a header row and maps
any of the `PlatformRecord` column names it recognises; unknown/blank columns
become `null`. The `platform` column is required and is normalised via aliases
(`ubereats` → `uber_eats`, `just eat` → `just_eat`, etc.); rows with an
unrecognised platform are skipped. Rows are marked `collector_method`
`imported_csv` and `collector_status` `imported`.

Minimum useful columns: `platform`, `business_name`, `postcode`,
`source_search_area` (or `outcode` / `area`), and optionally `rating`,
`review_count`, `evidence_url`.

---

## 8. What works vs what is evidence-only

- **Just Eat** — real live collection via the public endpoint (when
  `JUST_EAT_ENABLED=true`), with aggregate rating + count, cuisines, coordinates,
  delivery/collection flags and opening status.
- **Deliveroo & Uber Eats** — **evidence-only**. We emit a public search URL and a
  `manual_review_required` status. Real listings for these two platforms arrive
  only via the imported evidence CSV. This is deliberate and compliant.

---

## 9. Usage sketch

```ts
import { runPlatformDiscovery } from "@/lib/pipeline/platform-discovery-stage";

const result = await runPlatformDiscovery(runId, ["BS1", "BS2", "BS3"], {
  // optional: manually-collected Deliveroo/Uber evidence
  importedEvidenceCsv: csvText,
});

// result.records  → PlatformRecord[]
// result.failures → { platform, area, status, reason }[]
// result.summary  → counts + layered method statuses
```
