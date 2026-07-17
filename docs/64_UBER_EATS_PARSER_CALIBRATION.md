# 64 — Uber Eats parser calibration (real Apify output)

Calibration of the Uber Eats parser against the **real** output of the authorised Apify actor
`sourabhbgp/ubereats-scraper` (`discover` mode), captured on the approved 10-result UB1 pilot.
Parser version: **`uber-eats-parse-1.1.0`**. No customer comparison. No plan upgrade. No uncapped run.

## 1. Two findings from the first pilot

### Finding A — the parser mapped the wrong field paths (now fixed)
The old parser read `raw.location.*`, `raw.categories`, `raw.rating.score` and treated images as
strings. The real actor nests under **`raw.address.*`**, supplies **`cuisineList`**, a numeric
**`rating`** + **`ratingCount`**, a **`phoneNumber`** string, and images as **`{ url }`** objects.
That mismatch — not missing data — is why postcode/coords/rating read as 0. Recalibrated mapping below.

### Finding B — `discover` for `"UB1, United Kingdom"` returned **US (San Francisco) stores**
Every record in the first run had `address.country: "US"`, region `CA`, and US ZIPs (e.g. `94103`),
scraped via `scrapedFrom: "ld_json_fallback"` (a sparse path: no rating, delivery fee, hours or menu).
**The actor did not geolocate the UK postcode district** and fell back to a default US location.

Consequence: that run does **not** represent UK UB1 coverage. The pilot script now prints a country
distribution + a `⚠ WARNING` when 0 valid UK postcodes are returned, so a wrong-geography run can
never be mistaken for UK data. The US ZIPs are **not** coerced into the UK postcode field (kept in
`source_extra.source_postcode`); US phone numbers are **not** treated as UK phone keys (kept in
`source_extra.phone_number`). Nothing is fabricated.

> Open item for the product owner: the `discover` address input needs a UK-resolving form (e.g. a
> London lat/lng or a UK city/anchor the actor recognises), or a different input mode. Until that is
> confirmed, UB1-by-name via this actor returns non-UK data. **Not** changing actor (per instruction).

## 2. Real actor field → SourceOutlet mapping (`uber-eats-parse-1.1.0`)

| Actor field | Maps to | Notes |
| --- | --- | --- |
| `uuid` | `source_outlet_id` | identity |
| `title` | `name` | HTML entities decoded (`&amp;` → `&`) |
| `url` | `source_url` | |
| `address.postalCode` | `postcode` | **UK only** (classifyPostcode `level !== invalid`); US ZIP → null, raw kept in `source_extra.source_postcode` |
| `address.raw` / city/region/country | `address` (composed) | locality/region/country/neighborhood retained in `source_extra` |
| `address.lat` / `address.lng` | `latitude` / `longitude` | null when absent (never fabricated) |
| `phoneNumber` | `phone` | **valid UK only**; raw kept in `source_extra.phone_number` |
| `rating` | `rating` | numeric |
| `ratingCount` | `review_count` | `ratingCountText` retained in `source_extra` |
| `cuisineList` | `cuisines` | raw kept in `source_extra.cuisine_source` |
| `supportedDiningModes` | `is_delivery` / `is_collection` | empty list → **null** (unknown, not false) |
| `deliveryFee` | `delivery_cost` | minor units ÷100; **units unverified on live discover (all null)** — confirm on first non-null run; raw kept in `source_extra.delivery_fee_raw` |
| `serviceFee` | `source_extra.service_fee` | |
| `etaMinMinutes` | `eta_minutes` | `etaMaxMinutes` / `etaText` retained in `source_extra` |
| `workingHoursTagline` / `hours` | `source_extra.working_hours_tagline` / `.hours` | |
| `menu` / `menuItemCount` / `menuSectionCount` | `source_extra.menu*` | |
| `heroImage.url` / `logoImage.url` | `logo_url` | both retained in `source_extra` |
| `parentChain` | `brand` (from `.name`) | full object retained in `source_extra.parent_chain` |
| `promotion` | `source_extra.promotion` | **not** conflated with `is_sponsored` |
| `reviews` | `source_extra.reviews` + `reviews_available` | shape retained even when `includeReviews=false` |
| `isOpen`/`isOrderable`/`closedMessage`/`fareBadge`/`analytics`/`cityId`/`citySlug`/`currencyCode`/`scrapedAt`/`scrapedFrom` | `source_extra.*` | controlled retention |

**Unknown-field retention:** every unmapped field is kept in `source_extra` (controlled JSONB), and
the **full raw record** is also stored immutably on the observation (`je_raw_observations.raw_payload`).
No DB migration was required — `source_extra` is an in-memory model field; durable raw retention already
exists at the observation layer.

## 3. Coverage calculation fix
`reports/comparison.ts` now credits `menu` / `opening_hours` / `promotion` / `media` from **both**
first-class fields and the `source_extra` bag (previously hardcoded 0), and adds `delivery_fee` / `eta`
coverage. Postcode coverage uses the UK full-postcode regex, so US ZIPs correctly score 0.

## 4. Tests
- `npm run test:uber-parse` — new; asserts the mapping against a sanitised real-shape fixture
  (`tests/fixtures/uber-eats/discover-fallback.json`): US-fallback record (honest nulls, no fabrication)
  + UK-rich record (full correct mapping). 40 assertions.
- `npm run test:multi-source` — unchanged, still green (parser is backward-compatible with the old fixture).

## 5. Genuinely absent on live `discover` (this actor/mode)
rating, ratingCount, deliveryFee, serviceFee, eta*, hours, menu, supportedDiningModes, promotion,
logoImage — all null/empty via the `ld_json_fallback` path. These are actor/mode limitations, not
parser gaps (the UK-rich fixture proves they map when present).

## 6. Root cause of the wrong geography + supported-input diagnostic (2026-07-18)
The actor's `urls` field is **required** (default `["https://www.ubereats.com/near-me"]` → US). The
fetcher omitted it, so the actor ignored the GB `address` and returned San Francisco. Fix: the
fetcher/pilot now always send `urls` (documented field; no lat/lng invented). The next diagnostic
(prepared, **not run**) uses `urls:["pizza"]` + a full public UB1 address; verify dry with
`npm run uber:diagnostic-plan`. Wrong-geography results are now quarantined by the gate (docs/65).
