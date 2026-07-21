-- 0025 — Auth bootstrap support + a shared, append-only audit log.
--
-- Purely additive: no existing table/column is touched. Reuses the tenancy primitives
-- already built in 0001 (tenants, tenant_members, app_current_tenant_ids(),
-- app_is_tenant_member()) rather than inventing a parallel structure.
--
-- app_audit_log is the ONE shared audit trail for both sign-in/bootstrap events (this
-- migration) and settings changes (0026, via a trigger) — one audit concept, not two.
-- Append-only, same convention as provider_geography_validations (0018) /
-- je_raw_observations (0006): a BEFORE UPDATE OR DELETE trigger raises, so evidence can
-- never be edited or removed after the fact, even by an application bug.

create table if not exists app_audit_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  actor_user_id uuid references auth.users(id),
  actor_email   text,
  action        text not null,              -- e.g. 'owner_bootstrap', 'sign_in', 'settings_update'
  target_table  text,
  target_id     text,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists app_audit_log_tenant_idx on app_audit_log (tenant_id, created_at desc);

alter table app_audit_log enable row level security;

drop policy if exists app_audit_log_select on app_audit_log;
create policy app_audit_log_select on app_audit_log for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));

create or replace function forbid_audit_log_mutate() returns trigger
  language plpgsql set search_path = public as $$
begin raise exception 'app_audit_log is append-only (UPDATE/DELETE forbidden)'; end $$;

drop trigger if exists app_audit_log_no_mutate on app_audit_log;
create trigger app_audit_log_no_mutate before update or delete on app_audit_log
  for each row execute function forbid_audit_log_mutate();

revoke all on app_audit_log from anon;
revoke update, delete on app_audit_log from authenticated;
grant select, insert on app_audit_log to authenticated;
grant all on app_audit_log to service_role;

-- Role-check helper for RLS policies that need an owner/admin distinction beyond plain
-- membership (app_is_tenant_member already covers "is a member at all").
create or replace function app_has_tenant_role(p_tenant uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = p_tenant and user_id = auth.uid() and role = any(p_roles)
  );
$$;
revoke execute on function app_has_tenant_role(uuid, text[]) from public;
grant execute on function app_has_tenant_role(uuid, text[]) to authenticated, service_role;

-- Bootstrap idempotency, enforced at the DB level (not just app-code): at most one
-- 'owner' row per tenant. This is a single-owner-bootstrap-era invariant, not a
-- permanent architectural ceiling — a future multi-owner feature would need to drop
-- this index deliberately, not accidentally race past it.
create unique index if not exists tenant_members_one_owner_per_tenant
  on tenant_members (tenant_id) where role = 'owner';
