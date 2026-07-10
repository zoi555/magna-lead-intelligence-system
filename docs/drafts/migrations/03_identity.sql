-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 03_identity.sql — user_profiles (role + profile per auth user).
-- Depends on: 02_enums.sql (user_role); Supabase auth.users.
--
-- Access control note: RLS enable (19), policies (20), and GRANT/REVOKE (21) are applied in
-- LATER migrations per MIGRATION_DRAFTING_PLAN.md. No grants or policies are created here.

create table public.user_profiles (
  user_id     uuid primary key references auth.users(id) on delete restrict,  -- keep actor durable; NOT cascade
  role        user_role   not null default 'telesales',
  full_name   text,
  rep_code    text,                     -- links a telesales user to discovered_leads.assigned_rep
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- rep_code unique WHERE NOT NULL: many users may have no rep_code, but a set rep_code is unique.
-- (A plain UNIQUE would already permit multiple NULLs, but a partial index states the intent.)
create unique index user_profiles_rep_code_key
  on public.user_profiles (rep_code) where rep_code is not null;
