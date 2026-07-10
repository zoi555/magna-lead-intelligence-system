-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 04_rls_helpers.sql — security/role helper functions + guard-trigger functions.
-- Depends on: 02_enums.sql (user_role), 03_identity.sql (user_profiles).
--
-- OWNERSHIP: every SECURITY DEFINER function below MUST be owned by the trusted
-- migration/database owner (e.g. `postgres`), never by a low-privilege or app role — a
-- SECURITY DEFINER function runs with the OWNER's rights. Ownership is set by whoever runs the
-- migration; do not ALTER these to a weaker owner.
--
-- HARDENING: all functions pin `search_path = ''` and fully schema-qualify every reference, so
-- they cannot be hijacked via a mutable search_path.
--
-- EXECUTE GRANTS: `grant usage on schema app_private` and `grant execute on function ...` to
-- `authenticated` are applied LATER in 21_grants.sql (consistent with MIGRATION_DRAFTING_PLAN.md).
-- RLS policies call these helpers, so those grants are required before the policies work — but
-- they are intentionally NOT in this file.

create schema if not exists app_private;

-- Current user's role (NULL if no active profile).
create or replace function app_private.app_role()
  returns public.user_role
  language sql stable security definer
  set search_path = ''
as $$
  select role
  from public.user_profiles
  where user_id = auth.uid() and is_active
$$;

-- Owner/Admin?
create or replace function app_private.app_is_oa()
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app_private.app_role() in ('owner','admin')
$$;

-- Management or above (owner/admin/management)?
create or replace function app_private.app_is_mgmt_up()
  returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app_private.app_role() in ('owner','admin','management')
$$;

-- Current user's rep_code (for own-rep row scoping on the telesales surface).
create or replace function app_private.app_rep_code()
  returns text
  language sql stable security definer
  set search_path = ''
as $$
  select rep_code
  from public.user_profiles
  where user_id = auth.uid() and is_active
$$;

-- Guard trigger: block ALL updates and deletes (append-only / insert-only tables).
-- Applied to audit_logs, erasure_tombstones, run_territory_items, run_coverage_units in
-- 17_immutability_guards.sql. Blocks even the service role (which bypasses RLS but not triggers).
create or replace function app_private.app_forbid_write()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'table % is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end
$$;

-- Guard trigger: block DELETE only (delete-immutable tables where UPDATE-of-status is allowed,
-- e.g. suppression_list; and pipeline_runs which is SR-updatable but never deletable).
create or replace function app_private.app_forbid_delete()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'table % rows cannot be deleted', tg_table_name
    using errcode = 'restrict_violation';
end
$$;
