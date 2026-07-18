# 69 — Uber Eats discovery-actor market research + bounded UB1 benchmark plan

Overnight autonomous research session, 2026-07-18. **No paid actor executed, no Apify actor API
invoked, no money spent.** This document shortlists current Apify marketplace actors for Uber Eats
restaurant discovery, classifies each against the product-owner's stated architecture preference
(one strong geography-discovery actor + an enrichment actor; URL enumeration as fallback only),
and defines — but does not run — a bounded (<$1) three-way benchmark against an independently
compiled UB1 reference set.

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

| Actor | Classification | Basis |
| --- | --- | --- |
| `sourabhbgp/ubereats-scraper` | **Unsuitable** (for discovery) | Discovery REJECTED — wrong country, then wrong district (ISS-0018). Enrichment retained provisionally only when an exact store URL is already known. |
| `borderline/uber-eats-scraper-ppr` | **Supplementary discovery candidate** / enrichment / delivery-area intelligence / verification candidate | Precision confirmed, recall inadequate (2/7 known UB1 restaurants across 2 runs — docs/68). Must not be classified as a complete district-discovery provider on current evidence. Remains a strong option for enrichment, delivery-area intelligence, supplementary discovery (alongside a stronger primary), and verification of records found elsewhere. |
| `memo23/uber-eats-scraper` | **Primary geographic discovery candidate** | Address/city + lat-lng + keyword discovery, cheapest verified PPR price ($2.50/1k), best-evidenced usage/rating (141 users, 5.0/5, 94.1% success). Honest proxy-geolocation caveat disclosed. Not yet diagnosed with a real paid run in this project — recall/precision on UB1 specifically is **unvalidated**, hence "candidate" not "supported." |
| `piotrv1001/uber-eats-menu-scraper` | **Primary geographic discovery candidate** (recall-focused) | Only actor offering true sitemap-shard **enumeration** alongside city+category discovery — directly addresses the recall gap this project's own borderline-actor diagnostic exposed. Very thin usage history (2 users) — unproven at scale, hence a candidate requiring diagnostic evidence before any weight is placed on it. |
| `yasmany.casanova/uber-eats-restaurant-scraper` | **Unsuitable** (for UK discovery) | Actor's own documentation states "configured specifically for the US market"; no UK/GB support claimed. Not recommended even for enrichment without independent GB verification. |
| `easyapi/uber-eats-store-search-scraper` | **Enrichment/verification candidate** | Requires a pre-built Uber Eats search-result URL, not a geography input — cannot run as an unattended discovery step; useful only to verify/enrich once a search URL is already known. |
| `codingfrontend/uber-eats-store-search-scraper` | **Verification candidate** (insufficient evidence) | Address/lat-lng input exists in principle, but documentation is too thin (2 users, no output-field detail, no UK mention) to trust without its own bounded diagnostic. |
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
Uber UUID (the store-identifier path segment), active/inactive status, verification date,
verification method, physical/virtual-brand/chain classification, and category. **Verification
honesty, explicitly:**

- Ali Baba's Pizza and Tops Pizza Southall are `active_presumed` — confirmed by a real paid
  diagnostic run (`jg2xJwXcMgvmggYnT`, docs/68) that returned them as business-geography-valid UB1
  records. Their Uber URL/UUID were not separately recorded in committed docs (only in the run's
  uncommitted raw payload), so those fields are `null` here rather than guessed.
