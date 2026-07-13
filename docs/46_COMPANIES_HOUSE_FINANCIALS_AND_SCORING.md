# 46 — Companies House Financials & Financial Risk Scoring (NOW SPRINT)

## Purpose

The status gate (doc 44) uses Companies House to confirm **legitimacy, status and
directors**. This document adds a further, separate use: discovering a company's
**accounts and financial filings** and feeding them into a **financial RISK model**.

The financial model exists only to add **risk and confidence signals** to a lead. It is
**never** treated as a measure of actual or expected spend with Magna.

> **Hard rule — read first.**
>
> - Do **NOT** invent, guess, or "estimate to fill a gap" any turnover, profit, or other
>   financial figure. Use **only** what Companies House actually returns, or what can be
>   **safely parsed** from published accounts documents.
> - Do **NOT** exclude or penalise a lead **merely because financials are unavailable.**
>   Many small food businesses (sole traders, micro-entities, dormant filers) have no
>   useful structured accounts. Absence of financial data is a **warning**, never a
>   rejection and never a fabricated number.
> - Companies House accounts are a **risk/confidence input only**. They are **NEVER**
>   treated as actual spend with Magna.

---

## 1. Enablement

The financials stage uses the **same three enablement conditions** as the status gate.
Live API calls happen only when **all three** are true:

1. `COMPANIES_HOUSE_API_KEY` is present.
2. `COMPANIES_HOUSE_ENABLED=true`.
3. `COMPANIES_HOUSE_MAX_CALLS_PER_RUN` is greater than `0`.

Additional stage rules:

| Rule | Behaviour |
| --- | --- |
| **HIGH-confidence matches only** | The financials stage runs **only** for HIGH-confidence company matches. Low, medium and no-match leads are never sent to the accounts or document endpoints. |
| **Cap-aware** | The stage shares the per-run call cap (`COMPANIES_HOUSE_MAX_CALLS_PER_RUN`). |
| **Graceful degradation** | If the per-run call cap is exhausted, the stage degrades to `financials_unavailable`. This is **not a failure** — the lead continues, stamped `CH_FINANCIALS_UNAVAILABLE`. |

If the gate is disabled, or the lead is not a HIGH-confidence match, the financials stage
is simply skipped and the lead continues unaffected.

---

## 2. Endpoints used

| Endpoint | Host | Purpose |
| --- | --- | --- |
| `GET /company/{number}` | `api.company-information.service.gov.uk` | Accounts dates, accounts type, company status/type, and `links` (charges, insolvency, filing history) |
| `GET /company/{number}/filing-history?category=accounts` | `api.company-information.service.gov.uk` | The accounts filing history — most recent accounts filing, transaction id, dates, description |
| Filing item `links.document_metadata` | `api.company-information.service.gov.uk` | Document metadata for a specific accounts filing (formats available, content link) |
| Document content | **`document-api.company-information.service.gov.uk`** | The accounts document itself — fetched **only if safe and within cap** |

> **Note.** The document content API lives on a **separate host**
> (`document-api.company-information.service.gov.uk`) but uses the **same API key** and
> the same HTTP Basic auth (key as username, blank password). It still counts against the
> per-run call cap.

---

## 3. Profile / accounts fields captured

From `GET /company/{number}`:

| Field | Source |
| --- | --- |
| `accounts_next_due` | `accounts.next_due` |
| `accounts_next_made_up_to` | `accounts.next_made_up_to` |
| `accounts_last_accounts_made_up_to` | `accounts.last_accounts.made_up_to` |
| `accounts_last_accounts_type` | `accounts.last_accounts.type` |
| `confirmation_statement_next_due` | `confirmation_statement.next_due` |
| `confirmation_statement_last_made_up_to` | `confirmation_statement.last_made_up_to` |
| `company_status` | `company_status` |
| `company_type` | `type` |
| `company_age_years` | Derived from `date_of_creation` |
| `has_insolvency_link` | Presence of `links.insolvency` |
| `has_charges_link` | Presence of `links.charges` |
| `has_filing_history_link` | Presence of `links.filing_history` |

---

## 4. Accounts filing-history fields

From `GET /company/{number}/filing-history?category=accounts` (most recent accounts item):

