-- Additive-only: one new nullable column on an existing table. No data loss, no existing
-- row touched, no RLS/policy change, no removal of functionality.
--
-- candidate_source_links.raw_observation_id (0023) references provider_raw_observations —
-- the Uber Eats/Deliveroo IMPORT table. It is never populated for Just Eat candidates and
-- cannot be, since Just Eat's own raw evidence lives in a different table (je_raw_observations).
-- This left the JE consolidation path with no way to join a candidate's source link back to
-- the EXACT observation (and therefore the exact provider_geography_validations row) it came
-- from — only the outlet id, which is not run-scoped-safe as a matching key. This column closes
-- that gap for Just Eat specifically, mirroring the same evidence-traceability pattern 0023
-- already established for imports.
alter table candidate_source_links
  add column if not exists je_raw_observation_id uuid references je_raw_observations(id) on delete set null;

create index if not exists idx_csl_je_raw_obs on candidate_source_links(je_raw_observation_id);

-- Rollback (if ever needed): safe, since nothing depends on this column existing and no JE
-- consolidation row predates it being populated by the corresponding code change.
--   drop index if exists idx_csl_je_raw_obs;
--   alter table candidate_source_links drop column if exists je_raw_observation_id;
