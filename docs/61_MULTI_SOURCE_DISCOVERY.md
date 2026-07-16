# 61 — Multi-source discovery: Uber Eats + Deliveroo audit, adapters, consolidation, report

Extends Just Eat Stage 1 to a source-neutral, multi-platform foundation. Honest throughout:
no fabricated data, no anti-bot/ToS bypass, no silent purchases.

## Lawful acquisition audit (Parts 6–7)

| Platform | Official API | Open discovery? | Consumer site | Verdict |
| --- | --- | --- | --- | --- |
| **Just Eat** | — | **Yes** — public `bypostcode/{district}` listing endpoint (no auth/anti-bot) | detail pages Cloudflare-blocked | **Live discovery works** (Stage 1) |
| **Uber Eats** | Marketplace API — partner-gated (NDA + licensing + partner-manager approval) | **No** — manages a partner's OWN stores only | anti-bot + ToS-restricted | **No lawful open discovery**; needs authorised provider |
| **Deliveroo** | Partner/Retail/Signature — invitation-only, for own-business merchants | **No** | anti-bot + ToS-restricted | **No lawful open discovery**; needs authorised provider |

**Conclusion:** Uber Eats and Deliveroo have **no lawful open discovery API** for arbitrary
restaurant listings. Live discovery requires a paid/authorised provider. Options (documented,
**not purchased**):

| Option | Type | Lawful | Est. cost | Note |
| --- | --- | --- | --- | --- |
| Official Marketplace/Partner API | partner API | yes | commercial, gated | Own stores only — **not** area discovery |
| Commercial data provider (Apify actor / DoubleData / xByte) | 3rd-party feed | conditional | ~£30–£500+/mo | ToS-compliance is the provider's responsibility; review before buying |
| Browser-assisted / manual | manual | conditional | staff time | Human only, no anti-bot bypass, low volume |

Sources: [Uber Eats developer docs](https://developer.uber.com/docs/eats/introduction),
[Deliveroo developer portal](https://developers.deliveroo.com/).

## Adapters (Parts 6–7 build)

`src/lib/discovery-engine/{uber-eats,deliveroo}/` implement the generic `PlatformAdapter`
contract (`inspectCapabilities / validateConfiguration / planQueries / executeQuery /
parseSearchResults / diagnostics`). Both are **fixture/provider-driven**:
`inspectCapabilities()` reports `liveExecution: false`, `requiresAuthorisedProvider: true`
and the provider options above; `validateConfiguration()` **fails** without a provider (no
fake live). A real provider fetcher can be injected — the integration boundary is ready.
Sanitised fixtures live in `tests/fixtures/{uber-eats,deliveroo}/`.

Each parser produces the source-neutral `SourceOutlet` (id, name, brand, address, postcode,
coordinates, url, cuisines, rating, review count, delivery/collection, fee, min order, ETA,
sponsored, halal flag, logo). Phone/opening-hours/menu are honestly unavailable from all
three public sources.

## Consolidation (Part 8)

`consolidation/consolidate.ts` groups likely-same outlets across sources using **strong
evidence only** — exact normalised phone, same source URL, full postcode + strong name
overlap, or coordinate proximity + name. **Never merges on name alone.** Status per
candidate: `confirmed_same | probable_same | ambiguous_manual | separate_branch |
source_conflict`. Every source observation is retained; differing postcodes/brands within a
group are flagged as conflicts; same brand at different locations stays **separate branches**.

## Comparison + completeness report (Part 9)

`reports/comparison.ts`: per-source field coverage, cross-source overlap, unique-to-source
counts, match-status counts, and a per-candidate completeness status (`complete /
enrichment_required / conflicting / manual_review`). Fields no source supplies (phone,
opening hours, menu) are reported as **enrichment-required — never falsely "complete"**. In
the fixtures, a Just-Eat-only outlet is `enrichment_required` (no phone), while the
3-source "Test Spice House" becomes `complete` because Uber/Deliveroo supplied a phone —
demonstrating real multi-source enrichment value.

## Tests

`npm run test:multi-source` — Uber/Deliveroo parsing, honest no-live capabilities,
consolidation (3-source confirmed, phone-conflict, branch separation, no-name-merge,
overlap), and the comparison/completeness report.

## Not done / blocked (see the final report)

Live Uber Eats/Deliveroo execution (needs an authorised provider — awaiting approval);
national place data ingestion (OS Open Names + ONSPD — ISS-0017); DB persistence of
consolidated candidates; multi-source worker generalisation; Just Eat 96-field parser
extension. No customer comparison or enrichment started.
