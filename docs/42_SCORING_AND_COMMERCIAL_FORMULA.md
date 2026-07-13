# 42 — Scoring & Commercial Formula (NOW SPRINT)

An **estimated, assumption-based** commercial value and an internal score per lead, used
only to help prioritise which leads telesales work first.

> **Disclaimer — read first.**
>
> - Every commercial figure produced by this model is **ESTIMATED and ASSUMPTION-BASED**.
>   Nothing here is a quote, a price, a forecast, or a guarantee of revenue or profit. The
>   numbers exist to rank leads relative to each other, nothing more.
> - **Companies House accounts are a risk/confidence input ONLY.** They are **NEVER**
>   treated as actual or expected spend with Magna. A company's filed turnover is not its
>   spend with us.
> - The raw workings (pounds-and-pence values and multipliers) are **internal-audit
>   only.** They must **NOT** appear in the telesales export. The sales list may show
>   **only coarse value/opportunity bands** (Low / Medium / High / Very High) — never the
>   underlying figures.

> **Supersedes.** This document supersedes `docs/42_COMMERCIAL_VALUE_MODEL_NOW.md`, which
> is retained for history. Where the two differ, **this document is authoritative** — it
> adds the `financial_confidence_factor` and the internal scoring inputs.

---

## 1. Formula

```
estimated_monthly_value        = category_baseline_monthly_spend
                                 × territory_fit_factor
                                 × platform_presence_factor
                                 × contactability_factor
                                 × business_type_fit_factor
                                 × financial_confidence_factor
                                 × confidence_factor

estimated_monthly_gross_profit = estimated_monthly_value × expected_gross_margin_percent

expected_opportunity_value     = estimated_monthly_gross_profit × expected_conversion_probability
```

- **category_baseline_monthly_spend** — a starting monthly spend figure for the venue
  category tier.
- The six multipliers each scale that baseline up or down (all roughly **0.5–1.2**).
- **expected_gross_margin_percent** turns estimated spend into estimated gross profit.
- **expected_conversion_probability** discounts that profit by how likely the lead is to
  convert, based on its grade (A / B / C / D).

Because it is a chain of multipliers, a weak signal anywhere (say
`financial_confidence_factor = 0.60`) pulls the whole estimate down — which is the
intended, cautious behaviour.

---

## 2. The `financial_confidence_factor`

This is the new multiplier that connects the Companies House financial risk band (doc 46)
into the commercial model. It reflects **confidence**, not spend — a high-risk company is
dampened because we are less sure of it, not because its accounts are treated as spend.

| Financial risk band (doc 46) | `financial_confidence_factor` |
| --- | --- |
| **low** risk | `1.10` |
| **medium** risk | `1.00` |
| **unknown** (no data) | `0.90` |
| **high** risk | `0.60` |

> **Hold / exclude, not scored.** A **high-confidence** dissolved / closed / insolvency
> status is a **status-gate HOLD** (doc 44). Such leads are **not scored at all** — they
> never reach the commercial calculation. The `0.60` factor applies only to *active* leads
> that carry a **high financial-risk band**, not to leads held by the status gate.

The `unknown` band (financials genuinely unavailable) is dampened only slightly to `0.90`
— consistent with the doc 46 rule that **absence of financial data is a warning, never a
rejection.**

---

## 3. Assumptions (`src/config/commercial-assumptions.ts`)

> **All values below are `[ASSUMPTION]` placeholders.** They are sensible-looking numbers
> chosen so the model runs and ranks leads. They must be replaced with
> **finance-approved Magna Food Service figures** before any of the money values are
> treated as meaningful.

### 3.1 Category baseline (estimated monthly spend)

| Category tier | Example venue types | `category_baseline_monthly_spend` (£/month) |
| --- | --- | --- |
| HIGH | Takeaway, restaurant | `2,000` `[ASSUMPTION]` |
| MEDIUM | Pub, bar | `1,200` `[ASSUMPTION]` |
| LOW | Cafe, other | `600` `[ASSUMPTION]` |

### 3.2 Expected gross margin

| Parameter | Value |
| --- | --- |
| `expected_gross_margin_percent` | `0.25` (25%) `[ASSUMPTION]` |

