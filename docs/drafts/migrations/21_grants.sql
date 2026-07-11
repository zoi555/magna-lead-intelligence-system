-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 21_grants.sql — GRANT/REVOKE model (Rev 3 §14, decision 6). Makes 19/20 effective.
-- Depends on: 04 (app_private helpers), 05–16 (tables), 19 (RLS enabled), 20 (policies).
--
-- MODEL: RLS filters rows; GRANTS confer the base privilege. A policy without a grant = no access.
-- Two buckets: Bucket 1 tables get SELECT to `authenticated` (RLS then restricts rows; telesales
-- gets 0 rows via policy). Bucket 2 (existing_customers, erasure_tombstones) get NO grant at all.
-- `anon` gets nothing. `service_role` keeps what the pipeline needs EXCEPT where guard triggers +
-- revokes must block mutation. No secrets. No data.

-- ══ 0. Revoke broad defaults; stop future tables leaking (decision 6) ═══════════════════════
revoke all on all tables    in schema public from anon;
revoke all on all tables    in schema public from authenticated;
revoke all on all sequences in schema public from anon;          -- no implicit sequence access
-- Future tables/sequences created later must NOT auto-grant to anon/authenticated:
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon;   -- functions granted explicitly
-- REMINDER: every FUTURE migration that adds a table MUST explicitly grant the minimum access;
-- nothing is granted implicitly.

-- ══ 1. Helper execution (RLS policies call these) ══════════════════════════════════════════
grant usage on schema app_private to authenticated;
grant execute on function app_private.app_role()       to authenticated;
grant execute on function app_private.app_is_oa()      to authenticated;
grant execute on function app_private.app_is_mgmt_up() to authenticated;
grant execute on function app_private.app_rep_code()   to authenticated;

-- ══ 2. Bucket 1 — SELECT to authenticated (RLS restricts rows; telesales -> 0 rows) ════════
grant select on
  public.user_profiles,
  public.app_settings,
  public.integration_status,
  public.road_display_configs,
  public.map_assets,
  public.uploaded_files,
  public.customer_postcode_imports,
  public.delivery_boundary_imports,
  public.territory_sets,
  public.territory_items,
  public.delivery_boundaries,
  public.delivery_boundary_items,
  public.pipeline_runs,
  public.run_territory_items,
  public.run_coverage_units,
  public.coverage_summary,
  public.discovered_leads,
  public.lead_brands,
  public.lead_contacts,
  public.fsa_matches,
  public.company_profiles,
  public.company_financials,
  public.platform_profiles,
  public.lead_scores,
  public.lead_triggers,
  public.ignored_leads_audit,
  public.reactivation_leads,
  public.expansion_leads,
  public.same_day_trigger_queue,
  public.crm_field_mappings,
  public.sales_pro_export_batches,
  public.sales_pro_export_items,
  public.telesales_lead_assignments,
  public.suppression_list,
  public.audit_logs
  to authenticated;

-- ══ 2b. Bucket 2 — NO grant to authenticated (server-side only) ═════════════════════════════
--   public.existing_customers  -> reached only via service_role (dedup).
--   public.erasure_tombstones  -> hash-only; written/read server-side only.
-- (Deliberately NOT granted; RLS is ENABLED + FORCED on both.)

-- ══ 3. Telesales safe surface ══════════════════════════════════════════════════════════════
-- Full SELECT (table holds only safe columns). Column-limited UPDATE only. RLS (file 20) scopes
-- rows to own rep and preserves assigned_rep.
grant select on public.telesales_lead_assignments to authenticated;
grant update (worked_status, lead_status, outcome_notes, updated_at)
  on public.telesales_lead_assignments to authenticated;
-- NOT granted for update: export_batch_id, discovered_lead_id, assigned_rep, business_name,
-- trading_address, postcode, safe_contact_phone, priority_tier, trigger_reason, assigned_at.

-- ══ 4. Owner/Admin write grants (RLS policies in 20 already restrict to app_is_oa()) ═══════
-- Column/row restriction is by the 20 policies; these grants confer the base privilege only.
grant insert, update, delete on
  public.user_profiles,
  public.app_settings,
  public.integration_status,
  public.road_display_configs,
  public.map_assets,
  public.territory_sets,
  public.territory_items,
  public.crm_field_mappings
  to authenticated;
grant insert, update on public.uploaded_files             to authenticated;  -- no delete
grant update          on public.delivery_boundaries       to authenticated;  -- O/A flip is_current (policy-gated)
grant insert, update  on public.sales_pro_export_batches  to authenticated;  -- create + approve/status; no delete
grant insert, update  on public.suppression_list          to authenticated;  -- insert + status update; NO delete
grant insert, update  on public.telesales_lead_assignments to authenticated; -- O/A manage; no delete (col UPDATE cap in §3)
-- Management receives NO direct write grants beyond the above (which are all O/A-gated by policy).

-- ══ 5. Immutable / protected REVOKES (belt-and-braces to the guard triggers in 17) ═════════
-- Revoke from anon, authenticated AND service_role so mutation is blocked even for the pipeline.
-- (Guard triggers in 17 are the primary blocker; these revokes are defence-in-depth.)
revoke update, delete on public.audit_logs             from anon, authenticated, service_role;
revoke update, delete on public.erasure_tombstones     from anon, authenticated, service_role;
revoke delete          on public.suppression_list      from anon, authenticated, service_role;
revoke delete          on public.pipeline_runs         from anon, authenticated, service_role;
revoke update, delete  on public.run_territory_items   from anon, authenticated, service_role;
revoke update, delete  on public.run_coverage_units    from anon, authenticated, service_role;
revoke delete          on public.sales_pro_export_batches from anon, authenticated, service_role;
revoke update, delete  on public.sales_pro_export_items  from anon, authenticated, service_role;
revoke delete          on public.telesales_lead_assignments from anon, authenticated, service_role;

-- ══ 6. Service-role note (no broad mutation where guards must block) ════════════════════════
-- service_role bypasses RLS but NOT guard triggers and NOT the revokes above. Do NOT re-grant
-- UPDATE/DELETE on the tables in §5 to service_role. The pipeline still INSERTs (not revoked) into
-- run_*/audit/erasure/etc., and UPDATEs pipeline_runs status/failure/finished_at (UPDATE not revoked
-- on pipeline_runs). No Supabase keys/secrets appear anywhere in the schema or these grants.

-- ══ 7. REVIEW CHECKLIST (verify in UAT/CI before trusting this file) ════════════════════════
--  [ ] authenticated has NO INSERT privilege on audit_logs:
--        select has_table_privilege('authenticated','public.audit_logs','INSERT');  -- expect false
--  [ ] app_private.write_audit(...) CAN insert via SECURITY DEFINER ownership (audit_logs is NOT
--        force-RLS'd, file 19): trigger a change on an audited table and confirm an audit row appears.
--  [ ] authenticated can SELECT audit_logs ONLY through the O/A policy + SELECT grant:
--        as an O/A user -> rows returned; as management/telesales -> 0 rows.
--  [ ] UPDATE/DELETE on audit_logs are blocked for authenticated AND service_role (17 trigger + §5
--        revoke): both must RAISE, not silently no-op.
--  [ ] Bucket 2: has_table_privilege('authenticated','public.existing_customers','SELECT') = false;
--        same for public.erasure_tombstones.
--  [ ] Telesales UPDATE is limited to worked_status/lead_status/outcome_notes/updated_at only.
--  [ ] No table in schema public is SELECT-granted to authenticated without RLS enabled (see 19 helper).
