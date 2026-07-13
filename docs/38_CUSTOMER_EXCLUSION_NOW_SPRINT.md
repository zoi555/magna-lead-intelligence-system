# 38 — Customer Exclusion (NOW Sprint)

Keep the sales lead list clear of existing and known accounts, so telesales never
call a business we already serve. This is a suppression layer that sits between the
enriched lead pipeline and the telesales export gate.

> **Respectful naming — non-negotiable.** We never use the phrase "dead customer",
> and it must not appear anywhere in code, data, exports, or UI. Accounts are described
> only with the account-status names defined below. A lapsed account is a relationship
> we may re-open, not a write-off.

---

## 1. Purpose

- **Keep the sales list free of existing/known accounts.** Any lead that matches a
  customer record is gated out of the telesales export.
- **Flag ambiguous matches for manual review.** Where a match is plausible but not
  certain, the lead is held rather than excluded or exported, so a human decides.
- **Never silently drop — keep-and-flag.** Nothing is deleted. Every lead stays in the
  internal audit with its decision recorded. Exclusion is a *gate on the sales list*,
  not a removal from the data. This means we can always show why a lead was withheld.

The principle is: **decide once, record forever, gate the export.**

---

## 2. Import location

Load your customer master export into one of these paths (first match wins):

| Order | Path |
|---|---|
| 1 | `imports/customer-list.csv` |
| 2 | `imports/customers.csv` |
| 3 | `imports/sales-pro-customers.csv` |
| 4 | `data/imports/customer-list.csv` |

> **Customer data is NEVER committed.** `imports/` and `data/imports/` are gitignored.
> Only the template (below) and this documentation live in the repo. Real customer
> exports stay on the local machine.

If none of these files is present, the run continues but the sales list is flagged as
unguaranteed — see [section 7](#7-risk-no-customer-list-loaded).

---

## 3. CSV format (flexible)

The importer **auto-detects common column names**, so a raw Sales-Pro or accounts export
usually works without editing. It looks for columns matching, in any casing or spacing:

| Concept | Column names auto-detected |
|---|---|
| Account code / id | `account_code`, `account code`, `account id`, `code`, `customer_code`, `id` |
| Business name | `business_name`, `business name`, `name`, `customer_name`, `trading_name` |
| Postcode | `postcode`, `post code`, `zip` |
| Phone | `phone`, `telephone`, `tel`, `contact number` |
| Status | `account_status`, `status`, `account status` |

### Template

`templates/customer-exclusion-import-template.csv`

| Column | Purpose |
|---|---|
| `account_code` | Stable account id — the strongest match key |
| `business_name` | Account / trading name |
| `postcode` | Site postcode |
| `phone` | Contact number |
| `account_status` | One of the account-status names in section 4 |

Only these five columns are needed. Financial data is **not** imported and is never
stored or surfaced.

---

## 4. Account status naming

These are the only permitted status names. They replace **all** "dead customer" language.

| Status | Meaning |
|---|---|
| **Active Account** | A current customer ordering now. Always excluded from the sales list. |
| **Dormant Account** | A real account with no recent orders — quiet, not lost. Excluded from the cold sales list (re-activation is handled separately, not by telesales cold calling). |
| **Former / Closed Account** | A relationship that has ended or the account is closed. Excluded from the sales list to avoid re-approaching as if new. |
| **Possible Existing Account** | A lead that *probably* matches a customer but is not certain. Held for manual review — a person confirms before it is excluded or released. |
| **Unknown Existing Account** | A lead flagged as possibly ours by a weak signal (e.g. postcode only). Held for manual review. |
| **New Prospect Candidate** | No match against the customer list. Clear to proceed to the sales list. |

The first three are applied from the customer record itself when there is a confident
match. The middle two are decisions the matcher assigns when it is unsure. The last is
the default for genuinely new leads.

---

## 5. Matching rules

Names and postcodes are normalised before comparison (lowercase, strip
`ltd/limited/the/co` and punctuation; postcode uppercased, spaces removed, outward code
extracted). Fuzzy name scores run 0.0–1.0.

| Signal | Score / condition | Decision | Status applied |
|---|---|---|---|
| Exact account code / id match | — | **Exclude** | Active / Dormant / Former, as per the customer record |
| Exact phone match | — | **Exclude** | as per the customer record |
| Exact name **and** postcode match | — | **Exclude** | as per the customer record |
| Fuzzy name match | `>= 0.7` | **Exclude** | as per the customer record |
| Fuzzy name match | `0.4 – 0.7` | **Hold** | Possible Existing Account |
| Postcode-only weak match | postcode matches, nothing else | **Hold** | Unknown Existing Account |
| No match | — | **Proceed** | New Prospect Candidate |

Strongest signal wins. An exact code, phone, or name+postcode match always excludes,
regardless of the fuzzy score.

---

## 6. Decisions and the export gate

Every lead ends a run with exactly one decision, which maps to an export-gate state:

| Decision | Meaning | Export gate state | On the sales list? |
|---|---|---|---|
| **exclude** | Confident match to an existing/known account | `excluded_customer` | No |
| **hold** | Ambiguous — needs a human | `manual_review` | No (pending review) |
| **proceed** | New prospect, no match | `ready_for_review` | Yes |

`hold` leads are surfaced in the manual-review queue. Once a reviewer confirms, they are
either moved to `excluded_customer` or released to `ready_for_review`.

When a customer list **is** loaded and applied, the run records the reason code
**`STRICT_CUSTOMER_EXCLUSION_APPLIED`** against the export, so downstream users can see
the suppression ran.

---

## 7. Risk: no customer list loaded

If no file is found at any of the [import locations](#2-import-location):

- The sales list is labelled **"NOT GUARANTEED AGAINST EXISTING CUSTOMERS"**.
- A warning is raised with the code **`CUSTOMER_LIST_NOT_LOADED_RISK`**.
- The run still completes — leads default to New Prospect Candidate — but the label and
  warning make clear the list has **not** been checked against real accounts.

This is deliberate: we never block a run for a missing list, but we also never let an
unchecked list look safe.

---

## 8. Exports

Both are written to the gitignored `exports/` directory (never committed):

| File | Contents |
|---|---|
| `exports/customer-exclusion-matches.csv` | One row per matched lead — the lead, the customer record it matched, the signal, the fuzzy score, the decision, and the status applied. The audit trail. |
| `exports/customer-exclusion-summary.json` | Run-level summary — counts by decision (exclude / hold / proceed), counts by status, whether a list was loaded, and the reason/warning codes raised. |

These are for internal audit. The telesales sales list itself contains only leads with a
`ready_for_review` gate state.
