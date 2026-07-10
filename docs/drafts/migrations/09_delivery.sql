-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 09_delivery.sql — delivery boundary (codes + membership only) — BLOCKED BY ISS-0002.
-- Depends on: 02_enums.sql (membership_type, pc_granularity),
--             07_files_imports.sql (delivery_boundary_imports for source_import_id).
--
-- NO GEOMETRY IN THE DATABASE (ADR-0011): only postcode CODES and their in-area/expansion
-- MEMBERSHIP are stored. The boundary polygon itself is an external/static map asset.
-- BLOCKED BY ISS-0002: no real boundary rows and no `is_current` boundary exist until the
-- approved delivery postcode boundary list is supplied. Created empty; stays empty.
-- Grants/RLS deferred to 19/20/21.

create table public.delivery_boundaries (
  id               uuid primary key default gen_random_uuid(),
  name             text,
  version          int,
  effective_from   date,
  source_import_id uuid references public.delivery_boundary_imports(id) on delete set null,
  is_current       boolean not null default false
);
-- Only one delivery boundary may be current at a time (avoids ambiguous in/out-of-area routing).
create unique index one_current_boundary
  on public.delivery_boundaries (is_current) where is_current;

create table public.delivery_boundary_items (
  id                   uuid primary key default gen_random_uuid(),
  delivery_boundary_id uuid not null references public.delivery_boundaries(id) on delete cascade,  -- child of a boundary
  postcode_code        text not null,
  granularity          pc_granularity not null,
  membership           membership_type not null,
  -- idempotency: one membership row per (boundary, code, granularity)
  unique (delivery_boundary_id, postcode_code, granularity)
);
create index dbi_boundary_idx   on public.delivery_boundary_items (delivery_boundary_id);
create index dbi_postcode_idx   on public.delivery_boundary_items (postcode_code, granularity);
create index dbi_membership_idx on public.delivery_boundary_items (membership);
