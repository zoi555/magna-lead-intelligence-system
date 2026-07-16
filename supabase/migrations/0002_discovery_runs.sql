-- 0002 — Discovery runs (canonical persistence of a Run Builder configuration)
--
-- One row per saved discovery run. The full Run Builder draft is snapshotted in
-- config_snapshot (JSONB) for provenance; the frequently-queried parts are also
-- promoted to structured columns. localStorage remains browser recovery only —
-- THIS table is the canonical store.

create table if not exists discovery_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  created_by       uuid references auth.users(id),
  name             text not null,
  reference        text,
  objective        text,
  status           run_status not null default 'draft',
  schema_version   int not null default 1,
  -- territory
  territory_mode   text,
  territory_input  text,
  derived_outcodes jsonb not null default '[]',
  -- profile / filters / requested fields / source config
  search_terms     jsonb not null default '[]',
  target_filters   jsonb not null default '{}',
  requested_fields jsonb not null default '[]',
  source_config    jsonb not null default '{}',
  config_snapshot  jsonb not null default '{}',   -- full RunDraft snapshot
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists discovery_runs_tenant_idx on discovery_runs (tenant_id, created_at desc);

alter table discovery_runs enable row level security;

-- Authenticated users may read/write runs for their own tenant. (Stage 1 server
-- routes use the service-role key server-side; these policies are for when auth
-- is wired into the browser client.)
drop policy if exists discovery_runs_select on discovery_runs;
create policy discovery_runs_select on discovery_runs for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));

drop policy if exists discovery_runs_insert on discovery_runs;
create policy discovery_runs_insert on discovery_runs for insert to authenticated
  with check (tenant_id in (select app_current_tenant_ids()) and created_by = auth.uid());

drop policy if exists discovery_runs_update on discovery_runs;
create policy discovery_runs_update on discovery_runs for update to authenticated
  using (tenant_id in (select app_current_tenant_ids()))
  with check (tenant_id in (select app_current_tenant_ids()));

grant select, insert, update on discovery_runs to authenticated;

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists discovery_runs_touch on discovery_runs;
create trigger discovery_runs_touch before update on discovery_runs
  for each row execute function touch_updated_at();
