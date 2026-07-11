-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 19_rls_enable.sql — enable Row Level Security on EVERY public table (03–16).
-- Depends on: all table-creating migrations 03–16.
--
-- WHY THIS FILE MATTERS: a table that is GRANT-ed to `authenticated` but has RLS DISABLED is a
-- leak (every authenticated user could read all rows). Enabling RLS on 100% of tables is the
-- defence baseline. Policies come in 20; GRANT/REVOKE in 21.
--
-- RLS IS NOT ENOUGH BY ITSELF:
--   * RLS alone is NOT immutability — guard triggers (17) provide append-only / no-delete.
--   * `service_role` BYPASSES RLS entirely — protection also depends on grants/revokes (21) and
--     on the guard triggers (17). RLS only filters rows for the `authenticated` role.
--   * FORCE ROW LEVEL SECURITY additionally subjects the TABLE OWNER to RLS (still not service_role,
--     which has BYPASSRLS) — used on the most protected tables below.
-- No policies here. No grants here. No data, no seeds.

-- ── enable RLS on every table ───────────────────────────────────────────────────────────────
-- 03 identity
alter table public.user_profiles              enable row level security;
-- 05 config
alter table public.app_settings               enable row level security;
alter table public.integration_status         enable row level security;
alter table public.road_display_configs       enable row level security;
-- 06 map assets
alter table public.map_assets                 enable row level security;
-- 07 files/imports
alter table public.uploaded_files             enable row level security;
alter table public.customer_postcode_imports  enable row level security;
alter table public.delivery_boundary_imports  enable row level security;
-- 08 territory
alter table public.territory_sets             enable row level security;
alter table public.territory_items            enable row level security;
-- 09 delivery
alter table public.delivery_boundaries        enable row level security;
alter table public.delivery_boundary_items    enable row level security;
-- 10 runs/coverage
alter table public.pipeline_runs              enable row level security;
alter table public.run_territory_items        enable row level security;
alter table public.run_coverage_units         enable row level security;
alter table public.coverage_summary           enable row level security;
-- 11 existing customers
alter table public.existing_customers         enable row level security;
-- 12 leads + children
alter table public.discovered_leads           enable row level security;
alter table public.lead_brands                enable row level security;
alter table public.lead_contacts              enable row level security;
alter table public.fsa_matches                enable row level security;
alter table public.company_profiles           enable row level security;
alter table public.company_financials         enable row level security;
alter table public.platform_profiles          enable row level security;
alter table public.lead_scores                enable row level security;
alter table public.lead_triggers              enable row level security;
-- 13 ignored/reactivation/expansion/triggers
alter table public.ignored_leads_audit        enable row level security;
alter table public.reactivation_leads         enable row level security;
alter table public.expansion_leads            enable row level security;
alter table public.same_day_trigger_queue     enable row level security;
-- 14 export/CRM
alter table public.crm_field_mappings         enable row level security;
alter table public.sales_pro_export_batches   enable row level security;
alter table public.sales_pro_export_items     enable row level security;
-- 15 telesales safe surface
alter table public.telesales_lead_assignments enable row level security;
-- 16 compliance
alter table public.suppression_list           enable row level security;
alter table public.erasure_tombstones         enable row level security;
alter table public.audit_logs                 enable row level security;

-- ── FORCE RLS on the most protected / immutable / compliance tables ─────────────────────────
-- (subjects the table owner to RLS too; service_role still bypasses — see comments above)
--
-- audit_logs is INTENTIONALLY *NOT* force-RLS'd:
--   * Audit rows are written by app_private.write_audit(...), a SECURITY DEFINER function owned by
--     the trusted migration/database owner, which runs the INSERT AS that owner.
--   * FORCE RLS would subject that owner/definer INSERT path to audit_logs' RLS policies.
--   * By design audit_logs has NO INSERT policy (file 20), so FORCE RLS would REJECT the definer
--     INSERT and break audit capture entirely.
--   * Browser users are still fully protected: RLS is ENABLED, audit_logs is SELECT-only via the
--     O/A policy (file 20) + a matching SELECT grant (file 21), and there is NO INSERT grant to
--     authenticated (file 21).
--   * audit_logs IMMUTABILITY is enforced by the 17 guard trigger (blocks UPDATE/DELETE for every
--     role incl. service_role) plus the 21 REVOKE UPDATE,DELETE — NOT by FORCE RLS.
alter table public.erasure_tombstones force row level security;
alter table public.suppression_list   force row level security;
alter table public.existing_customers force row level security;
-- (Optional to also FORCE run_*/export_items; left to review — guard triggers already protect them.)

-- ── Review helper: every public base table MUST have RLS enabled ────────────────────────────
-- This query MUST return zero rows. Run it in UAT/CI after applying 19.
--   select n.nspname, c.relname
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relkind = 'r'
--     and c.relrowsecurity = false
--   order by c.relname;
