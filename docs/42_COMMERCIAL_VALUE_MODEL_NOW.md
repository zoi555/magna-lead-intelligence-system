# 42 — Commercial Value Model (NOW)

An **estimated, assumption-based** commercial value per lead, used only to help
prioritise which leads telesales work first.

> **Disclaimer — read first.**
> Every figure produced by this model is **ESTIMATED and ASSUMPTION-BASED**. Nothing here
> is a quote, a price, a forecast, or a guarantee of revenue or profit. The numbers exist
> to rank leads relative to each other, nothing more.
>
> The raw workings (pounds-and-pence values and multipliers) are **internal-audit only**.
> They must **NOT** appear in the telesales export. The sales list may show **only coarse
> value/opportunity bands** (Low / Medium / High / Very High) — never the underlying
> figures.

---

## 1. Formula

```
estimated_monthly_value = category_baseline
                          × territory_fit
                          × platform_presence
                          × contactability
                          × business_type_fit
                          × confidence

gross_profit            = estimated_monthly_value × margin_percent

opportunity_value       = gross_profit × conversion_probability
```

- **category_baseline** — a starting monthly spend figure for the venue category.
- The five multipliers each scale that baseline up or down (all roughly 0.5–1.2).
- **margin_percent** turns estimated spend into estimated gross profit.
- **conversion_probability** discounts that profit by how likely the lead is to convert,
  based on its grade.

Because it is a chain of multipliers, a weak signal anywhere (say `confidence = 0.5`)
pulls the whole estimate down — which is the intended, cautious behaviour.

---

## 2. Assumptions (`src/config/commercial-assumptions.ts`)

> **All values below are `[ASSUMPTION]` placeholders.** They are sensible-looking numbers
> chosen so the model runs and ranks leads. They must be replaced with real
> Magna Food Service figures before any of the money values are treated as meaningful.

### 2.1 Category baseline (estimated monthly spend)

| Category tier | Example venue types | `category_baseline` (£/month) |
|---|---|---|
| HIGH | Takeaway, restaurant | `2,000` `[ASSUMPTION]` |
| MEDIUM | Pub, bar | `1,200` `[ASSUMPTION]` |
| LOW | Cafe, other | `600` `[ASSUMPTION]` |

### 2.2 Default margin

| Parameter | Value |
|---|---|
| `margin_percent` | `0.25` (25%) `[ASSUMPTION]` |

### 2.3 Conversion probability by grade

| Grade | `conversion_probability` |
|---|---|
| A | `0.40` `[ASSUMPTION]` |
| B | `0.25` `[ASSUMPTION]` |
| C | `0.12` `[ASSUMPTION]` |
| D | `0.05` `[ASSUMPTION]` |

### 2.4 Multiplier ranges

Each multiplier sits roughly in the range **0.5–1.2** (below 1.0 dampens, above 1.0 lifts).

| Multiplier | What it reflects | Range |
|---|---|---|
| `territory_fit` | How well the venue sits within a served delivery territory | `0.5 – 1.2` `[ASSUMPTION]` |
| `platform_presence` | Presence/activity on delivery platforms (signal of turnover) | `0.5 – 1.2` `[ASSUMPTION]` |
| `contactability` | How reachable the decision-maker is (phone/email present) | `0.5 – 1.2` `[ASSUMPTION]` |
| `business_type_fit` | How well the business type fits our product range | `0.5 – 1.2` `[ASSUMPTION]` |
| `confidence` | Overall data confidence for the lead | `0.5 – 1.2` `[ASSUMPTION]` |

---

## 3. Output fields per lead (internal)

Computed and stored per lead for the internal audit:

| Field | Description |
|---|---|
| `estimated_monthly_value` | Result of the first formula line (£/month, estimated). |
| `estimated_gross_profit` | `estimated_monthly_value × margin_percent` (£/month, estimated). |
| `estimated_opportunity_value` | `estimated_gross_profit × conversion_probability` (£/month, estimated). |
| `estimated_monthly_value_band` | Coarse band for the monthly value — Low / Medium / High / Very High. |
| `estimated_opportunity_value_band` | Coarse band for the opportunity value — Low / Medium / High / Very High. |

The two **band** fields are the only commercial outputs allowed onto the telesales sales
list. The three raw money fields stay internal.

---

## 4. Export

| File | Contents | Audience |
|---|---|---|
| `exports/commercial-calculation-summary.csv` | Per-lead: every input multiplier, the baseline, margin, conversion probability, and all three raw money values plus the two bands. Full workings. | **Internal audit only** (gitignored). |

**Sales list rule:** the telesales export may include `estimated_monthly_value_band` and
`estimated_opportunity_value_band` **only**. It must never carry
`estimated_monthly_value`, `estimated_gross_profit`, `estimated_opportunity_value`, or any
of the multipliers. Bands communicate priority without implying a price.
