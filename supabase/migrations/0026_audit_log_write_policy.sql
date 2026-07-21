-- 0026 — Fix forward: app_audit_log must not be directly insertable by plain
-- `authenticated` sessions.
--
-- 0025 granted table-level INSERT to `authenticated` but defined no RLS INSERT policy —
-- since RLS defaults to deny with no matching policy, that grant was inert. On reflection
-- that's also the WRONG trust model even if it had worked: an audit trail that any
-- authenticated client could insert into directly is not trustworthy evidence. The only
-- legitimate writers are: (a) the service-role client (bootstrap, sign-in logging — both
-- happen server-side during auth-callback processing, never from the browser), and (b) a
-- SECURITY DEFINER trigger on tenant_settings/source_operational_settings (0027) that logs
-- a settings change as part of the same transaction as the change itself, regardless of
-- the invoking session's own table grants.
--
-- Applied ~10 minutes after 0025, before anything depended on the broken grant — fixed
-- forward per this project's established convention (see docs/09_DECISIONS.md, the
-- migration-0024 precedent) rather than editing an already-applied migration in place.

revoke insert on app_audit_log from authenticated;
