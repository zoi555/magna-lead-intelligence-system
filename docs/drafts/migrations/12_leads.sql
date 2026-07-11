-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 12_leads.sql — canonical lead + sensitive normalised child tables.
-- Depends on: 02_enums.sql (priority_tier, lead_status), 03_identity.sql (user_profiles.rep_code
--             UNIQUE constraint — required for the assigned_rep FK), 10_runs_coverage.sql
--             (pipeline_runs).
--
-- SENSITIVITY (ADR-0012): discovered_leads and ALL child tables below are CLASS-MGMT — readable
-- by Owner/Admin/Management via GRANT+RLS, and TELESALES NEVER. company_financials and lead_scores
-- are especially sensitive (financials, score internals, match %). Telesales sees only the
-- separate safe table telesales_lead_assignments (file 15). No policies/grants here — deferred to 19–21.
--
-- CASCADE POLICY:
--   * discovered_leads references pipeline_runs with ON DELETE RESTRICT — a lead must not be
--     cascade-destroyed by touching run history.
--   * child tables cascade FROM discovered_leads (composition — they are parts of one lead), which
--     is safe; they are not independent history.
-- RETENTION: retention_until on PII/customer-linked tables (values are a pre-production decision).
-- No data, no seeds. matched_account_code is kept as plain text (soft dedup reference), NOT an FK
-- to existing_customers, to avoid coupling lead creation to the ISS-0001-blocked customer master.

create table public.discovered_leads (
  id                 uuid primary key default gen_random_uuid(),
  pipeline_run_id    uuid references public.pipeline_runs(id) on delete restrict,
  primary_brand_name text,
  trading_address    text,
  postcode           text,
  outer_code         text,
  inner_code         text,
  lat                double precision,
  lng                double precision,
  lead_score         int,
  priority_tier      priority_tier,
  uniqueness_pct     numeric,
  legitimacy_pct     numeric,
  match_pct          numeric,
  matched_account_code text,                 -- soft reference to existing_customers.account_code (no FK)
  lead_status        lead_status not null default 'new',
  assigned_rep       text references public.user_profiles(rep_code),
  retention_until    date,                   -- retention hook (period TBD, pre-production policy)
  created_at         timestamptz not null default now()
);
create index dl_run_idx      on public.discovered_leads (pipeline_run_id);
create index dl_postcode_idx on public.discovered_leads (postcode);
create index dl_outer_idx    on public.discovered_leads (outer_code);
create index dl_inner_idx    on public.discovered_leads (inner_code);
create index dl_rep_idx      on public.discovered_leads (assigned_rep);
create index dl_tier_idx     on public.discovered_leads (priority_tier);
create index dl_status_idx   on public.discovered_leads (lead_status);
create index dl_created_idx  on public.discovered_leads (created_at);
-- No cross-lead uniqueness constraint: multiple legitimate businesses can share an address
-- (multi-tenant buildings / virtual kitchens), so a natural-key unique would wrongly block them.

-- ── Sensitive child tables (composition; cascade from the parent lead) ──────────────────────

create table public.lead_brands (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  brand_name         text,
  is_primary         boolean not null default false
);
create index lb_lead_idx on public.lead_brands (discovered_lead_id);

-- lead_contacts separates the safe/exportable number from raw source metadata.
create table public.lead_contacts (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  phone              text,            -- raw discovered number (SENSITIVE)
  phone_kind         text,            -- mobile / landline (flexible, CHECK-able later)
  source             text,            -- e.g. justeat / google / whatsapp_link (raw source metadata)
  is_mobile          boolean,
  is_suppressed      boolean not null default false,
  is_exportable      boolean not null default false,  -- flags the safe number chosen for CRM/telesales
  retention_until    date,
  created_at         timestamptz not null default now()
);
create index lc_lead_idx on public.lead_contacts (discovered_lead_id);

create table public.fsa_matches (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  fsa_id             text,
  operator_name      text,
  business_type      text,
  hygiene_rating     int,
  last_inspection    date,
  registrations_at_address int,
  days_since_registration  int,
  new_business_flag  boolean
);
create index fm_lead_idx on public.fsa_matches (discovered_lead_id);

create table public.company_profiles (      -- director/PSC names = personal data
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  ch_company_name    text,
  ch_number          text,
  ch_status          text,
  incorporation_date date,
  sic_code           text,
  red_flags          text,
  directors          jsonb,          -- names/roles (SENSITIVE personal data)
  psc                jsonb,          -- persons with significant control (SENSITIVE)
  retention_until    date
);
create index cp_lead_idx on public.company_profiles (discovered_lead_id);

-- O/A/M ONLY — TELESALES NEVER. Parsed Companies House financials.
create table public.company_financials (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  ch_number          text,
  accounts_type      text,
  accounts_date      date,
  c_net_assets       numeric,
  p_net_assets       numeric,
  c_turnover         numeric,
  net_assets_growth  numeric,
  financial_label    text
);
create index cf_lead_idx on public.company_financials (discovered_lead_id);

create table public.platform_profiles (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  platform           text,           -- justeat / ubereats / deliveroo / google
  url                text,
  rating             numeric,
  reviews            int,
  cuisine_type       text
);
create index pp_lead_idx on public.platform_profiles (discovered_lead_id);

-- O/A/M ONLY — TELESALES NEVER. Score breakdown, match internals.
create table public.lead_scores (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  base_score         int,
  trigger_bonus      int,
  score_breakdown    text,
  matched_fields     text,
  match_pct          numeric
);
create index ls_lead_idx on public.lead_scores (discovered_lead_id);

create table public.lead_triggers (
  id                 uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  trigger_type       text,           -- new_fsa / ownership_change / review_complaint
  snippet            text,           -- short paraphrase (no verbatim copyright text)
  source             text,
  detected_at        date
);
create index lt_lead_idx on public.lead_triggers (discovered_lead_id);
