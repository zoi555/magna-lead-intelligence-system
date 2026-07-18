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
