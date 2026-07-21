# Marketplace schema mapping — canonical `SourceOutlet` field → database column

Companion to migration `supabase/migrations/0022_marketplace_contract_completion.sql` and the
`docs/09_DECISIONS.md` ADR "Canonical marketplace-record contract completed on `SourceOutlet`, not a
new schema". All 21 canonical fields added to `SourceOutlet` in commit `e329a79`, mapped to their
database home. 7 already had an approved existing column and were **not** duplicated.

| Application field (`SourceOutlet`) | DB table | DB column | Type | Nullable | Indexed | Source providers |
|---|---|---|---|---|---|---|
| `schema_version` | `je_outlets` | `schema_version` | text | yes | no | just_eat |
| `branch_name` | `je_outlets` | `branch_name` | text | yes | no | just_eat |
| `address_line1` | `je_outlets` | `address_first_line` *(existing, reused)* | text | yes | no | just_eat |
| `address_line2` | `je_outlets` | `address_line2` | text | yes | no | just_eat |
| `locality` | `je_outlets` | `locality` | text | yes | no | just_eat |
| `city` | `je_outlets` | `city` *(existing, reused)* | text | yes | no | just_eat |
| `categories` | `je_outlets` | `categories` | jsonb | not null, default `[]` | no | just_eat |
| `rating_distribution` | `je_outlets` | `rating_distribution` | jsonb | yes | no | just_eat (none currently expose this) |
| `is_open` | `je_outlets` | `is_open_now` *(existing, reused)* | boolean | yes | no | just_eat |
| `opening_hours` | `je_outlets` | `opening_times` *(existing, reused)* | jsonb | yes | no | just_eat |
| `service_fee` | `je_outlets` | `service_fee` | numeric(8,2) | yes | no | just_eat |
| `distance_miles` | `je_outlets` | `distance_miles` | numeric(8,3) | yes | no | just_eat |
| `offers` | `je_outlets` | `offers` *(existing, reused)* | jsonb | not null, default `[]` | no | just_eat |
| `badges` | `je_outlets` | `badges` *(existing, reused)* | jsonb | not null, default `[]` | no | just_eat |
| `image_url` | `je_outlets` | `image_url` | text | yes | no | just_eat |
| `hygiene_rating` | `je_outlets` | `hygiene_rating` | text | yes | no | just_eat (rarely exposed) |
| `anchor_id` | `je_outlets` | `anchor_id` | text | yes | **yes** (`je_outlets_anchor_idx`, partial) | just_eat |
| `pipeline_run_id` | `je_outlets` | `latest_pipeline_run_id` | uuid → `discovery_runs(id)` | yes | **yes** (`je_outlets_pipeline_run_idx`, partial) | just_eat |
| `provider_version` | `je_outlets` | `provider_version` | text | yes | no | just_eat |
| `parser_version` | `je_outlets` | `parser_version` | text | yes | no | just_eat |
| `raw_evidence_reference` | `je_outlets` | `latest_observation_id` *(existing, reused)* | uuid → `je_raw_observations(id)` | yes | already indexed via FK | just_eat |

## Why only `je_outlets`

`je_outlets` is the **only** provider-outlets table that currently exists — Uber Eats and Deliveroo
are `pending_authorised_source` (0 operational records; see `src/lib/sources/source-registry.ts`), so
their `SourceOutlet` output is produced in-memory by their adapters and never persisted. When either
source is authorised and starts producing operational records, it will reuse the same columns above
(no schema change needed) — see `docs/09_DECISIONS.md` for the reasoning against forking a
per-provider or duplicate schema.

## Enrichment provenance (Just Eat phone enrichment, §3)

| Field | DB table | DB column | Type | Nullable |
|---|---|---|---|---|
| phone number | `je_outlets` | `telephone_e164` / `telephone_national` / `telephone_raw` *(existing)* | text | yes |
| phone source | `je_field_provenance` | `source` *(existing — now also carries non-JE values, e.g. `google_places`, `website`)* | text | not null, default `'just_eat'` |
| source URL | `je_field_provenance` | `source_url` **(new, migration 0022)** | text | yes |
| retrieval timestamp | `je_field_provenance` | `collected_at` *(existing)* | timestamptz | not null, default `now()` |
| confidence | `je_field_provenance` | `confidence` *(existing)* | numeric | yes |
| raw evidence reference | `je_field_provenance` | `raw_observation_id` *(existing, when the evidence is a Just Eat raw observation)* or `enrichment_evidence_reference` **(new, migration 0022, when it is not)** | uuid / text | yes |

## Rating history (never overwritten)

Already satisfied — `je_rating_history` (migration 0004) is append-only: one row per observation,
keyed by `(outlet_id, observed_at)`, never updated or deleted. Verified in the disposable-schema test
(two inserts for the same outlet retained as two distinct rows).
