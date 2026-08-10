-- 0031 — confirm_and_queue_run: atomic draft -> queued transition with overlap disclosure
--
-- P4 control review, 2026-08-10, corrected same day by explicit owner clarification:
-- TERRITORY OVERLAP IS PERMITTED. AspectLead must allow the same geography to be searched
-- multiple times — Area vs contained District/Sector/Unit, District vs contained
-- Sector/Unit, and an exact territorial repeat in a separate run are all legitimate. This
-- supersedes this migration's original design (identical-overlap-among-active-runs was a
-- hard block requiring an owner/admin-authorised override). Overlap is now DETECTED and
-- DISCLOSED, never prohibited — see docs/09_DECISIONS.md for the full correction record.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THIS FUNCTION STILL PREVENTS
-- ---------------------------------------------------------------------------------------
-- Accidental duplicate EXECUTION of the same configured run/source — i.e. the SAME
-- discovery_run id + source ending up with two active je_executions rows because of a
-- double-click or a race between two requests for the SAME run. This is a completely
-- different concern from two DISTINCT runs targeting the same territory (which is fine).
-- Enforced by: (a) SELECT ... FOR UPDATE on the target run (a second concurrent call for
-- the SAME run blocks until the first commits, then sees status <> 'draft'), and (b) an
-- explicit check for an existing active (queued/running/cancelling) execution for this
-- run+source.
--
-- ---------------------------------------------------------------------------------------
-- WHY NO ADVISORY LOCK ANY MORE
-- ---------------------------------------------------------------------------------------
-- The original design's pg_advisory_xact_lock(tenant+source) existed solely to serialise
-- the "identical overlap among active runs" check across DIFFERENT runs, so two
-- simultaneous queue attempts on the same territory couldn't both slip through a race and
-- both get queued in violation of the (then) prohibition. Since overlap between different
-- runs is no longer prohibited, there is nothing left for that lock to protect — two
-- different runs queueing concurrently on the same or overlapping territory is the
-- INTENDED, permitted outcome, not a race to prevent. The remaining duplicate-EXECUTION
-- protection (same run, same source) is already fully provided by the row lock in (a)
-- above, which only ever contends against calls for that SAME run — no cross-run
-- serialisation is needed for that either. Per "prefer the narrowest locking needed",
-- this migration now takes no advisory lock at all.
--
-- ---------------------------------------------------------------------------------------
-- OVERLAP DISCLOSURE + ACKNOWLEDGEMENT (not authorisation)
-- ---------------------------------------------------------------------------------------
-- "Material" overlap = this run shares at least one query_unit with another run currently
-- in an ACTIVE status (queued/running/cancelling) for the same tenant+source. Historical
-- runs (completed/completed_with_warnings/failed/cancelled) are informational only — they
-- never require acknowledgement, matching "historical completed runs should normally be
-- informational rather than treated as active conflicts". When material overlap exists,
-- the run's target_filters.overlapAcknowledgement.acknowledged must be true (the client
-- disclosure UI collects this — see /api/discovery/runs/conflicts and the Review step) or
-- the function rejects with CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED. This is NOT an
-- authorisation check — no owner/admin role is verified, because proceeding with an
-- overlapping search is not a restricted action; only the disclosure evidence
-- (acknowledgedBy/acknowledgedByEmail/acknowledgedAt/overlappingRunIds) is stamped
-- server-side, so a queued run always carries real proof of what was disclosed at
-- confirmation time, not just a client claim of "acknowledged: true".
--
-- ---------------------------------------------------------------------------------------
-- CANONICAL OVERLAP DATA
-- ---------------------------------------------------------------------------------------
-- query_unit (migration 0013), unique on (run_id, source, code) — proven to represent
-- every geography-selection kind this app's Run Builder can currently produce (Area/
-- District/Sector/Unit, all deterministically canonicalised to postcode_district query
-- units for Just Eat — see scripts/test-geography-standard.ts's "CROSS-PLAN overlap"
-- assertions). Place/town selections resolve to pending_data with ZERO query units (an
-- honest, pre-existing gap) and map-polygon selections are not reachable through this
-- app's current Run Builder UI/API — neither is claimed as covered here.
--
-- ---------------------------------------------------------------------------------------
-- SECURITY
-- ---------------------------------------------------------------------------------------
-- SECURITY DEFINER, fixed search_path=public, EXECUTE revoked from public/anon/authenticated,
-- granted to service_role only (same pattern as claim_je_execution/heartbeat_je_execution).
-- Tenant always derived from the locked run row, never caller input. p_actor_user_id is
-- supplied by the trusted Next.js API route from an already-verified session
-- (requireSessionAndRole()) — used only to stamp WHO acknowledged, never to authorise
-- anything (there is nothing here that requires authorising). RLS untouched.
--
-- ---------------------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------------------
-- `drop function if exists confirm_and_queue_run(uuid, uuid, text);` reverts the queue
-- route's one call site to the prior two-step (unguarded) path. No data loss.

drop function if exists confirm_and_queue_run(uuid, uuid, text);

create or replace function confirm_and_queue_run(
  p_run_id uuid,
  p_actor_user_id uuid,
  p_source text default 'just_eat'
)
returns je_executions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run             discovery_runs;
  v_units           text[];
  v_overlap_run_ids uuid[];
  v_ack             boolean;
  v_email           text;
  v_now             timestamptz := now();
  v_execution       je_executions;
