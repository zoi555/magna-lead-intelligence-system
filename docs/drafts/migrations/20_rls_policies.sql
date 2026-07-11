-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 20_rls_policies.sql — RLS POLICIES only. No grants/revokes (those are 21_grants.sql).
-- Depends on: 04_rls_helpers.sql (app_private.app_role / app_is_oa / app_is_mgmt_up / app_rep_code),
--             19_rls_enable.sql (RLS enabled), and all tables 03–16.
--
-- IMPORTANT: a policy WITHOUT a matching GRANT (21) yields no access — RLS filters rows, grants
-- confer the base privilege. All policies below are scoped `to authenticated` (NEVER anon/public),
-- so no policy grants anonymous access. Function EXECUTE grants for the app_private helpers are in
-- 21_grants.sql. Telesales protection on CLASS-MGMT tables is enforced by these policies returning
-- 0 rows for telesales; `service_role` bypasses RLS and writes server-side (not via these policies).
-- No data, no seeds.

-- ═══ Identity ═══════════════════════════════════════════════════════════════════════════════
-- user_profiles: users read OWN profile; Owner/Admin read & manage ALL.
create policy up_sel_self_or_oa on public.user_profiles
  for select to authenticated using (user_id = auth.uid() or app_private.app_is_oa());
create policy up_ins_oa on public.user_profiles
  for insert to authenticated with check (app_private.app_is_oa());
create policy up_upd_oa on public.user_profiles
  for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy up_del_oa on public.user_profiles
  for delete to authenticated using (app_private.app_is_oa());

-- ═══ Config (CLASS-OA: Management may VIEW, Owner/Admin WRITE) ══════════════════════════════
-- app_settings (is_secret stays false; no secrets stored regardless)
create policy as_sel_mgmt on public.app_settings
  for select to authenticated using (app_private.app_is_mgmt_up());
create policy as_ins_oa on public.app_settings for insert to authenticated with check (app_private.app_is_oa());
create policy as_upd_oa on public.app_settings for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy as_del_oa on public.app_settings for delete to authenticated using (app_private.app_is_oa());

-- integration_status
create policy is_sel_mgmt on public.integration_status for select to authenticated using (app_private.app_is_mgmt_up());
create policy is_ins_oa on public.integration_status for insert to authenticated with check (app_private.app_is_oa());
create policy is_upd_oa on public.integration_status for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy is_del_oa on public.integration_status for delete to authenticated using (app_private.app_is_oa());

-- road_display_configs
create policy rdc_sel_mgmt on public.road_display_configs for select to authenticated using (app_private.app_is_mgmt_up());
create policy rdc_ins_oa on public.road_display_configs for insert to authenticated with check (app_private.app_is_oa());
create policy rdc_upd_oa on public.road_display_configs for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy rdc_del_oa on public.road_display_configs for delete to authenticated using (app_private.app_is_oa());

-- map_assets (coverage map is not a telesales surface)
create policy ma_sel_mgmt on public.map_assets for select to authenticated using (app_private.app_is_mgmt_up());
create policy ma_ins_oa on public.map_assets for insert to authenticated with check (app_private.app_is_oa());
create policy ma_upd_oa on public.map_assets for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy ma_del_oa on public.map_assets for delete to authenticated using (app_private.app_is_oa());

-- ═══ Files / imports (Management read, Owner/Admin write; bytes stay in private Storage) ════
create policy uf_sel_mgmt on public.uploaded_files for select to authenticated using (app_private.app_is_mgmt_up());
create policy uf_ins_oa on public.uploaded_files for insert to authenticated with check (app_private.app_is_oa());
create policy uf_upd_oa on public.uploaded_files for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());

-- customer_postcode_imports / delivery_boundary_imports: Management read; parsing done by service role.
create policy cpi_sel_mgmt on public.customer_postcode_imports for select to authenticated using (app_private.app_is_mgmt_up());
create policy dbimp_sel_mgmt on public.delivery_boundary_imports for select to authenticated using (app_private.app_is_mgmt_up());

