-- 0005 — Field-level provenance + execution data-quality snapshot
--
-- Provenance records, per normalised value, where it came from and how it was
-- transformed, so any outlet field can be traced back to a raw observation.

create table if not exists je_field_provenance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  outlet_id      uuid not null references je_outlets(id) on delete cascade,
  field_key      text not null,        -- name|telephone|address|postcode|coordinates|
                                        -- review_score|review_count|cuisine|service_models|
                                        -- opening_status|halal_evidence
  value          jsonb,                -- normalised value
  original_value jsonb,                -- source value
  source         text not null default 'just_eat',
  source_field_path text,              -- e.g. Rating.Average
  raw_observation_id uuid references je_raw_observations(id),
  transform_rule text,
  transform_version text,
  confidence     numeric,
  is_derived     boolean not null default false,
  manually_amended boolean not null default false,
  amended_by     uuid references auth.users(id),
  amended_at     timestamptz,
  collected_at   timestamptz not null default now()
);

create index if not exists je_prov_outlet_idx on je_field_provenance (outlet_id, field_key);

alter table je_field_provenance enable row level security;
drop policy if exists je_prov_select on je_field_provenance;
create policy je_prov_select on je_field_provenance for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
grant select on je_field_provenance to authenticated;

-- ---- data-quality snapshot ---------------------------------------------
-- One row written by the worker at the end of an execution. The full report lives
-- in `report` (percentages + counts + field availability by response type).
create table if not exists je_execution_quality (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  execution_id uuid not null references je_executions(id) on delete cascade,
  run_id       uuid not null references discovery_runs(id) on delete cascade,
  computed_at  timestamptz not null default now(),
  report       jsonb not null
);

create index if not exists je_quality_exec_idx on je_execution_quality (execution_id);

alter table je_execution_quality enable row level security;
drop policy if exists je_quality_select on je_execution_quality;
create policy je_quality_select on je_execution_quality for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
grant select on je_execution_quality to authenticated;
