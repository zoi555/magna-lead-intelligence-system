-- 0018 — Provider-result geography validation (append-only audit).
--
-- Purpose: a provider can technically "succeed" (return records) while returning records for the
-- WRONG place (Uber `discover` resolved a UB1 request to San Francisco, US — ISS-0018). This table
-- records one verdict per observation — valid_geography / out_of_scope_geography /
-- unverifiable_geography — so wrong-geography results are quarantined out of operational use but
-- retained as immutable audit evidence.
--
-- Effect on existing rows: NONE. This creates a brand-new table only. Additive and reversible.

create table if not exists public.provider_geography_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  run_id uuid references discovery_runs(id) on delete set null,
  execution_id uuid references je_executions(id) on delete set null,
  observation_id uuid references je_raw_observations(id) on delete set null,
  source text not null,
  source_record_id text,
  requested_country text not null,
  requested_geography text,
  resolved_query_units text[] not null default '{}',
  provider_country text,
  provider_postcode text,
  provider_postcode_type text,
  provider_has_coords boolean not null default false,
  status text not null check (status in ('valid_geography','out_of_scope_geography','unverifiable_geography')),
  signal text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_geo_val_run on public.provider_geography_validations(run_id);
create index if not exists idx_provider_geo_val_status on public.provider_geography_validations(status);
create index if not exists idx_provider_geo_val_obs on public.provider_geography_validations(observation_id);

-- Append-only: verdicts are audit evidence — forbid UPDATE/DELETE (same posture as je_raw_observations).
create or replace function public.forbid_geo_val_mutation() returns trigger language plpgsql
  set search_path = '' as $$
begin
  raise exception 'provider_geography_validations is append-only (audit evidence)';
end $$;
drop trigger if exists provider_geo_val_no_mutate on public.provider_geography_validations;
create trigger provider_geo_val_no_mutate before update or delete on public.provider_geography_validations
  for each row execute function public.forbid_geo_val_mutation();

-- RLS: tenant-scoped read for authenticated; writes via service role only (mirrors 0015 tables).
alter table public.provider_geography_validations enable row level security;
drop policy if exists provider_geography_validations_select on public.provider_geography_validations;
create policy provider_geography_validations_select on public.provider_geography_validations
  for select to authenticated using (tenant_id in (select app_current_tenant_ids()));
revoke all on public.provider_geography_validations from anon;
revoke insert, update, delete, truncate on public.provider_geography_validations from authenticated;
grant select on public.provider_geography_validations to authenticated;
