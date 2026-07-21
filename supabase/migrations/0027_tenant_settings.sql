-- 0027 — Persisted, audited tenant settings.
--
-- tenant_settings: one row per tenant, owner-editable operational defaults (NOT
-- code-defined technical capabilities — those stay in SOURCE_REGISTRY, enforced
-- server-side in the API route, never overridable from here).
-- source_operational_settings: per-tenant, per-source operational enablement — the
-- owner's choice of whether a technically-supported source is switched on, never a way
-- to mark a technically-unsupported source (e.g. Uber Eats/Deliveroo today) operational.
--
-- Both tables: SELECT for any tenant member; INSERT/UPDATE restricted to owner/admin via
-- app_has_tenant_role() (migration 0025). Every UPDATE is logged to app_audit_log by a
-- SECURITY DEFINER trigger (runs with elevated privilege regardless of the invoking
-- session's own grants — see 0026's note on why authenticated can't insert audit rows
-- directly). Writes go through the caller's own session-scoped client so RLS is the real
-- enforcement boundary — application code checks role too, but that is defence in depth,
-- not the only guard.

create table if not exists tenant_settings (
  tenant_id                          uuid primary key references tenants(id),
  display_name                       text,                       -- null = fall back to env/local-dev logic in app-config.ts
  default_spend_ceiling_gbp          numeric check (default_spend_ceiling_gbp is null or default_spend_ceiling_gbp >= 0),
  default_sources                    jsonb not null default '["just_eat"]',
  data_retention_days                int check (data_retention_days is null or data_retention_days > 0),
  import_defaults                    jsonb not null default '{"defaultFormat":"csv","requireChecksumMatch":true}',
  export_defaults                    jsonb not null default '{"defaultFormat":"csv","includeUnverifiedFields":false}',
  default_territory_behaviour        text not null default 'require_physical_location',
  default_existing_customer_exclusion boolean not null default false,
  ui_preferences                     jsonb not null default '{}',
  updated_by                         uuid references auth.users(id),
  updated_at                         timestamptz not null default now()
);

create table if not exists source_operational_settings (
  tenant_id             uuid not null references tenants(id),
  source_id             text not null,                  -- matches SOURCE_REGISTRY ids, e.g. 'just_eat'
  enabled               boolean not null default false,
  display_status_override text,
  updated_by            uuid references auth.users(id),
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, source_id)
);

alter table tenant_settings enable row level security;
alter table source_operational_settings enable row level security;

drop policy if exists tenant_settings_select on tenant_settings;
create policy tenant_settings_select on tenant_settings for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
drop policy if exists tenant_settings_write on tenant_settings;
create policy tenant_settings_write on tenant_settings for all to authenticated
  using (app_has_tenant_role(tenant_id, array['owner','admin']))
  with check (app_has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists source_operational_settings_select on source_operational_settings;
create policy source_operational_settings_select on source_operational_settings for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
drop policy if exists source_operational_settings_write on source_operational_settings;
create policy source_operational_settings_write on source_operational_settings for all to authenticated
  using (app_has_tenant_role(tenant_id, array['owner','admin']))
  with check (app_has_tenant_role(tenant_id, array['owner','admin']));

grant select, insert, update on tenant_settings to authenticated;
grant select, insert, update on source_operational_settings to authenticated;
grant all on tenant_settings, source_operational_settings to service_role;

-- keep updated_at / updated_by fresh, and (SECURITY DEFINER) log every change regardless
-- of the invoking session's own table grants on app_audit_log.
create or replace function touch_settings_and_audit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  insert into app_audit_log (tenant_id, actor_user_id, action, target_table, target_id, old_value, new_value)
  values (
    new.tenant_id, auth.uid(), 'settings_update', TG_TABLE_NAME,
    new.tenant_id::text || coalesce(':' || (to_jsonb(new)->>'source_id'), ''),
    to_jsonb(OLD), to_jsonb(new)
  );
  return new;
end $$;

drop trigger if exists tenant_settings_audit on tenant_settings;
create trigger tenant_settings_audit before update on tenant_settings
  for each row execute function touch_settings_and_audit();

drop trigger if exists source_operational_settings_audit on source_operational_settings;
create trigger source_operational_settings_audit before update on source_operational_settings
  for each row execute function touch_settings_and_audit();

-- Seed a settings row for the existing default tenant so /api/settings never has to
-- upsert-on-first-read. display_name left null deliberately (falls back to existing
-- env/local-dev logic) — this is NOT where Magna branding gets hardcoded.
insert into tenant_settings (tenant_id)
  select id from tenants where slug = 'magna'
  on conflict (tenant_id) do nothing;

insert into source_operational_settings (tenant_id, source_id, enabled)
  select t.id, s.source_id, s.enabled
  from tenants t
  cross join (values ('just_eat', true), ('manual_import', true), ('uber_eats', false), ('deliveroo', false)) as s(source_id, enabled)
  where t.slug = 'magna'
  on conflict (tenant_id, source_id) do nothing;