| Field | Notes |
| --- | --- |
| `latest_accounts_filing_date` | `date` of the most recent accounts filing |
| `latest_accounts_made_up_to` | Period end the accounts are made up to |
| `latest_accounts_type` | Accounts type (e.g. micro-entity, small, full, dormant) |
| `latest_accounts_category` | Filing category (should be `accounts`) |
| `latest_accounts_description` | Human-readable filing description |
| `latest_accounts_transaction_id` | Filing transaction id |
| `latest_accounts_document_metadata_link` | `links.document_metadata` for the filing |
| `accounts_filing_overdue` | Overdue flag, **if inferable** from `accounts_next_due` vs today |
| `accounts_document_available` | Whether a document is available to fetch |
| `accounts_document_format` | Available format(s): XBRL / iXBRL / XML / XHTML / PDF |

---

## 5. Document handling

The stage prefers **machine-readable, structured** documents and refuses to fabricate
anything from an image.

| Situation | Behaviour |
| --- | --- |
| **XBRL / iXBRL / XML / XHTML available** | Fetch (within cap) and best-effort parse — see section 6. |
| **PDF only** | Do **NOT** OCR tonight. Mark `financials_pending_manual_review` and stamp `CH_PDF_ONLY_MANUAL_REVIEW`. |
| **No document available** | Mark `financials_unavailable`. **Never fail the pipeline** because documents are missing. |
| **Cap exhausted before fetch** | Degrade to `financials_unavailable` (`CH_FINANCIALS_UNAVAILABLE`). Not a failure. |

The guiding rule: a missing, unreadable, or PDF-only document produces a **warning and a
manual-review flag** — never an invented figure and never a pipeline failure.

---

## 6. Best-effort XBRL / iXBRL extraction

When a structured document is fetched, the stage attempts a **best-effort** extraction of
the fields below.

> Each field is left **`null`** if it is absent from the document. When a field cannot be
> extracted, add the warning `FINANCIAL_FIELD_NOT_AVAILABLE` for that field. **Never invent
> a value to replace a null.**

| Field | Notes |
| --- | --- |
| `turnover` | Null if absent |
| `revenue` | Null if absent |
| `gross_profit` | Null if absent |
| `operating_profit` | Null if absent |
| `profit_loss_before_tax` | Null if absent |
| `profit_loss_after_tax` | Null if absent |
| `cash_bank_in_hand` | Null if absent |
| `current_assets` | Null if absent |
| `current_liabilities` | Null if absent |
| `net_current_assets_liabilities` | Null if absent |
| `total_assets_less_current_liabilities` | Null if absent |
| `net_assets_liabilities` | Null if absent |
| `creditors_due_within_one_year` | Null if absent |
| `creditors_due_after_one_year` | Null if absent |
| `employees_average_number` | Null if absent |
| `period_start` | Reporting period start |
| `period_end` | Reporting period end |
| `currency` | Reporting currency |
| `extraction_confidence` | Confidence in the parse (high / medium / low) |
| `extraction_source` | One of: `xbrl` / `ixbrl` / `profile` / `filing_metadata` / `unavailable` |

Many micro-entity and small-company filings legitimately contain only a handful of these
(often just `net_assets_liabilities` and `cash_bank_in_hand`). That is expected — capture
what is present, null the rest, and warn.

---

## 7. Financial risk scoring

The financials feed a **financial risk band** and a **financial score component**. Signals
are split into positive (lower risk) and negative (higher risk).

### 7.1 Positive signals (lower risk / higher confidence)

| Signal | Rationale |
| --- | --- |
| Active company status | Legally trading |
| Recent accounts (made up to recently) | Up-to-date filer |
| No insolvency link | No insolvency proceedings on record |
| Accounts not overdue | Compliant filer |
| Positive net assets | Balance-sheet solvent |
| Healthy cash / bank in hand | Liquidity signal |
| Established company age | Track record |
| FSA address ↔ CH registered-office **agreement** | Identity corroboration between sources |

### 7.2 Negative / risk signals (higher risk / lower confidence)

| Signal | Rationale |
| --- | --- |
| Dissolved / liquidation / administration | Legal jeopardy — also a status-gate hold |
| Accounts overdue | Non-compliant filer |
| Old accounts (long since last made up to) | Stale picture |
| Negative net assets | Balance-sheet insolvent |
| Weak / minimal cash | Liquidity concern |
| Heavy creditors | Leverage / payables pressure |
| Insolvency link present | Insolvency proceedings on record |
| Low match confidence | Weak identity link to the financials |
| Financial document unavailable | No structured picture available |
| Too newly incorporated | No track record yet |

