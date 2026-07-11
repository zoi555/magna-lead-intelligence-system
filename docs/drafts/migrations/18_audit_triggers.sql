-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 18_audit_triggers.sql — DRAFT audit-capture pattern (explicit per-table, redaction-aware).
-- Depends on: 04_rls_helpers.sql (schema app_private), 16_compliance.sql (audit_logs), and every
--             covered table (03,05,06,07,08,09,10,12,13,14,15,16).
--
-- DESIGN (decision 2 — NOT a lazy generic whole-row dump for PII):
--   * write_audit(): the single INSERT path into audit_logs. SECURITY DEFINER, owned by the
--     trusted migration/database owner, so it can write even though callers have no audit_logs
--     grant and audit_logs is RLS-forced. It records actor, action, entity, optional payloads,
--     and an optional correlation_id from a per-request GUC (app.correlation_id).
--   * audit_min(): for PII-HEAVY tables — logs ONLY action, entity type/id, actor, correlation.
--     NO before/after payload. (IDs/action/actor/safe-metadata/hashes only.)
--   * audit_safe(): for LOW-RISK tables — logs before/after REDUCED to an explicit allow-list of
--     SAFE columns passed as trigger arguments (TG_ARGV). Only the named columns are captured.
--
-- SAFETY RULES:
--   * NO audit trigger on audit_logs itself (prevents recursion).
--   * NEVER store raw phone numbers, emails, customer names, raw addresses, director/PSC names,
--     or erased values in before_json/after_json. PII-heavy tables use audit_min (no payload);
--     low-risk tables use audit_safe with a reviewed allow-list.
--   * The per-table allow-lists below are a DRAFT and MUST be reviewed (and expanded/trimmed)
--     before this file is ever executed. When in doubt, prefer audit_min.
-- No data, no seeds.

-- ── Core writer ─────────────────────────────────────────────────────────────────────────────
create or replace function app_private.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb
) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_logs
    (actor_user_id, actor_kind, action, entity_type, entity_id, before_json, after_json, correlation_id)
  values (
    auth.uid(),
    case when auth.uid() is null then 'service' else 'user' end,
    p_action, p_entity_type, p_entity_id, p_before, p_after,
    nullif(current_setting('app.correlation_id', true), '')::uuid
  );
end
$$;

-- ── Minimal audit (PII-heavy tables): action/entity/actor only, NO payload ──────────────────
create or replace function app_private.audit_min() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare v_id text;
begin
  v_id := case when tg_op = 'DELETE'
               then (to_jsonb(old) ->> 'id')
               else (to_jsonb(new) ->> 'id') end;
  perform app_private.write_audit(tg_op, tg_table_name, v_id, null, null);
  return null;  -- AFTER trigger; return value ignored
end
$$;

-- ── Safe audit (low-risk tables): before/after limited to allow-listed columns (TG_ARGV) ────
create or replace function app_private.audit_safe() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id     text;
  v_before jsonb := null;
  v_after  jsonb := null;
  k        text;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_before := '{}'::jsonb;
    foreach k in array tg_argv loop
      v_before := v_before || jsonb_build_object(k, to_jsonb(old) -> k);
    end loop;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_after := '{}'::jsonb;
    foreach k in array tg_argv loop
      v_after := v_after || jsonb_build_object(k, to_jsonb(new) -> k);
    end loop;
  end if;
  v_id := case when tg_op = 'DELETE'
               then (to_jsonb(old) ->> 'id')
               else (to_jsonb(new) ->> 'id') end;
  perform app_private.write_audit(tg_op, tg_table_name, v_id, v_before, v_after);
  return null;
end
$$;

-- ══ Per-table triggers ══════════════════════════════════════════════════════════════════════
-- LOW-RISK tables → audit_safe(<explicit safe columns>). Review the allow-lists before running.

create trigger audit_user_profiles      after insert or update or delete on public.user_profiles
  for each row execute function app_private.audit_safe('role','is_active');           -- NOT full_name/rep_code
create trigger audit_app_settings        after insert or update or delete on public.app_settings
  for each row execute function app_private.audit_safe('key','is_secret');            -- NOT value_json
