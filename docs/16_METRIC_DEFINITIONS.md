# Metric definitions — homepage & run detail

Every homepage/run-detail metric, exactly as computed. This file and the `title=` tooltip
on each stat (`src/app/page.tsx`) must not drift apart — if you change one, change both.

Source of truth for the actual queries: `src/lib/discovery-engine/reports/homepage-overview.ts`
and `src/lib/discovery-engine/reports/run-detail.ts`.

## Just Eat / run counts

| Metric | Source table | Filter | Scope | Counts |
|---|---|---|---|---|
| Raw observations | `je_raw_observations` | `run_id = <latest run>` | One run | Rows (every scrape response captured, incl. duplicates) |
| Canonical | `je_raw_observations` | `run_id = <latest run> AND duplicate_of IS NULL` | One run | Rows |
| Duplicates | `je_raw_observations` | `run_id = <latest run> AND duplicate_of IS NOT NULL` | One run | Rows |
| Physically in target | `provider_geography_validations` | `run_id = <latest run> AND status = 'valid_geography'` | One run | Rows — shows **"Not evaluated"**, never `0`, when zero `provider_geography_validations` rows exist for the run at all (the gate never ran for it — see below) |
| Just Eat outlets (all-time) | `je_outlets` | `tenant_id = <tenant>` (no run/date filter) | **All-time, all-territory** | Rows — deliberately a different scope from every run-specific figure above; never shown adjacent to them without this label |

### Why "Physically in target" can read "Not evaluated"

`provider_geography_validations` (migration 0018) is written by
`persistGeographyValidations()`. As of 2026-07-22 this is called from the Just Eat worker
execution path for every **new** run — but historical runs created before that date have
zero rows in this table, because the gate was previously wired only into the Uber Eats
pilot scripts, never the Just Eat worker. Zero rows means "never checked," not "checked,
zero valid" — so the UI must show `Not evaluated`, never `0`, whenever
`RunDetail.geographyValidationRan` is `false`. Backfilling old runs was deliberately not
done — see `docs/09_DECISIONS.md`.

## Data-quality exceptions

Computed once, from a single `je_outlets` query, in `fetchDataQualityExceptions()`.

| Metric | Definition | Scope | Counts |
|---|---|---|---|
| Affected restaurants | Distinct `je_outlets` rows with ≥1 of: missing phone, missing address, missing postcode, missing coordinates, missing rating, or a phone shared with another outlet | All-time, all-territory | **Restaurants** — a restaurant missing 3 fields counts once |
| Total field exceptions | Sum of missing-phone + missing-address + missing-postcode + missing-coordinates + missing-rating counts | All-time, all-territory | **Fields** — a restaurant missing 2 fields contributes 2 |
| Needs manual review | Unresolved phone-enrichment attempts (`je_field_provenance`, `field_key = 'telephone_enrichment_exception'`, still no phone) + duplicate-phone conflicts | All-time, all-territory | Exceptions with no automated resolution path yet |

**Never conflated**: duplicate raw observations (`je_raw_observations.duplicate_of IS NOT
NULL`) and schema-parse failures (`parse_status != 'parsed'`) are scrape-pipeline
concepts, not restaurant-data-quality concepts — they are never summed into any of the
three numbers above. They remain visible separately on `/data-quality-exceptions`.

## New candidates (24h)

`consolidated_candidates` where `created_at >= now() - interval '24 hours'`. All-time
rolling window, all-territory — not scoped to the latest run.

## Run naming

Run names created via `scripts/je-run.ts` before 2026-07-22 used the pattern `live:
<territory>` (e.g. `"live: UB1"`), which duplicated the territory when shown next to the
`territoryInput` field (`"live: UB1 · UB1"`). Fixed at the source going forward
(`"Just Eat discovery — UB1 — 2026-07-22"`); the homepage display also detects and skips
the redundant territory suffix when a run's name already contains it, so both old and new
runs render correctly without ever editing historical row data.
