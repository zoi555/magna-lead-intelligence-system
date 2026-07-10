-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 05_config.sql — non-secret config + integration status + road display config.
-- Depends on: 03_identity.sql (user_profiles for updated_by).
--
-- NO SECRETS RULE: API keys / service-role key / the HMAC pepper NEVER live in the database.
-- They live in a managed store / server environment (see docs/06_SECURITY.md). app_settings is
-- for NON-SECRET config only; the is_secret CHECK is a structural bar. No real values are seeded
-- here and nothing implies anything is configured or verified (seeds, if any, are 22_seed_minimal.sql).
-- Grants/RLS are applied later (19/20/21).

create table public.app_settings (
  key         text primary key,
  value_json  jsonb   not null,                          -- NON-SECRET config only
  is_secret   boolean not null default false check (is_secret = false),  -- structural: no secrets here
  updated_by  uuid references public.user_profiles(user_id),
  updated_at  timestamptz not null default now()
);

create table public.integration_status (
  service     text primary key,          -- e.g. 'supabase','netsuite','companies_house','apify','sales_pro'
  status      text,                       -- free text (flexible) — NOT an enum
  configured  boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table public.road_display_configs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  mode         text not null check (mode in ('feeder','primary','all','custom')),  -- CHECK, not enum (flexible)
  road_numbers text[] not null default '{}',
  is_default   boolean not null default false
);

-- Only one default road display config may exist at a time.
create unique index one_default_road_config
  on public.road_display_configs (is_default) where is_default;
