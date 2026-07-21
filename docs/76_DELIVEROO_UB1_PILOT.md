# 76 — Deliveroo persisted UB1 pilot (2026-07-21)

Bounded run: Former Southall Town Hall, UB1 3HA. Standard Playwright Chromium, default config —
no proxy, no fingerprint modification, no CAPTCHA solving. Max 150 discovery records, detail
enrichment for the 20 closest, no paid third-party actor, no retry after a challenge.

## Step 1 — discovery: succeeded, no challenge

One real browser session, real UI interaction (postcode search "UB1 3HA"), same method
validated in docs/74. **150 real restaurant cards captured**, 150 unique outlet IDs, no
challenge. Rating coverage 126/150, review-count coverage 126/150 (both from the accessibility
label, same as docs/74). Postcode/address: 0/150 at this stage (never present in the home-feed
card — confirmed again).

## Step 2 — detail enrichment: genuine challenge encountered, correctly stopped

First attempt used `waitUntil: "networkidle"` for detail pages — all 20 timed out (Deliveroo's
pages poll analytics endpoints continuously and never reach network-idle; **not** a challenge,
a wait-strategy bug, fixed to `domcontentloaded` + a short fixed wait, the same approach already
proven to work for the single-restaurant detail fetch in docs/74).

Second attempt (corrected wait strategy, 3-way controlled concurrency): the very first batch of
3 concurrent detail-page requests triggered a genuine Cloudflare interstitial — page title
matched `"just a moment"` (Cloudflare's specific, well-known challenge-page title, a materially
stronger and more specific signal than the loose "captcha"-anywhere-in-DOM keyword match that
produced a false positive earlier this session). **Stopped immediately, per instruction — no
further detail requests attempted, no retry, no concurrency reduction and reattempt.**

**Real finding:** the single-request detail fetch (docs/74) did not trigger a challenge; 3
concurrent detail-page requests did. This is a genuine, useful operational signal — Deliveroo's
bot protection appears sensitive to concurrent request patterns from one browser context, not
necessarily to detail-page access itself.

## Result — honest, not disguised

Because postcode confirmation depends entirely on the now-blocked detail step, **0 of the 150
records have a confirmed UK postcode this run** — all 150 are classified `unverifiable_geography`
by the same gate used everywhere else in this project (no postcode/coordinates to prove
membership in the requested UB1 units — see `provider-geography-gate.ts`'s documented decision
order). Per that gate's design, **only `valid_geography` records are persisted as canonical
candidates** — so **0 canonical records were persisted this run.** This is reported as the real
result, not disguised as a success: discovery genuinely works and is repeatable (150/150, twice
now), but this run's detail-enrichment step did not complete far enough to confirm physical
location for any record.

**Per instruction: restaurants are not described as physically located in UB1 merely because they
appear in a UB1-area delivery search.** 21 of the 150 are within 1 mile of the anchor by the
platform's own reported distance — reported honestly as a *distance* signal, not conflated with a
confirmed physical address.

## Report

| Metric | Value |
|---|---|
| Raw observations (discovery cards) | 150 |
| Canonical records persisted | **0** |
| Unique outlet IDs | 150 |
| Physically located in UB1 (postcode-confirmed) | 0 (blocked by the detail-page challenge) |
| Within 1 mile of anchor (distance signal only) | 21 |
| Duplicate count | 0 |
| Geography-rejected count | 150 (0 out-of-scope, 150 unverifiable — no postcode reached) |
| Address coverage | 0/150 |
| Postcode coverage | 0/150 |
| Phone coverage | 0 (enrichment never ran — no detail-enriched candidates to enrich) |
| Rating coverage | 126/150 |
| Review-count coverage | 126/150 |
| Detail-enrichment success | 0/20 |
| Discovery challenge | None |
| Detail challenge | **Yes — stopped, not bypassed** |

## Source-health implication

Deliveroo discovery is reliable and repeatable via the real public flow. Detail-level enrichment
(needed for address/postcode/phone) is not currently reliable at even modest (3-way) concurrency
without triggering bot protection. `marketplaceStatus` stays `PENDING_AUTHORISATION` — this
session adds evidence that a production adapter would need either strictly sequential detail
requests (unverified whether that avoids the challenge — not tested, per the no-retry rule) or a
different enrichment source, not that the source is production-ready as-is.
