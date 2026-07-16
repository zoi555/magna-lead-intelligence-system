-- 0012 — Geography Standard v1.0: canonical GENERIC geography reference
--
-- Shared reference data (not tenant-specific): postcode enumeration (seeded from the real
-- national Code-Point-derived dataset), aliases, and the place / admin schema (empty until
-- lawful gazetteer/ONSPD data is ingested — capability_status = 'pending_data', NEVER
-- fabricated). Every table carries source + source_version for provenance and future
-- OS Open Names / ONSPD ingestion.

-- ---- postcode reference (area / district / sector), seeded from real data ----
create table if not exists postcode_reference (
  code           text primary key,          -- "UB", "UB1", "UB1 1"
  level          text not null check (level in ('area','district','sector')),
  area           text not null,
  district       text,
  sector         text,
  parent_code    text,
  centroid_lng   double precision,
  centroid_lat   double precision,
  unit_count     integer,
  source         text not null,
  source_version text not null,
  created_at     timestamptz not null default now()
);
create index if not exists postcode_reference_level_idx on postcode_reference (level);
create index if not exists postcode_reference_area_idx on postcode_reference (area);
create index if not exists postcode_reference_parent_idx on postcode_reference (parent_code);

-- ---- postcode aliases (empty; schema ready for future alias datasets) ----
create table if not exists postcode_alias (
  alias          text primary key,
  canonical_code text not null,
  source         text not null,
  source_version text not null
);

-- ---- place gazetteer (EMPTY — pending OS Open Names) ----
create table if not exists place (
  id             text primary key,
  kind           text not null check (kind in ('city','town','locality','village')),
  name           text not null,
  centroid_lng   double precision,
  centroid_lat   double precision,
  local_authority text,
  region         text,
  nation         text,
  capability_status text not null default 'pending_data' check (capability_status in ('available','pending_data','unavailable')),
  source         text,
  source_version text,
  created_at     timestamptz not null default now()
);

-- ---- EXPLICIT place↔postcode many-to-many (EMPTY — never inferred from "towns ≈ districts") ----
create table if not exists place_postcode_link (
  place_id       text not null references place(id) on delete cascade,
  postcode_code  text not null,
  postcode_level text not null check (postcode_level in ('postcode_district','postcode_sector','postcode_unit')),
  relationship   text not null check (relationship in ('contains','intersects','primary')),
  source         text not null,
  source_version text not null,
  primary key (place_id, postcode_code)
);

-- ---- admin geography (nation / region / local authority) — EMPTY, pending ONSPD/Boundary-Line ----
create table if not exists admin_area (
  id             text primary key,
  kind           text not null check (kind in ('nation','region','local_authority')),
  name           text not null,
  parent_id      text,
  capability_status text not null default 'pending_data' check (capability_status in ('available','pending_data','unavailable')),
  source         text,
  source_version text,
  created_at     timestamptz not null default now()
);

-- ---- RLS: reference data is shared (world-readable to signed-in users); writes are service-role only ----
do $$ declare t text; begin
  foreach t in array array['postcode_reference','postcode_alias','place','place_postcode_link','admin_area'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t||'_read', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

-- capability record: no place/admin data yet (honest)
insert into place (id, kind, name, capability_status, source)
  values ('__capability__', 'town', 'PLACE GAZETTEER PENDING (OS Open Names)', 'pending_data', 'none')
  on conflict (id) do nothing;
