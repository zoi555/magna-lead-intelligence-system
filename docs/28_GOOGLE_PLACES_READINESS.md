# Google Places Readiness (Phase 7)

Adapter: `src/lib/sources/google-places.ts`.
Stage: `src/lib/pipeline/google-places-enrichment-stage.ts`.

**PAID API. OFF by default and cost-controlled. No live call unless explicitly enabled.**

## Server-side only — never the client

The Google Places API key is a paid, privileged secret. It is read from
`process.env` and used **only** on the server (pipeline stage / adapter). It must
**never** be shipped to, referenced from, or embedded in any client/browser code,
and it is never exposed to the client. There is no `NEXT_PUBLIC_` variant.

## Enablement conditions

A live call is made **only** when **ALL** of the following are true:

- `GOOGLE_PLACES_API_KEY` is set (server-only secret), **and**
- `GOOGLE_PLACES_ENABLED=true` (default: off), **and**
- `GOOGLE_PLACES_MAX_CALLS_PER_RUN` > 0 (default: `0` — i.e. no calls).

If any condition fails, the runner reports `disabled` and makes no network call.
`isGooglePlacesEnabled()` encodes this rule; `getGooglePlacesConfig()` exposes it.

## Env vars

- `GOOGLE_PLACES_API_KEY` — API key (server-only). Never committed, never client-side.
- `GOOGLE_PLACES_ENABLED` — must be exactly `true` to allow live calls (default off).
- `GOOGLE_PLACES_MAX_CALLS_PER_RUN` — per-run billable-call cap (default `0`).
- `GOOGLE_PLACES_FIELD_MASK` — optional override of the field mask (advanced).
- `GOOGLE_PLACES_DAILY_BUDGET_WARNING` — optional warning text.

## Endpoint + field mask (cost control)

Live calls use the **Places API (New) Text Search** endpoint:
`POST https://places.googleapis.com/v1/places:searchText`, with an
`X-Goog-Api-Key` header and a tight **`X-Goog-FieldMask`** header. The field mask
restricts both the returned fields and the billing SKU, so we only ever pay for
what we need. `maxResultCount` is `1` (top match only).

Contact-enrichment field mask (`CONTACT_FIELD_MASK`):

```
places.id, places.displayName, places.formattedAddress, places.location,
places.nationalPhoneNumber, places.internationalPhoneNumber, places.websiteUri,
places.businessStatus, places.types, places.rating, places.userRatingCount,
places.googleMapsUri
```

The original minimal mask (`DEFAULT_FIELD_MASK`) remains for backwards
compatibility with the earlier match adapter.

## What is collected

- `id` (place_id), `displayName`, `formattedAddress`, `location` (lat/lng)
- `nationalPhoneNumber` / `internationalPhoneNumber` (national preferred)
- `websiteUri`, `businessStatus`, `types`
- `rating`, `userRatingCount` (aggregate counts only)
- `googleMapsUri`

**Full reviews are never requested.** Only the aggregate `rating` and
`userRatingCount` are collected — no review text is fetched or stored. Any field
the API does not return is stored as `null`.

## Cost + cap controls

- The runner (`GooglePlacesRunner`) is **stateful and cap-aware**: it tracks
  `callsMade` and `capRemaining`, reserving one call from the budget before each
  request. Once `capRemaining` hits `0`, further leads return `cap_reached` with
  **no** network call.
- Transient failures (HTTP 429 / 5xx / network errors) are **retried once**; a
  hard failure returns an `error` result. The runner **never throws**.
- The stage (`runGooglePlacesEnrichment`) **prioritises exportable / new-prospect
  leads first**, so scarce paid calls land on the leads that matter.
- Config is read **lazily** (at runner construction), so env may be set after
  module import.

## Outputs (gitignored `exports/`)

- `google-places-enrichment-summary.csv` — one row per processed lead
  (status, match, phone, website, address, geo, business status, types, rating,
  review count, maps URI, fields collected, warning).
- `missing-phone-list.csv` — leads still lacking a phone after enrichment, with a
  suggested follow-up action (re-run with more budget / manual research).

`runGooglePlacesEnrichment` returns
`{ enriched, phoneCount, websiteCount, callsUsed, capRemaining, disabled }`.

## If disabled

When Google Places is disabled, the stage does nothing and returns
`{ disabled: true }` (no calls, no cost). In that case **the final report must
state that contact enrichment is incomplete** — phone/website coverage was not
attempted via Google Places, and any missing-phone leads still require manual
research or a later enabled run.

## Public API (adapter)

`getGooglePlacesConfig`, `isGooglePlacesEnabled`, `validateGooglePlacesBudget`,
`explainGooglePlacesStatus`, `matchPlaceForLead`, `enrichLeadWithGooglePlaces`
(all preserved), plus the new contact-enrichment `GooglePlacesRunner`
(`enabled`, `callsMade`, `capRemaining`, `enrich`) and `GooglePlacesResult`.
