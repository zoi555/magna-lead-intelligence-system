-- ============================================================================
-- DO NOT RUN WITHOUT EXPLICIT MANUAL APPROVAL.
-- Prepared per the tightly-bounded geography hotfix (2026-07-22, revised after the
-- observation-level join + mixed-evidence correction). This is a one-off operational data
-- repair, NOT a schema migration — do not add to supabase/migrations/ and do not run it via
-- the migration runner. Run manually (psql / Supabase SQL editor / execute_sql) only after
-- the dry-run report has been reviewed and approved.
--
-- Target: run c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9.
--
-- Join: OBSERVATION-level, not source_outlet_id/source_record_id text-level. Each candidate's
-- linked source_outlet_id is resolved to its exact CANONICAL (latest, non-duplicate)
-- je_raw_observations row for this run, then that exact observation_id is matched against
-- provider_geography_validations (observation_id + run_id + tenant_id + source) to read its
-- own verdict — never any row merely sharing the same source_record_id text, which could
-- belong to a different (stale or cross-run) capture with a different verdict.
--
-- Classification (three existing geography_status values only — no schema change):
--   all linked observations valid_geography      -> valid_geography (operational)
--   all linked observations out_of_scope_geography -> out_of_scope_geography (excluded)
--   all linked observations missing/unverifiable  -> unverifiable_geography (excluded)
--   ANY OTHER MIX                                  -> unverifiable_geography,
--                                                      geography_reason = 'mixed_geography_evidence'
--                                                      (excluded from sales-ready output, retained
--                                                       for manual/Level-3 review via the existing
--                                                       Data-Quality Exceptions view — never deleted)
--
-- Confirmed by dry run (scripts/repair-geography-c301cbbc-dry-run.ts) against the current
-- production evidence:
--   before:  646 valid_geography (all of them — the defect)
--   after:    94 valid_geography, 552 out_of_scope_geography, 0 unverifiable_geography
--   37 candidates have more than one linked source outlet; ALL 37 are evidence-homogeneous
--   (8 all-valid, 29 all-out-of-scope) — zero mixed_geography_evidence cases in this run.
-- ============================================================================

begin;

-- Lock the exact candidate set for this run + tenant so nothing else can modify it mid-repair.
select cc.id
from consolidated_candidates cc
where cc.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
for update;

-- Abort outright if the pre-repair count, tenant, or candidate set has drifted from the
-- reconciled, reviewed figures — never repair against state nobody has actually seen.
do $$
declare
  n int;
  distinct_tenants int;
begin
  select count(*), count(distinct tenant_id) into n, distinct_tenants
  from consolidated_candidates where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9';
  if n <> 646 then
    raise exception 'Pre-repair count drifted: expected 646, found %. Aborting — re-run the dry run before repairing.', n;
  end if;
  if distinct_tenants <> 1 then
    raise exception 'Run c301cbbc spans % tenants, expected exactly 1. Aborting.', distinct_tenants;
  end if;
end $$;

