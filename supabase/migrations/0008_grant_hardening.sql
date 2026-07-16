-- 0008 — Least-privilege table grants (defence in depth on top of RLS)
--
-- Supabase's default privileges grant anon + authenticated ALL on new public tables;
-- RLS is what actually restricts rows. We tighten this so the grant surface matches
-- intent: anon touches nothing (no public surface in Stage 1); authenticated is
-- read-only except for the two tables it legitimately writes (runs, execution cancel).
-- The worker uses the service role, which is unaffected.

-- anon: no access to any discovery/JE table.
revoke all on tenants, tenant_members, discovery_runs, je_executions,
              je_raw_observations, je_outlets, je_rating_history,
              je_field_provenance, je_execution_quality
  from anon;

-- authenticated: read-only on worker-written + reference tables.
revoke insert, update, delete, truncate on
       tenants, tenant_members, je_outlets, je_rating_history,
       je_field_provenance, je_execution_quality
  from authenticated;

-- authenticated may create/update its own runs, and update executions (cancel only)
revoke insert, delete, truncate on je_executions from authenticated;   -- keep select, update
revoke delete, truncate on discovery_runs from authenticated;          -- keep select, insert, update

-- raw observations: authenticated keeps ONLY the column-level SELECT from 0006
-- (raw_payload excluded); ensure no table-wide privilege lingers.
revoke insert, update, delete, truncate on je_raw_observations from authenticated;
