# 51 — Reviews and Ratings Data Strategy

## Purpose

Ratings and reviews are used **only** as **aggregate trading-activity signals**. We treat a business's public rating and its volume of reviews as a proxy for how busy and established it is — nothing more. We do **not** collect, store, or process the content of individual reviews or any information about the people who wrote them.

The intent is to answer questions like "does this business show signs of active, healthy trading?" — not "what do customers say?" and never "who are these customers?".

## What we collect

Where the data is **publicly available**, we may collect the following aggregate fields per business:

- Platform rating (the headline star/score value shown on the source platform)
- Platform review count (the total number of reviews the platform reports)
- Google rating (the headline score from Google)
- Google review count (the total number of Google reviews reported)
- Source URL (the public page the figures were read from)
- Fetched date (the date we read the figures)

These are all **summary numbers plus provenance**. They describe the business in aggregate, not any individual.

## What we NEVER collect

- Full review text (partial or complete)
- Reviewer names, usernames, handles, or profile links
- Any customer or reviewer personal data of any kind
- Photos, quotes, or other reviewer-generated content

We also **never bulk-copy reviews** or scrape review bodies en masse. If a figure is not publicly available as a simple aggregate, we do without it.

## How ratings and reviews feed scoring

Ratings and review counts are **soft signals** that adjust a lead's trading-activity picture. They never act alone and they are never treated as personal or reputational judgements.

- **High review count + good rating** → stronger evidence of active, established trading.
- **Very low rating** → a **warning** signal worth flagging (possible instability or a struggling site), not an automatic reject.
- **Many reviews + a clear platform presence** → a **high-demand** signal (busy, visible business).
- **No reviews found** → treated as **absence of a signal, NOT an automatic reject.** Many perfectly good prospects have little or no public review footprint.

The guiding principle: reviews can *raise* confidence or *raise a flag*, but the absence of reviews should never sink a lead on its own.

## Reason codes

Each reason code below is emitted with the aggregate figures and provenance that triggered it, so scoring decisions stay auditable.

| Reason code | Meaning | Typical trigger |
| --- | --- | --- |
| `PLATFORM_REVIEW_COUNT_HIGH` | Platform review volume is high enough to indicate a busy, established business. | Platform review count ≥ high threshold |
| `PLATFORM_RATING_STRONG` | Platform rating is strong, reinforcing healthy trading activity. | Platform rating ≥ strong threshold |
| `PLATFORM_RATING_WEAK` | Platform rating is weak — raised as a warning, not a reject. | Platform rating < weak threshold |
| `GOOGLE_REVIEW_SIGNAL` | Google rating and/or review count contributes a demand/activity signal. | Google rating and review count present and meaningful |
| `REVIEWS_NOT_AVAILABLE` | No public review data could be found. Neutral — never an automatic reject. | No platform or Google review figures available |

## Suggested thresholds

> **These are tunable assumptions**, not fixed rules. They are starting points to be reviewed against real lead data and adjusted. Treat every value below as `[ASSUMED]` until calibrated.

| Signal | Threshold | Notes |
| --- | --- | --- |
| Rating — strong | ≥ 4.3 | Applies to both platform and Google ratings. |
| Rating — weak | < 3.5 | Triggers a warning reason code, not a reject. |
| Review count — high | ≥ 50 | Indicates meaningful review volume / busy trading. |

The band between "weak" and "strong" (e.g. 3.5–4.3) is intentionally neutral — it neither boosts nor flags a lead.

## Data retention

- We store only the **aggregate** `rating` and `review_count` values internally, always alongside the **source URL** and **fetched date**.
- We **never** store review text, reviewer identities, or any data in a form that could identify an individual.
- Because the retained data is purely aggregate summary figures plus provenance, it carries no personal data and can be refreshed or discarded without individual-level considerations.

## Cross-references

- **Doc 49 — Platform collector**: defines how platform rating and platform review count are collected. This document governs *how those figures may be used and what must never be collected*.
- **Doc 28 — Google Places**: defines how Google rating and Google review count are obtained. This document governs *their aggregate-only use and retention*.
