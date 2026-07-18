# 68 — borderline/uber-eats-scraper-ppr diagnostic + parser calibration

One bounded paid run (`uber:pilot:borderline`, 10 rows, **$0.05**, cap $0.25). Actor run
`jg2xJwXcMgvmggYnT`, dataset `IVvfNEqnBbP13jPqk`, actId `nrQeUJPbeJLVVsXPH`, build 0.0.50, SUCCEEDED,
charged 10. Input exactly as approved (`locale en-GB`, full Southall UB1 3HA address, `addressCountry
GB`, `query pizza`, `storeType RESTAURANTS`, `maxRows 10`, `getMenuCustomizations false`, no urls).

## Result — the actor binds to the Southall delivery area (unlike sourabhbgp)
- **Country: GB 10/10** (wrong-country problem gone). **Valid UK postcodes 10/10. Coordinates 10/10.**
- **2 records in UB1** (Ali Baba's Pizza UB1 2NN, Tops Pizza Southall UB1 3) → `target_district`,
  business-valid → **2 operational candidates**.
- **8 records `near_target`** (UB6/UB3/UB4/TW5/TW3, ~2.8–3.5 km from Southall) → correctly
  `out_of_scope` for a UB1 run but genuinely local delivery-area restaurants.
- **0 `unrelated_location`.** business status `geography_validated`.

Success criteria (all met): binds to the delivery location; ≥1 record demonstrably in UB1;
geography-invalid records quarantined; parser calibrated with no second paid run (offline replay).

## Real payload schema (run jg2xJwXcMgvmggYnT)
Rich and structured (not the sparse fallback path): `title`/`sanitizedTitle`/`uuid`/`url`/
`merchantType`; nested `location{address,streetAddress,city,region,postalCode,country,latitude,
longitude,locationType,geo{}}`; `rating{ratingValue, reviewCount(STRING)}`; `cuisineList`,
`categories`, `categoriesLink[{text,link}]`; `supportedDiningModes` = array of **objects**
`{mode,title,isAvailable,isSelected}`; `isOpen`, `storeAvailablityStatus`, `closedMessage`,
`etaRange` (TEXT), `fareBadge` (TEXT), `hours[{dayRange,sectionHours[]}]`; `menu[{catalogName,
catalogItems[]}]`, `featuredItems`; `storeReviews`/`featuredReviews`; `heroImageUrl`/`logoImageUrl`;
`distance{text}`; `phoneNumber` (valid UK E.164); `emails[]`; `currencyCode`.

## Parser calibration → `uber-eats-borderline-parse-0.2.0`
First-class: name, url, uuid, address, **UK postcode**, lat/lng, **phone (UK E.164)**, **rating**,
**review_count** (string→number), **cuisines**, **is_delivery/is_collection** (from the dining-mode
OBJECT array), **eta_minutes** (lower bound parsed from `etaRange` text), halal (inferred from
cuisines). `delivery_cost` stays **null** — `fareBadge` is promotional text, not a clean numeric fee
(retained in `source_extra`, never fabricated). `source_extra` retains the complete raw record plus
locality/region/country, dining modes, hours, menu counts + full menu, categories/categoriesLink,
eta/fare text, reviews availability, media, distance, currency, merchant type, location type.

Verified by **offline replay** of the saved payload (`uber:borderline:replay`) — no second paid call.

## Persistence (run 4ac3558a…)
internal executions 1 · provider executions 1 · raw obs 10 · canonical 10 · duplicates 0 · dangling 0
· geography validations 10 (valid 2 / out-of-scope 8 / unverifiable 0) · candidates 2 (all valid) ·
source links 2 · conflicts 0 · completeness 2 · comparison snapshots 1. (Candidates were persisted
under the tolerant 0.1.0 parse; the immutable raw payloads support re-parse/enrichment with 0.2.0.)

## Recommendation
`borderline/uber-eats-scraper-ppr` is a **strong candidate** for UK district discovery: it binds to
the requested delivery area and returns valid GB geography with coordinates. It remains
`operationalStatus: candidate` (not auto-selected) pending product-owner sign-off — do not promote to
production discovery on a single 10-record run. A slightly larger confirmatory run (still bounded)
and a check of the near_target radius policy are the sensible next steps. sourabhbgp stays discovery-
rejected / enrichment-provisional. No Deliveroo; no customer comparison; no larger Uber run here.

## Broad-query diagnostic (run MrKoKg8322ZVzk449, 2026-07-18)
Second approved run — BROAD (no `query`), `maxRows 40`, Southall anchor. SUCCEEDED, charged 40,
**actual $0.20**. 40 items, 40 unique UUIDs. Persistence: raw 40 / canonical **34** / duplicates **6**
(restaurants also seen in the pizza run — cross-run content-hash dedup) / 0 dangling · validations 40
· candidates **7** · snapshot 1.

Business geography: **valid 10** (in UB1) / out-of-scope 28 / unverifiable 2. Location fidelity:
target_district 10 / near_target 26 / unrelated 4. Coverage across 40: postcode 38/40, coords 40/40,
phone 40/40, rating 38/40, cuisine 40/40, hours 40/40, menu 40/40, url 40/40.

**Broad query raised UB1 count 2 → 10** (10 UB1 listings = **7 physical restaurants**; Loaded
Burgers/Wings 100/Tasty Tenders are virtual brands at UB1 1RT sharing one kitchen → `confirmed_same`).
UB1 restaurants appeared at feed **ranks 15–33** (interleaved, not the top).

### Recall is NOT adequate — the home feed is not a complete UB1 directory
The broad run found a DIFFERENT set from the pizza run and **dropped** Ali Baba's Pizza + Tops Pizza
(the pizza run's 2 UB1 records). Of the 7 known UB1 restaurants, the broad run found **0/7**; across
BOTH runs only **2/7** (Ali Baba's, Tops Pizza — pizza run only). Watan, Spice Village, Pizzeria Hut,
Kebabish Original, Pizza Planet were never returned. The feed is a proximity/relevance-ranked delivery
home feed truncated per anchor+query — **not** a guaranteed directory; a single call cannot achieve
district completeness regardless of query breadth or `maxRows`.

### Path to adequate district recall (not built here)
- **Several UB1 delivery anchors + `excludeStores` pagination** — highest-value scalable breadth
  (defeats single-anchor proximity truncation; page deeper by excluding seen UUIDs).
- **Uber search/category-URL actor mode** (`urls[]`) — worth a cheap test; may be more directory-like
  than the personalised feed.
- **Sitemap / store-URL enumeration + store-URL enrichment** — the route to true completeness
  (enumerate UB-area store URLs, enrich each), independent of the ranked feed. Heavier.
- Multiple category queries — minor supplement (surfaces cuisine-specific places the broad feed drops).
- Custom Uber discovery actor — only if the above are insufficient.
