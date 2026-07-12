# Source Registry & Settings (Phase 5)

A single registry of every external system the engine can use, surfaced on a source-control
`/settings` dashboard.

## Registry — `src/lib/sources/source-registry.ts`

`SOURCE_REGISTRY: SourceEntry[]` (9 sources). Each entry carries: `name`, `purpose`, `status`,
`authNeeded`, `envVar` (name only — **never a value**), `costRisk`, `legalRisk`, `pipelineUse`,
`liveEnabled`, `safeTonight`, `blocksExport`, `nextAction`, `notes`.

`summariseRegistry(envPresent)` returns counts: live / disabled / manual-import / needing-keys /
cost-risk / legal-risk. `envPresent` is a boolean presence map computed server-side.

### Current statuses
| # | Source | Status | Live | Auth / Env | Cost | Legal | Blocks export |
|---|---|---|---|---|---|---|---|
| 1 | FSA FHRS | `live_ready` | **Yes** | No | low | low | No |
| 2 | Companies House | `not_configured` | No | API key · `COMPANIES_HOUSE_API_KEY` | low | low | No |
| 3 | Google Places | `disabled_cost_control_required` | No | API key · `GOOGLE_PLACES_API_KEY` | high | low | No |
| 4 | Uber Eats | `manual_import_placeholder` | No | No | none | medium | No |
| 5 | Deliveroo | `manual_import_placeholder` | No | No | none | medium | No |
| 6 | Just Eat | `manual_import_placeholder` | No | No | none | medium | No |
| 7 | Existing Customers Import | `manual_import_placeholder` | No | No | none | low | No |
| 8 | Delivery Boundary Import | `manual_import_placeholder` | No | No | none | low | No |
| 9 | Map / OS Open Data | `poc_derived_local_static` | No | No | none | low | No |

**FSA is the only fully live source.** No source blocks export — Companies House / Google /
delivery-presence produce warnings or manual-review only.

## Settings page — `/settings`

Rebuilt as a source-control dashboard (server component; env presence resolved server-side, values
never sent to the client):
- **Summary cards:** Live sources · Disabled · Manual import · Needing keys · Cost risk · Legal review.
- **Filter tabs:** All · Live · Needs setup · Manual import · Disabled · Legal/cost risk.
- **Source detail cards:** status badge, live-enabled, *safe to run tonight?*, *blocks export?*, auth,
  cost/legal risk, env var name + present/not-set, pipeline use, next action, notes.
- **Prominent warning:** delivery-platform presence must use approved public/business-level methods
  only — no login, captcha bypass, proxy evasion, protected-data extraction, or bulk menu/price/review copying.
- Product/tenant + secrets note retained.

## Security
Env var **names** are shown; **values are never read into the client** — the page only sends a boolean
`present` per env var. No keys in the repo, DB, or browser.
