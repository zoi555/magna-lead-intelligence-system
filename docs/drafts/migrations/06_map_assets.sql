-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 06_map_assets.sql — registry of EXTERNAL map assets (metadata only).
-- Depends on: nothing (id uses built-in gen_random_uuid()).
--
-- NO GEOMETRY IN THE DATABASE (ADR-0011): postcode-boundary, road and basemap GEOMETRY remain
-- external/static assets in object storage. This table stores ONLY asset metadata — path,
-- version, source, attribution, dates — so the app knows which asset version is live. There are
-- deliberately NO geometry / geography columns here.
-- Grants/RLS are applied later (19/20/21).

create table public.map_assets (
  id            uuid primary key default gen_random_uuid(),
  kind          text check (kind in ('postcode_boundary','roads','basemap','delivery_boundary')),
  name          text,
  storage_path  text,          -- pointer to the external/static asset (object storage), NOT geometry
  version       text,
  source        text,          -- e.g. 'OS Code-Point Open', 'OS Open Roads'
  source_date   date,          -- release/vintage of the source data
  attribution   text,          -- required licence attribution string
  generated_at  timestamptz,   -- when the asset was produced
  created_at    timestamptz not null default now()
);
