-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 07_files_imports.sql — upload metadata + import tracking.
-- Depends on: 02_enums.sql (file_status, import_status), 03_identity.sql (user_profiles).
--
-- STORAGE RULE: file BYTES live in PRIVATE object storage (Supabase Storage), never in the
-- database. These tables hold METADATA and import status only. No storage bucket is created
-- here, no files are uploaded, no seeds.
-- Grants/RLS deferred to 19/20/21 per MIGRATION_DRAFTING_PLAN.md.

create table public.uploaded_files (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('customer_postcodes','delivery_boundary','other')),
  storage_path  text,          -- pointer into private Storage; NOT the bytes
  filename      text,
  sha256        text,          -- integrity hash of the uploaded file
  uploaded_by   uuid references public.user_profiles(user_id),
  status        file_status not null default 'uploaded',
  row_count     int,
  created_at    timestamptz not null default now()
);
create index uploaded_files_uploaded_by_idx on public.uploaded_files (uploaded_by);
create index uploaded_files_kind_idx        on public.uploaded_files (kind);

-- BLOCKED BY ISS-0001: no real customer-postcode data may be imported until the completed
-- existing-customer postcode file is supplied. Table is created empty and stays empty.
create table public.customer_postcode_imports (
  id                    uuid primary key default gen_random_uuid(),
  uploaded_file_id      uuid references public.uploaded_files(id) on delete restrict,
  rows_total            int,
  rows_missing_postcode int,
  status                import_status not null default 'pending',
  imported_at           timestamptz
);
create index customer_postcode_imports_file_idx on public.customer_postcode_imports (uploaded_file_id);

-- BLOCKED BY ISS-0002: no real delivery-boundary data may be imported until the approved
-- delivery postcode boundary list is supplied. Table is created empty and stays empty.
create table public.delivery_boundary_imports (
  id               uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references public.uploaded_files(id) on delete restrict,
  in_area_count    int,
  expansion_count  int,
  status           import_status not null default 'pending'
);
create index delivery_boundary_imports_file_idx on public.delivery_boundary_imports (uploaded_file_id);
