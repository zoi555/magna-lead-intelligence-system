# 69 — Uber Eats discovery-actor market research + bounded UB1 benchmark plan

Overnight autonomous research session, 2026-07-18. **No paid actor executed, no Apify actor API
invoked, no money spent.** This document shortlists current Apify marketplace actors for Uber Eats
restaurant discovery, classifies each against the product-owner's stated architecture preference
(one strong geography-discovery actor + an enrichment actor; URL enumeration as fallback only),
and defines — but does not run — a bounded (<$1) benchmark against an independently compiled UB1
reference set.

## Audit correction (2026-07-18, later same-day session)

A follow-up audit of the first pass of this document and its code found real defects before any
paid diagnostic was approved. **No overnight commit was reverted** — the dual-Vercel-project
topology work, the provider-neutral benchmark architecture, the precision-vs-recall registry
correction, the UB1 reference-set concept, and Borderline's classification as enrichment/
delivery-area-intelligence/supplementary-discovery are all retained. What changed:

1. **Recall geography bug (fixed):** the scorer matched the reference set against ALL raw returned
   outlets, not just geography-valid ones — an out-of-UB1 restaurant sharing a reference name could
   have earned recall credit it should not have. `benchmark-scoring.ts` now partitions through
   `partitionByGeography` FIRST and matches the reference set only against `part.valid`. A new test
   proves a same-name record outside UB1 earns zero credit (`test:ub1-benchmark`).
2. **Misleading count renamed:** `uniquePhysicalUB1RestaurantCount` → `uniqueValidUB1StorefrontCount`
   — a distinct `source_outlet_id` is a storefront, not a confirmed physical kitchen. A new
   `storefrontEntityBreakdown` reports known physical locations / known virtual storefronts / chain
   branches / unknown entity type separately, without ever merging distinct UUIDs.
3. **Name matching tightened:** the old containment/substring fallback (a false-positive risk for
   short or generic names) is replaced by a strict order — exact UUID → canonical URL/URL-UUID →
   conservative normalised EXACT name match → a bounded, EXPLICIT alias list. No more "contains" or
   "is contained in" matching.
4. **Reference-set status split:** the two-value `active_presumed`/`unconfirmed` status is replaced
   with `verified_active` / `active_presumed` / `unconfirmed` / `inactive` / `unknown`. Two new
   metrics: `verifiedActiveRecall` (denominator = `verified_active` only, unless a caller explicitly
   opts in to include `active_presumed`) and `candidateReferenceCoverage` (informational, full
   7-listing set, never used as hard pass/fail evidence). Ali Baba's Pizza and Tops Pizza Southall
   are now `verified_active` (a real successful paid run returned them); the other 5 remain
   `unconfirmed` — **the reference set is NOT claimed as 7 confirmed-current Uber restaurants.**
5. **Actor prioritisation corrected:** `piotrv1001/uber-eats-menu-scraper` is reclassified from
   "primary geographic discovery candidate" to a **fallback recall/completeness, sitemap-enumeration,
   and enrichment-where-useful candidate** — it must not be treated as the preferred architecture
   before credible direct-geography actors are tested. Four direct-geography candidates
   (`memo23/uber-eats-scraper`, `jdtpnjtp/uber-eats-restaurant-scraper`,
   `sovereigntaylor/ubereats-scraper`, `scrapier/uber-eats-scraper`) were researched from their live
   documentation; see the corrected classification and prioritisation below.
6. **Paid benchmark replaced:** the previous proposal included re-running the existing Borderline
   broad diagnostic — **not done.** Instead, the retained raw payload of that already-paid run
   (`MrKoKg8322ZVzk449`, $0.20, 40 results) was re-parsed with the real parser and re-scored through
   the corrected scorer entirely offline (`npm run uber:borderline:benchmark-replay`, no network, no
   Apify call). See "Offline baseline: the corrected scorer applied to the retained Borderline run"
   below for the real numbers this produced. The new paid-benchmark proposal covers direct-geography
   actors only, in priority order, gated on exact schema validation before any input is finalised.

## Why this research, and the standing evidence it builds on

Two actors have already been diagnosed with **real, paid, approved runs** in this project:

- `sourabhbgp/ubereats-scraper` — **discovery REJECTED**. First bounded UB1 run returned 10
  San Francisco/US records (wrong country); the corrected run (with the required `urls` field)
  fixed the country but returned central-London postcodes, not UB1 (wrong district). See
  ISS-0018, docs/64, `provider-registry.ts` (`uber_eats_sourabhbgp`).
- `borderline/uber-eats-scraper-ppr` — **candidate, precision confirmed, recall inadequate**. Two
  diagnostic runs (docs/68) show the actor reliably localises records it *does* return to the
  correct district (0 `unrelated_location` across 50 combined records), but only found **2 of 7**
  independently-verified UB1 reference restaurants across both runs. It behaves as a
  proximity-ranked delivery home feed, not a directory.