-- Resolve, for every source_outlet_id linked to a candidate in this run, its exact CANONICAL
-- (latest, non-duplicate) je_raw_observations row for this run.
with canonical_observations as (
  select distinct on (source_record_id) id as observation_id, source_record_id
  from je_raw_observations
  where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9' and duplicate_of is null
  order by source_record_id, created_at desc
),
-- That exact observation's own evidence (never a source_record_id text match).
evidence as (
  select co.source_record_id, co.observation_id, pgv.status
  from canonical_observations co
  left join provider_geography_validations pgv
    on pgv.observation_id = co.observation_id
   and pgv.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
   and pgv.tenant_id = (select tenant_id from consolidated_candidates where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9' limit 1)
   and pgv.source = 'just_eat'
),
per_candidate as (
  select
    csl.candidate_id,
    count(*)                                                                            as link_count,
    count(*) filter (where e.status = 'valid_geography')                                as valid_count,
    count(*) filter (where e.status = 'out_of_scope_geography')                         as rejected_count,
    count(*) filter (where e.status is null or e.status = 'unverifiable_geography')      as unverifiable_count
  from candidate_source_links csl
  left join evidence e on e.source_record_id = csl.source_outlet_id
  where csl.source = 'just_eat'
    and csl.candidate_id in (select id from consolidated_candidates where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9')
  group by csl.candidate_id
),
corrected as (
  select
    candidate_id,
    case
      when link_count = 0 then 'unverifiable_geography'
      when valid_count = link_count then 'valid_geography'
      when rejected_count = link_count then 'out_of_scope_geography'
      when unverifiable_count = link_count then 'unverifiable_geography'
      else 'unverifiable_geography'  -- genuinely mixed evidence — never ordinary out_of_scope
    end as new_status,
    case
      when link_count = 0 then 'no linked evidence found'
      when valid_count = link_count then format('repair 2026-07-22: %s/%s linked observations valid_geography (observation-level, run-scoped)', valid_count, link_count)
      when rejected_count = link_count then format('repair 2026-07-22: %s/%s linked observations out_of_scope_geography (observation-level, run-scoped)', rejected_count, link_count)
      when unverifiable_count = link_count then 'repair 2026-07-22: no valid or rejected evidence found for any linked observation'
      else 'mixed_geography_evidence'
    end as new_reason
  from per_candidate
)
update consolidated_candidates cc
set geography_status = corrected.new_status,
    geography_reason = corrected.new_reason
from corrected
where cc.id = corrected.candidate_id
  and cc.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9';

-- Abort if any candidate had no reconcilable linked evidence at all (link_count = 0) — this
-- should never happen (every candidate in this run has >=1 source link), so treat it as a
-- data-integrity signal worth stopping for, not silently repairing over.
do $$
declare
  unreconciled int;
begin
  select count(*) into unreconciled
  from consolidated_candidates cc
  left join candidate_source_links csl on csl.candidate_id = cc.id and csl.source = 'just_eat'
  where cc.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
  group by cc.id
  having count(csl.candidate_id) = 0;
  if unreconciled > 0 then
    raise exception '% candidate(s) have no linked evidence at all — aborting for manual review.', unreconciled;
  end if;
end $$;

-- Postcondition: no candidate now marked valid_geography may have ANY linked observation whose
-- exact evidence is out_of_scope_geography or unverifiable_geography (i.e. every valid_geography
-- candidate's evidence must be homogeneously valid).
do $$
declare
  bad int;
begin
  select count(*) into bad
  from consolidated_candidates cc
  where cc.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
    and cc.geography_status = 'valid_geography'
    and exists (
      select 1
      from candidate_source_links csl
      join je_raw_observations jro
        on jro.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
       and jro.duplicate_of is null
       and jro.source_record_id = csl.source_outlet_id
      join provider_geography_validations pgv
        on pgv.observation_id = jro.id
       and pgv.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
       and pgv.source = 'just_eat'
      where csl.candidate_id = cc.id and csl.source = 'just_eat'
        and pgv.status <> 'valid_geography'
    );
  if bad <> 0 then
    raise exception 'Postcondition failed: % candidate(s) marked valid_geography still have non-valid linked evidence. Rolling back.', bad;
  end if;
end $$;

-- Preservation check: row counts for every evidence/link table must be UNCHANGED by this
-- repair (only consolidated_candidates.geography_status/geography_reason are written).
do $$
declare
  cand_count int;
  link_count int;
begin
  select count(*) into cand_count from consolidated_candidates where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9';
  select count(*) into link_count from candidate_source_links csl
    where csl.candidate_id in (select id from consolidated_candidates where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9');
  if cand_count <> 646 then
    raise exception 'Candidate row count changed during repair: expected 646, found %. Rolling back.', cand_count;
  end if;
  if link_count <> 716 then
    raise exception 'candidate_source_links row count changed during repair: expected 716, found %. Rolling back.', link_count;
  end if;
end $$;

-- Audit trail (append-only table; this INSERT is the only permitted write to it).
insert into app_audit_log (tenant_id, action, target_table, target_id, old_value, new_value, reason)
select
  cc.tenant_id,
  'geography_status_repair',
  'consolidated_candidates',
  'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9',
  jsonb_build_object('before_valid_geography', 646, 'before_out_of_scope_geography', 0, 'before_unverifiable_geography', 0),
  jsonb_build_object('after_valid_geography', 94, 'after_out_of_scope_geography', 552, 'after_unverifiable_geography', 0, 'after_mixed_geography_evidence', 0),
  'Corrected consolidateRun()/persistConsolidation() defect: candidates were stamped valid_geography unconditionally, ignoring provider_geography_validations evidence. Recomputed via exact observation-level, run-scoped evidence (candidate_source_links.source_outlet_id -> canonical je_raw_observations.id -> provider_geography_validations.observation_id, matched on run_id+tenant_id+source). See scripts/repair-geography-c301cbbc-dry-run.ts for the pre-repair verification and scripts/test-geography-consolidation-fix.ts for the regression proof.'
from consolidated_candidates cc
where cc.run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9'
limit 1;

commit;

-- Rollback procedure (manual, if something looks wrong AFTER commit — this is a data
-- correction, not a schema change, so "rollback" means restoring the prior status column
-- values, which are fully captured in the before-state JSON file written by the dry-run
-- script (scratchpad/geo-repair/before-state-c301cbbc-*.json) and in this audit row's
-- old_value. No row was ever deleted, so a restore is always possible:
--
--   update consolidated_candidates set geography_status = 'valid_geography', geography_reason = null
--   where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9';
--
-- (restores the pre-repair state exactly, since all 646 were uniformly 'valid_geography'
-- before this repair — confirmed by the dry run's before-status breakdown).
