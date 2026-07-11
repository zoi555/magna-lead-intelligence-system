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
  -- rep_code links a telesales user to discovered_leads.assigned_rep (and other assigned_rep FKs).
  -- Uses a NAMED UNIQUE CONSTRAINT (not a partial unique index) so it can be the target of a
  -- foreign key. A UNIQUE constraint still permits multiple NULL rep_codes (NULLs are distinct in
  -- PostgreSQL), so "many users without a rep_code" is preserved, while non-null rep_codes stay unique.
  rep_code    text        constraint user_profiles_rep_code_key unique,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
