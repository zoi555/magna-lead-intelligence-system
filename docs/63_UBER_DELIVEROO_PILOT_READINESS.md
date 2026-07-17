# 63 — Uber Eats & Deliveroo controlled-pilot readiness (Part 7)

Prepared, **not executed, not purchased.** Goal: one postcode district on each of Uber Eats
and Deliveroo, tiny capped budget (~a few pounds), cheapest lawful route. Awaiting the
product owner's explicit approval of provider + exact cost before any run.

## Cheapest lawful route — Apify Free plan (no monthly purchase)

Use Apify's **Free plan** ($0/month, **$5 prepaid credit**) — no £199 subscription. Pay-per-
result comes out of the free credit, so a one-district pilot is effectively **£0 out of
pocket** (well within the $5 credit).

## Exact pilot configuration

| Item | Uber Eats | Deliveroo |
| --- | --- | --- |
| Provider | Apify (pay-per-result actor) | Apify (pay-per-result actor) |
| Actor ID (candidate) | `sovereigntaylor/ubereats-scraper` (or `memo23/uber-eats-scraper`) | `thirdwatch/deliveroo-scraper` |
| Current price | **~$3 / 1,000 results** | **~$8/1k (free tier) → $4/1k (gold)** |
| Input geography | one postcode district (e.g. `UB1`) | one postcode district (e.g. `UB1`) |
| Result limit (`maxItems`) | **250** | **250** |
| Expected outlets/district | ~150–240 | ~150–240 |
| **Expected max pilot cost** | **~$0.75** (250 × $3/1k) | **~$2.00** (250 × $8/1k) |
| **Both, one district** | | **~$2.75 total — within the $5 free credit** |
| API token | **`APIFY_TOKEN`** (server-side only, never committed) | same |
| Auth method | Apify token in the run-sync URL | same |
| Fields requested | name, brand, address, postcode, coords, url, cuisines, rating, review count, delivery/collection, fee, min, ETA, promotions, sponsored, halal, image | same (+ menu optional) |

## Adapter validation (done)

- `UberEatsAdapter` / `DeliverooAdapter` implement the generic contract, `liveExecution:false`
  by default, `validateConfiguration()` fails without a provider (no fake live). Parsers →
  source-neutral `SourceOutlet`. Covered by `npm run test:multi-source`.
- Provider seam `providers/apify-fetcher.ts` (`uberEatsApifyFetcher` / `deliverooApifyFetcher`)
  wraps Apify dataset items under the key each parser expects (`stores` / `restaurants`) and
  plugs into the adapters' injectable fetcher — **no change to adapters, consolidation or
  worker.** Round-trip validated against a provider-shaped fixture (`test:multi-source`).

## Caveats / what must be confirmed before the run
1. **Actor field-name calibration:** the chosen actor's real output field names must be checked
   against our parser on the first run; a small mapping shim may be needed (the parser is
   defensive — missing fields become null, never fabricated).
2. **Legal:** the third-party provider asserts ToS-compliance; product owner + legal should
   accept that representation before running.
3. **No anti-bot/CAPTCHA/auth bypass** by us — the provider handles acquisition.

## To execute (after approval — NOT done)
Product owner supplies **`APIFY_TOKEN`** + approves the ~$2.75 pilot and the two actor IDs.
Then: set `UBER_EATS_APIFY_ACTOR` / `DELIVEROO_APIFY_ACTOR` + `APIFY_TOKEN`, inject the
provider fetchers into the adapters, run one district each with `maxItems: 250`, persist
observations + consolidate. Stop and report coverage before scaling.