This is the calibration standard the rest of this research is held to: **do not accept an actor's
marketing/precision claims as a completeness claim.** A registry correction distinguishing
"district localisation precision" from "district recall/completeness" was made this session (see
`docs/10_BUGS_AND_FIXES.md` and `src/lib/discovery-engine/providers/provider-registry.ts`).

## Shortlist — current Apify marketplace Uber Eats actors

Populated from the 2026-07-18 market-research pass: live fetches of real Apify Store pages (not
memory/guessing). Every field below is either sourced from the fetched page or explicitly marked
**not verified**. Two actors (`sourabhbgp`, `borderline/…-ppr`) already have real paid-diagnostic
evidence from this project and are not re-derived from marketing pages.

### `sourabhbgp/ubereats-scraper` — internal evidence only
Discovery **REJECTED** by two real paid runs in this project: wrong-country default (San
Francisco for a UB1 request), then wrong-district (central London, not UB1) even once corrected.
Enrichment retained provisionally. See ISS-0018, docs/64, docs/67.

### `borderline/uber-eats-scraper-ppr` — internal evidence + confirmed live
**Pricing:** pay-per-result, **$5.00 / 1,000 restaurants** (confirmed live). **Usage:** 509 total
users, 60 monthly active, 99.8% success rate, **5.0/5 rating**. **Input:** `locale` (includes
`en-GB`), `address`, `addressCountry`, `query`, `storeType`, `maxRows`, `urls` (direct store
pages), `getMenuCustomizations`, `excludeStores` (UUID-based filtering — **pagination behaviour
not confirmed**, consistent with this project's own caution in docs/68). **Direct URL support:**
yes. Two real internal paid diagnostics: precision confirmed (0 `unrelated_location` across 50
combined records), recall inadequate (2/7 known UB1 reference restaurants across both runs) — a
proximity-ranked home feed, not a directory. Source: <https://apify.com/borderline/uber-eats-scraper-ppr>.

### `easyapi/uber-eats-store-search-scraper`
**Pricing:** pay-per-event, "from $2.99 / 1,000 results" (+ a separate $19.99/mo API-access tier,
6-hour free trial). **Usage:** 51 total users, 1 monthly active, no ratings. **Input:** requires
`searchUrls` — pre-formed Uber Eats search-result URLs obtained by manually searching the Uber Eats
website; `maxItems` (default 100); **no address/lat-lng/postcode input field exists**. **Output:**
store ID, name, URL, operating status, rating (score + review count), coordinates, images,
orderability flags. **Missing:** phone, menu, opening hours, chain/virtual-brand indicators not
advertised. **UK/GB:** not mentioned either way — **not verified**. **Limitation:** needing a
pre-built search-result URL (not a programmatic geography input) rules this out as an unattended
discovery step. Source: <https://apify.com/easyapi/uber-eats-store-search-scraper>.

### `yasmany.casanova/uber-eats-restaurant-scraper`
**Pricing:** pay-per-event, "from $19.90 / 1,000 results" — the most expensive PPR option found.
**Usage:** 13 total users, 0 monthly active, 90.6% success rate, no ratings, last modified "4
months ago" (undated). **Input:** `latitude`/`longitude` (defaults to Miami), `mode`
(store_info/menu/stores/categories), `query`, `store_url`, `store_id`, `max_results` (1–5,000),
`proxyCountry` (default `US`). **Output:** store_id, name, rating, review_count, ETA,
delivery_fee, coordinates, URL; menu items with price/discount/availability; address, hours,
phone. **Direct URL support:** yes, via `store_url`. **Stated limitation, in the actor's own
docs: "configured specifically for the US market."** No UK/GB support claimed — excluded from
primary UB1 discovery on the actor's own documented scope, not assumption.
Source: <https://apify.com/yasmany.casanova/uber-eats-restaurant-scraper>.

### `piotrv1001/uber-eats-menu-scraper`
**Pricing:** pay-per-event, "$3.00 / 1,000 stores". **Usage:** 2 total users, 0 monthly active,
100% success (very small sample), no ratings. **Input — three distinct mechanisms:** (a)
`storeUrls` — direct store URLs; (b) `sitemapShards` (indices 0–25, ~50k URLs/shard across all
markets) — a genuine **enumeration** mechanism, not a ranked feed; (c) `categorySeeds` — city +
category pairs (e.g. `{"city":"new-york-city","category":"pizza"}`), real geographic+keyword
discovery; plus `countryFilter` (two-letter code) and `maxStores` (0 = unlimited). **Output:**
name, cuisines, price range, full structured address (street/city/region/postal code/country),
lat/lng, phone, rating, review count, delivery methods, structured opening hours, full menu with
item-level UUIDs/prices. **UK/GB:** "25+ Uber Eats markets," country-prefixed URLs for non-US
markets — plausible but **not explicitly confirmed** in the fetched docs. **Notable:** the
`sitemapShards` mechanism is exactly the "sitemap/store-URL enumeration" approach docs/68 already
identified as "the route to true completeness" — worth testing for that reason specifically,
despite thin usage history. Source: <https://apify.com/piotrv1001/uber-eats-menu-scraper>.

### `memo23/uber-eats-scraper`
**Pricing:** pay-per-event, "$2.50 / 1,000 results" — the cheapest verified option. **Usage:** 141
total users, 35 monthly active, 94.1% success rate, **5.0/5 rating**. **Input:** address/city text
or lat/lng, keyword/cuisine filtering, store-vertical selection, dining mode, `maxItems`,
`maxConcurrency`, `maxRequestRetries`, `includeItemCustomizations`, `reviewsSince`, `maxReviews`;
also accepts direct store URLs. **Output:** store ID/UUID/slug, structured address, phone, hours,
cuisines, currency, full nested menu (items/prices/images/customisation groups), rating, review
count, review samples (text/date/reviewer), ETA range, delivery fee text, dining modes, scrape-
quality metadata (image coverage %, timestamp). **UK/GB:** no stated restriction; docs explicitly
disclose "Uber Eats geolocates the search by the proxy's exit IP, not just coordinates" and
recommend a city-targetable proxy provider — an honestly-disclosed caveat directly relevant to UK
targeting. **Not verified:** whether a GB-geolocated proxy is selectable by the caller.
Source: <https://apify.com/memo23/uber-eats-scraper>.

### `jdtpnjtp/uber-eats-restaurant-scraper` — direct-geography candidate (audit addition)
**Pricing:** pay-per-event, three charged row types: **$0.0015/restaurant listing**, **$0.005/
restaurant detail+menu** (≈$5/1k), **$0.0004/review**; also quoted as "$6.00/1,000 restaurant
details" for the detail tier. **Which event type a plain discovery call actually charges is NOT
fully confirmed** from the fetched page — the docs list three distinct row types
(`restaurant_result`, `restaurant_detail`, `review`) with different prices but don't spell out which
one a bare listing search produces; this must be confirmed pre-flight, not assumed. **Usage:** 2
total users, 1 monthly active, 100% success (tiny sample), no ratings. **Input:** `city` (required
for search — described as "adaptive: a slug like `new-york`, a city URL, or a human name"),
`address` (optional delivery address string), `searchQuery`, `storeUrls` (direct URLs/slugs/names),
`maxResults` (1–100), **`listAll`** (boolean — "pull every restaurant in the city without a search
query"), `sort`, `priceRange`, `includeReviews`, `maxReviewsPerRestaurant`. **Output:** name, slug,
Uber store UUID, address, lat/lng, phone, rating, review_count, price_range, categories, full menu
(`data.menu`, 60–131 items/store typical), `menu_item_count`, delivery_time_min/max, is_open,
opening hours, reviews (author/rating/text/date) when enabled, `row_type` indicator. **UK/GB:** not
explicitly stated; only US city examples (New York, Chicago) shown. **Geographic grain:** `city`,
not postcode/district/lat-lng-radius — same limitation class as `piotrv1001`'s `categorySeeds`: too
coarse for UB1 precision on its own, and it is **not verified** whether "London" as a city value
would let a bounded `address`/`searchQuery` narrow results to Southall/UB1 specifically. **Do not
assume `listAll` guarantees completeness** — the claim is the actor's own marketing language
("pull every restaurant"), not an independently verified behaviour; treat it exactly like `maxRows:
0` claims elsewhere — a claim to test, not a fact. Source:
<https://apify.com/jdtpnjtp/uber-eats-restaurant-scraper>.

### `sovereigntaylor/ubereats-scraper` — direct-geography candidate, SCHEMA UNVERIFIED (audit addition)
Listed in the original decision pack (docs/62) as a candidate Uber Eats actor. **This session's
direct page fetch (`https://apify.com/sovereigntaylor/ubereats-scraper` and the `/api` variant) and
a direct Apify API lookup both returned HTTP 404** — no live input schema could be retrieved this
session. A general WebSearch surfaced only marketing-style summary text (full menus, ratings,
delivery fees, "search any city or address", export to JSON/CSV/Excel, MIT-licensed, author
"Sovereign AI") with **no verifiable field names, pricing figures, or usage stats** — none of that
is reported here as fact. **Status: schema-validation pending.** Do not propose an exact input for
this actor, and do not carry forward any marketing claim as if it were a confirmed schema field,
until its documentation is actually fetchable (e.g. via an authenticated Apify Console session) in
a future check.

### `scrapier/uber-eats-scraper` — direct-geography candidate, HIGH RISK: near-identical schema to
### the already-REJECTED `sourabhbgp/ubereats-scraper` (audit addition)
**Pricing:** pay-per-event, "billed per store, not per minute" (no failed-store charge stated).
**Usage:** 2 total users, 1 monthly active, 100% success (tiny sample), no ratings. **Input:**
`address` (delivery address string, e.g. "Address, City, Zip Code"), `locale` (55+ options incl.
`en-GB`), `query`, `storeType` (RESTAURANTS/GROCERY/CONVENIENCE/PHARMACY/RETAIL), **`maxRows`
("Maximum number of restaurants/stores to scrape in search mode (0 = all)")**, `urls` (direct store
page URLs), `getMenuCustomizations`, `proxyConfiguration`, `concurrency`, `maxRetries`. **Output:**
`uuid`, `title`, `sanitizedTitle`, `url`, `merchantType`, `location{address,city,country,latitude,
longitude}`, `distance`, `phoneNumber`, `emails`, `menu{catalogName,catalogItems}`, `currencyCode`,
`rating{ratingValue,reviewCount}`, `storeReviews`, `featuredReviews`, `hours`, `isOpen`,
`storeAvailablityStatus`, `etaRange`, `supportedDiningModes`, `cuisineList`, `categories`,
`categoriesLink`, `logoImageUrl`, `heroImageUrl`. **UK/GB:** claims "anywhere Uber Eats operates,"
55+ locales. **CRITICAL FINDING — this schema is essentially field-for-field identical to
`sourabhbgp/ubereats-scraper`'s** (same `address`/`urls`/`storeType`/`maxRows: "0 = all"`/
`getMenuCustomizations` input shape; same `uuid`/`title`/`location{}`/`cuisineList`/`rating{}`
output shape) — the actor already rejected for discovery in this project (ISS-0018: defaulted to
San Francisco when `urls` was omitted, then returned central London instead of UB1 even once
corrected). **This strongly suggests a shared underlying template**, and therefore a real risk of
repeating the exact same failure mode. **Do not treat `maxRows: 0` ("0 = all") as a completeness
guarantee** — it is an unverified marketing claim about an unverified underlying mechanism, exactly
like `listAll`/`categorySeeds` elsewhere in this document. If tested at all, this actor must be
tested with the ISS-0018 lessons applied from the first input (explicit `urls`, explicit UK
address, verify the returned country/district BEFORE trusting any other field) — not assumed safe
because the schema looks similar to a working actor. Source:
<https://apify.com/scrapier/uber-eats-scraper>.

### Other actors checked and ruled out as ENRICHMENT-ONLY (audit addition — no geography input at all)
- **`moving_beacon-owner1/uber-eats-store-scraper`** — pay-per-event ("from $10.00/1,000 results"),
  input is `storeUrls`/store UUIDs only, no location/postcode/lat-lng/keyword field of any kind.
  Enrichment-only. Source: <https://apify.com/moving_beacon-owner1/uber-eats-store-scraper>.
- **`natanielsantos/uber-eats-scraper`** — **RENTAL** ("$30.00/month + usage" — refused outright by
  this project's `assertPayPerResult` guard regardless of capability), input is `restaurantUrls`
  only, no geography input. Enrichment-only even if pricing were acceptable. Source:
  <https://apify.com/natanielsantos/uber-eats-scraper>.

### `codingfrontend/uber-eats-store-search-scraper`
**Pricing:** pay-per-event, "from $4.99 / 1,000 results" + platform usage. **Usage:** 2 total
users, 1 monthly active, 100% success (tiny sample), no ratings. **Input:** `locationAddress`,
`latitude`, `longitude`, `query`, `maxItems` (1–200, default 20). **Output:** not detailed beyond
"restaurant/store information" in the fetched page. **UK/GB:** not mentioned; docs emphasise
"Residential US proxies recommended." **Assessment:** documentation too thin to trust for
production without its own bounded diagnostic. Source: <https://apify.com/codingfrontend/uber-eats-store-search-scraper>.

### `borderline/ubereats-scraper` [RENTAL variant — noted only, not fetched]
A **rental** ($35/mo + usage) sibling of the PPR actor above, same publisher. This project's
registry guard (`assertPayPerResult`) already refuses RENTAL actors for diagnostics, and the PPR
sibling has real paid evidence — no reason to switch pricing model.

### Other alternatives noted, not deep-dived
General search surfaced managed/dedicated providers (Bright Data, Food Data Scrape, DoubleData,
Oxylabs, Actowiz) already covered at decision-pack level in docs/62 — none looked clearly superior
to the Apify pay-per-result route for a bounded pilot, so not re-evaluated here.

## Actor classification

**Corrected 2026-07-18 (audit).** `piotrv1001` is downgraded from "primary" to "fallback"; four new
direct-geography candidates added and prioritised for schema validation.

| Actor | Classification | Basis |
| --- | --- | --- |
| `sourabhbgp/ubereats-scraper` | **Unsuitable** (for discovery) | Discovery REJECTED — wrong country, then wrong district (ISS-0018). Enrichment retained provisionally only when an exact store URL is already known. |
| `borderline/uber-eats-scraper-ppr` | **Supplementary discovery candidate** / enrichment / delivery-area intelligence / verification candidate | Precision confirmed, recall inadequate (2/7 known UB1 restaurants across 2 runs — docs/68; 0/7 on the broad run alone, reconfirmed by the offline audit re-score below). Must not be classified as a complete district-discovery provider on current evidence. Remains a strong option for enrichment, delivery-area intelligence, supplementary discovery (alongside a stronger primary), and verification of records found elsewhere. |
| `memo23/uber-eats-scraper` | **Primary direct-geography discovery candidate — #1 for schema validation** | Address/city + lat-lng + keyword discovery, cheapest verified PPR price ($2.50/1k), best-evidenced usage/rating (141 users, 5.0/5, 94.1% success). Honest proxy-geolocation caveat disclosed. Not yet diagnosed with a real paid run in this project — recall/precision on UB1 specifically is **unvalidated**, hence "candidate" not "supported." |
| `jdtpnjtp/uber-eats-restaurant-scraper` | **Direct-geography discovery candidate — #2 for schema validation** | Genuine restaurant/store-level search input (`city`, `searchQuery`, `listAll`) with rich output incl. full menus; but geography grain is `city`, not district/postcode/lat-lng-radius, and UK support is unstated. Charged event type for a plain discovery call is unconfirmed (three priced row types). Requires schema/pricing confirmation before any real input is finalised. |
| `sovereigntaylor/ubereats-scraper` | **Direct-geography discovery candidate — #3 for schema validation, SCHEMA UNVERIFIED** | Documentation could not be fetched this session (404 on page + API). Only unverifiable marketing text available. Must not be scheduled ahead of actors whose schema IS confirmed; kept in the priority list per instruction but flagged as blocked on documentation access. |
| `scrapier/uber-eats-scraper` | **Direct-geography discovery candidate — #4 for schema validation, HIGH RISK** | Schema is near-identical to the already-REJECTED `sourabhbgp/ubereats-scraper` (same input/output shape) — real risk of repeating the exact ISS-0018 failure (wrong-country default, then wrong-district). If tested, must apply the ISS-0018 lessons from the first input, not be assumed safe. |
| `piotrv1001/uber-eats-menu-scraper` | **Fallback recall/completeness candidate · sitemap-enumeration candidate · enrichment candidate where useful** (downgraded from "primary" — audit correction) | The `sitemapShards` mechanism is the closest thing on the market to true district enumeration and remains worth testing, but it must NOT be treated as the preferred primary architecture ahead of direct-geography actors per product-owner direction. Execute only as a separate fallback benchmark if the direct-geography candidates above fail on recall. Thin usage history (2 users) unchanged. |
| `yasmany.casanova/uber-eats-restaurant-scraper` | **Unsuitable** (for UK discovery) | Actor's own documentation states "configured specifically for the US market"; no UK/GB support claimed. Not recommended even for enrichment without independent GB verification. |
| `easyapi/uber-eats-store-search-scraper` | **Enrichment/verification candidate** | Requires a pre-built Uber Eats search-result URL, not a geography input — cannot run as an unattended discovery step; useful only to verify/enrich once a search URL is already known. |
| `codingfrontend/uber-eats-store-search-scraper` | **Verification candidate** (insufficient evidence) | Address/lat-lng input exists in principle, but documentation is too thin (2 users, no output-field detail, no UK mention) to trust without its own bounded diagnostic. |
| `moving_beacon-owner1/uber-eats-store-scraper` | **Enrichment-only** | `storeUrls`/UUID input only — no geography field of any kind. |
| `natanielsantos/uber-eats-scraper` [RENTAL] | **Unsuitable** (pricing model + enrichment-only anyway) | RENTAL pricing refused by `assertPayPerResult`; also `restaurantUrls`-only input regardless. |
| `borderline/ubereats-scraper` [RENTAL] | **Unsuitable** (pricing model) | RENTAL pricing is refused by this project's `assertPayPerResult` guard; the PPR sibling above already has real paid evidence at a usage-based price. |

## UB1 benchmark design

### Reference set

An independently compiled 7-restaurant reference set (expandable) lives in code, not just this
doc, so scoring is reproducible and testable without network access:
`src/lib/discovery-engine/providers/benchmark/ub1-reference-set.ts`
(`UB1_BENCHMARK_REFERENCE_SET`). Required entries, per instruction: Ali Baba's Pizza, Tops Pizza
Southall, Watan Southall, Spice Village Southall, Pizzeria Hut, Kebabish Original Southall, Pizza
Planet.

For each entry the module records (where verifiable): business name, physical postcode, Uber URL,
Uber UUID (the store-identifier path segment), status, verification date, verification method,
physical/virtual-brand/chain classification, and category. **Verification honesty, explicitly**
(status vocabulary corrected 2026-07-18 — see "Audit correction" above):

- Ali Baba's Pizza and Tops Pizza Southall are now `verified_active` (**upgraded from
  `active_presumed`** in the audit correction) — a real paid diagnostic run (`jg2xJwXcMgvmggYnT`,
  docs/68) actually returned them as business-geography-valid, live/orderable UB1 records. This is
  the strongest evidence tier this project can produce without a fresh live check. Their Uber
  URL/UUID were not separately recorded in committed docs (only in the run's uncommitted raw
  payload), so those fields are `null` here rather than guessed.
- The other five remain `unconfirmed` (not `active_presumed`, not `verified_active`). Their Uber
  Eats store URLs and UUID path segments were found via a search index this session, but a direct
  fetch of one of those URLs returned an Uber Eats anti-bot/reCAPTCHA interstitial, so **no live
  "currently active" status was independently confirmed for any of the five**. Per instruction, an
  indexed/historic Uber page is never treated as automatically active. Postcodes are recorded only
  where a full unit was found in a citable source (Companies House, FSA ratings register, the
  restaurant's own site, or a general directory listing); two entries (Pizzeria Hut, Pizza Planet)
  have `postcode: null` because no full postcode unit appeared in any source checked this session —
  not guessed.
- **None are marked `inactive`** (no positive closure evidence exists for any of them) and none are
  `unknown` (all 7 have at least directional evidence). **The reference set is NOT 7
  confirmed-current Uber restaurants — it is 2 verified-active plus 5 unconfirmed-by-design.** Any
  benchmark score must report `verifiedActiveRecall` (against the 2) and
  `candidateReferenceCoverage` (against all 7, informational) as two separate numbers — never a
  single blended "X/7" pass/fail claim.

Expanding the reference set beyond these 7 requires the same standard: an independently verified
current Uber listing, not an assumption from a directory page.

### Scoring model

Provider-neutral, pure, no network — `src/lib/discovery-engine/providers/benchmark/benchmark-scoring.ts`
(`scoreUB1Benchmark`), tested with a synthetic (clearly-labelled, non-real) fixture in
`npm run test:ub1-benchmark`. It computes, per candidate run:

- **`verifiedActiveRecall`** — matched vs total, computed **only against `verified_active`**
  reference listings by default (a caller may explicitly opt in to also count `active_presumed`,
  but none currently exist). This is the metric to treat as pass/fail-grade evidence.
- **`candidateReferenceCoverage`** — matched vs total across the **full** 7-listing reference set
  regardless of status tier. Informational context only — must NOT be used as hard pass/fail
  evidence on its own, since most entries are `unconfirmed`.
- **AUDIT-CORRECTED matching scope:** both recall metrics are computed by matching the reference
  set **only against geography-valid records** (`partitionByGeography`'s `part.valid`) — never the
  raw outlet list. Match order is exact UUID → canonical URL/URL-UUID → conservative normalised
  EXACT name match → a bounded, explicit alias list. **No containment/substring matching, and no
  matching of short/generic names.** `npm run test:ub1-benchmark` proves a same-name record outside
  UB1 earns zero recall credit.
- **`uniqueValidUB1StorefrontCount`** (renamed from the misleading `uniquePhysicalUB1RestaurantCount`)
  — distinct `source_outlet_id` values among business-geography-valid records. A distinct UUID is a
  **storefront**, not a confirmed physical kitchen; deduplicated separately from the raw valid-record
  count so a repeated/duplicate observation is never counted as a second storefront.
- **`storefrontEntityBreakdown`** — reports `knownPhysicalLocations` / `knownVirtualStorefronts` /
  `chainBranches` / `unknownEntityType` as TAGS on the same distinct-storefront set, using (a) a
  matched reference listing's known `entity_type`, or (b) an evidence-based heuristic — storefronts
  sharing an identical non-null address+phone with at least one other distinct storefront are
  flagged as a shared-kitchen/virtual-brand cluster (the same signal behind the real docs/68 finding
  — Loaded Burgers/Wings 100/Tasty Tenders at one UB1 address). **This never merges counts** — every
  distinct UUID is still counted individually; the breakdown is an additional tag, not a collapse.
- **`physicalUB1Precision`** — the existing geography-validation gate reused unmodified
  (`partitionByGeography`), so precision scoring is consistent with the production pipeline's own
  in-scope/out-of-scope logic, not a parallel reimplementation. Raw totals, out-of-scope counts and
  unverifiable counts are kept as separate fields (`geography.valid/outOfScope/unverifiable/total`),
  never folded into the recall numbers.
- **Outside-area result count** and **unverifiable-geography count** — from the same gate, plus the
  existing location-fidelity module (`near_target` vs `unrelated_location`) for the finer-grained
  evaluation-only signal.
- **Duplicate rate** — distinct IDs vs total raw records returned.
- **Field completeness** — a genuine per-field percentage (postcode, coordinates, phone, rating,
  review count, cuisines, delivery flags, ETA, halal flag), not a boolean pass/fail.
- **`costPerUniqueValidStorefront`** — actual run cost ÷ the deduplicated unique valid-storefront
  count; `null` (never fabricated) when no real cost is supplied.

Not yet scored by this pass (left as future work, not silently assumed adequate): **UUID
stability** and **repeatability** require at least two runs of the *same* actor+input to compare,
and **provider/ease-of-integration stability** is a qualitative judgement, not a number this module
computes. Both should be filled in from the actual diagnostic runs once/if they are approved and
executed — this module does not invent them from a single run.

### Offline baseline: the corrected scorer applied to the retained Borderline broad run

**No new paid run.** The raw payload of the already-approved, already-paid broad diagnostic
(`borderline/uber-eats-scraper-ppr`, actor run `MrKoKg8322ZVzk449`, $0.20, 40 results, docs/68) was
retained locally from that session's scratchpad. It was re-parsed with the real parser
(`parseBorderlineSearch`) and re-scored through the corrected `scoreUB1Benchmark` this session via
`npm run uber:borderline:benchmark-replay` — genuinely offline, no network call, no Apify call:

```
totalRecords=40 distinctRecords=40 duplicates=0 (0.0%)
geography: valid=10 outOfScope=28 unverifiable=2 total=40
physicalUB1Precision: 10/40 = 25%
uniqueValidUB1StorefrontCount=10
storefrontEntityBreakdown: knownPhysicalLocations=0 knownVirtualStorefronts=3 chainBranches=0 unknownEntityType=7
verifiedActiveRecall (verified_active only): 0/2 = 0%
candidateReferenceCoverage (full 7-listing set): 0/7 = 0%
costPerUniqueValidStorefront=$0.02 ($0.20 ÷ 10 storefronts)
fieldCompleteness: postcode=95% latitude=100% phone=100% rating=95% review_count=20% cuisines=100%
  is_delivery=100% delivery_cost=0% eta_minutes=100% halal_flag=65%
```

This **exactly reproduces** docs/68's manually-computed finding for the broad run alone (10 UB1
records, 0/7 known reference restaurants) — a useful cross-check that the corrected scorer is
accurate, not just differently wrong. The `knownVirtualStorefronts=3` tag independently recovers
the same shared-kitchen cluster docs/68 identified by hand (Loaded Burgers/Wings 100/Tasty Tenders
at one UB1 address), via the address+phone heuristic, without merging their counts.
**`verifiedActiveRecall` is 0/2 for the broad run specifically** — Ali Baba's Pizza and Tops Pizza
Southall were found only in the earlier narrow pizza-query run (`jg2xJwXcMgvmggYnT`), not this one;
across BOTH borderline runs combined the project's known evidence remains 2/7 (unchanged from
docs/68). This offline baseline is the reference point the next paid benchmark's direct-geography
candidates should be compared against — not a fresh assumption.

### Replaced paid-benchmark proposal — schema-validation-first, direct-geography actors only

The previous proposal's inclusion of a fresh Borderline re-run is **withdrawn** — superseded by the
offline baseline above. The new proposal targets **direct-geography discovery actors only**, per
the product-owner's stated architecture preference (one strong discovery actor + enrichment;
`piotrv1001`'s sitemap-enumeration route stays a fallback, executed only if these fail on recall).

**Priority order for schema validation (no paid runs yet — validate first, then select):**
1. `memo23/uber-eats-scraper`
2. `jdtpnjtp/uber-eats-restaurant-scraper`
3. `sovereigntaylor/ubereats-scraper`
4. `scrapier/uber-eats-scraper`

The strongest two or three are selected for an actual paid diagnostic **only after** exact schema
validation (below) confirms their real input field names, geography mode, and cost mechanics — not
before. **No invented city slugs or address strings appear below** — anything not confirmed by the
actor's own published schema is explicitly marked unverified, with no illustrative placeholder
value invented in its place (the prior draft's `"southall-uk"` categorySeeds slug was exactly this
mistake, and is not repeated here).

| | #1 `memo23/uber-eats-scraper` | #2 `jdtpnjtp/uber-eats-restaurant-scraper` | #3 `sovereigntaylor/ubereats-scraper` | #4 `scrapier/uber-eats-scraper` |
| --- | --- | --- | --- | --- |
| Confirmed input fields | address/city text OR lat/lng, keyword/cuisine filter, `maxItems`, `maxConcurrency`, `maxRequestRetries`, direct store URLs | `city` (required), `address` (optional), `searchQuery`, `storeUrls`, `maxResults`, `listAll`, `sort`, `priceRange` | **none — schema not fetchable this session (404)** | `address`, `locale`, `query`, `storeType`, `maxRows` ("0 = all"), `urls`, `getMenuCustomizations`, `proxyConfiguration` |
| Geography mode | address/city text or lat/lng — can supply the exact UB1 address string, closest to the working Borderline pattern | `city` slug/URL/name (coarse — London-level, not confirmed to resolve to UB1/Southall specifically) | unverified | `address` string, same shape as the already-rejected `sourabhbgp` |
| UK proxy required? | **Unverified** — actor's own docs disclose Uber Eats geolocates by proxy exit IP, not address alone; whether a GB proxy is selectable is not confirmed | Unverified — no proxy/locale field surfaced in the fetched docs | unverified | `proxyConfiguration` field exists; whether a GB proxy is selectable is not confirmed |
| Proxy cost included in advertised price? | **Unverified** | Unverified | unverified | Unverified |
| Restaurant/result cap | `maxItems` | `maxResults` (1–100) or `listAll` (claim only — completeness NOT verified) | unverified | `maxRows` (`0` claimed "= all" — claim only, NOT verified as a completeness guarantee) |
| Charged output event type | per result (`$2.50/1,000`) | **unconfirmed which of 3 priced row types** (`restaurant_result` $0.0015, `restaurant_detail` $0.005, `review` $0.0004) a plain discovery call produces | unverified | per store ("billed per store, not per minute") — exact rate not separately quoted beyond "pay per usage" |
| Expected cost (40 results, discovery-only) | ~$0.10 (40 × $2.50/1,000) | ~$0.06 if `restaurant_result`-priced (40 × $0.0015); **could be materially higher if it defaults to the detail-priced event — must be confirmed before running** | cannot estimate — no confirmed price | not separately quoted; assume worst-case parity with `sourabhbgp` (~$3/1,000 ⇒ ~$0.12) until confirmed |
| Hard maximum cost (proposed) | $0.25 | $0.25 (defer running until the event-type ambiguity is resolved — do not run under an unbounded-price assumption) | not proposable until schema exists | $0.25 |
| Stop conditions | Halt on FAILED/ABORTED/TIMED-OUT (existing orchestrator behaviour); halt before further paid source on `provider_succeeded_validation_failed` (existing gate) | same, PLUS do not run until the charged-event-type ambiguity is resolved | N/A — not runnable | same, PLUS treat any non-GB or non-UB1 result as an immediate signal to stop and re-diagnose (ISS-0018 pattern), not retry |
| Duplicate-paid-run protection | `findInFlight(actorId, inputFingerprint)` (existing, docs/66) | same | N/A | same |
| Approval gate | Product-owner sign-off on this exact input + a dry pre-flight schema check (Apify Console) confirming field names before spend | same, PLUS confirmation of which event type a discovery call charges | blocked until schema is fetchable | same, PLUS explicit acknowledgement of the ISS-0018-repeat risk before approval |

**Total proposed ceiling if all three runnable candidates (#1, #2, #4) are approved:** 3 × $0.25 =
**$0.75 hard-capped maximum**, comfortably under the $1 instruction ceiling; **expected cost
~$0.10–$0.28** depending on which charged event type `jdtpnjtp` actually uses. `#3
sovereigntaylor` is excluded from any cost total until its schema is confirmed — it cannot be
proposed, only queued for a future documentation check.

**Fallback benchmark (separate, executed only if the above fail on recall):**
`piotrv1001/uber-eats-menu-scraper`'s `categorySeeds` (city+category) or `sitemapShards`
(enumeration) mode. No exact input is proposed here — city-slug format for `categorySeeds` is
**not confirmed** for a UB1-precise value, and `sitemapShards`' cost behaviour under a `maxStores`
cap is **not confirmed** either (does the actor stop charging once the cap is reached, or does
enumerating a shard itself carry cost regardless?). Both must be confirmed from the actor's own
schema/support channel — not guessed — before any input is proposed, exactly as this project
declined to invent a `categorySeeds` city slug in the withdrawn prior draft.

**Explicitly not done in producing this revised proposal:** no actor was run, no Apify run-API call
was made, no `APIFY_TOKEN` usage occurred beyond what already exists. `#3 sovereigntaylor` remains
entirely unproposed pending documentation access. `#2 jdtpnjtp`'s cost is a range, not a point
estimate, until the charged-event-type ambiguity is resolved by a pre-flight check (not a paid
trial). `#4 scrapier`'s structural similarity to the rejected `sourabhbgp` is flagged as a real risk
to be tested with the ISS-0018 lessons applied, not glossed over because a schema exists.

## What this session did NOT do

- Did not execute any paid Apify actor or invoke an actor-run API.
- Did not purchase an Apify plan or add/verify `APIFY_TOKEN` usage beyond what already exists.
- Did not build a custom Uber Eats scraping actor.
- Did not perform customer comparison.
- Did not start Deliveroo work.
- Did not change the existing consolidation/dedup logic — the benchmark scorer reuses the
  production geography gate and location-fidelity modules unmodified; it does not fork their logic.