> **Precedence.** Financial risk **must NOT override the hard status gates** in doc 44. A
> financially healthy-looking balance sheet does **not** rescue a high-confidence dissolved
> company, and a weak balance sheet does **not** by itself hold an otherwise-active lead.
> Financial risk adjusts scoring and confidence; the status gate decides holds.

---

## 8. Reason codes

| Reason code | Meaning |
| --- | --- |
| `CH_FINANCIALS_AVAILABLE` | Financial data was found and captured |
| `CH_FINANCIALS_UNAVAILABLE` | No financial data available (or cap exhausted); lead continues |
| `CH_ACCOUNTS_RECENT` | Most recent accounts are recent |
| `CH_ACCOUNTS_OLD` | Most recent accounts are stale |
| `CH_ACCOUNTS_OVERDUE` | Accounts are overdue |
| `CH_NET_ASSETS_POSITIVE` | Net assets are positive |
| `CH_NET_ASSETS_NEGATIVE` | Net assets are negative |
| `CH_CASH_SIGNAL_POSITIVE` | Healthy cash / bank in hand |
| `CH_CASH_SIGNAL_WEAK` | Weak / minimal cash |
| `CH_INSOLVENCY_RISK` | Insolvency link or insolvency-related status present |
| `CH_CHARGES_PRESENT` | Charges (e.g. secured lending) registered against the company |
| `CH_FINANCIAL_EXTRACTION_LOW_CONFIDENCE` | Document parsed but with low extraction confidence |
| `CH_PDF_ONLY_MANUAL_REVIEW` | Only a PDF is available; flagged for manual review, not OCR'd tonight |
| `CH_XBRL_PARSED` | XBRL / iXBRL document successfully parsed |
| `CH_COMPANY_TOO_NEW` | Company too newly incorporated for a track record |
| `CH_COMPANY_ESTABLISHED` | Company established long enough to show a track record |

---

## 9. Per-lead financial output

The stage writes the following fields onto each lead record (internal):

| Field | Description |
| --- | --- |
| `companies_house_financial_status` | Overall stage outcome (available / unavailable / pending manual review) |
| `accounts_last_made_up_to` | Period end of the most recent accounts |
| `accounts_type` | Accounts type (micro-entity, small, full, dormant, etc.) |
| `financials_available` | `yes` / `no` |
| `financial_extraction_confidence` | Confidence in the extraction (high / medium / low) |
| `financial_risk_band` | `low` / `medium` / `high` / `unknown` |
| `financial_score_component` | Numeric contribution of financial risk to the internal score |
| `financial_score_reasons[]` | The reason codes that drove the financial component |
| `financial_warnings[]` | Warnings raised (unavailable, field-not-available, PDF-only, cap reached) |

---

## 10. Privacy / telesales boundary

**Financial workings, raw accounts, raw XBRL, and exact extracted values are INTERNAL
only.** This is a hard boundary.

- They are **never** placed in the telesales-safe export or the tomorrow-sales export.
- The sales list may show **only** the coarse, safe summary fields below.

### Fields allowed on the sales list

| Field | Notes |
| --- | --- |
| `companies_house_status` | Register status only |
| `companies_house_match_confidence` | High / medium / low / none |
| `financial_risk_band` | Coarse band only — low / medium / high / unknown |
| `accounts_last_made_up_to` | Date only — a freshness signal, not a figure |
| `companies_house_warning_summary` | Short, human-readable warning summary |
| `estimated_monthly_value_band` | Coarse commercial band (see doc 42) |
| `estimated_opportunity_value_band` | Coarse commercial band (see doc 42) |

Exact turnover / profit / cash / net-asset values, XBRL, and the raw score workings must
**never** leave the internal files.

---

## 11. Internal export files

| File | Contents |
| --- | --- |
| `exports/companies-house-financials-summary.csv` | Per-lead accounts data, extracted fields, extraction source/confidence |
| `exports/companies-house-financial-risk-report.csv` | Per-lead financial risk band, score component, and reason codes |

Both are **internal, gitignored, and never committed.**

---

## 12. Pipeline order

The financials stage sits between directors enrichment and the LinkedIn research queue:

```
customer_exclusion
  → companies_house_status_gate
  → companies_house_directors_enrichment
  → companies_house_financials_stage
  → linkedin_research_queue_generation
  → commercial_calculation
  → score_candidates
  → export_review_gate
```
