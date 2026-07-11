-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 13_ignored_reactivation_expansion_triggers.sql — ignored audit, reactivation, expansion,
-- and the same-day trigger queue.
-- Depends on: 02_enums.sql (ignored_reason, verify_state, reactivation_status, trigger_urgency,
--             worked_status), 03_identity.sql (user_profiles.rep_code), 10_runs_coverage.sql
--             (pipeline_runs), 12_leads.sql (discovered_leads).
--
-- SENSITIVITY (ADR-0012): all four tables are CLASS-MGMT (Owner/Admin/Management read; SR write) —
-- TELESALES NEVER. same_day_trigger_queue is Management/OA-only in MVP; telesales sees a trigger
-- via telesales_lead_assignments.trigger_reason (file 15), NOT this table, and never the
-- discovered_lead_id. Policies/grants deferred to 19–21. No data, no seeds.
-- RETENTION: retention_until on customer-linked/PII tables (period is a pre-production decision).

-- Ignored/auto-discarded leads — audit-like history (restrict FK to the run).
create table public.ignored_leads_audit (
  id                   uuid primary key default gen_random_uuid(),
  pipeline_run_id      uuid references public.pipeline_runs(id) on delete restrict,
  brand_name           text,
  address              text,
  postcode             text,
  reason_code          ignored_reason,
  reason_detail        text,
  matched_account_code text,                 -- soft reference (no FK to existing_customers)
  match_pct            numeric,
  ch_status            text,
  retention_until      date,
  created_at           timestamptz not null default now()
);
create index ila_run_idx     on public.ignored_leads_audit (pipeline_run_id);
create index ila_postcode_idx on public.ignored_leads_audit (postcode);
create index ila_reason_idx   on public.ignored_leads_audit (reason_code);
create index ila_matched_idx  on public.ignored_leads_audit (matched_account_code);
create index ila_created_idx  on public.ignored_leads_audit (created_at);

-- Inactive former customers surfaced by discovery (70% special case).
create table public.reactivation_leads (
  id                   uuid primary key default gen_random_uuid(),
  brand_name           text,
  postcode             text,
  matched_account_code text,                 -- soft reference (no FK)
  match_pct            numeric,
  last_order_date      date,
  status               reactivation_status not null default 'to_contact',
  retention_until      date,
  created_at           timestamptz not null default now()
);
create index rl_postcode_idx on public.reactivation_leads (postcode);
create index rl_matched_idx  on public.reactivation_leads (matched_account_code);
create index rl_status_idx   on public.reactivation_leads (status);

-- Verified out-of-area leads held for future routes (not exported in MVP).
create table public.expansion_leads (
  id                 uuid primary key default gen_random_uuid(),
  brand_name         text,
  postcode           text,
  outer_code         text,
  verify_state       verify_state not null default 'unverified',
  score              int,
  held_reason        text,
  retention_until    date,
  created_at         timestamptz not null default now()
);
create index el_postcode_idx on public.expansion_leads (postcode);
create index el_outer_idx    on public.expansion_leads (outer_code);
create index el_verify_idx   on public.expansion_leads (verify_state);

-- Same-day trigger queue — MANAGEMENT/OA ONLY. Telesales does NOT read this table (and never sees
-- discovered_lead_id); triggers reach telesales via telesales_lead_assignments.trigger_reason (15).
create table public.same_day_trigger_queue (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid references public.discovered_leads(id) on delete restrict,  -- not exposed to telesales
  trigger_reason     text,          -- new_fsa / ownership_change / review_complaint
  signal_detail      text,
  urgency            trigger_urgency,
  age_days           int,
  assigned_rep       text references public.user_profiles(rep_code),
  worked_status      worked_status not null default 'open',
  created_at         timestamptz not null default now()
);
create index sdt_lead_idx    on public.same_day_trigger_queue (discovered_lead_id);
create index sdt_rep_idx     on public.same_day_trigger_queue (assigned_rep);
create index sdt_worked_idx  on public.same_day_trigger_queue (worked_status);
create index sdt_reason_idx  on public.same_day_trigger_queue (trigger_reason);
create index sdt_created_idx on public.same_day_trigger_queue (created_at);