### 3.3 Expected conversion probability by grade

| Grade | `expected_conversion_probability` |
| --- | --- |
| A | `0.40` `[ASSUMPTION]` |
| B | `0.25` `[ASSUMPTION]` |
| C | `0.12` `[ASSUMPTION]` |
| D | `0.05` `[ASSUMPTION]` |

### 3.4 Multiplier ranges

Each multiplier sits roughly in the range **0.5–1.2** (below 1.0 dampens, above 1.0 lifts).

| Multiplier | What it reflects | Range |
| --- | --- | --- |
| `territory_fit_factor` | How well the venue sits within a served delivery territory | `0.5 – 1.2` `[ASSUMPTION]` |
| `platform_presence_factor` | Presence / activity on delivery platforms (signal of turnover) | `0.5 – 1.2` `[ASSUMPTION]` |
| `contactability_factor` | How reachable the decision-maker is (phone / email present) | `0.5 – 1.2` `[ASSUMPTION]` |
| `business_type_fit_factor` | How well the business type fits our product range | `0.5 – 1.2` `[ASSUMPTION]` |
| `financial_confidence_factor` | Companies House financial risk band (doc 46) | `0.60 – 1.10` `[ASSUMPTION]` |
| `confidence_factor` | Overall data confidence for the lead | `0.5 – 1.2` `[ASSUMPTION]` |

> Every figure in this section is a placeholder pending sign-off by Magna finance. Nothing
> here should be quoted to a customer or reported as a real value.

---

## 4. Output fields per lead (internal)

Computed and stored per lead for the internal audit:

| Field | Description |
| --- | --- |
| `estimated_monthly_value` | Result of the first formula line (£/month, estimated). |
| `estimated_monthly_gross_profit` | `estimated_monthly_value × expected_gross_margin_percent` (£/month, estimated). |
| `expected_opportunity_value` | `estimated_monthly_gross_profit × expected_conversion_probability` (£/month, estimated). |
| `estimated_monthly_value_band` | Coarse band for the monthly value — Low / Medium / High / Very High. |
| `estimated_opportunity_value_band` | Coarse band for the opportunity value — Low / Medium / High / Very High. |

The two **band** fields are the only commercial outputs allowed onto the telesales sales
list. The raw money fields and all multipliers stay internal.

---

## 5. Scoring inputs (internal 0–100 score)

Separately from the commercial value, each lead is given an **internal 0–100 score** used
for ranking. The score is fed by reason codes from across the pipeline:

| Input source | Feeds the score via | Doc |
| --- | --- | --- |
| **FSA legitimacy** | Food-hygiene registration / rating signals that the business is a real, operating venue | FSA source |
| **Just Eat presence** | Active delivery-platform listing as a turnover / activity signal | doc 43 |
| **Companies House status** | Active / dissolved / liquidation status and match confidence | doc 44 |
| **Financial-risk reason codes** | `CH_ACCOUNTS_RECENT`, `CH_NET_ASSETS_POSITIVE`, `CH_CASH_SIGNAL_POSITIVE`, `CH_INSOLVENCY_RISK`, `CH_ACCOUNTS_OVERDUE`, `CH_FINANCIALS_UNAVAILABLE`, etc. | doc 46 |

> **The 0–100 score is INTERNAL.** It is used for ranking and prioritisation only and must
> **never** appear in the telesales-safe export. Only the coarse bands (section 4) and the
> safe summary fields listed in doc 46 §10 reach the sales list.

---

## 6. Export

| File | Contents | Audience |
| --- | --- | --- |
| `exports/commercial-calculation-summary.csv` | Per-lead: every input multiplier (including `financial_confidence_factor`), the baseline, margin, conversion probability, all three raw money values, the internal score, and the two bands. Full workings. | **Internal audit only** (gitignored). |

**Sales list rule.** The telesales export may include `estimated_monthly_value_band` and
`estimated_opportunity_value_band` **only**. It must never carry `estimated_monthly_value`,
`estimated_monthly_gross_profit`, `expected_opportunity_value`, the internal 0–100 score, or
any of the multipliers. Bands communicate priority without implying a price.
