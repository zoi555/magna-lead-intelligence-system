# 59 — Just Eat outlet-detail capability audit (Stage 1)

Purpose: determine whether **outlet-detail** data (phone, opening hours, menu, prices,
description, delivery economics, dietary/halal, extra reviews) can be obtained **lawfully**
to enrich the listing-level data — before deciding whether to build detail fetching.

**Result: detail-level data is NOT lawfully or technically retrievable in Stage 1.** Do not
integrate detail fetching. Recommendation below.

## Method (capped, conservative, lawful)

- Selected **10 real outlets** from the completed UB1 execution (highest review counts).
- Fetched each **public restaurant page** (`https://www.just-eat.co.uk/restaurants-{slug}`)
  — the same URL a normal browser loads — with an honest descriptive User-Agent, **paced 3 s**,
  retry-once, fail-safe. Analysed for JSON-LD (`application/ld+json`) and `__NEXT_DATA__`
  structured data covering each target field.
- Additionally probed the **same lawful API host** used by the listing endpoint
  (`uk.api.just-eat.io`) for 2 outlets, to see if a public detail/menu JSON endpoint exists.
- **No** login, CAPTCHA solving, anti-bot circumvention, header spoofing, proxies, or
  aggressive scraping. Raw responses were kept **outside Git** (scratchpad); none are
  committed. There was no real detail data to sanitise into a fixture.

## Findings

| Route | Result | Meaning |
| --- | --- | --- |
| Public restaurant page ×10 | **HTTP 403**, 4,550 b, "Attention Required! \| Cloudflare" | Cloudflare anti-bot block. Retrieval requires circumvention (prohibited). |
| `uk.api.just-eat.io/restaurants/{id}` | **HTTP 404** | No public outlet-detail JSON endpoint on the known host. |
| `uk.api.just-eat.io/restaurants/{id}/menu` | **HTTP 404** | No public menu endpoint on the known host. |

Real pages parsed: **0 / 10**. Blocked/failed: **10 / 10**.

## Per-field capability (capped sample)

Every detail-only field is **unavailable via lawful public routes** in Stage 1:

| Field | Availability | Sample success | Source level | Limitation |
| --- | --- | --- | --- | --- |
| Telephone number | Unavailable | 0/10 | detail page (blocked) | Cloudflare 403; no lawful endpoint |
| Opening hours | Unavailable | 0/10 | detail page (blocked) | Cloudflare 403 |
| Menu categories | Unavailable | 0/10 | menu endpoint (404) | no public endpoint |
| Menu items & prices | Unavailable | 0/10 | menu endpoint (404) | no public endpoint |
| Outlet description | Unavailable | 0/10 | detail page (blocked) | Cloudflare 403 |
| Delivery fee / min / ETA (detail) | Unavailable at detail | 0/10 | detail page (blocked) | Cloudflare 403 (note: fee/min/ETA ARE available at **listing** level) |
| Dietary / halal (detail) | Unavailable at detail | 0/10 | detail page (blocked) | Cloudflare 403 (note: an `IsHalal` flag IS available at **listing** level) |
| Additional review information | Unavailable | 0/10 | detail page (blocked) | Cloudflare 403; individual reviews are personal data |

Reliability: the 403 was uniform across all 10 outlets and both attempts — this is a
consistent platform anti-bot posture, not a transient error.

## Blockers

1. The consumer restaurant page is behind **Cloudflare anti-bot** — lawful server-side
   retrieval is not possible; a browser-emulation/bypass would breach the project's rules
   and likely Just Eat's terms.
2. No **public** outlet-detail or menu JSON endpoint exists on the known API host.
3. Individual review text is **personal data** and out of scope regardless.

## Recommendation

**Option B — proceed to consolidation / customer comparison and obtain phone/menu via later
lawful enrichment (Google Places, Companies House, business websites), NOT via Just Eat
detail.**

Rationale: Just Eat detail is not lawfully retrievable, so **Option A (integrate detail
fetching) is not viable** without prohibited circumvention or a commercial Just Eat partner
feed. The listing endpoint already delivers strong coverage (postcode 100 %, coordinates
100 %, review score ~88 %, review count 100 %, cuisine 100 %, plus delivery/collection
economics and an explicit halal flag), which is sufficient to identify and prioritise
outlets. Phone and menu — the main gaps — are better filled by dedicated lawful sources in
the enrichment phase. **Option C (add another platform)** improves discovery breadth but
does not solve phone/menu and is a larger commitment; consider it only if UB1-style listing
coverage proves geographically insufficient.

Do not build Just Eat detail fetching into the worker.
