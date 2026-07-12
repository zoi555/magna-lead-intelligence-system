# Existing Customer Import Plan (Phase 4)

Dedup/suppression against the customer master. **No real Magna customer data is used yet** — a mock
master (`src/lib/pipeline/mock-existing-customers.ts`) stands in. The matching logic is real.

## Import template

`templates/existing-customers-import-template.csv` — one row per customer:

| Field | Purpose |
|---|---|
| `customer_code` | Stable customer id (used as the match reference) |
| `customer_name` | Registered / account name |
| `trading_name` | Trading-as name (also matched) |
| `postcode` | Delivery/site postcode |
| `address` | Free-text address |
| `phone` | Contact number (used for phone matching when present) |
| `email` | Contact email |
| `status` | active / lapsed / prospect / closed |
| `last_order_date` | ISO date of last order |
| `route` | Delivery route |
| `sales_rep` | Owning rep |
| `notes` | Free text |

**Financials are NOT part of the import** and are never stored or surfaced.

## Matching rules (`src/lib/pipeline/customer-matching.ts`)

Names/postcodes are normalised (lowercase, strip `ltd/limited/the/co` + punctuation; postcode
uppercased, spaces removed; outward code extracted).

1. **Exact match → `existing_customer_match`** (confidence ~0.97) when **postcode + normalised name
   (or trading name) both match**. Also an exact **phone match** → `existing_customer_match` (~0.95).
2. **Possible match → `possible_existing_customer`** when the **name overlaps strongly (Jaccard ≥ 0.5)
   within the same outward code**. Confidence = overlap score.
3. **No match → `no_match`.**

## Why postcode-only is NOT enough to exclude

Many distinct businesses share a postcode (a parade of shops, a retail park, a high street). Excluding
on postcode alone would wrongly suppress genuine new leads. Postcode is therefore only a **grouping
key** for fuzzy name matching — it can lead to a *possible* (manual-review) match, never an automatic
exclusion on its own.

## Pipeline rules

- **Exact / high-confidence match → excluded** at `exclude_existing_customers` (reason
  `EXISTING_CUSTOMER_MATCH`). Removed from the lead set.
- **Possible match → kept but flagged** `customerMatch.status = possible_existing_customer`. Scoring
  adds the `POSSIBLE_EXISTING_CUSTOMER` manual-review flag and a small penalty; the export gate sets
  `export_status = manual_review` (held from the auto-export CSV — a human decides).
- **No match → continues** as a lead candidate.

## How real customer data will be imported later

1. Export the customer master from NetSuite / Sales Pro to the template CSV (server-side, not in the browser).
2. Load it server-side into `getCustomerMaster()` (replacing the mock), ideally with **hashed**
   name+postcode keys so raw customer identity isn't held longer than needed.
3. Run the same `matchCustomer()` logic; tune the fuzzy threshold with real data.
4. Keep it **server-only** — customer data must never reach the client bundle or the offline queue.

## Never exposed to telesales

The telesales safe view must never show: internal score, raw matching internals (confidence, match
reason, matched customer code), or any financials. Only safe operational fields
(`business_name, postcode, phone, category, trigger_reason, assigned_rep, worked_status`).
