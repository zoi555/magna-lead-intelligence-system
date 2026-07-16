-- 0004 — Immutable raw observations, normalised outlets, rating history
--
-- je_raw_observations is APPEND-ONLY: UPDATE is forbidden by trigger (never
-- overwrite an earlier observation). DELETE is not granted to authenticated (only
-- the service-role may prune for retention). Each observation keeps the original
-- payload, a canonical content hash, and full request/parse metadata.

-- ---- immutable raw observations ----------------------------------------
create table if not exists je_raw_observations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  execution_id   uuid not null references je_executions(id) on delete cascade,
  run_id         uuid not null references discovery_runs(id) on delete cascade,
  source         text not null default 'just_eat',
  response_type  text not null default 'search',      -- search | outlet_detail | menu
  source_record_id text,                              -- JE outlet Id where applicable
  query_context  jsonb not null default '{}',         -- {outcode, requestedCoords, page,...}
  requested_at   timestamptz,
  fetched_at     timestamptz not null default now(),
  http_status    int,
  response_headers jsonb,                              -- safe headers only (no auth/set-cookie)
  raw_payload    jsonb not null,
  content_hash   text not null,                        -- sha256 of canonical payload
  parser_version text not null,
  adapter_version text not null,
  schema_version int not null default 1,
  parse_status   parse_status not null default 'parsed',
  parse_warnings jsonb not null default '[]',
  duplicate_of   uuid references je_raw_observations(id),  -- first identical observation
  attempt        int not null default 1,
  created_at     timestamptz not null default now()
);

create index if not exists je_raw_exec_idx  on je_raw_observations (execution_id);
create index if not exists je_raw_hash_idx  on je_raw_observations (tenant_id, content_hash);
create index if not exists je_raw_srid_idx  on je_raw_observations (tenant_id, source_record_id);

-- Append-only guard: forbid UPDATE outright (immutability). DELETE is left to RLS
-- (service-role only) so cascades and retention pruning still work.
create or replace function forbid_update() returns trigger language plpgsql as $$
begin raise exception 'je_raw_observations is append-only (UPDATE forbidden)'; end $$;

drop trigger if exists je_raw_no_update on je_raw_observations;
create trigger je_raw_no_update before update on je_raw_observations
  for each row execute function forbid_update();

alter table je_raw_observations enable row level security;
-- NOTE: no SELECT/INSERT/DELETE policy for `authenticated` => the raw payload is
-- NOT readable by the browser client at all. Only the service-role (worker /
-- server routes) may touch raw observations. A sanitised view is provided below.

-- ---- normalised outlets -------------------------------------------------
create table if not exists je_outlets (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  je_outlet_id   text not null,
  unique_name    text,
  trading_name   text,
  brand_name     text,
  is_brand       boolean,
  merchant_type  text,
  -- location
  address_first_line text, city text, postcode text, outcode text,
  latitude double precision, longitude double precision, delivery_zipcode text,
  -- contact (Just Eat listing supplies NONE; retained for a future lawful detail source)
  telephone_raw text, telephone_e164 text, telephone_national text,
  telephone_extension text, telephone_valid boolean, telephone_invalid_reason text,
  -- ratings (latest observed)
  rating_average numeric, rating_count int, rating_stars numeric,
  -- classification
  cuisines jsonb not null default '[]', primary_cuisine text,
  service_models jsonb not null default '[]', tags jsonb not null default '[]', badges jsonb not null default '[]',
  -- trading / availability (latest observed)
  is_open_now boolean, open_for_delivery boolean, open_for_collection boolean, open_for_preorder boolean,
  is_delivery boolean, is_collection boolean, is_temporarily_offline boolean, offline_reason text,
  delivery_cost numeric, is_free_delivery boolean, minimum_delivery_value numeric,
  delivery_eta_lower int, delivery_eta_upper int, opening_times jsonb,
  -- promotions / media
  logo_url text, deals jsonb not null default '[]', offers jsonb not null default '[]', offer_percent numeric,
  is_sponsored boolean, default_display_rank int,
  -- halal evidence (conservative; never inferred from cuisine)
  halal_flag boolean, halal_evidence jsonb not null default '[]', halal_confidence numeric,
  -- territory classification (delivers-to vs located-in)
  territory_class text, territory_confidence numeric,
  -- source + overflow
  source_url text, source_extra jsonb not null default '{}',
  -- observation linkage + lifecycle
  latest_observation_id uuid references je_raw_observations(id),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  observation_count int not null default 1,
  normalisation_version text not null,
  processing_state text not null default 'normalised',
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, je_outlet_id)
);

create index if not exists je_outlets_tenant_idx on je_outlets (tenant_id);
create index if not exists je_outlets_postcode_idx on je_outlets (tenant_id, postcode);

drop trigger if exists je_outlets_touch on je_outlets;
create trigger je_outlets_touch before update on je_outlets
  for each row execute function touch_updated_at();

alter table je_outlets enable row level security;
drop policy if exists je_outlets_select on je_outlets;
create policy je_outlets_select on je_outlets for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
grant select on je_outlets to authenticated;

-- ---- rating history -----------------------------------------------------
create table if not exists je_rating_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  outlet_id      uuid not null references je_outlets(id) on delete cascade,
  je_outlet_id   text not null,
  raw_observation_id uuid references je_raw_observations(id),
  score          numeric,
  max_scale      numeric default 5,
  review_count   int,
  source_label   text,
  observed_at    timestamptz not null default now()
);

create index if not exists je_rating_history_outlet_idx on je_rating_history (outlet_id, observed_at);

alter table je_rating_history enable row level security;
drop policy if exists je_rating_history_select on je_rating_history;
create policy je_rating_history_select on je_rating_history for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
grant select on je_rating_history to authenticated;

-- ---- sanitised observation view (no raw_payload) ------------------------
-- Lets the browser client see that an observation happened and its metadata,
-- WITHOUT exposing the raw payload. Security-definer view with an explicit tenant
-- filter (telesales-safe: never returns raw_payload).
create or replace view je_observation_summary as
  select id, tenant_id, execution_id, run_id, source, response_type, source_record_id,
         query_context, fetched_at, http_status, content_hash, parser_version,
         adapter_version, schema_version, parse_status, duplicate_of, attempt, created_at
    from je_raw_observations
   where tenant_id in (select app_current_tenant_ids());

grant select on je_observation_summary to authenticated;
