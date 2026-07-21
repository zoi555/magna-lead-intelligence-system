# 72 — Deliveroo bounded public-flow test (2026-07-21)

Purpose: perform the one authorised, controlled, read-only test of Deliveroo's ordinary public
consumer flow for the central UB1 anchor (Former Southall Town Hall, UB1 3HA), per this session's
instruction — not a broad re-investigation (the actor-lab planning package and
`thirdwatch/deliveroo-scraper` evaluation from the prior session were reused, not repeated).

## Method

One HTTP GET, no proxy, no CAPTCHA solving, no authenticated account, no browser-fingerprint
modification, one attempt only:

```
curl -A "AspectLead-ResearchBot/1.0 (+internal lead-intelligence research; contact: zoeb@magnafoodservice.co.uk)" \
  "https://deliveroo.co.uk/restaurants?postcode=UB1%203HA"
```

The URL matches the pattern already assumed (but never tested) by
`src/lib/sources/deliveroo-public.ts`'s `deliverooSearchUrl()` helper. The Claude-in-Chrome browser
extension was unavailable this session (not connected — the same recurring limitation recorded
against ISS-0019), so a real-browser page load could not be used; a single honest HTTP request with a
descriptive, non-spoofed User-Agent was used instead — the same method already accepted for the Just
Eat detail-page test (docs/59).

## Result

**HTTP 404, 145,612 bytes, `<title>Page Not Found</title>`.**

- This is Deliveroo's own genuine 404 page, not a bot-challenge page: no "Attention Required",
  "Checking your browser", or CAPTCHA-interstitial content; no small (~4.5 KB) block-page signature
  like the one Just Eat's Cloudflare block returned (docs/59). The response is a full, normal
  Next.js-rendered page (145 KB) with Deliveroo's real site chrome.
- `client.px-cloud.net` (PerimeterX) is loaded by the page, confirming Deliveroo does use PerimeterX
  bot-management — consistent with the actor-lab's `BROWSER_PROXY_RISK_NOTE.md` inference — but it did
  not block or challenge this single request; it simply loaded as part of the page's normal script
  set (PerimeterX commonly runs passively/behaviourally rather than always presenting a challenge).
- **Conclusion: the assumed URL pattern (`?postcode=` query param) does not correspond to a real
  discovery endpoint on Deliveroo's current site.** It returns their own honest "not found" response,
  not a wrong-country or truncated result. The real public flow for setting a delivery location is
  very likely a client-side interaction (an address-search widget triggering an XHR/fetch call) that
  a static URL cannot reproduce — matching the actor-lab's own `RESEARCH_QUESTIONS.md` §1–2, which
  flagged exactly this as unknown and unanswered.

## Classification

**Not `DELIVEROO_BLOCKED_BY_CHALLENGE`** — no challenge was presented. The correct classification is:
0 real records obtained, no lawful/working discovery URL confirmed, `PROVIDER_UNAVAILABLE`.

Per the one-controlled-test limit, no further URL patterns were guessed or attempted this session.
Raw response evidence retained at
`/private/tmp/claude-501/.../scratchpad/deliveroo-response.html` (session-local, not committed —
research evidence only, no personal data).

## What this does and does not change

- Does **not** change `src/lib/sources/deliveroo-public.ts`'s runtime behaviour — it still correctly
  never fetches Deliveroo live in production code.
- Does **not** authorise any further live Deliveroo request this session (one test only, as
  instructed).
- **Does** complete the provider-neutral Deliveroo adapter regardless of this result — see
  `src/lib/discovery-engine/deliveroo/import.ts` and the updated `DeliverooAdapter.importJson`/
  `.importCsv` (docs/09_DECISIONS.md, this session).
