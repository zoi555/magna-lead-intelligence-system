# 55 — Data Completeness and Source Coverage Report

## Purpose

This document explains the data-completeness scoring model that lives in
`src/lib/pipeline/data-completeness.ts`. The model answers one practical
question for every lead we hold: **how ready is this record for a salesperson
to pick up and act on?**

It does this by scoring each lead from 0 to 100 based on which fields are
present, grouping leads into plain-English readiness bands, and rolling the
whole dataset up into a single report. Crucially, when the dataset falls short
of our target it tells us **exactly which data source to enable** to close the
gap.

## The completeness model

Every lead is scored against thirteen fields. Each field carries a weight, and
the weights add up to 100. A lead's score is simply the sum of the weights of
the fields it actually has. So a record with every field filled in scores 100,
and a record with nothing scores 0.

A field counts as "present" when:

- **Text fields** (business name, address, postcode, phone, website, platform
  URL, source evidence URL) contain a non-empty, non-whitespace value.
- **Check/flag fields** (FSA record, Google place, rating or review count,
  customer exclusion checked, Companies House checked, coordinates) are
  explicitly `true`.

Anything else — `null`, `undefined`, an empty string, or `false` — counts as
missing.

## Field weights

The weights reflect how much each field matters to a salesperson. Identity and
contact details are worth the most; "nice to have" background signals are worth
the least. The full list, summing to 100:

| Field                       | Weight | Why it matters                                        |
| --------------------------- | -----: | ----------------------------------------------------- |
| Business name               |     12 | You cannot approach a lead you cannot name.           |
| Trading address             |     12 | Needed to route, territory-map and visit the lead.    |
| Phone                       |     12 | The primary way sales makes first contact.            |
| Postcode                    |     10 | Drives territory and delivery-radius logic.           |
| Platform URL                |     10 | Evidence of an active delivery/ordering presence.     |
| Website                     |      8 | Adds credibility and a second contact route.          |
| FSA record                  |      8 | Confirms the business is real and food-registered.    |
| Google place                |      6 | Confirms a physical, findable location.               |
| Rating or review count      |      6 | Signals how established and busy the business is.      |
| Customer exclusion checked  |      6 | Confirms we are not chasing an existing customer.      |
| Companies House checked     |      4 | Confirms legal entity and trading status.             |
| Source evidence URL         |      4 | Provides an audit trail for where the lead came from.  |
| Coordinates                 |      2 | Convenience for mapping; derivable from postcode.     |
| **Total**                   | **100** |                                                       |

These weights are the single source of truth in code — see `FIELD_WEIGHTS` in
`data-completeness.ts`. If a weight changes there, update this table.

## Readiness bands

Each score maps to one of four bands:

| Band       | Score range | Meaning                                                        |
| ---------- | ----------- | -------------------------------------------------------------- |
| **ready**  | 80–100      | Sales-ready. Enough to name, locate and contact the lead.      |
| **usable** | 60–79       | Workable but with gaps; needs light enrichment before contact. |
| **weak**   | 40–59       | Thin record; needs real enrichment before it is worth pursuing. |
| **poor**   | below 40    | Not yet a lead — little more than a name.                      |

## Per-lead output

`scoreCompleteness(input)` returns, for a single lead:

- **`data_completeness_score`** — the 0–100 score.
- **`completeness_band`** — `ready`, `usable`, `weak` or `poor`.
- **`missing_fields`** — the exact fields that are absent.
- **`enrichment_needed`** — the data sources that would fill those gaps, with
  no duplicates. For example a missing phone maps to
  `google_places_or_platform`, a missing website to `google_places`, a missing
  platform URL to `platform_collector`, and a missing Companies House check to
  `companies_house`.
- **`present_count`** — how many of the thirteen fields are present.
- **`weighted_total`** — the summed weight (identical to the score; kept
  separate for readability in reports).

## Dataset aggregate report

`aggregateCompleteness(results)` rolls a batch of per-lead results into a
dataset-level report with these fields:

- **`average`** — the mean completeness score across all leads. This is the
  headline number we track against our target.
- **`over80`** — count of leads scoring 80 or more (i.e. sales-ready).
- **`band_60_79`** — count of leads in the 60–79 (usable) range.
- **`below60`** — count of leads scoring under 60 (weak or poor).
- **`topMissingFields`** — the fields most often missing across the dataset,
  ordered from most to least common. This is the key diagnostic: it tells us
  which single gap, if closed, would lift the most records.

An empty input returns all-zero counts and an empty `topMissingFields` list.

## The 80%+ target and closing the gap

**A dataset is considered sales-ready when at least 80% of its leads score in
the `ready` band (80+), and ideally when the average score is 80 or above.**

If we are below that target, the report is designed to point straight at the
fix rather than leave us guessing:

1. Read `topMissingFields` from the aggregate. The field at the top is the one
   holding the most records back.
2. Map that field to its source using the `enrichment_needed` values on the
   individual results (or the table below). Enabling that source is the single
   highest-leverage action.

| Missing field(s)             | Enable this source                        |
| ---------------------------- | ----------------------------------------- |
| Phone                        | Google Places (or the platform collector) |
| Website                      | Google Places                             |
| Google place, rating/reviews | Google Places                             |
| Platform URL                 | Platform collector (e.g. Just Eat)        |
| FSA record                   | FSA matcher                               |
| Address, postcode            | FSA or Google Places                      |
| Companies House checked      | Companies House                           |
| Customer exclusion checked   | Existing-customer exclusion list          |
| Source evidence URL          | Source collector                          |
| Coordinates                  | Google Places or a geocoder               |

**Worked example.** Suppose a run of 1,000 leads scores an average of 71 with
only 58% in the `ready` band, and `topMissingFields` shows `phone` and
`website` at the top. Both map to Google Places. The report's conclusion is
therefore explicit: *enabling Google Places is the action required to reach the
80%+ sales-ready target.* No further investigation is needed to know where to
spend effort.

## Verification

The module ships with an exported `__selfTest()` (not auto-run). It asserts
that a fully-populated input scores 100 and lands in `ready`, that an
almost-empty input scores under 40 and lands in `poor`, and that the aggregate
correctly counts one record over 80 and one below 60. Call it from a script or
REPL to confirm the scoring behaves as documented.