-- ═══ Territory (Owner/Admin MANAGE, Management read) ════════════════════════════════════════
create policy ts_sel_mgmt on public.territory_sets for select to authenticated using (app_private.app_is_mgmt_up());
create policy ts_ins_oa on public.territory_sets for insert to authenticated with check (app_private.app_is_oa());
create policy ts_upd_oa on public.territory_sets for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy ts_del_oa on public.territory_sets for delete to authenticated using (app_private.app_is_oa());

create policy ti_sel_mgmt on public.territory_items for select to authenticated using (app_private.app_is_mgmt_up());
create policy ti_ins_oa on public.territory_items for insert to authenticated with check (app_private.app_is_oa());
create policy ti_upd_oa on public.territory_items for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy ti_del_oa on public.territory_items for delete to authenticated using (app_private.app_is_oa());

-- ═══ Delivery (Management read; Owner/Admin flip is_current; rows import-loaded by service role) ══
create policy db_sel_mgmt on public.delivery_boundaries for select to authenticated using (app_private.app_is_mgmt_up());
create policy db_upd_oa   on public.delivery_boundaries for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy dbi_sel_mgmt on public.delivery_boundary_items for select to authenticated using (app_private.app_is_mgmt_up());
-- (no user write policy on delivery_boundary_items => service-role writes only)

-- ═══ Runs / coverage (Management read; NO user write; SR maintains; no delete) ══════════════
create policy pr_sel_mgmt  on public.pipeline_runs       for select to authenticated using (app_private.app_is_mgmt_up());
create policy rti_sel_mgmt on public.run_territory_items for select to authenticated using (app_private.app_is_mgmt_up());
create policy rcu_sel_mgmt on public.run_coverage_units  for select to authenticated using (app_private.app_is_mgmt_up());
create policy cs_sel_mgmt  on public.coverage_summary    for select to authenticated using (app_private.app_is_mgmt_up());
-- pipeline_runs: service-role updates status/failure/finished_at are NOT via a browser policy
-- (service_role bypasses RLS). No delete policy (17 blocks delete). No user write policies.

-- ═══ existing_customers — NO authenticated policy (server-side only, Bucket 2) ══════════════
-- Deliberately NO policy. RLS is enabled + FORCED and there is no grant (21), so no browser user
-- (including Owner/Admin) can read it; Owner/Admin reach it only via the service role (dedup).

-- ═══ Leads + sensitive children (Management + Owner/Admin READ; TELESALES NONE; SR write) ═══
create policy dl_sel_mgmt on public.discovered_leads   for select to authenticated using (app_private.app_is_mgmt_up());
create policy lb_sel_mgmt on public.lead_brands        for select to authenticated using (app_private.app_is_mgmt_up());
create policy lc_sel_mgmt on public.lead_contacts      for select to authenticated using (app_private.app_is_mgmt_up());
create policy fm_sel_mgmt on public.fsa_matches        for select to authenticated using (app_private.app_is_mgmt_up());
create policy cp_sel_mgmt on public.company_profiles   for select to authenticated using (app_private.app_is_mgmt_up());
create policy cf_sel_mgmt on public.company_financials for select to authenticated using (app_private.app_is_mgmt_up());
create policy pp_sel_mgmt on public.platform_profiles  for select to authenticated using (app_private.app_is_mgmt_up());
create policy ls_sel_mgmt on public.lead_scores        for select to authenticated using (app_private.app_is_mgmt_up());
create policy lt_sel_mgmt on public.lead_triggers      for select to authenticated using (app_private.app_is_mgmt_up());
-- No telesales policy on ANY of the above => telesales gets 0 rows. No user write => SR writes only.

-- ═══ Ignored / reactivation / expansion (Management + Owner/Admin READ; telesales none) ═════
create policy ila_sel_mgmt on public.ignored_leads_audit for select to authenticated using (app_private.app_is_mgmt_up());
create policy rl_sel_mgmt  on public.reactivation_leads  for select to authenticated using (app_private.app_is_mgmt_up());
create policy el_sel_mgmt  on public.expansion_leads     for select to authenticated using (app_private.app_is_mgmt_up());

