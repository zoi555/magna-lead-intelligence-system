# MVP Final Validation Report — Vertical Slice 001

Run: **RUN-20260712-170716** (live FSA pull, West London pilot UB1/UB2/UB6/HA0/HA9/W5).
Branch: `feature/mvp-vertical-slice-001`. Validation: build + all tests **passing**.

## 1. Executive summary
The engine turns a **live FSA FHRS pull** into a monitored, resumable, explainable lead pipeline:
discovery → normalise → validate → territory → category tiers → dedupe → existing-customer exclusion →
enrichment placeholders → scoring → export gate → CSV/JSON + telesales-safe export. It produces
**466 export-eligible leads** from **1,200 fetched**, with **333 routed to manual review**, an animated
pipeline monitor, a POC-derived coverage map, an honest export-review gate, and a **verified
telesales-safe queue**. FSA is the only live source; all enrichment adapters are key/import-ready but
disabled. Ready for human app review; not for production calling without review.

## 2. Branch & commits
- `62c94bf` lead quality / scoring / customer matching
- `75eb76b` source registry + settings readiness dashboard
- `7d386e9` source adapter readiness (enrichment + platform evidence)
- `dd435bc` pipeline monitoring, map usability, telesales-safe exports
- (this) docs: final MVP validation report

## 3. What is now working
Live FSA discovery; 14-stage monitored + resumable pipeline (pause/resume/retry file-based via CLI);
category tiers; explainable scoring (grade + reasons + warnings + manual-review flags); existing-customer
matching (exact→exclude, possible→manual); export gate + manual-review routing; CSV/JSON + telesales-safe
exports; source registry + /settings dashboard; CH/Google/delivery adapters ready-but-disabled;
pipeline monitor (Operational Status + Flow Network) with run summary, source strip, export-file
availability, error summary; reusable POC-derived map engine; export-review honest counts; telesales
safe view (validated).

## 4. Final pipeline counts
| Stage | Out | Rejected |
|---|---|---|
| FSA fetched | 1,200 | — |
| Validate postcodes | 1,066 | 134 |
| Territory filter | 1,066 | 0 |
| Category filter | 864 | 202 excluded |
| Dedupe | 800 | 64 |
| Exclude existing customers | 799 | 1 exact |
| Score | 799 | 0 |
| Export gate | 799 | 333 → manual/held |
| **Export-eligible (CSV)** | **466** | — |

Final leads (JSON): **799** · export-eligible CSV: **466** · telesales-safe rows: **466**.

## 5. Lead-quality summary
- **Grades:** A 44 · B 415 · C 339 · D 1
- **Category fit:** HIGH 406 · MANUAL_REVIEW 238 · LOW 110 · MEDIUM 45
- **Territory:** HA0 165 · HA9 156 · W5 137 · UB2 118 · UB1 113 · UB6 110
- **Mapped:** 757 · **Unmapped (missing coords):** 42 · **Missing phone:** 799 (no phone source)
- **Top warnings:** MISSING_PHONE 799 · PLATFORM_NOT_CHECKED 799 · COMPANY_NOT_ENRICHED 799 ·
  GOOGLE_NOT_ENRICHED 799 · FSA rating >2y old 166 · Low category fit 110 · Duplicate-looking 93 · Missing coords 42
- **Manual-review reasons:** MANUAL_REVIEW_REQUIRED 238 (institutional/low-fit) · DUPLICATE_RISK 93 · MISSING_COORDINATES 42

### Top 20 best leads
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

### Top 20 manual-review leads
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
| KFC | UB6 8DH | UB6 | Restaurant/Cafe/Canteen | 5 | B | 63 | HIGH |
## 6. Export / telesales safety
- **Export gate: LOCKED** — reason: CRM field mappings not verified (ISS-0003). Local files generated;
  nothing sent to a CRM. Approval workflow **not implemented** (stated honestly on the page).
- **Local export files:** `exports/first-fsa-leads.csv`, `exports/first-fsa-leads.json`,
  `exports/first-fsa-telesales-safe.csv` (generated locally; browser download not implemented).
- **Telesales-safe validation:** `npm run test:telesales-safe` → **PASS**, 466 rows.
- **Restricted-field leak check:** PASS — no score / reasons / matching internals / financials /
  enrichment internals / grade / export_status in telesales output.

## 7. Source-readiness
| Source | Status | Live |
|---|---|---|
| FSA FHRS | live_ready (real) | **Yes** |
| Companies House | not_configured (key-ready) | No |
| Google Places | disabled_cost_control_required | No |
| Uber Eats / Deliveroo / Just Eat | manual_import_placeholder (no scraping) | No |
| Existing Customers Import | manual_import (matching real, mock data) | No |
| Delivery Boundary Import | manual_import_placeholder (planned) | No |
| Map / OS Open Data | poc_derived_local_static | No |

**Live API calls beyond FSA: NONE.**

