# Source Adapters Readiness Summary (Phases 6–8)

## Completed
- **Phase 6 — Companies House** adapter made ready, **disabled by default** (`docs/27`).
- **Phase 7 — Google Places** adapter made ready, **disabled + cost-controlled** (`docs/28`).
- **Phase 8 — Delivery platform presence** import/manual-evidence readiness (`docs/29`), import template.
- Optional low-risk wiring: `/settings` shows an "Adapter configuration" strip (booleans/limits only).

## Files changed
- `src/lib/sources/companies-house.ts` (rewritten — config/types/functions, gated live path)
- `src/lib/sources/google-places.ts` (rewritten — config/types/functions, field mask + budget)
- `src/lib/sources/delivery-platforms.ts` (added import/evidence API — config/normalise/validate/match/enrich)
- `src/app/settings/page.tsx` (adapter-config strip, server-side)
- `templates/delivery-platform-presence-import-template.csv`
- `docs/27, 28, 29, 30`

## Statuses now
| Adapter | Status | Live enabled | Blocks export |
|---|---|---|---|
| Companies House | `not_configured` (key-ready) | No | No |
| Google Places | `disabled_cost_control_required` | No | No |
| Delivery presence | `manual_import_placeholder` | No | No (warnings/manual-review only) |

## Env vars now recognised (values never read into the client)
- `COMPANIES_HOUSE_API_KEY`, `COMPANIES_HOUSE_ENABLED`, `COMPANIES_HOUSE_MAX_CALLS_PER_RUN`
- `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_ENABLED`, `GOOGLE_PLACES_MAX_CALLS_PER_RUN`, `GOOGLE_PLACES_FIELD_MASK`, `GOOGLE_PLACES_DAILY_BUDGET_WARNING`

## Live API calls made?
**No.** All three adapters return disabled/not-configured results without any network call. Live paths
exist but are only reachable when explicitly enabled with a positive call budget (not tonight).

## Remaining blockers
- Enrichment still off → every lead keeps `COMPANY_NOT_ENRICHED` / `GOOGLE_NOT_ENRICHED` /
  `PLATFORM_NOT_CHECKED` warnings (not blockers). CRM export gated (ISS-0003).
- New adapter functions (`enrichLeadWith*`, `matchPlatformEvidenceToLead`) are **ready but not yet wired
  into the pipeline** — that's a deliberate later step (would require enabling + a call budget).

## Next recommended phase
**Phase 9** — Pipeline Monitor refinement (latest run, export file links, stage error + source-status
summary), then Phase 10 (map practical refinements) and Phase 11 (export review + telesales safety).
