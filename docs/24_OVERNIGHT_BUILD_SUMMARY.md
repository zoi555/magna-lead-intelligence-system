# Overnight Build Summary — Phases 1–4

Branch: `feature/mvp-vertical-slice-001`. Checkpoint after finalising lead quality, category rules,
scoring and existing-customer matching.

## Completed
- **Phase 1** Lead Quality Audit — analyser + reports + `docs/22`.
- **Phase 2** Category rules — `category-rules.ts` (HIGH/MEDIUM/LOW/MANUAL_REVIEW/EXCLUDED).
- **Phase 3** Scoring — explainable score/grade/reasons/warnings/disqualifiers/manual_review_flags + tests.
- **Phase 4** Existing-customer matching — `customer-matching.ts`, import template, mock master, `docs/25`.

## Current numbers (run RUN-20260712-111501)
- **Final leads:** 799
- **Ready / exportable (CSV):** 466
- **Manual-review / held:** 333
- **Grade distribution:** A 44 · B 415 · C 339 · D 1
- **Category fit:** HIGH 406 · MANUAL_REVIEW 238 · LOW 110 · MEDIUM 45
- **Funnel:** 1,200 fetched → 1,066 valid postcode → 1,066 in territory → 864 in-category
  (202 excluded) → 800 deduped → 799 after existing-customer exclusion → 466 export-eligible.

## Source statuses
| Source | Status |
|---|---|
| FSA FHRS | **live-ready / real** (default pull) |
| Existing customers | **import-ready** (matching real; mock master data) |
| Companies House | key-ready, disabled (placeholder) |
| Google Places | key-ready, disabled (paid) |
| Delivery presence | manual/import collector (no scraping) |
| Map / OS open data | POC-derived static |
| Supabase | not connected |

## Reports generated (local, gitignored)
`exports/reports/first-leads-quality-summary.json`, `top-50-leads.csv`, `weak-leads.csv`,
`manual-review-leads.csv`. Exports: `exports/first-fsa-leads.{csv,json}`,
`exports/first-fsa-telesales-safe.csv` (all match the latest gate logic; 466 rows).

## Files changed (committed in this checkpoint)
- New: `src/lib/pipeline/{category-rules,customer-matching,mock-existing-customers}.ts`,
  `scripts/{analyse-first-leads,test-scoring-samples}.ts`,
  `templates/existing-customers-import-template.csv`, `docs/{22,23,24,25}`.
- Modified: `src/lib/pipeline/{scoring,stages,types,export-leads}.ts`,
  `src/lib/sources/existing-customers.ts`, `package.json`, `.gitignore`.

## Remaining blockers
- No phone (Google disabled); Companies House/Google/delivery unchecked → warnings only.
- CRM export gated (ISS-0003). 42 leads missing coordinates.

## Phase 5 — Source Registry & Settings — ✅ COMPLETE
- `src/lib/sources/source-registry.ts` (9 sources + `summariseRegistry`),
  `src/components/settings/SourceRegistryPanel.tsx`, rebuilt `/settings`, `docs/26`.
- Source-control dashboard: summary cards, filter tabs, detail cards, delivery legal warning,
  env var **names only** (presence resolved server-side, values never sent to the client),
  "safe to run tonight?" + "blocks export?" per source. FSA is the only fully live source; none block export.

## Next recommended task
**Phase 5** — Source Configuration Screen: create `src/lib/sources/source-registry.ts` and rebuild
`/settings` to show all 9 sources (status/auth/env/cost/legal/pipeline-use/next-action/live-enabled),
with the delivery-platform legal warning. Then Phases 6–8 (adapter readiness) and 9–11 (monitor/map/
export-telesales), 12 (final validation).