-- ═══ same_day_trigger_queue (Owner/Admin/Management read & manage; TELESALES NONE) ═════════
create policy sdt_sel_mgmt on public.same_day_trigger_queue for select to authenticated using (app_private.app_is_mgmt_up());
create policy sdt_upd_mgmt on public.same_day_trigger_queue for update to authenticated using (app_private.app_is_mgmt_up()) with check (app_private.app_is_mgmt_up());
-- no telesales policy (telesales sees triggers via telesales_lead_assignments.trigger_reason).

-- ═══ Export / CRM ═══════════════════════════════════════════════════════════════════════════
-- crm_field_mappings: Management read; Owner/Admin manage (incl. verification).
create policy cfm_sel_mgmt on public.crm_field_mappings for select to authenticated using (app_private.app_is_mgmt_up());
create policy cfm_ins_oa on public.crm_field_mappings for insert to authenticated with check (app_private.app_is_oa());
create policy cfm_upd_oa on public.crm_field_mappings for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
create policy cfm_del_oa on public.crm_field_mappings for delete to authenticated using (app_private.app_is_oa());

-- sales_pro_export_batches: Management read; Owner/Admin create + update approval/status; no delete (17).
create policy speb_sel_mgmt on public.sales_pro_export_batches for select to authenticated using (app_private.app_is_mgmt_up());
create policy speb_ins_oa on public.sales_pro_export_batches for insert to authenticated with check (app_private.app_is_oa());
create policy speb_upd_oa on public.sales_pro_export_batches for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());

-- sales_pro_export_items: Management + Owner/Admin read; NO telesales; NO user update/delete (17).
create policy spei_sel_mgmt on public.sales_pro_export_items for select to authenticated using (app_private.app_is_mgmt_up());

-- ═══ telesales_lead_assignments — MVP telesales surface ═════════════════════════════════════
-- Read: Management/Owner/Admin see all; Telesales see ONLY their own assigned rows.
create policy tla_sel on public.telesales_lead_assignments
  for select to authenticated using (
    app_private.app_is_mgmt_up()
    or (app_private.app_role() = 'telesales' and assigned_rep = app_private.app_rep_code())
  );
-- Telesales UPDATE own rows only; WITH CHECK preserves assigned_rep = own rep_code (no reassignment).
-- Column-limited UPDATE (worked_status/lead_status/outcome_notes) is enforced by COLUMN GRANTS in 21.
create policy tla_upd_tele on public.telesales_lead_assignments
  for update to authenticated
  using      (app_private.app_role() = 'telesales' and assigned_rep = app_private.app_rep_code())
  with check (app_private.app_role() = 'telesales' and assigned_rep = app_private.app_rep_code());
-- Owner/Admin manage (insert/update); rows are normally populated by the service role on export approval.
create policy tla_ins_oa on public.telesales_lead_assignments for insert to authenticated with check (app_private.app_is_oa());
create policy tla_upd_oa on public.telesales_lead_assignments for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
-- No delete policy (17 blocks delete).

-- ═══ Compliance ═════════════════════════════════════════════════════════════════════════════
-- suppression_list: Owner/Admin/Management read; Owner/Admin insert + status update; no delete (17).
create policy supp_sel_mgmt on public.suppression_list for select to authenticated using (app_private.app_is_mgmt_up());
create policy supp_ins_oa on public.suppression_list for insert to authenticated with check (app_private.app_is_oa());
create policy supp_upd_oa on public.suppression_list for update to authenticated using (app_private.app_is_oa()) with check (app_private.app_is_oa());
-- (no delete policy; 17 guard trigger + 21 revoke enforce delete-immutability)

-- erasure_tombstones: NO authenticated policy. Created server-side by the service role only;
-- never read/updated/deleted by the browser. RLS is enabled + FORCED and there is no grant (21).

-- audit_logs: Owner/Admin READ only. INSERT is via the SECURITY DEFINER write_audit() (18), which
-- bypasses RLS as its owner — so no insert policy is needed here. No update/delete policies (17).
create policy audit_sel_oa on public.audit_logs for select to authenticated using (app_private.app_is_oa());
