-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 08_territory.sql — per-run territory sets + items (ADR-0009).
-- Depends on: 02_enums.sql (territory_item_type), 03_identity.sql (user_profiles),
--             07_files_imports.sql (uploaded_files for source_file_id).
--
-- Territory is codes/config only — NO geometry. Owner/Admin write POLICIES and all grants are
-- deferred to 20_rls_policies.sql / 21_grants.sql per MIGRATION_DRAFTING_PLAN.md (policies are
-- ALL deferred). No territories or seeds are created here.

create table public.territory_sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references public.user_profiles(user_id),
  created_at  timestamptz not null default now(),
  is_archived boolean not null default false
);

create table public.territory_items (
  id               uuid primary key default gen_random_uuid(),
  territory_set_id uuid not null references public.territory_sets(id) on delete cascade,  -- child of a set (composition)
  item_type        territory_item_type not null,
  value            text not null,
  source_file_id   uuid references public.uploaded_files(id) on delete set null,
  is_expansion     boolean not null default false,
  -- idempotency: the same item cannot be added twice to a set
  unique (territory_set_id, item_type, value)
);
create index territory_items_set_idx    on public.territory_items (territory_set_id);
create index territory_items_source_idx on public.territory_items (source_file_id);
