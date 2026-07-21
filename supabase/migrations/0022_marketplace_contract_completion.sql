-- 0022 — Marketplace contract completion.
--
-- Additive-only migration supporting the 21 canonical SourceOutlet fields introduced in
-- commit e329a79 (see docs/09_DECISIONS.md "Canonical marketplace-record contract
-- completed on SourceOutlet, not a new schema"). Rules followed:
--   - additive only: no drops, no renames of existing columns, no destructive type changes
--   - every new column is nullable, or defaults to an empty jsonb array (never fabricated data)
--   - existing Just Eat rows remain fully readable with no backfill required
--   - rating history stays append-only (je_rating_history, migration 0004) — untouched here
--   - indexes added only for columns used for lookup/filtering/joins (anchor, run linkage)
--
-- 7 of the 21 canonical fields already have an approved existing column and are NOT
-- duplicated here — see the schema-mapping table in docs/71_MARKETPLACE_SCHEMA_MAPPING.md:
--   address_line1 -> je_outlets.address_first_line
--   city          -> je_outlets.city
--   is_open       -> je_outlets.is_open_now
--   opening_hours -> je_outlets.opening_times
--   offers        -> je_outlets.offers
--   badges        -> je_outlets.badges
--   raw_evidence_reference -> je_outlets.latest_observation_id

alter table je_outlets
  add column if not exists schema_version text,
  add column if not exists branch_name text,
  add column if not exists address_line2 text,
  add column if not exists locality text,
  add column if not exists categories jsonb not null default '[]'::jsonb,
  add column if not exists rating_distribution jsonb,
  add column if not exists service_fee numeric(8,2),
  add column if not exists distance_miles numeric(8,3),
  add column if not exists image_url text,
  add column if not exists hygiene_rating text,
  add column if not exists anchor_id text,
  add column if not exists latest_pipeline_run_id uuid references discovery_runs(id),
  add column if not exists provider_version text,
  add column if not exists parser_version text;

comment on column je_outlets.schema_version is 'Canonical MarketplaceRestaurant contract version this row was normalised against (e.g. "1").';
comment on column je_outlets.branch_name is 'Specific branch/location name, distinct from brand_name (the chain/brand).';
comment on column je_outlets.address_line2 is 'Second address line, when the source supplies one (Just Eat listing supplies only one line today).';
comment on column je_outlets.locality is 'Neighbourhood/locality, distinct from city — not distinctly supplied by Just Eat today (null).';
comment on column je_outlets.categories is 'Broader business-type categories, distinct from cuisines/tags. Empty array, never fabricated.';
comment on column je_outlets.rating_distribution is 'Per-star rating breakdown, only when the provider genuinely exposes it. Null otherwise — never derived or inferred.';
comment on column je_outlets.service_fee is 'Platform service fee (GBP major units), distinct from delivery_cost. Not supplied by Just Eat today (null).';
comment on column je_outlets.distance_miles is 'Distance from the query anchor, when the provider supplies it.';
comment on column je_outlets.image_url is 'Hero/listing image, distinct from logo_url.';
comment on column je_outlets.hygiene_rating is 'FSA-style hygiene rating where the provider exposes it (text: ratings are not always purely numeric, e.g. "Awaiting Inspection").';
comment on column je_outlets.anchor_id is 'The query anchor (e.g. a named UB1 anchor) this outlet was discovered under, when the run used named anchors.';
comment on column je_outlets.latest_pipeline_run_id is 'The discovery_runs run this outlet was most recently observed under. Convenience join column — the authoritative per-observation link is je_raw_observations.run_id.';
comment on column je_outlets.provider_version is 'Adapter/provider version (e.g. "je-adapter-1.0.0") — distinct from normalisation_version and parser_version.';
comment on column je_outlets.parser_version is 'Parser version (e.g. "je-search-1.1.0") — distinct from normalisation_version and provider_version.';

create index if not exists je_outlets_anchor_idx on je_outlets (anchor_id) where anchor_id is not null;
create index if not exists je_outlets_pipeline_run_idx on je_outlets (latest_pipeline_run_id) where latest_pipeline_run_id is not null;

-- Field-provenance: support enrichment sources beyond a Just Eat raw observation (e.g. a
-- phone number enriched from Google Places or a business website). Additive, nullable.
alter table je_field_provenance
  add column if not exists source_url text,
  add column if not exists enrichment_evidence_reference text;

comment on column je_field_provenance.source_url is 'The exact URL a value was retrieved from, when the source is not the Just Eat listing endpoint (e.g. a Google Places result or business website).';
comment on column je_field_provenance.enrichment_evidence_reference is 'Free-form reference to stored raw evidence for a non-Just-Eat source (e.g. a saved response file path), when raw_observation_id does not apply because the evidence is not a je_raw_observations row.';

-- Rollback (manual — Supabase migrations do not auto-generate a down migration):
--   alter table je_field_provenance drop column if exists enrichment_evidence_reference;
--   alter table je_field_provenance drop column if exists source_url;
--   drop index if exists je_outlets_pipeline_run_idx;
--   drop index if exists je_outlets_anchor_idx;
--   alter table je_outlets
--     drop column if exists parser_version,
--     drop column if exists provider_version,
--     drop column if exists latest_pipeline_run_id,
--     drop column if exists anchor_id,
--     drop column if exists hygiene_rating,
--     drop column if exists image_url,
--     drop column if exists distance_miles,
--     drop column if exists service_fee,
--     drop column if exists rating_distribution,
--     drop column if exists categories,
--     drop column if exists locality,
--     drop column if exists address_line2,
--     drop column if exists branch_name,
--     drop column if exists schema_version;
-- Safe: every dropped column is additive-only from this migration; no other migration or
-- application code depends on their presence (application code null-coalesces their absence).
