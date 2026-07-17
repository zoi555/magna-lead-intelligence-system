-- 0016 — columns for OS Open Names place ingestion (Workstream A1)
--
-- Adds place aliases and relationship method/confidence, and widens the place↔postcode
-- relationship vocabulary to the association types the Standard supports. OS Open Names
-- assigns each populated place ONE postcode district (a point/source association) — this is
-- honestly a `source_defined` / `primarily_associated` relationship, NOT boundary containment.

alter table place add column if not exists aliases jsonb not null default '[]';

alter table place_postcode_link add column if not exists method text;
alter table place_postcode_link add column if not exists confidence numeric;

alter table place_postcode_link drop constraint if exists place_postcode_link_relationship_check;
alter table place_postcode_link add constraint place_postcode_link_relationship_check
  check (relationship in ('contains','intersects','primary','primarily_associated','centroid_within','nearest','source_defined'));
