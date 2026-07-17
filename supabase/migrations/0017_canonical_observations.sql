-- 0017 — Canonical vs historical-duplicate observations (Part 2)
--
-- The 718 historical duplicate observations from the pre-fix lease double-claim are
-- immutable evidence and are PRESERVED (duplicate_of links verified correct, 0 dangling).
-- Operational surfaces must use CANONICAL observations only (duplicate_of IS NULL);
-- duplicates remain visible ONLY to admin/audit (the service role, via the base table).
--
-- The browser-facing summary view is therefore restricted to canonical rows.

drop view if exists je_observation_summary;
create view je_observation_summary
  with (security_invoker = on) as
  select id, tenant_id, execution_id, run_id, source, response_type, source_record_id,
         query_context, fetched_at, http_status, content_hash, parser_version,
         adapter_version, schema_version, parse_status, duplicate_of, attempt, created_at
    from je_raw_observations
   where duplicate_of is null;   -- CANONICAL only; duplicates are admin/audit (service-role) only
grant select on je_observation_summary to authenticated;

comment on view je_observation_summary is
  'Canonical observations only (duplicate_of IS NULL). Historical duplicates are audit-only via the base table (service role).';