begin
  -- 1. Row-lock the target run FIRST — serialises repeat calls for the SAME run (duplicate-
  --    queue-request protection): a second concurrent call blocks here until the first
  --    commits, then sees status <> 'draft' and is rejected below.
  select * into v_run from discovery_runs where id = p_run_id for update;
  if not found then
    raise exception 'CONFIRM_QUEUE_RUN_NOT_FOUND: run % does not exist', p_run_id;
  end if;

  -- 2. Eligibility.
  if v_run.status <> 'draft' then
    raise exception 'CONFIRM_QUEUE_NOT_DRAFT: run % is ''%'', not ''draft'' — its configuration is frozen once queued', p_run_id, v_run.status;
  end if;

  if p_source <> 'just_eat' then
    raise exception 'CONFIRM_QUEUE_SOURCE_NOT_PERMITTED: source ''%'' has no authorised operational execution path', p_source;
  end if;

  if not (
    (v_run.source_config ->> 'source') = p_source
    or (v_run.target_filters -> 'selectedProviders') ? p_source
  ) then
    raise exception 'CONFIRM_QUEUE_SOURCE_NOT_SELECTED: source ''%'' is not selected in run %''s immutable configuration', p_source, p_run_id;
  end if;

  -- Duplicate-EXECUTION protection (same run+source) — distinct from territory overlap
  -- between different runs, which is permitted and checked separately below.
  if exists (
    select 1 from je_executions e
    where e.run_id = p_run_id and e.source = p_source and e.status in ('queued', 'running', 'cancelling')
  ) then
    raise exception 'CONFIRM_QUEUE_DUPLICATE_EXECUTION: run % already has an active % execution — a second queue call must not create another one', p_run_id, p_source;
  end if;

  -- 3. Territory overlap — DETECT and DISCLOSE, never reject on this basis alone. Material
  --    overlap = shares >=1 query_unit with another run currently ACTIVE for this tenant+
  --    source. Historical (non-active) runs are informational only, never require
  --    acknowledgement.
  select coalesce(array_agg(distinct qu.code), array[]::text[])
    into v_units
    from query_unit qu
    where qu.run_id = p_run_id and qu.source = p_source;

  if array_length(v_units, 1) is not null then
    select coalesce(array_agg(distinct r.id), array[]::uuid[])
      into v_overlap_run_ids
      from discovery_runs r
      where r.tenant_id = v_run.tenant_id
        and r.id <> p_run_id
        and r.status in ('queued', 'running', 'cancelling')
        and exists (
          select 1 from query_unit qu2
          where qu2.run_id = r.id and qu2.source = p_source and qu2.code = any(v_units)
        );
  else
    v_overlap_run_ids := array[]::uuid[];
  end if;

  if array_length(v_overlap_run_ids, 1) is not null then
    v_ack := coalesce(((v_run.target_filters -> 'overlapAcknowledgement') ->> 'acknowledged')::boolean, false);
    if not v_ack then
      raise exception 'CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED: run % overlaps % currently active run(s) on source ''%'' — acknowledge the disclosed overlap to proceed (overlap itself is permitted)', p_run_id, array_length(v_overlap_run_ids, 1), p_source;
    end if;

    select email into v_email from auth.users where id = p_actor_user_id;

    -- Stamp disclosure evidence onto both mirrors. Never overwrites the user's own
    -- acknowledged/note fields — only adds server-verified proof of what was acknowledged.
    update discovery_runs set
      target_filters = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(target_filters, '{overlapAcknowledgement,acknowledgedBy}', to_jsonb(p_actor_user_id::text)),
            '{overlapAcknowledgement,acknowledgedByEmail}', to_jsonb(coalesce(v_email, p_actor_user_id::text))
          ),
          '{overlapAcknowledgement,acknowledgedAt}', to_jsonb(v_now)
        ),
        '{overlapAcknowledgement,overlappingRunIds}', to_jsonb(array(select id::text from unnest(v_overlap_run_ids) as id))
      ),
      config_snapshot = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(config_snapshot, '{review,overlapAcknowledgement,acknowledgedBy}', to_jsonb(p_actor_user_id::text)),
            '{review,overlapAcknowledgement,acknowledgedByEmail}', to_jsonb(coalesce(v_email, p_actor_user_id::text))
          ),
          '{review,overlapAcknowledgement,acknowledgedAt}', to_jsonb(v_now)
        ),
        '{review,overlapAcknowledgement,overlappingRunIds}', to_jsonb(array(select id::text from unnest(v_overlap_run_ids) as id))
      )
      where id = p_run_id
      returning * into v_run;
  end if;

  -- 4. Atomic transition — same transaction as everything above. A raised exception rolls
  --    back the whole transaction (including any overlap-evidence UPDATE), leaving nothing
  --    partial.
  update discovery_runs set status = 'queued', updated_at = v_now where id = p_run_id;

  insert into je_executions (tenant_id, run_id, source, status, planned_queries)
  values (v_run.tenant_id, p_run_id, p_source, 'queued', coalesce(jsonb_array_length(v_run.derived_query_units), 0))
  returning * into v_execution;

  return v_execution;
end $$;

revoke execute on function confirm_and_queue_run(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function confirm_and_queue_run(uuid, uuid, text) to service_role;