create trigger audit_integration_status  after insert or update or delete on public.integration_status
  for each row execute function app_private.audit_safe('service','status','configured');
create trigger audit_road_display_configs after insert or update or delete on public.road_display_configs
  for each row execute function app_private.audit_safe('name','mode','is_default');
create trigger audit_map_assets          after insert or update or delete on public.map_assets
  for each row execute function app_private.audit_safe('kind','name','version','source','source_date');
create trigger audit_uploaded_files      after insert or update or delete on public.uploaded_files
  for each row execute function app_private.audit_safe('kind','status','row_count');  -- NOT filename/storage_path
create trigger audit_customer_postcode_imports after insert or update or delete on public.customer_postcode_imports
  for each row execute function app_private.audit_safe('status','rows_total','rows_missing_postcode');
create trigger audit_delivery_boundary_imports after insert or update or delete on public.delivery_boundary_imports
  for each row execute function app_private.audit_safe('status','in_area_count','expansion_count');
create trigger audit_territory_sets      after insert or update or delete on public.territory_sets
  for each row execute function app_private.audit_safe('name','is_archived');
create trigger audit_territory_items     after insert or update or delete on public.territory_items
  for each row execute function app_private.audit_safe('item_type','is_expansion');   -- NOT value (may be pasted codes)
create trigger audit_delivery_boundaries after insert or update or delete on public.delivery_boundaries
  for each row execute function app_private.audit_safe('name','version','effective_from','is_current');
create trigger audit_delivery_boundary_items after insert or update or delete on public.delivery_boundary_items
  for each row execute function app_private.audit_safe('granularity','membership');
create trigger audit_pipeline_runs       after insert or update or delete on public.pipeline_runs
  for each row execute function app_private.audit_safe('status','run_type','finished_at');  -- NOT failure jsonb
create trigger audit_crm_field_mappings  after insert or update or delete on public.crm_field_mappings
  for each row execute function app_private.audit_safe('internal_field','sales_pro_field','is_verified');
create trigger audit_sales_pro_export_batches after insert or update or delete on public.sales_pro_export_batches
  for each row execute function app_private.audit_safe('status','lead_count','exported_at','approved_by');

-- PII-HEAVY tables → audit_min (no payload; ids/action/actor only).
create trigger audit_discovered_leads    after insert or update or delete on public.discovered_leads
  for each row execute function app_private.audit_min();
create trigger audit_lead_contacts       after insert or update or delete on public.lead_contacts
  for each row execute function app_private.audit_min();
create trigger audit_company_financials  after insert or update or delete on public.company_financials
  for each row execute function app_private.audit_min();
create trigger audit_lead_scores         after insert or update or delete on public.lead_scores
  for each row execute function app_private.audit_min();
create trigger audit_ignored_leads_audit after insert or update or delete on public.ignored_leads_audit
  for each row execute function app_private.audit_min();
create trigger audit_reactivation_leads  after insert or update or delete on public.reactivation_leads
  for each row execute function app_private.audit_min();
create trigger audit_expansion_leads     after insert or update or delete on public.expansion_leads
  for each row execute function app_private.audit_min();
create trigger audit_same_day_trigger_queue after insert or update or delete on public.same_day_trigger_queue
  for each row execute function app_private.audit_min();
create trigger audit_sales_pro_export_items after insert or update or delete on public.sales_pro_export_items
  for each row execute function app_private.audit_min();  -- NOT mapped_values
create trigger audit_telesales_lead_assignments after insert or update or delete on public.telesales_lead_assignments
  for each row execute function app_private.audit_min();  -- NOT business_name/phone/etc.
create trigger audit_suppression_list    after insert or update or delete on public.suppression_list
  for each row execute function app_private.audit_min();  -- NOT the hmac
create trigger audit_erasure_tombstones  after insert on public.erasure_tombstones
  for each row execute function app_private.audit_min();  -- insert-only; NOT the subject_hmac

-- NOTE: NO trigger on public.audit_logs (recursion guard). existing_customers is intentionally
-- not audited here (server-side master sync; add a minimal audit later if required by review).
