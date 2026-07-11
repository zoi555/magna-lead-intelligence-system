-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 14_export_crm.sql — CRM field mapping + manual export batches/items (Magna Sales Pro).
-- Depends on: 02_enums.sql (export_status), 03_identity.sql (user_profiles, rep_code),
--             10_runs_coverage.sql (pipeline_runs), 12_leads.sql (discovered_leads).
--
-- BLOCKED BY ISS-0003: real export is disabled until the CTO validates which of the 102 fields
-- Magna Sales Pro accepts. crm_field_mappings rows default is_verified = false, and a batch must
-- not reach status 'exported' while any referenced mapping is unverified — that gate is enforced
-- by the app / an optional check in a LATER file, not here. No mappings inserted, no exports created.
--
-- HISTORY: export batches/items are the record of what was sent to the CRM — ON DELETE RESTRICT,
-- never cascade; batches are archived (status), not deleted. Policies/grants deferred to 19–21.

create table public.crm_field_mappings (
  id            uuid primary key default gen_random_uuid(),
  internal_field text not null constraint crm_field_mappings_internal_field_key unique,
  sales_pro_field text,
  transform     text,
  is_verified   boolean not null default false,   -- ISS-0003: stays false until CTO validation
  verified_by   uuid references public.user_profiles(user_id),
  verified_at   timestamptz
);

create table public.sales_pro_export_batches (
  id              uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references public.pipeline_runs(id) on delete restrict,
  created_by      uuid references public.user_profiles(user_id),
  approved_by     uuid references public.user_profiles(user_id),   -- manual approval gate (O/A)
  status          export_status not null default 'draft',
  lead_count      int,
  exported_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index speb_run_idx      on public.sales_pro_export_batches (pipeline_run_id);
create index speb_status_idx   on public.sales_pro_export_batches (status);
create index speb_exported_idx on public.sales_pro_export_batches (exported_at);

create table public.sales_pro_export_items (
  id                 uuid primary key default gen_random_uuid(),
  export_batch_id    uuid not null references public.sales_pro_export_batches(id) on delete restrict,
  discovered_lead_id uuid references public.discovered_leads(id) on delete restrict,
  mapped_values      jsonb,          -- snapshot of mapped values (may carry internal fields; mgmt/OA only)
  assigned_rep       text references public.user_profiles(rep_code),
  -- idempotency: a lead appears at most once per export batch
  unique (export_batch_id, discovered_lead_id)
);
create index spei_batch_idx on public.sales_pro_export_items (export_batch_id);
create index spei_lead_idx  on public.sales_pro_export_items (discovered_lead_id);
create index spei_rep_idx   on public.sales_pro_export_items (assigned_rep);
