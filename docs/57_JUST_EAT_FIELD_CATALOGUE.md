# 57 — Just Eat Field Catalogue (verified from live)

Status: verified 2026-07-16 against the live listing endpoint across the 6 pilot
outcodes (UB1, UB2, UB6, HA0, HA9, W5). 6/6 outcodes returned 200; **4,904 restaurant
objects** observed; **96 distinct field paths** on the restaurant object. This catalogue
is the honest basis for the Stage-1 schema — no field is claimed available unless it was
seen in real responses.

Method: `GET https://uk.api.just-eat.io/restaurants/bypostcode/{outcode}` — the same
lawful, server-side, capped, paced endpoint already in `src/lib/sources/just-eat.ts`.
No login, scraping, proxy, or anti-bot bypass. Raw responses were **not committed**;
sanitised fixtures are hand-authored from this structure.

## Source levels observed

| Level | Source | Status |
| --- | --- | --- |
| A. Search/listing result | `bypostcode/{outcode}` → `Restaurants[]` | **Available and used** |
| — Response context | top-level `MetaData`, `Area`, `deliveryFees`, `promotedPlacement`, `RestaurantSets`, `CuisineSets`, `Views`, `Dishes` | Available (query metadata) |
| B. Restaurant/outlet detail | separate detail endpoint | **Not acquired** — not verified lawful/available; catalogued as conditional |
| C. Menu/category/item | separate menu endpoint (menu IDs appear as `DeliveryMenuId`/`CollectionMenuId`, mostly null in listing) | **Not acquired** — conditional on a verified lawful menu endpoint |
| D. Delivery/collection availability | listing object | **Available** (see Trading) |
| E. Reviews/aggregate rating | listing object (`Rating`, `NumberOfRatings`) | **Aggregate only** — no individual review text |
| F. Images/promotions/metadata | listing object (`Logo`, `Deals`, `Offers`, `Badges`, `Tags`) | **Available** |
| G. Request/query metadata | response + request | **Available** |

## Field classification (level A — listing)

Legend: **D** = directly available · **det** = detail-request only · **menu** = menu-only ·
**der** = derived safely · **opt** = inconsistent/optional · **N/A** = unavailable ·
**PROH** = prohibited/inappropriate.

### Identity
| Internal key | JE path | Type | Class |
| --- | --- | --- | --- |
| je_outlet_id | `Id` | number | D |
| unique_name (slug) | `UniqueName` | string | D |
| trading_name | `Name` | string | D |
| brand_name | `BrandName` | string\|null | opt |
| is_brand | `IsBrand` | boolean | D |
| description | `Description` | string\|null | opt |
| outlet_url | `Url` | string | D |
| is_test_restaurant | `IsTestRestaurant` | boolean | D (filter out) |

### Contact
| telephone | — | — | **N/A** at listing (not present in payload; would need a verified detail endpoint) |
| website | — | — | **N/A** at listing |

> Phone is **not supplied** by the listing endpoint. Per spec §7 phone is captured
> "where supplied" — it is not, so it is honestly recorded unavailable, not fabricated.

### Location
| raw_address_first_line | `Address.FirstLine` | string | D |
| city | `Address.City` / `City` | string | D |
| postcode | `Postcode` / `Address.Postcode` | string | D |
| outcode | derived from postcode | string | der |
| latitude | `Address.Latitude` / `Latitude` | number | D |
| longitude | `Address.Longitude` / `Longitude` | number | D |
| delivery_zipcode | `DeliveryZipcode` | string\|null | opt |
| serviceable_areas | `ServiceableAreas` | array | opt |
| drive_distance | `DriveDistance` / `DriveInfoCalculated` | number/bool | opt (query-relative) |

### Ratings & reviews (aggregate only)
| rating_average | `Rating.Average` / `RatingAverage` | number | D |
| rating_count | `Rating.Count` / `NumberOfRatings` | number | D |
| rating_stars | `Rating.StarRating` / `RatingStars` | number | opt |
| individual reviews / text | — | — | **N/A** (not in listing; do not infer count from snippets) |
| food/service/delivery split | — | — | **N/A** at listing |

