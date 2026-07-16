-- 0013 — Geography Standard v1.0: business geography + discovery selection provenance
--
-- Business hierarchy (AspectLead-specific): Organisation (= tenant) → Sales Region →
-- Sales Territory → Delivery Coverage. Territory/coverage membership is an EXPLICIT
-- many-to-many against postcode districts/sectors (objective 4) — no assumption that a
-- territory equals a set of towns. Plus discovery_selection + query_unit capture the full
-- provenance the Standard requires (objective 7): original selection, resolved entity,
-- expansion, source+version, and the query units actually executed.

-- ---- sales region ----
create table if not exists sales_region (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- sales territory (belongs to a sales region) ----
create table if not exists sales_territory (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  sales_region_id uuid references sales_region(id) on delete set null,
  name            text not null,
  code            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---- delivery coverage (operational delivery footprint) ----
create table if not exists delivery_coverage (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  name        text not null,
  is_mock     boolean not null default false,   -- honest flag while only a mock boundary exists
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- territory ↔ postcode (M:N) ----
create table if not exists territory_postcode (
  territory_id   uuid not null references sales_territory(id) on delete cascade,
  tenant_id      uuid not null references tenants(id),
  postcode_code  text not null,
  postcode_level text not null check (postcode_level in ('postcode_district','postcode_sector')),
  primary key (territory_id, postcode_code)
);

-- ---- coverage ↔ postcode (M:N) ----
create table if not exists coverage_postcode (
  coverage_id    uuid not null references delivery_coverage(id) on delete cascade,
  tenant_id      uuid not null references tenants(id),
  postcode_code  text not null,
  postcode_level text not null check (postcode_level in ('postcode_district','postcode_sector')),
  primary key (coverage_id, postcode_code)
);

-- ---- discovery selection (one row per original user selection; provenance) ----
create table if not exists discovery_selection (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  run_id         uuid not null references discovery_runs(id) on delete cascade,
  original_kind  text not null,      -- the selection kind the user made
  original_value text not null,      -- verbatim user input (preserved)
  resolved_kind  text,               -- resolved canonical entity kind
  resolved_code  text,
  status         text not null,      -- available | pending_data | unavailable
  method         text,               -- enumeration | classification | centroid_in_polygon | place_links | none
  expansion_count integer not null default 0,
  source         text,
  source_version text,
  reason         text,               -- honest reason when not available
  created_at     timestamptz not null default now()
);
create index if not exists discovery_selection_run_idx on discovery_selection (run_id);

-- ---- query unit (the postcode codes ACTUALLY executed, per source) ----
create table if not exists query_unit (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  run_id       uuid not null references discovery_runs(id) on delete cascade,
  selection_id uuid references discovery_selection(id) on delete set null,
  code         text not null,        -- executed postcode code
  level        text not null,        -- postcode_district | postcode_sector | postcode_unit
  source       text not null,        -- adapter/source it was planned for (e.g. just_eat)
  created_at   timestamptz not null default now(),
  unique (run_id, source, code)      -- NO duplicate query units per run+source
);
create index if not exists query_unit_run_idx on query_unit (run_id);

-- keep updated_at fresh on the business tables
do $$ declare t text; begin
  foreach t in array array['sales_region','sales_territory','delivery_coverage'] loop
    execute format('drop trigger if exists %I on %I', t||'_touch', t);
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ---- RLS: tenant-scoped ----
do $$ declare t text; begin
  foreach t in array array['sales_region','sales_territory','delivery_coverage','territory_postcode','coverage_postcode','discovery_selection','query_unit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_select', t);
    execute format('create policy %I on %I for select to authenticated using (tenant_id in (select app_current_tenant_ids()))', t||'_select', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;