## 8. Map status
- Mapped **757 / 799** (42 unmapped — missing coordinates, with an on-map note).
- **Default road mode: Primary A roads.** "All A roads" available (3,425), flagged "⚠ heavy".
- Legends (coverage/gap/expansion/selected/roads + grade A–D). Territory + lead panels (no numeric score).
- **Limitations:** static POC-derived SVG engine (not live MapLibre); GB-only data → GB frame + West
  London pilot lens; Northern Ireland hatched/flagged, not faked.

## 9. Pipeline monitor status
- **Operational Status** tab ✅ · **Flow Network** tab ✅ (both live-polling while running/paused).
- Latest-run summary ✅ · source-readiness strip ✅ · local export-file availability ✅ ·
  stage warning/error summary ✅. Pause/Resume/Retry are honest UI concepts (CLI/manual run only).

## 10. Real vs placeholder
- **Real:** FSA discovery, full pipeline logic, scoring, category tiers, customer matching, exports,
  telesales-safe queue, monitor counts, map lead points, source registry.
- **Placeholder:** Companies House / Google Places / delivery-presence enrichment (disabled → warnings);
  browser download; CRM approval workflow; real customer + delivery-boundary imports; MapLibre engine.

## 11. Known blockers
- Companies House **disabled** until `COMPANIES_HOUSE_API_KEY` + `COMPANIES_HOUSE_ENABLED=true` + call cap.
- Google Places **disabled** until key + `GOOGLE_PLACES_ENABLED=true` + `MAX_CALLS_PER_RUN>0` + field-mask approval.
- Delivery-platform evidence is **import/manual only** — no scraping/login/anti-bot/proxy/bulk copying.
- **CRM/export approval workflow not implemented** (gate locked, ISS-0003).
- Map is a **static POC-derived SVG engine**; MapLibre production engine is later.
- **Real customer import not loaded** (mock master); **delivery boundary import not loaded**.
- Some leads **miss phone (all) and coordinates (42)**.
- **Human review still required before telesales calling.**

## 12. Risks
- FSA rating is 5★ for ~89% of records → grade separation leans on category fit; monitor for skew.
- Chains/duplicates (93) flagged but not resolved — human review needed.
- Enabling Google Places without a strict cap/field-mask could incur real cost.
- Postcode-heavy areas can create false "possible" customer matches — kept as manual review by design.

## 13. Next 10 tasks (priority)
1. Load a real existing-customer CSV (server-side) + tune fuzzy threshold.
2. Import the real delivery-boundary and wire coverage-gap/expansion logic.
3. Enable Companies House (key + cap) and wire `enrichLeadWithCompaniesHouse` into the pipeline.
4. Enable Google Places (cap + field mask + approval) for phone/website on top leads only.
5. Wire imported delivery-platform evidence into the presence stage.
6. Resolve/merge duplicate chains + handle 42 missing coordinates (geocode).
7. Implement export approval workflow + unlock the CRM gate (ISS-0003 field mapping).
8. Add browser CSV/JSON download for export review.
9. Persist runs to Supabase (UAT) with RLS; keep telesales-safe boundary.
10. Plan the production MapLibre engine using OS open data.

## 14. Human review checklist
Serve locally (`npm run dev`), then open each page:
- **http://localhost:3004/pipeline-runs** — run summary (466 exportable / 333 manual); switch
  Operational Status ⇄ Flow Network (animation, click a stage); source-readiness strip; local export
  files listed with sizes; stage warning/error summary.
- **http://localhost:3004/coverage-map** — default road mode = Primary A; try granularity + "All A
  roads" (heavy flag); zoom/pan; click a territory (grade/categories/platform-unknown/missing-phone)
  and a lead (no numeric score); missing-coordinates note; GB pilot-lens inset.
- **http://localhost:3004/leads** — 799 final leads; grade filter; category_fit + delivery columns.
- **http://localhost:3004/export-review** — gate LOCKED + reason; counts; source warnings; file paths;
  "approval not implemented"; export button disabled.
- **http://localhost:3004/telesales** — safe fields only (business/postcode/phone/category/trigger/rep/
  worked/source-warning); confirm NO score/grade/financials/internals.
- **http://localhost:3004/settings** — 9 sources; FSA live; CH/Google disabled; delivery manual;
  filter tabs; env var names (present/not-set, never values); delivery legal warning; adapter-config strip.

## 15. Commands run & results
- `npm run leads:first` → RUN-20260712-170716 completed (1,200 → 466 exportable). FSA live only.
- `npm run leads:analyse` → reports regenerated (exports/reports, local-only).
- `npm run test:scoring` → **PASS**.
- `npm run test:telesales-safe` → **PASS** (466 rows, no leaks).
- `npm run build` → **passes** (Next 16 + TypeScript).

## 16. Final git status
Working tree clean apart from the auto-generated `next-env.d.ts` (not committed). `data/` and `exports/`
gitignored (not committed). Only `docs/32` + `docs/24` committed in this phase.
