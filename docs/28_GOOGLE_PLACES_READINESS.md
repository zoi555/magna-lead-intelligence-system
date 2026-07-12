# Google Places Readiness (Phase 7)

Adapter: `src/lib/sources/google-places.ts`. **PAID. Ready but disabled + cost-controlled. No live call tonight.**

## Env vars
- `GOOGLE_PLACES_API_KEY` — API key (server-only).
- `GOOGLE_PLACES_ENABLED` — must be `true` (default off).
- `GOOGLE_PLACES_MAX_CALLS_PER_RUN` — call cap (default `0`).
- `GOOGLE_PLACES_FIELD_MASK` — overrides the minimal safe field mask.
- `GOOGLE_PLACES_DAILY_BUDGET_WARNING` — optional warning text.

Live only when **ALL**: key present AND `GOOGLE_PLACES_ENABLED=true` AND `MAX_CALLS_PER_RUN > 0`.

## Cost controls
- `validateGooglePlacesBudget(usedThisRun)` enforces the per-run cap.
- Every live call sends `X-Goog-FieldMask` (default: `places.id, displayName, formattedAddress,
  nationalPhoneNumber, websiteUri, businessStatus, location`) — restricts fields and billing SKU.
- **Ratings/reviews are out of scope** until explicitly approved.

## What it may enrich
`place_id, display_name, formatted_address, phone, website, location, business_status, types`.
Phone/website enrichment is ready for future controlled runs.

## Why disabled by default / broad-run warning
It is paid; broad runs can incur real cost. Enable only with a call cap + spend approval. Disabled →
pipeline sees `disabled_cost_control_required` (warning, never a blocker). API key never exposed to client.
Functions: `getGooglePlacesConfig`, `isGooglePlacesEnabled`, `validateGooglePlacesBudget`,
`matchPlaceForLead`, `enrichLeadWithGooglePlaces`, `explainGooglePlacesStatus`.
