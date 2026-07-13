# 44 — Companies House Status Gate (NOW SPRINT)

## Purpose

This gate connects live **Companies House** data to the sales lead list for the West London pilot outcodes. For each lead it aims to:

- Verify company **legitimacy and status** against the official register.
- **HOLD** high-confidence dissolved or closed companies so telesales does not chase businesses that no longer legally exist.
- **Never exclude a lead solely because there is no company match.** Sole traders, partnerships and trading names legitimately have no Companies House record. A no-match is a warning, not a rejection.

The gate is deliberately conservative: weak, name-only matches are not trusted, and the default posture is to let a lead continue with a warning rather than wrongly remove a genuine prospect.

## Data source and access

| Item | Value |
| --- | --- |
| Base URL | `https://api.company-information.service.gov.uk` |
| Auth | HTTP Basic — API key as **username**, blank password |
| Key type | Free Companies House API key |
| Key handling | **Server-side only.** Never exposed to the client, never committed to git. |

### Endpoints used

| Endpoint | Purpose |
| --- | --- |
| `/search/companies?q=` | Find candidate companies by name / address |
| `/company/{number}` | Full profile: status, type, registered office, SIC codes |
| `/company/{number}/officers` | Directors / officers (see doc 45) |
| `/officers/{officer_id}/appointments` | Officer appointment history (see doc 45) |

## Enablement conditions

The gate performs **live API calls only when all three** of the following are true:

1. `COMPANIES_HOUSE_API_KEY` is present.
2. `COMPANIES_HOUSE_ENABLED=true`.
3. `COMPANIES_HOUSE_MAX_CALLS_PER_RUN` is greater than `0`.

| Env var | Default | Meaning |
| --- | --- | --- |
| `COMPANIES_HOUSE_API_KEY` | *(unset)* | Free API key, server-side only |
| `COMPANIES_HOUSE_ENABLED` | `false` | Master on/off switch |
| `COMPANIES_HOUSE_MAX_CALLS_PER_RUN` | `100` | Hard ceiling on API calls per run |

If **any** condition is not met, the gate runs in **disabled mode**:

- Every lead is stamped with reason code `CH_API_DISABLED`.
- Every lead **continues** with a warning.
- **Nothing is excluded** and no live calls are made.

This means the default configuration (`COMPANIES_HOUSE_ENABLED=false`) is safe: the pipeline still runs end-to-end, simply without Companies House enrichment.

## Matching approach

For each lead the gate builds a search query from the best available business identity:

- `business_name`
- `trading_name`
- a cleaned, "legal-looking" version of the name (normalised suffixes such as *Ltd*, *Limited*, punctuation and casing tidied)
- **plus** postcode / address to raise confidence

Candidates returned by `/search/companies` are then scored against the lead on:

| Signal | Used for |
| --- | --- |
| Name similarity | Primary identity match |
| Registered-office postcode / address | Location corroboration |
| Company status | Active / dissolved / liquidation / administration |
| Company type | Ltd, LLP, PLC, etc. |
| SIC codes | Sector plausibility (food service, hospitality, retail) |
| Active vs dissolved flag | Status gate decision |

**Do NOT trust weak name-only matches.** A name that matches but sits at a different postcode with no address corroboration is treated as low confidence, not a confirmed match.

## Per-lead output fields

The gate writes the following fields onto each lead record:

| Field | Description |
| --- | --- |
| `companies_house_checked` | Whether a live check was performed for this lead |
| `companies_house_status` | Company status from the register (e.g. active, dissolved, liquidation) |
| `companies_house_company_number` | Matched company registration number |
| `companies_house_company_name` | Official registered company name |
| `companies_house_company_type` | Company type (Ltd, LLP, PLC, etc.) |
| `companies_house_registered_office_address` | Registered office address |
| `companies_house_sic_codes` | SIC codes for the matched company |
| `companies_house_match_confidence` | High / medium / low / none |
| `companies_house_match_reason` | Human-readable explanation of the match decision |
| `companies_house_warnings` | Any warnings raised (no match, low confidence, cap reached, API error) |
| `companies_house_hold_reason` | Populated only when the lead is held |

## Status gate decisions

| Situation | Decision |
| --- | --- |
| High-confidence **dissolved** | **Hold / exclude** |
| High-confidence **liquidation / administration / closed** | **Hold** |
| Medium-confidence **dissolved** | **Hold** |
| **Active**, high confidence | **Continue** |
| **No match** | **Continue with warning** (never rejected on no-match alone) |
| **Low confidence** match | **Continue or hold by risk** (conservative judgement) |
| **Sole trader / unincorporated likely** | **Continue with warning** (not rejected) |

The guiding principle: a hold requires **confidence in a negative status**. Uncertainty defaults to continue-with-warning so genuine prospects are not lost.

## Reason codes

| Reason code | Meaning |
| --- | --- |
| `CH_ACTIVE_COMPANY_MATCH` | Confident match to an active company; lead continues |
| `CH_DISSOLVED_COMPANY_HOLD` | Confident match to a dissolved company; lead held |
| `CH_COMPANY_STATUS_RISK` | Liquidation / administration / closed status; lead held |
| `CH_LOW_CONFIDENCE_MATCH` | Match found but weak; continue or hold by risk |
| `CH_NO_MATCH` | No company record found; continue with warning |
| `CH_SOLE_TRADER_OR_UNINCORPORATED_POSSIBLE` | Pattern suggests sole trader / unincorporated; continue with warning |
| `CH_DIRECTORS_FOUND` | Officers retrieved for the matched company (see doc 45) |
| `CH_DIRECTORS_NOT_FOUND` | No officers retrieved for the matched company |
| `CH_CALL_CAP_REACHED` | Per-run call cap hit; lead left unchecked and continues |
| `CH_API_DISABLED` | Gate disabled by config; lead continues with warning |
| `CH_API_ERROR` | API call failed; lead continues with warning |

## Call-cap behaviour

`COMPANIES_HOUSE_MAX_CALLS_PER_RUN` sets a hard ceiling on live API calls per run (default `100`).

- Once the cap is reached, remaining leads are stamped `CH_CALL_CAP_REACHED`.
- Those leads **continue unchecked** — they are never held or excluded purely because the cap ran out.
- This keeps free-tier usage predictable while guaranteeing no lead is penalised for the pipeline running low on budget.

## Exports

| File | Contents |
| --- | --- |
| `exports/companies-house-status-summary.csv` | Per-lead check outcome, status, confidence and reason code |
| `exports/companies-house-hold-list.csv` | Leads placed on hold, with `companies_house_hold_reason` |

**Exports are gitignored and never committed.** They are internal working artefacts of a run.

## Precedence rules

- **Platform presence never overrides a customer exclusion.** If a lead is already excluded as an existing customer, appearing on Just Eat / Deliveroo / Uber Eats does not reinstate it.
- **A high-confidence dissolved company overrides platform presence.** A company that is confidently dissolved on the register but still listed on Just Eat is a **hold** — the live listing does not rescue a legally dissolved entity.
