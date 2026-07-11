-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 15_telesales_assignments.sql — the MVP SAFE telesales working surface (ADR-0012).
-- Depends on: 02_enums.sql (priority_tier, lead_status, worked_status), 03_identity.sql
--             (user_profiles.rep_code UNIQUE — valid FK target after the 03 fix),
--             12_leads.sql (discovered_leads), 14_export_crm.sql (sales_pro_export_batches).
--
-- COLUMN SAFETY (structural): this denormalised table contains ONLY safe, exportable fields.
-- It deliberately EXCLUDES financials, score breakdowns, match %, matched account code, ignored
-- reasons, and raw contact-source metadata. Telesales column-safety is therefore guaranteed by
-- the table shape, not by RLS. Telesales never reads discovered_leads or its child tables.
--
-- ACCESS (deferred to 20/21): telesales gets FULL SELECT (only safe columns exist) and a
-- COLUMN-LIMITED UPDATE (worked_status, lead_status, outcome_notes) scoped to their own rep via
-- RLS WITH CHECK. Owner/Admin reassignment/correction goes via service-role edge functions.
-- The service role POPULATES this table on export approval. No grants/policies here.
--
-- HISTORY: ON DELETE RESTRICT (not cascade). No data, no seeds.

create table public.telesales_lead_assignments (
  id                 uuid primary key default gen_random_uuid(),
  export_batch_id    uuid not null references public.sales_pro_export_batches(id) on delete restrict,
  discovered_lead_id uuid references public.discovered_leads(id) on delete restrict,
  assigned_rep       text not null references public.user_profiles(rep_code),
  business_name      text,
  trading_address    text,
  postcode           text,
  safe_contact_phone text,          -- single approved, non-suppressed number (re-checked on suppression change)
  priority_tier      priority_tier,
  lead_status        lead_status not null default 'new',
  trigger_reason     text,          -- how telesales sees a trigger (nullable)
  worked_status      worked_status not null default 'open',
  outcome_notes      text,          -- telesales-writable outcome
  assigned_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- idempotency: a lead is assigned at most once per export batch
  unique (export_batch_id, discovered_lead_id)
);
create index tla_rep_idx      on public.telesales_lead_assignments (assigned_rep);
create index tla_worked_idx   on public.telesales_lead_assignments (worked_status);
create index tla_status_idx   on public.telesales_lead_assignments (lead_status);
create index tla_tier_idx     on public.telesales_lead_assignments (priority_tier);
create index tla_postcode_idx on public.telesales_lead_assignments (postcode);
create index tla_assigned_idx on public.telesales_lead_assignments (assigned_at);