### Trading & availability
| is_open_now | `IsOpenNow` | boolean | D |
| open_for_delivery | `IsOpenNowForDelivery` | boolean | D |
| open_for_collection | `IsOpenNowForCollection` | boolean | D |
| open_for_preorder | `IsOpenNowForPreorder` | boolean | D |
| is_delivery | `IsDelivery` | boolean | D |
| is_collection | `IsCollection` | boolean | D |
| is_temporarily_offline | `IsTemporarilyOffline` | boolean | D |
| offline_reason | `ReasonWhyTemporarilyOffline` | string\|null | opt |
| delivery_cost | `DeliveryCost` | number | D |
| is_free_delivery | `IsFreeDelivery` | boolean | D |
| minimum_delivery_value | `MinimumDeliveryValue` | number | D |
| delivery_eta_lower/upper | `DeliveryEtaMinutes.RangeLower/RangeUpper` | number | opt |
| delivery_charge_bands | `DeliveryChargeBands` | array | opt |
| opening_times | `OpeningTimes` | array | opt |
| delivery_opening_time | `DeliveryOpeningTimeLocal` etc. | string\|null | opt |
| is_new | `IsNew` / `NewnessDate` | boolean/date | D |
| is_premier | `IsPremier` | boolean | opt |

### Cuisine & classification
| cuisines | `Cuisines[].Name` | string[] | D |
| cuisine_types | `CuisineTypes[]` `{Id,Name,SeoName,IsTopCuisine}` | array | D |
| primary_cuisine | derived (`IsTopCuisine` / first) | string | der |
| tags | `Tags` | array | opt |
| badges | `Badges` | array | opt |
| chain_evidence | `IsBrand` + `BrandName` | — | der (evidence, not final classification) |

### Menu
| menu ids | `DeliveryMenuId` / `CollectionMenuId` | null (mostly) | opt — pointer only |
| menu categories/items/prices/allergens | — | — | **menu** (conditional on a verified lawful menu endpoint; not acquired in Stage 1) |
| top-level dishes | `Dishes` (search context) | array | opt (query metadata, not per-outlet menu) |

### Promotions & media
| logo_url | `LogoUrl` / `Logo[].StandardResolutionURL` | string | D |
| deals | `Deals` | array | opt |
| offers | `Offers` | array | opt |
| offer_percent | `OfferPercent` | number | opt |
| is_sponsored | `IsSponsored` | boolean | D |
| sponsored_position | `SponsoredPosition` | number | opt |
| default_display_rank | `DefaultDisplayRank` | number | D (result position) |

### Halal evidence (conservative)
| is_halal_flag | `IsHalal` | boolean | D — **explicit platform flag** |
| halal_wording_in_description | scan `Description` text | string excerpt | der (evidence only) |
| halal_wording_in_cuisine/tags | scan `Cuisines`/`Tags` | string excerpt | der (evidence only) |

> `IsHalal` is a direct Just Eat flag and is stored as **source evidence**, not as a
> certification claim. Halal is never inferred from cuisine alone. No certification field
> is provided by the source, so none is claimed.

### Source & audit metadata (per observation)
| source = "just_eat"; query outcode `fetchedForOutcode`; requested vs returned coords;
| result rank `DefaultDisplayRank`/`SecondDateRank`; `LastUpdated`; HTTP status; fetched
| timestamp; raw content hash; parser/adapter/schema version; execution id; attempt no. |

### Prohibited / inappropriate
- Individual reviewer identities or review text → not collected (not present; would be
  personal data).
- Any field requiring login, payment, or anti-bot bypass → prohibited.
- FSA hygiene: `HygieneRating`/`Smiley*` appear but were **null** in this feed — treat as
  unavailable from Just Eat (FSA is a separate source, out of scope for this stage).

## What this means for the schema

1. Listing (level A) is rich enough to populate identity, location, aggregate rating,
   cuisine, trading/availability, delivery economics, promotions and an explicit halal
   flag — all directly, from one lawful endpoint.
2. **Phone, individual reviews, and menu items are not available at listing level.** The
   raw-observation model reserves response types (`search`, `outlet_detail`, `menu`) so
   they can be added later *if* a lawful endpoint is verified — but Stage 1 collects only
   `search`, and the data-quality report will show phone/menu coverage as 0% honestly.
3. Many booleans have three-way open state (`IsOpenNowForDelivery/Collection/Preorder`) —
   captured distinctly rather than collapsed.
