-- 0007 — Explicit function EXECUTE grants (least privilege)
--
-- Postgres grants EXECUTE to PUBLIC by default. Revoke that and grant only the
-- roles that actually need each function, so nothing is callable by anon and the
-- worker RPCs are reachable solely by the service role.

-- Tenancy helpers: needed by `authenticated` for RLS policy evaluation, and by the
-- service role; NOT by anon. (These only ever return the CALLER's own membership.)
revoke execute on function app_current_tenant_ids() from public;
revoke execute on function app_is_tenant_member(uuid) from public;
grant  execute on function app_current_tenant_ids() to authenticated, service_role;
grant  execute on function app_is_tenant_member(uuid) to authenticated, service_role;

-- Worker RPCs: service role only (the locally-runnable worker authenticates as the
-- service role, server-side). Revoked from everyone else in 0006.
grant execute on function claim_je_execution(text, int) to service_role;
grant execute on function heartbeat_je_execution(uuid, text, int, jsonb, int) to service_role;
