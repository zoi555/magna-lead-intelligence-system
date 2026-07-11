-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 17_immutability_guards.sql — BEFORE-trigger guards that enforce append-only / no-delete rules.
-- Depends on: 04_rls_helpers.sql (app_private.app_forbid_write / app_forbid_delete),
--             10 (pipeline_runs, run_*), 13 (suppression via 16), 14 (export batches/items),
--             15 (telesales_lead_assignments), 16 (audit_logs, erasure_tombstones, suppression_list).
--
-- WHY TRIGGERS, NOT RLS:
--   * RLS is NOT the immutability mechanism. RLS filters ROWS for the `authenticated` role only.
--   * `service_role` BYPASSES RLS entirely — so mutation blocking must NOT rely on RLS.
--   * BEFORE triggers fire for EVERY role, including `service_role` and the table owner (they are
--     not bypassed by RLS or by grants), so a guard trigger that RAISES is the reliable, role-
--     independent blocker.
--   * Belt-and-braces `REVOKE UPDATE/DELETE` (including from `service_role`) is applied in
--     21_grants.sql. No grants and no RLS policies are created in THIS file.
-- No data, no seeds.

-- ── Fully immutable / append-only (block UPDATE and DELETE) ─────────────────────────────────

-- audit_logs: append-only. (INSERT is allowed so audit capture in 18 can write.)
create trigger no_mut_audit_logs
  before update or delete on public.audit_logs
  for each row execute function app_private.app_forbid_write();

-- erasure_tombstones: hash-only, retained; append-only.
create trigger no_mut_erasure_tombstones
  before update or delete on public.erasure_tombstones
  for each row execute function app_private.app_forbid_write();

-- run_territory_items: insert-only history (decision 7).
create trigger no_mut_run_territory_items
  before update or delete on public.run_territory_items
  for each row execute function app_private.app_forbid_write();

-- run_coverage_units: insert-only history (decision 7).
create trigger no_mut_run_coverage_units
  before update or delete on public.run_coverage_units
  for each row execute function app_private.app_forbid_write();

-- sales_pro_export_items: the record of what was sent to CRM — immutable once created.
-- Block UPDATE and DELETE (no justified reason to mutate an export line item).
create trigger no_mut_sales_pro_export_items
  before update or delete on public.sales_pro_export_items
  for each row execute function app_private.app_forbid_write();

-- ── Delete-immutable (block DELETE only; UPDATE allowed, later scoped by policies/grants) ────

-- suppression_list: never deleted; status withdrawal is an UPDATE, restricted to O/A in 20/21.
create trigger no_del_suppression_list
  before delete on public.suppression_list
  for each row execute function app_private.app_forbid_delete();

-- pipeline_runs: never deleted; service-role UPDATE of status/failure/finished_at/telemetry is
-- allowed later via 21 grants + the run being SR-owned (decision 7).
create trigger no_del_pipeline_runs
  before delete on public.pipeline_runs
  for each row execute function app_private.app_forbid_delete();

-- sales_pro_export_batches: archived (status), never deleted; controlled status updates later.
create trigger no_del_sales_pro_export_batches
  before delete on public.sales_pro_export_batches
  for each row execute function app_private.app_forbid_delete();

-- telesales_lead_assignments: NOT fully immutable — telesales needs worked_status/lead_status/
-- outcome_notes updates later (column-capped in 20/21). Block DELETE only.
create trigger no_del_telesales_lead_assignments
  before delete on public.telesales_lead_assignments
  for each row execute function app_private.app_forbid_delete();
