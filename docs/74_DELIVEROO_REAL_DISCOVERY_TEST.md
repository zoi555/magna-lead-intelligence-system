# 74 — Deliveroo: real public-flow discovery test (2026-07-21, corrected)

Supersedes the verdict in docs/72. That test's `PROVIDER_UNAVAILABLE` conclusion was drawn from
one guessed static URL (`?postcode=`) returning a 404 — which the current session correctly
flagged as insufficient evidence of provider unavailability. This test uses the actual ordinary
public browser flow and finds real discovery data.

## Method

One genuine Playwright Chromium session (default launch config — no stealth plugin, no proxy, no
fingerprint modification; Chromium itself is a real, standard rendering engine, not automation
evasion):

1. Navigated to `https://deliveroo.co.uk/` (the real homepage, not a guessed path).
2. Used the page's own visible "Enter a postcode to see what we deliver" field — typed
   `UB1 3HA`, clicked the real "Search" button.
3. This produced a genuine navigation to
   `https://deliveroo.co.uk/restaurants/london/southall?fulfillment_method=DELIVERY&geohash=gcptp3rdtebz`
   — a URL pattern Deliveroo resolves client-side; not guessable from a postcode alone.
4. One direct replay of that exact URL (network-idle wait) to capture the page's embedded
   `__NEXT_DATA__` in full.
5. One restaurant-detail page inspection (`/menu/London/southall/chick-filler-southall-stl`) —
   permitted when discovery succeeds but phone/address are absent — its `__NEXT_DATA__` was
   also inspected.

A first pass incorrectly flagged a "challenge" on the homepage load via an overly broad keyword
match (the word "captcha" appears in hidden PerimeterX accessibility text present on many normal,
unblocked pages — the same false-positive class as the earlier curl test). The screenshot proved
this was the genuine, fully-rendered homepage with no visible block; the check was corrected
before continuing. No actual bot challenge was encountered at any point this session.

## Result — real data found

**52 feed items** in the home-feed `__NEXT_DATA__`, containing **150 distinct restaurant cards**
across "Top picks," per-cuisine carousels, etc. Filtered to the **10 genuinely local** results
(≤1 mile from the searched UB1 3HA point — several results at 2–7 miles cover a much wider
Ealing/Wembley/Harrow delivery catchment, the same "delivers-to vs physically-in" distinction
already documented for Just Eat and Uber Eats). Several names cross-match the existing Just Eat
UB1 dataset (Chicken Cottage, Chick Filler), a useful cross-provider sanity check.

## Field coverage (10 local records + 1 detail page)

| Field | Coverage | Note |
|---|---|---|
| Outlet ID / URL / name | 10/10 (100%) | stable numeric ID + a UUID (`drnId`) |
| Rating / review count | 10/10 (100%) | parsed from the accessibility label; "500+" retained as a floor, never presented as exact |
| Image | 10/10 (100%) | |
| ETA | 5/10 numeric (50%) | the other 5 show "Pre-order" — retained as text, never coerced to a number |
| Phone | 0/10 (0%) | confirmed absent on both the feed AND the one detail page inspected — same pattern as Just Eat (docs/59) |
| Full address / postcode | 1/10 (10%) | only from the one detail page fetched (address embedded as free text, e.g. "20 South Road, London, UB11RT" — a parser now splits this into street + a correctly-spaced UK postcode "UB1 1RT") |
| Coordinates | 0/10 (0%) | not exposed for the restaurant itself — only the searching customer's own location is present; never substituted |
| Cuisines, opening hours, delivery/service fee, minimum order, offers, sponsored | 0/10 (0%) | not present in the home-feed card; some (opening-hours text, a delivery-fee UI row) were visible in the one detail page's header blocks but not parsed into structured fields this session — menu/item-level extraction stayed out of scope per instruction |

## New calibrated parser

`src/lib/discovery-engine/deliveroo/parse-real.ts` (`deliveroo-real-parse-0.1.0`) — built from
this real data, not assumption. Kept separate from the existing `parse.ts` (unchanged), which
serves a different input shape (third-party licensed-provider CSV/JSON exports, not Deliveroo's
own internal `__NEXT_DATA__` representation). 16 assertions in `test:deliveroo-real-parse`,
including: real screen-reader-label parsing, "500+" floor handling, "Pre-order" ETA honesty, and
the "UB11RT" → "UB1 1RT" postcode-splitting fix. Fixtures:
`tests/fixtures/deliveroo/real-southall-home-feed.json` (10 real, sanitised records — no personal
data, public restaurant listings only) and `real-southall-detail.json`.

## Verdict

**`DELIVEROO_PUBLIC_SOURCE_PARTIAL`** — a real, validated public discovery source exists and
returns genuine local restaurant data (not blocked, not unavailable). Coverage is partial: core
identity/rating/image fields are strong (100%), but phone and coordinates are confirmed absent at
this access level, and several commercial fields (cuisines, hours, fees, offers) were not
extracted this session (visible in richer page sections not yet mined, within the one-detail-page
bound given).

## What this does NOT authorise

This was one bounded, manual research session using Playwright to drive a real, unmodified
Chromium browser — appropriate for a one-off investigation, but **not** the same as wiring
recurring, automated browser-driven scraping into the production discovery adapter. Running
scripted browser automation against Deliveroo's live consumer site on an ongoing, scheduled basis
is a materially different decision (recurring load on their infrastructure, an different ToS/risk
posture than a single manual check) that this session does not make. See
`src/lib/sources/source-registry.ts` — `marketplaceStatus` remains `PENDING_AUTHORISATION`, not
`ACTIVE`, until that explicit productionisation decision is made.