- The other five are `unconfirmed`. Their Uber Eats store URLs and UUID path segments were found
  via a search index this session, but a direct fetch of one of those URLs returned an Uber Eats
  anti-bot/reCAPTCHA interstitial, so **no live "currently active" status was independently
  confirmed for any of the five**. Per instruction, an indexed/historic Uber page is never treated
  as automatically active — `status: "unconfirmed"` reflects that honestly. Postcodes are recorded
  only where a full unit was found in a citable source (Companies House, FSA ratings register, the
  restaurant's own site, or a general directory listing); two entries (Pizzeria Hut, Pizza Planet)
  have `postcode: null` because no full postcode unit appeared in any source checked this session —
  not guessed.

Expanding the reference set beyond these 7 requires the same standard: an independently verified
current Uber listing, not an assumption from a directory page.

### Scoring model

Provider-neutral, pure, no network — `src/lib/discovery-engine/providers/benchmark/benchmark-scoring.ts`
(`scoreUB1Benchmark`), tested with a synthetic (clearly-labelled, non-real) fixture in
`npm run test:ub1-benchmark`. It computes, per candidate run:

- **Known-listing recall** — how many of the 7 reference listings were returned (matched by Uber
  UUID first, falling back to a conservative name match; unmatched listings are reported as
  genuinely not found, never guessed as a match).
- **Unique physical UB1 restaurant count** — distinct `source_outlet_id` values among
  business-geography-valid records. Explicitly **deduplicated separately from the raw valid-record
  count**, so a repeated/duplicate observation is never counted as a second restaurant.
- **Distinct storefront / virtual-brand count** — the same distinct-ID count at the raw level,
  before any geography filtering; virtual storefronts sharing a kitchen, address, or phone number
  are **never merged into one entity** by this module. Storefront-vs-kitchen consolidation (e.g.
  the confirmed shared-kitchen case in docs/68 — Loaded Burgers/Wings 100/Tasty Tenders at one UB1
  address) is a job for the existing consolidation layer (`confirmed_same`), not the benchmark
  scorer.
- **Physical UB1 precision** — the existing geography-validation gate reused unmodified
  (`partitionByGeography`), so precision scoring is consistent with the production pipeline's own
  in-scope/out-of-scope logic, not a parallel reimplementation.
- **Outside-area result count** and **unverifiable-geography count** — from the same gate, plus the
  existing location-fidelity module (`near_target` vs `unrelated_location`) for the finer-grained
  evaluation-only signal.
- **Duplicate rate** — distinct IDs vs total raw records returned.
- **Field completeness** — a genuine per-field percentage (postcode, coordinates, phone, rating,
  review count, cuisines, delivery flags, ETA, halal flag), not a boolean pass/fail.
- **Cost per unique valid restaurant** — actual run cost ÷ the deduplicated unique valid-restaurant
  count; `null` (never fabricated) when no real cost is supplied.

Not yet scored by this pass (left as future work, not silently assumed adequate): **UUID
stability** and **repeatability** require at least two runs of the *same* actor+input to compare,
and **provider/ease-of-integration stability** is a qualitative judgement, not a number this module
computes. Both should be filled in from the actual diagnostic runs once/if they are approved and
executed — this module does not invent them from a single run.

### The three candidates selected for benchmarking

1. **`borderline/uber-eats-scraper-ppr`** — the proven baseline (2 real paid diagnostics already
   run this project). Included so the other two are measured against a known reference point, not
   an assumption.
2. **`memo23/uber-eats-scraper`** — strongest all-round primary-discovery candidate from the
   market research above: cheapest verified PPR price ($2.50/1k), best usage/rating evidence (141
   users, 5.0/5, 94.1% success), genuine address+lat/lng+keyword discovery.
3. **`piotrv1001/uber-eats-menu-scraper`** — the only actor offering true sitemap-shard
   **enumeration** (not a ranked feed), which directly targets the recall gap the borderline actor
   exposed — worth testing despite thin usage history, precisely because it is architecturally
   different from a personalised feed.

`yasmany.casanova/uber-eats-restaurant-scraper` was excluded (actor's own docs: "configured
specifically for the US market"); `easyapi`/`codingfrontend` were excluded as enrichment-only or
too thinly documented to benchmark as primary discovery (see classification table above).

### Benchmark parameters (fixed across all three candidates, for a fair comparison)

| Parameter | Value |
| --- | --- |
| Geography | UB1 (Southall) |
| Central anchor | Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom (51.5074, -0.3778) — the same anchor already used in every prior Uber diagnostic this project has run |
| Restaurant type | RESTAURANTS (no cuisine/query filter — broad discovery, matching the finding in docs/68 that a narrow query under-counts) |
| Result cap | 40 results per candidate (matches the largest diagnostic already run and costed; see docs/68) |
| Cost ceiling | see per-candidate table below; **total across all three candidates kept under USD 1** |
| Reference set | `UB1_BENCHMARK_REFERENCE_SET` (7 listings, see above) |
| Output assessment | `scoreUB1Benchmark()` — identical scoring code run against every candidate's parsed output, so no candidate gets a bespoke scoring pass |
| Success criteria | A candidate is a **viable primary discovery actor** only if it demonstrates (a) ≥5/7 known-listing recall, or a clearly higher recall than the existing borderline-actor evidence (2/7) with a stated reason the gap is closing (e.g. multi-anchor coverage), AND (b) ≥80% physical UB1 precision on business-geography-valid records, AND (c) 0 `unrelated_location` results (no wrong-city/wrong-country contamination). Falling short of (a) but clearing (b)+(c) keeps a candidate as a **supplementary/enrichment/verification** candidate, matching how `borderline/uber-eats-scraper-ppr` is currently classified — it is not automatically "unsuitable" just for having partial recall. |

## Paid benchmark proposal — NOT EXECUTED

Prepared for product-owner approval only. No actor run, no Apify actor-run API call, no spend
occurred in producing this document. All three proposed runs reuse the existing Apify
provenance/orchestrator seam (`apify-orchestrator.ts`, docs/66) — idempotent, one run per
actor+input, resumable on timeout (never a silent second charge), token in the Authorization
header only.

| | Candidate 1 (baseline) | Candidate 2 | Candidate 3 |
| --- | --- | --- | --- |
| Actor ID | `borderline/uber-eats-scraper-ppr` | `memo23/uber-eats-scraper` | `piotrv1001/uber-eats-menu-scraper` |
| Proposed input (JSON) | `{"locale":"en-GB","address":"Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom","addressCountry":"GB","storeType":"RESTAURANTS","maxRows":40,"getMenuCustomizations":false}` (no `query` — broad, per docs/68 finding) | `{"address":"Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom","latitude":51.5074,"longitude":-0.3778,"maxItems":40}` (exact field names **not independently verified beyond the fetched docs** — must be re-checked against the actor's live input schema in the Apify Console before the run is approved, per this project's own pre-flight-check pattern in `uber-diagnostic-plan.ts`) | `{"categorySeeds":[{"city":"southall-uk","category":"restaurants"}],"maxStores":40,"countryFilter":"GB"}` (city-slug format **not independently verified** — must be confirmed against the actor's live schema before running; a `storeUrls`/sitemap fallback exists if `categorySeeds` does not resolve UB1) |
| Maximum results | 40 | 40 | 40 |
| Maximum charge (hard cap) | $0.25 (40 × $5/1k = $0.20, capped) | $0.15 (40 × $2.50/1k = $0.10, capped) | $0.20 (40 × $3/1k = $0.12, capped) |
| Expected cost | ~$0.20 (matches the actual cost of the equivalent run already executed, docs/68) | ~$0.10 | ~$0.12 |
| **Total proposed (3 candidates)** | **~$0.42 expected, ~$0.60 hard-capped maximum — under the USD 1 ceiling** | | |
| Stop conditions | Halt before ingest on any actor FAILED/ABORTED/TIMED-OUT status (existing orchestrator behaviour); halt before any further paid source if `provider_succeeded_validation_failed` (existing geography gate) | same | same |
| Retry rules | No automatic retry of a paid run. A `ResumableTimeoutError` resumes the *same* run by its stored ID (never starts a second paid run) — existing `apify-orchestrator.ts` behaviour, unmodified. | same | same |
| Duplicate-paid-run prevention | `findInFlight(actorId, inputFingerprint)` refuses to start a second run for the same actor+input while one is in flight (existing behaviour, docs/66) | same | same |
| Approval gate | Requires: (1) explicit product-owner approval of this exact input + cost table, (2) `APIFY_TOKEN` present server-side, (3) a dry pre-flight check script (following the `uber-diagnostic-plan.ts` pattern) confirming the exact input before spend, matching this proposal exactly | same | same |

**Explicitly not done in producing this proposal:** no actor was run, no Apify run-API call was
made, no `APIFY_TOKEN` usage occurred beyond what already exists in the repo. Candidates 2 and 3
have input field names sourced from marketing/documentation pages, **not from this project's own
live pre-flight verification** (unlike candidate 1, whose input format is already proven exact by
two real runs) — a dry pre-flight check equivalent to `uber:diagnostic-plan` must be written and
run (network-free against the actor's published schema, or a schema-fetch call that costs nothing)
before either of those two actors is approved to spend real money.

## What this session did NOT do

- Did not execute any paid Apify actor or invoke an actor-run API.
- Did not purchase an Apify plan or add/verify `APIFY_TOKEN` usage beyond what already exists.
- Did not build a custom Uber Eats scraping actor.
- Did not perform customer comparison.
- Did not start Deliveroo work.
- Did not change the existing consolidation/dedup logic — the benchmark scorer reuses the
  production geography gate and location-fidelity modules unmodified; it does not fork their logic.
