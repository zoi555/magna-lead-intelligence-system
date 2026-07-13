# 43 — Just Eat Platform Source (NOW)

This document describes the Just Eat live data source as built for the NOW SPRINT.
It covers the endpoint, configuration, the normalised record, the territory
classification concept, the functions in the adapter, how records match to FSA lead
candidates, and how to run the standalone pull.

Read alongside `docs/40_API_CREDENTIALS_AND_DATA_SOURCE_SETUP.md` for credentials and
safety rules.

Source file: `src/lib/sources/just-eat.ts`
Runner script: `scripts/fetch-just-eat.ts`

---

## What this source is

Just Eat exposes a public "restaurants by postcode" discovery endpoint. We read
**lightweight business facts only** to confirm which food businesses have a live
delivery-platform presence in the six pilot outcodes: **UB1, UB2, UB6, HA0, HA9, W5**.

We do **not** scrape pages, use proxies, bypass anti-bot measures, log in, or bulk
copy menus, prices, or reviews. See doc 40 for the full safety rules.

---

## Endpoint and configuration

| Item | Value |
| --- | --- |
| Endpoint | `https://uk.api.just-eat.io/restaurants/bypostcode/{postcodeOrOutcode}` |
| Access | **Server-side only** — never called from the browser |
| Auth | None (no key) |

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `JUST_EAT_ENABLED` | `false` | Master on/off switch. Must be `true` to pull. |
| `JUST_EAT_MAX_CALLS_PER_RUN` | `50` | Hard cap on outward requests per run. |
| `JUST_EAT_REQUEST_DELAY_MS` | `500` | Polite delay between requests, in ms. |

### Reliability behaviour

- **Retry once.** A failed request is retried a single time before giving up.
- **Fail-safe on 403 / 429 / 5xx.** If the endpoint blocks or rate-limits us, the
  fetch returns `ok: false` rather than throwing. The pipeline then **continues on
  FSA plus customer exclusion**, so a Just Eat outage never sinks the whole run.
- **Capped and paced.** The per-run cap and inter-request delay keep the pull polite
  and within the six-outcode territory.

---

## The normalised record

Each raw restaurant is normalised to a stable record shape before it reaches the
pipeline. Fields:

| Field | Meaning |
| --- | --- |
| `justEatId` | Just Eat's internal id for the restaurant. |
| `uniqueName` | Just Eat slug / unique name. |
| `businessName` | Trading name of the restaurant. |
| `brandName` | Brand name where the outlet belongs to a chain. |
| `isBrand` | True if the outlet is part of a recognised brand/chain. |
| `addressLine` | First line of the address. |
| `city` | City / town. |
| `postcode` | Full postcode as returned. |
| `outcode` | Outward code derived from the postcode. |
| `latitude` | Latitude. |
| `longitude` | Longitude. |
| `ratingAverage` | Aggregate star rating. |
| `ratingCount` | Number of ratings behind the average. |
| `cuisines` | List of cuisine tags. |
| `isOpenNow` | Whether the outlet is open at fetch time. |
| `isNew` | Whether Just Eat flags the outlet as new. |
| `isDelivery` | Offers delivery. |
| `isCollection` | Offers collection. |
| `isTemporarilyOffline` | Temporarily offline on the platform. |
| `url` | Just Eat listing URL. |
| `fetchedForOutcode` | The pilot outcode we queried to find this record. |
| `territoryClass` | Territory classification (see below). |
| `territoryConfidence` | Confidence 0..1 that the record sits in target territory. |

---

## Territory classification (KEY concept)

The endpoint returns restaurants that **DELIVER TO** an outcode, **not only those
located in it**. A restaurant physically in a neighbouring area but delivering into a
pilot outcode will appear in the results.

Rather than throw those away, every record is classified and given a
`territoryConfidence` between 0 and 1:

| `territoryClass` | Meaning | Kept? |
| --- | --- | --- |
| `located_in_target_territory` | The outlet's own postcode is a pilot outcode. | Yes — highest confidence |
| `serves_target_territory` | Delivers into the pilot area; likely nearby. | Yes |
| `outside_target_but_serves` | Located outside the pilot area but delivers in. | **Yes — kept, lower confidence** |
| `unknown_location` | Location could not be resolved. | Yes — flagged, low confidence |

**Outside-but-serves records are kept, not discarded.** They are scored with a lower
territory confidence so the pipeline can weigh them appropriately, but they remain
valid delivery-platform signals for the pilot area.

---

## Functions in `src/lib/sources/just-eat.ts`

| Function | Purpose |
| --- | --- |
| `getJustEatConfig()` | Reads the env vars and returns the resolved config (enabled flag, per-run cap, delay). |
| `isJustEatEnabled()` | Convenience boolean — is the source switched on? |
| `fetchJustEatRestaurantsByOutcode(outcode, pilotOutcodes)` | Fetches and normalises one outcode's restaurants, with retry-once and fail-safe handling. |
| `pullJustEatForOutcodes(outcodes)` | Orchestrates a capped, paced pull across all supplied outcodes, de-duplicating results. |
| `normaliseJustEatRestaurant(raw, queriedOutcode, pilotOutcodes)` | Maps a raw restaurant to the normalised record and assigns `territoryClass` / `territoryConfidence`. |
| `matchJustEatToLeadCandidate(target, pool)` | Matches a Just Eat record to an FSA lead candidate from a pool. |
| `explainJustEatStatus(restaurant)` | Produces a short human-readable status line for a record (or a null-safe message). |

---

## Matching to FSA candidates

Just Eat records are matched against FSA lead candidates so that a **real,
observed** platform presence and rating enrich the FSA lead — instead of us guessing
a Just Eat search URL.

Matching tiers, strongest first:

| Tier | Rule | Strength |
| --- | --- | --- |
| Name + postcode | Same postcode and a matching business name. | **Strong** |
| Coordinate proximity + name | Within **≤ 120 m** and a matching name. | Strong |
| Fuzzy name only | Name similarity only, no location corroboration. | **Weak — flagged for review** |

### What matching produces

- **Matched FSA leads** gain live Just Eat detail: real presence, aggregate rating,
  rating count, cuisines, and open flag — replacing any guessed search URL.
- **Strong Just Eat-only, in-territory records** (a real delivering business FSA did
  not surface) become **`PLATFORM_ONLY_CANDIDATE`** leads. These enter the pipeline
  through the **fan-in** step that merges sources.

---

## How to run

Standalone pull:

```bash
npm run leads:just-eat
```

This runs `scripts/fetch-just-eat.ts`, which pulls the six pilot outcodes and writes:

| Output | Contents |
| --- | --- |
| `exports/just-eat-platform-candidates.csv` | Normalised candidate records, CSV. |
| `exports/just-eat-platform-candidates.json` | Same records, JSON. |
| `exports/just-eat-fetch-summary.json` | Run summary — counts, per-outcode totals, territory breakdown. |

**`exports/` is gitignored** — run output stays local and is never committed.

The source must be enabled first (`JUST_EAT_ENABLED=true` in `.env.local`).

---

## Verified tonight (2026-07-12)

A live pull across the six pilot outcodes returned approximately **2,578 unique
restaurants**:

- **767** located in-area (`located_in_target_territory`).
- **1,811** outside-but-delivering-in (`outside_target_but_serves` / serving the
  pilot area from a neighbouring outcode).

This confirms the endpoint, the retry/fail-safe behaviour, the normalisation, and the
territory classification all work end-to-end against live data, and that
outside-but-serves records are retained rather than dropped.
