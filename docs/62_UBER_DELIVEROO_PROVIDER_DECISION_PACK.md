# 62 — Uber Eats & Deliveroo authorised-access audit + provider decision pack

Evidence-based, current (July 2026). **No purchase made.** Costs are provider-published or
estimated with stated assumptions. Both platforms are mandatory; both require a paid/
authorised path for area discovery.

## Why a provider is required (recap)

Neither Uber Eats nor Deliveroo offers a lawful **open discovery** API for arbitrary
restaurant listings. Official APIs manage a partner's **own** stores only; consumer sites
are anti-bot + ToS-restricted. So area discovery needs a **licensed/commercial data
provider** (or a manual fallback). We never bypass anti-bot/CAPTCHA/ToS.

## Verified options

### Uber Eats
| Option | Product | Price (verified) | Fields | Coverage |
| --- | --- | --- | --- | --- |
| Uber Eats Marketplace API (official) | partner API | commercial, NDA-gated | own store only | n/a for discovery |
| **Apify Uber Eats actors** (several) | pay-per-result | **~$3 / 1,000 listings** (+ Apify plan) | name, address, coords, cuisines, rating, reviews, fees, ETA, menu (optional) | UK + intl |
| DoubleData / xByte / 3i / Actowiz | managed extraction | quote-based (custom) | similar | UK |
| Browser-assisted / manual | manual | staff time | listing-level | low volume |

### Deliveroo
| Option | Product | Price (verified) | Fields | Coverage |
| --- | --- | --- | --- | --- |
| Deliveroo Partner/Retail/Signature API | official | invitation-only | own business only | n/a for discovery |
| **Apify Deliveroo scraper** (thirdwatch) | pay-per-result | **from $8/1k (free tier) → $4/1k (gold)**; ~$5/1k mid | name, rating, delivery times/fees, cuisines, URL, city/neighbourhood, menu (optional) | UK + 11 markets; **~150–240 restaurants / neighbourhood** |
| DoubleData / Actowiz (500 free rows) / xByte / 3i / Xwiz | managed extraction | quote-based; Actowiz custom scraper 3–5 days | similar + menu | UK |
| Browser-assisted / manual | manual | staff time | listing-level | low volume |

**Apify platform plans** (needed to run the actors): Free $0 ($5 credit) · **Starter $29/mo** ($29
credit) · **Scale $199/mo** ($199 credit) · **Business $999/mo** ($999 credit); compute overage
$0.13–0.20/CU.

## Costed volume estimates (ASSUMPTIONS stated — not quotes)

Assumption: **~200 outlets per postcode district** (Deliveroo's own "150–240/neighbourhood");
GB ≈ **2,872 districts**; Greater London ≈ **~300 districts**. Result-fees only (add the Apify
plan + minor compute):

| Scope | Listings (est.) | Uber Eats @ $3/1k | Deliveroo @ $5/1k |
| --- | --- | --- | --- |
| 1 postcode district | ~200 | ~$0.60 | ~$1.00 |
| 1 postcode area (~12 districts) | ~2,400 | ~$7 | ~$12 |
| Greater London (~300 districts) | ~60,000 | ~$180 | ~$300 |
| National GB refresh (~2,872 districts) | ~574,000 | **~$1,720 / refresh** | **~$2,870 / refresh** |

A **monthly national refresh of both** ≈ **~$4,600/mo in result fees** + Apify **Business
$999/mo**. A **Greater-London monthly refresh of both** ≈ **~$480/mo** + Apify **Scale $199/mo**
(credit covers part). A **single test district for both** ≈ **~$2** on the Free/Starter plan.

## Decision table (score 1–5, higher better)

| Criterion | Apify (per-result) | Managed provider (DoubleData/Actowiz) | Manual |
| --- | --- | --- | --- |
| Legality/compliance | 3 (ToS-grey; provider's responsibility) | 3–4 (they assert compliance) | 4 |
| Reliability | 4 | 4 | 2 |
| Field richness | 4 (+menu) | 4 | 2 |
| Postcode coverage | 4 | 4 | 1 |
| Refresh capability | 5 (on-demand API) | 3 (batch/managed) | 1 |
| Engineering effort | 5 (drop-in fetcher) | 3 (integration/onboarding) | 1 |
| Ongoing cost | 4 (usage-based, cheap to start) | 2 (quote/minimums) | 3 |
| Interruption risk | 3 (actors can break on site changes) | 4 (managed SLA) | 2 |
| Scalability | 5 | 4 | 1 |
| Auditability | 4 (raw JSON retained) | 3 | 2 |

## Recommendations

- **Preferred production:** **Apify pay-per-result actors** (Uber Eats ~$3/1k, Deliveroo ~$5/1k)
  on the **Scale $199/mo** plan for Greater London; scale to Business for national. Cheap to
  start, drop-in behind our existing injectable fetcher, raw JSON retained for audit. Requires a
  legal sign-off on third-party-provider ToS.
- **Cheapest acceptable:** Apify **Starter $29/mo** for a **single-area pilot** (~$20–40 total).
- **Fastest test:** Apify **Free plan** ($5 credit) — one district for both, **~$2**, this week.
- **Fallback:** a **managed provider** (DoubleData/Actowiz) with a compliance SLA if in-house
  actor maintenance is undesirable — quote-based, slower onboarding.

## What we need from the product owner (approvals/payments)
1. **Approve a provider + budget** (recommend: Apify Scale $199/mo + ~$480/mo Greater-London
   result fees, or Free-plan £-few test first).
2. **Legal sign-off** on using a third-party data provider for Uber Eats/Deliveroo (their
   ToS-compliance representation).
3. On approval, provide an **Apify API token** (server-side only) — the adapter's injectable
   fetcher plugs straight in (see `providers/apify-fetcher.ts`); **no code change to the
   consolidation/worker layers.**

Sources: [Apify pricing](https://apify.com/pricing), [Apify Uber Eats actor](https://apify.com/sovereigntaylor/ubereats-scraper), [Apify Deliveroo actor](https://apify.com/thirdwatch/deliveroo-scraper), [Uber developer docs](https://developer.uber.com/docs/eats/introduction), [Deliveroo developer portal](https://developers.deliveroo.com/).
