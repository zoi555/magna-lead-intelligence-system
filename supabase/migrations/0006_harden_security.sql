-- 0006 — Security hardening (advisor remediation)
--
-- 1. Pin search_path on trigger functions.
-- 2. Worker RPCs (claim/heartbeat) are service-role only — revoke from anon/authenticated.
-- 3. Raw observations: protect the raw_payload at COLUMN level (browser cannot read it)
--    while allowing a tenant-scoped, invoker-rights summary view of safe metadata.

-- 1. search_path -----------------------------------------------------------
create or replace function touch_updated_at() returns trigger
  language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function forbid_update() returns trigger
  language plpgsql set search_path = public as $$
begin raise exception 'je_raw_observations is append-only (UPDATE forbidden)'; end $$;

-- 2. worker RPCs are service-role only -------------------------------------
revoke execute on function claim_je_execution(text, int) from public, anon, authenticated;
revoke execute on function heartbeat_je_execution(uuid, text, int, jsonb, int) from public, anon, authenticated;
-- tenancy helpers: anon never needs them; authenticated needs them for policy checks
revoke execute on function app_current_tenant_ids() from anon;
revoke execute on function app_is_tenant_member(uuid) from anon;

-- 3. raw observations: column-level protection -----------------------------
-- Tenant-scoped read policy so RLS is satisfied, then strip column access to
-- raw_payload so the browser client can never read the original payload.
drop policy if exists je_raw_select on je_raw_observations;
create policy je_raw_select on je_raw_observations for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));

revoke all on je_raw_observations from authenticated;
grant select (id, tenant_id, execution_id, run_id, source, response_type, source_record_id,
              query_context, requested_at, fetched_at, http_status, response_headers,
              content_hash, parser_version, adapter_version, schema_version, parse_status,
              parse_warnings, duplicate_of, attempt, created_at)
  on je_raw_observations to authenticated;   -- NOTE: raw_payload deliberately omitted

-- Recreate the summary view with invoker rights (inherits RLS + column grants).
drop view if exists je_observation_summary;
create view je_observation_summary
  with (security_invoker = on) as
  select id, tenant_id, execution_id, run_id, source, response_type, source_record_id,
         query_context, fetched_at, http_status, content_hash, parser_version,
         adapter_version, schema_version, parse_status, duplicate_of, attempt, created_at
    from je_raw_observations;

grant select on je_observation_summary to authenticated;
