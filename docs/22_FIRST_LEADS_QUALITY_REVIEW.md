# First Leads — Quality Review

Latest run: **RUN-20260712-111501** (live FSA pull, West London pilot UB1/UB2/UB6/HA0/HA9/W5).
Reports: `exports/reports/first-leads-quality-summary.json`, `top-50-leads.csv`, `weak-leads.csv`,
`manual-review-leads.csv`. Regenerate: `npm run leads:analyse`. Rebuild leads: `npm run leads:first`.

## Funnel (latest)

| Stage | Out | Rejected |
|---|---|---|
| FSA fetched | 1,200 | — |
| Validate postcodes | 1,066 | 134 (invalid) |
| Territory filter | 1,066 | 0 |
| Category filter | 864 | **202 excluded** |
| Dedupe | 800 | 64 |
| Exclude existing customers | 799 | 1 exact match |
| Score | 799 | 0 |
| Export review gate | 799 | **333 → manual/held** |
| **Export-eligible (CSV)** | **466** | — |

Final leads (JSON): **799**. Export-eligible CSV rows: **466**. Telesales-safe rows: **466**.

## Before / after (Phase 2–3 improvements)

| Metric | Before (hard foodservice filter) | After (category tiers + rescored) |
|---|---|---|
| Final leads | 435 | 799 (keep+downgrade, not hard-exclude) |
| Grade A | 46 | 44 |
| Grade B | 342 | 415 |
| Grade C | 47 | 339 |
| Grade D | 0 | 1 |
| Avg score | 66 | 56 (better discrimination) |
| Export-eligible | 435 (all) | **466** (manual/held separated) |
| Manual-review / held | 0 | **333** |
| Category tiers | none | HIGH 406 · MANUAL_REVIEW 238 · LOW 110 · MEDIUM 45 |

**What changed:**
- **Category tiers** replace the binary foodservice filter. Only obvious non-food/farm/excluded types
  are dropped (202). Schools, care homes, hospitals, mobile caterers, supermarkets and unclear
  retailers are **downgraded to LOW/MANUAL_REVIEW** rather than silently kept as prospects.
- **Rescored** with explainable weights (category fit, territory, FSA rating + recency, data
  completeness, coordinate quality, enrichment status, duplicate/existing-customer risk) →
  `score/grade/score_reasons/warnings/disqualifiers/manual_review_flags`.
- **Manual-review routing:** any manual flag (institutional category, missing coordinates, possible
  existing-customer, duplicate-risk) sets `export_status = manual_review` and is held from the
  auto-export CSV (466 clean vs 333 manual/held).

**Downgraded to manual review (238 final MANUAL_REVIEW):** Caring Premises, School/college, Hospitals/
childcare, Mobile caterers with weak data, community halls/clubs.
**Excluded (202):** farms/growers, non-food retailers, hardware/pharmacy-type names, distributors
without a food name.

## Remaining weaknesses

- **No phone** on any lead (799) — Google Places disabled; `MISSING_PHONE` on all. Phase 7 makes it key-ready.
- **Companies House / Google / delivery unchecked** → `COMPANY_NOT_ENRICHED` / `GOOGLE_NOT_ENRICHED` /
  `PLATFORM_NOT_CHECKED` warnings on most leads. Not blockers.
- **42 leads missing coordinates** (cannot be mapped) → flagged + down-weighted.
- **Duplicate-looking:** ~33 name groups (chains e.g. McDonalds/Greggs) → flagged as duplicate-risk / manual.
- FSA rating is 5★ for ~89% of records, so it discriminates weakly on its own; category fit now carries most of the signal.

## Top 20 best leads (latest)
| Business | Postcode | Terr | Type | FSA | Grade | Score | Fit |
|---|---|---|---|---|---|---|---|
| Amigos Burgers Southall | UB1 1DW | UB1 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Motimahal | UB1 1QF | UB1 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Noor Mahal Sweets | UB1 1LW | UB1 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Punjabi Junction | UB1 2HD | UB1 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Roti Shack | UB1 3AF | UB1 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Spice Village | UB1 1LX | UB1 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| The Good Shepherds | UB1 2HE | UB1 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Apna Pind | UB2 4DG | UB2 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Chicken Guys | UB6 9PN | UB6 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Japanese Hotplate Kitchen | UB6 0GR | UB6 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Kluseczka | UB6 7LA | UB6 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Rocco's Pizza Greenford | UB6 9RZ | UB6 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Adam's Pizza & Grill | HA0 4PJ | HA0 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Ambala | HA0 4QL | HA0 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Jalsa Sweets and Savouries | HA0 3EP | HA0 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Kebabish / Grill Spot | HA0 4TL | HA0 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Lucky 13 Goan Treats Limited (Unit 1-2) & Basement Unit 10) | HA0 2DJ | HA0 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Passion Events UK, Dabeli Hut, Indian Bites | HA0 3HG | HA0 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |
| Alpasha Grill | HA9 6AH | HA9 | Takeaway/sandwich shop | 5 | A | 80 | HIGH |
| Big Moe's Diner | HA9 0FD | HA9 | Restaurant/Cafe/Canteen | 5 | A | 80 | HIGH |

## Top 20 manual-review leads (latest)
| Business | Postcode | Terr | Type | FSA | Grade | Score | Fit |
|---|---|---|---|---|---|---|---|
| Kulcha Express | UB1 1RD | UB1 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| McDonalds | UB1 1NN | UB1 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Pepes Piri Piri | UB1 1NN | UB1 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Chicken Valley | UB2 4AN | UB2 | Takeaway/sandwich shop | 5 | A | 77 | HIGH |
| German Doner Kebab | UB6 9BE | UB6 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Ladudu Kitchen | HA0 1DY | HA0 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Five Guys | HA9 0HP | HA9 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Chicken Valley | W5 3HU | W5 | Restaurant/Cafe/Canteen | 5 | A | 77 | HIGH |
| Domino's Pizza | UB1 2NN | UB1 | Takeaway/sandwich shop | 5 | B | 63 | HIGH |
| German Doner Kebab | UB1 1LP | UB1 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Karak Chaii | UB1 1LN | UB1 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| SpicySub | UB1 1JR | UB1 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Subway | UB1 3DA | UB1 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Karak Chaii | UB2 4BQ | UB2 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Kulcha Express | UB2 4BQ | UB2 | Takeaway/sandwich shop | 5 | B | 63 | HIGH |
| Pepe's Piri Piri | UB2 4BQ | UB2 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Chaiiwala | UB6 9PN | UB6 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Costa Coffee | UB6 9BE | UB6 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| Costa Coffee | UB6 0UW | UB6 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
| KFC | UB6 9PH | UB6 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |

_Full lists: exports/reports/top-50-leads.csv, weak-leads.csv, manual-review-leads.csv._
