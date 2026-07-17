-- 0019 — Operational geography status on consolidated candidates.
--
-- Adds a first-class filter so wrong-geography candidates (see 0018 / ISS-0018) can be excluded
-- from operational lead counts, exports and coverage WITHOUT deleting them.
--
-- Effect on existing rows: every existing candidate gets the DEFAULT 'valid_geography'. This is
-- correct for all prior Just Eat (GB) candidates. Any wrong-geography rows are then corrected by a
-- separate, audited data backfill (recorded in candidate_merge_decisions; raw observations untouched).

alter table public.consolidated_candidates
  add column if not exists geography_status text not null default 'valid_geography'
    check (geography_status in ('valid_geography','out_of_scope_geography','unverifiable_geography'));

alter table public.consolidated_candidates
  add column if not exists geography_reason text;
