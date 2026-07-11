-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 22_seed_minimal.sql — SAFE seeds only.
-- Depends on: 05_config.sql (road_display_configs, integration_status).
--
-- IMPORTANT: seeding these rows does NOT mean the system is configured, verified, deployed, or
-- operational. These are neutral placeholders only:
--   * a single DEFAULT road display config (feeder mode) — NOT a verified/authoritative routing set;
--   * integration_status rows marked configured = false / status 'not_configured'.
-- Explicitly NOT seeded (must stay empty until real inputs / decisions): customer data, delivery
-- boundaries, verified CRM field mappings, users, leads, suppression/erasure/audit data.
-- No secrets. No real data.

-- Default road display config: feeder mode, empty list (Owner/Admin configures the real list later).
-- Placeholder only — does NOT imply verified routing.
insert into public.road_display_configs (name, mode, road_numbers, is_default)
values ('Default feeder routes (placeholder — not verified)', 'feeder', '{}', true);

-- Integration status rows, all NOT configured. Status is informational only; no keys/secrets here.
insert into public.integration_status (service, status, configured) values
  ('supabase',        'not_configured', false),
  ('netsuite',        'not_configured', false),
  ('companies_house', 'not_configured', false),
  ('google_places',   'not_configured', false),
  ('apify',           'not_configured', false),
  ('justeat',         'not_configured', false),
  ('sales_pro',       'not_configured', false);

-- NOT seeded (intentionally): existing_customers, delivery_boundaries/_items, crm_field_mappings
-- (no verified rows), user_profiles, discovered_leads + children, suppression_list,
-- erasure_tombstones, audit_logs, territory_sets/items, pipeline_runs, export batches/items.
