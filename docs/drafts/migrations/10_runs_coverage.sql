-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 10_runs_coverage.sql — pipeline runs, per-run history, and maintained coverage summary.
-- Depends on: 02_enums.sql (run_type, run_status, territory_item_type, pc_granularity),
--             03_identity.sql (user_profiles), 08_territory.sql (territory_sets),
--             09_delivery.sql (delivery_boundaries).
--
-- HISTORY / IMMUTABILITY (decision 7, MIGRATION_DRAFTING_PLAN.md):
--   * pipeline_runs: SR may UPDATE status/failure/finished_at; MUST NOT be deleted.
--   * run_territory_items, run_coverage_units: INSERT-ONLY history (no update/delete for anyone).
--   The guard triggers (app_forbid_delete / app_forbid_write) that ENFORCE this are applied in
--   17_immutability_guards.sql — NOT here. Here we only forbid destructive cascades via
--   ON DELETE RESTRICT. No cascade to history.
-- coverage_summary is a MAINTAINED table, rebuilt by service-role jobs (not history).
-- No pipeline jobs, no run data, nothing operational is created here.
-- Grants/RLS deferred to 19/20/21.

create table public.pipeline_runs (
  id                   uuid primary key default gen_random_uuid(),
  territory_set_id     uuid references public.territory_sets(id) on delete restrict,
  delivery_boundary_id uuid references public.delivery_boundaries(id) on delete restrict,
  run_type             run_type   not null,
  status               run_status not null default 'queued',
  started_at           timestamptz,
  finished_at          timestamptz,   -- SR-updatable
  cost_pence           int,
  stage_counts         jsonb,
  failure              jsonb,         -- SR-updatable
  triggered_by         uuid references public.user_profiles(user_id)
);
create index pipeline_runs_set_idx      on public.pipeline_runs (territory_set_id);
create index pipeline_runs_boundary_idx on public.pipeline_runs (delivery_boundary_id);
create index pipeline_runs_status_idx   on public.pipeline_runs (status);

-- INSERT-ONLY history (enforcement in 17). Restrict FK so a run cannot be cascade-deleted.
create table public.run_territory_items (
  id                uuid primary key default gen_random_uuid(),
  pipeline_run_id   uuid not null references public.pipeline_runs(id) on delete restrict,
  item_type         territory_item_type,
  value             text,
  resolved_postcodes int
);
create index rti_run_idx on public.run_territory_items (pipeline_run_id);

-- INSERT-ONLY history (enforcement in 17). Restrict FK.
create table public.run_coverage_units (
  id              uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  postcode_code   text not null,
  granularity     pc_granularity not null,
  leads_found     int not null default 0,
  ignored_count   int not null default 0,
  exported_count  int not null default 0,
  -- idempotency: one coverage row per (run, code, granularity)
  unique (pipeline_run_id, postcode_code, granularity)
);
create index rcu_run_idx  on public.run_coverage_units (pipeline_run_id);
create index rcu_code_idx on public.run_coverage_units (postcode_code, granularity);  -- summary rebuild joins

-- MAINTAINED summary (rebuilt by SR). Carries the delivery boundary it was computed against so
-- in_delivery / is_expansion cannot silently go stale after a boundary change.
create table public.coverage_summary (
  postcode_code        text not null,
  granularity          pc_granularity not null,
  total_runs           int not null default 0,
  first_targeted       date,
  last_targeted        date,
  leads_total          int not null default 0,
  exported_total       int not null default 0,
  ignored_total        int not null default 0,
  reactivation_total   int not null default 0,
  in_delivery          boolean not null default false,
  is_expansion         boolean not null default false,
  delivery_boundary_id uuid references public.delivery_boundaries(id) on delete set null,  -- boundary in_delivery reflects
  boundary_version     int,                                                                -- stale-detection
  refreshed_at         timestamptz not null default now(),
  primary key (postcode_code, granularity)
);
create index coverage_gap_idx      on public.coverage_summary (in_delivery) where in_delivery;
create index coverage_boundary_idx on public.coverage_summary (delivery_boundary_id);
