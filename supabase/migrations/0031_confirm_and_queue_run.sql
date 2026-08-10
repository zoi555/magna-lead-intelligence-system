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
-- P4 INDEPENDENT REVIEW, 2026-08-10 (same day, second correction pass) — two audit-safety
-- defects fixed:
--   (a) confirmedAtIso was only ever stamped by the BROWSER, before the queue call — so a
--       run's immutable config_snapshot could read confirmedAtIso=null even though the run
--       had genuinely been confirmed, or (worse) could carry a client timestamp for a
--       confirmation that then failed to queue at all. This function now stamps
--       config_snapshot.review.confirmedAtIso itself, from its own transaction timestamp,
--       unconditionally on every successful queue — never from client input.
--   (b) the disclosed-overlap acknowledgement was accepted at face value: the client sent
--       acknowledged=true and this function stamped WHATEVER overlap existed at that
--       instant, even if it differed from what the Review screen actually showed the user
--       (a new run could become active in the gap between disclosure and confirm). This
--       function now requires the client to record exactly which active run ids were
--       DISCLOSED at acknowledgement time (target_filters.overlapAcknowledgement.
--       disclosedOverlapRunIds), recomputes the current material overlap, and rejects with
--       CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE if the two sets differ — in either direction
--       (a run becoming active that wasn't disclosed, OR a disclosed run no longer being
--       active) — rather than silently queuing against evidence the user never saw. This
--       is still not an authorisation check: any authorised application user may
--       acknowledge permitted overlap: no role is verified, only that the DISCLOSURE is
--       fresh.
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
-- informational rather than treated as active conflicts". When material overlap exists:
--   1. target_filters.overlapAcknowledgement.acknowledged must be true (the client
--      disclosure UI collects this — see /api/discovery/runs/conflicts and the Review
--      step), else CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED.
--   2. target_filters.overlapAcknowledgement.disclosedOverlapRunIds (the exact active run
--      ids the Review screen showed when the box was ticked) must equal the run ids this
--      function independently recomputes RIGHT NOW, else CONFIRM_QUEUE_STALE_OVERLAP_
--      DISCLOSURE — the disclosure the user acted on is no longer accurate (something
--      became active, or something that was active no longer is) and must be refreshed.
-- This is NOT an authorisation check — no owner/admin role is verified, because proceeding
-- with an overlapping search is not a restricted action; only the disclosure evidence
-- (acknowledgedBy/acknowledgedByEmail/acknowledgedAt/overlappingRunIds) is stamped
-- server-side, so a queued run always carries real proof of what was disclosed AND
-- verified fresh at confirmation time, not just a client claim of "acknowledged: true".
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
  v_run               discovery_runs;
  v_units             text[];
  v_overlap_run_ids   uuid[];
  v_disclosed_run_ids uuid[];
  v_ack               boolean;
  v_email             text;
  v_now               timestamptz := now();
  v_execution         je_executions;
begin
  -- 1. Row-lock the target run FIRST — serialises repeat calls for the SAME run (duplicate-
  --    queue-request protection): a second concurrent call blocks here until the first
  --    commits, then sees status <> 'draft' and is rejected below.
  select * into v_run from discovery_runs where id = p_run_id for update;
  if not found then
    raise exception 'CONFIRM_QUEUE_RUN_NOT_FOUND: run % does not exist', p_run_id;
  end if;

  -- Normalise config_snapshot so the confirmedAtIso stamp below (step 4, unconditional on
  -- every successful queue) can never silently no-op: jsonb_set only creates the FINAL path
  -- segment if missing — an INTERMEDIATE segment ('review') that is absent, or present as
  -- JSON null, makes the whole call a silent no-op rather than an error. This is reachable
  -- for real: scripts/je-run.ts (the CLI discovery-run path) creates runs with
  -- config_snapshot={} directly, with no 'review' key at all (P4 independent review,
  -- 2026-08-10 — caught by test:confirm-and-queue-run-local while adding confirmedAtIso
  -- stamping). Only 'review' is normalised HERE (unconditionally needed); 'overlapAcknowledgement'
  -- is normalised separately, only inside the branch that actually writes into it below —
  -- forcing it from null to {} for every run regardless of overlap would misrepresent a run
  -- that never had anything to acknowledge.
  v_run.config_snapshot := coalesce(v_run.config_snapshot, '{}'::jsonb);
  if jsonb_typeof(v_run.config_snapshot -> 'review') is distinct from 'object' then
    v_run.config_snapshot := jsonb_set(v_run.config_snapshot, '{review}', '{}'::jsonb);
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
    select coalesce(array_agg(distinct r.id order by r.id), array[]::uuid[])
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

  v_ack := coalesce(((v_run.target_filters -> 'overlapAcknowledgement') ->> 'acknowledged')::boolean, false);
  select coalesce(array_agg(distinct elem::uuid order by elem::uuid), array[]::uuid[])
    into v_disclosed_run_ids
    from jsonb_array_elements_text(coalesce(v_run.target_filters #> '{overlapAcknowledgement,disclosedOverlapRunIds}', '[]'::jsonb)) as elem;

  if array_length(v_overlap_run_ids, 1) is not null then
    -- Material overlap exists RIGHT NOW.
    if not v_ack then
      raise exception 'CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED: run % overlaps % currently active run(s) on source ''%'' — acknowledge the disclosed overlap to proceed (overlap itself is permitted)', p_run_id, array_length(v_overlap_run_ids, 1), p_source;
    end if;

    if v_disclosed_run_ids <> v_overlap_run_ids then
      raise exception 'CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE: run % was acknowledged against overlapping run(s) % but the current overlap is now % — the disclosure you saw is no longer accurate; refresh and re-acknowledge before confirming', p_run_id, v_disclosed_run_ids, v_overlap_run_ids;
    end if;

    select email into v_email from auth.users where id = p_actor_user_id;

    -- Normalise review.overlapAcknowledgement to a real object ONLY here, right before
    -- writing into it — 'review' itself is already guaranteed an object (step 1 above), but
    -- overlapAcknowledgement could still be JSON null (the normal, honest default for a run
    -- with nothing to acknowledge) or absent (a CLI-created run). Scoped to this branch so a
    -- run that never had material overlap never gets a fabricated {} written in its place.
    if jsonb_typeof(v_run.config_snapshot -> 'review' -> 'overlapAcknowledgement') is distinct from 'object' then
      v_run.config_snapshot := jsonb_set(v_run.config_snapshot, '{review,overlapAcknowledgement}', '{}'::jsonb);
    end if;

    -- Stamp disclosure evidence onto both mirrors. Never overwrites the user's own
    -- acknowledged/note/disclosedOverlapRunIds fields — only adds server-verified proof of
    -- what was acknowledged (which, having just been checked above, is known-fresh).
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
            jsonb_set(v_run.config_snapshot, '{review,overlapAcknowledgement,acknowledgedBy}', to_jsonb(p_actor_user_id::text)),
            '{review,overlapAcknowledgement,acknowledgedByEmail}', to_jsonb(coalesce(v_email, p_actor_user_id::text))
          ),
          '{review,overlapAcknowledgement,acknowledgedAt}', to_jsonb(v_now)
        ),
        '{review,overlapAcknowledgement,overlappingRunIds}', to_jsonb(array(select id::text from unnest(v_overlap_run_ids) as id))
      )
      where id = p_run_id
      returning * into v_run;
  elsif v_ack and array_length(v_disclosed_run_ids, 1) is not null then
    -- No material overlap right now, but the user previously acknowledged one that has
    -- since disappeared (e.g. it completed) — do NOT silently proceed as if nothing had
    -- been disclosed; that would leave stale evidence implying the user saw today's (now
    -- empty) picture. Require a fresh disclosure/acknowledgement instead.
    raise exception 'CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE: run % was acknowledged against overlapping run(s) % but none of those are active any more — refresh the disclosure before confirming', p_run_id, v_disclosed_run_ids;
  end if;

  -- 4. Atomic transition — same transaction as everything above. A raised exception rolls
  --    back the whole transaction (including any overlap-evidence UPDATE), leaving nothing
  --    partial, and confirmedAtIso stays null. Stamp the server-authoritative confirmation
  --    time unconditionally — every successful queue is a confirmation, overlap or not.
  update discovery_runs set
    status = 'queued',
    updated_at = v_now,
    config_snapshot = jsonb_set(v_run.config_snapshot, '{review,confirmedAtIso}', to_jsonb(v_now))
    where id = p_run_id
    returning * into v_run;

  insert into je_executions (tenant_id, run_id, source, status, planned_queries)
  values (v_run.tenant_id, p_run_id, p_source, 'queued', coalesce(jsonb_array_length(v_run.derived_query_units), 0))
  returning * into v_execution;

  return v_execution;
end $$;

revoke execute on function confirm_and_queue_run(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function confirm_and_queue_run(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------
-- ONE-TIME BACKFILL: historical Just Eat query_unit rows (P4 production pre-flight,
-- 2026-08-11)
-- ---------------------------------------------------------------------------------------
-- confirm_and_queue_run and /api/discovery/runs/conflicts both now read query_unit as the
-- canonical source of a run's geography — but this migration has never been applied to the
-- hosted project, and query_unit has only ever been populated going forward from when this
-- feature branch's app code started calling persistGeographyProvenance/persistQueryUnits.
-- Read-only inspection of the hosted aspectlead-platform project (rubhjkgygauuixiqouza,
-- 2026-08-11) found: 222 discovery_runs total (217 just_eat, 5 uber_eats), only 1
-- query_unit row total (belonging to 1 just_eat run), and all 217 just_eat runs' own
-- derived_query_units genuinely typed as a JSON array (jsonb_typeof = 'array' for every
-- one — zero malformed rows). Applying this migration without a backfill would make 216 of
-- 217 historical Just Eat runs' territory invisible to overlap disclosure and to
-- confirm_and_queue_run's own materiality check for THEIR OWN query units — a real
-- regression versus the pre-migration behaviour (which read derived_query_units directly).
--
-- Scope: JUST EAT ONLY. Uber Eats' 5 historical draft runs are deliberately NOT backfilled
-- — Uber Eats has no authorised production execution path (ISS-0021), is not queueable
-- through this vertical slice, and confirm_and_queue_run already hard-rejects it via
-- CONFIRM_QUEUE_SOURCE_NOT_PERMITTED regardless of query_unit content. Backfilling
-- geography for a source that can never be queued would add data with no corresponding
-- product behaviour to support, for no benefit — see docs/09_DECISIONS.md.
--
-- Safety:
--  - INSERT only, using the existing (run_id, source, code) unique constraint via
--    ON CONFLICT DO NOTHING — never deletes or overwrites an existing query_unit row.
--  - Never touches discovery_runs (status, config_snapshot, or anything else), je_executions,
--    or any outlet/candidate/lead table.
--  - Fails closed on malformed input: a run is only eligible if its derived_query_units is
--    genuinely a JSON array (jsonb_typeof = 'array'); a candidate code is only inserted if
--    it matches a standard UK postcode-district shape (1-2 letters, a digit, an optional
--    trailing alphanumeric — e.g. "SW1", "M1", "EC1A"). Non-array or non-district-shaped
--    values are silently skipped, never guessed into a fabricated code. Read-only
--    inspection found zero malformed derived_query_units among the 217 hosted just_eat
--    runs, so no rows are expected to be skipped in production — this guard exists for any
--    future/edge-case row, not because bad hosted data was found.
--  - Defined as a named, idempotent, re-invocable function (not a bare inline statement) so
--    it can be safely called again — a no-op for already-backfilled rows — if a future gap
--    of this same shape ever appears, and so this exact logic is directly testable via RPC
--    (see scripts/test-confirm-and-queue-run-local.ts §12) without duplicating the SQL.
--  - SECURITY DEFINER, fixed search_path=public, EXECUTE restricted to service_role only —
--    same pattern as confirm_and_queue_run.
--
-- Invoked ONCE, immediately below, as part of this migration's application (local reset AND
-- the eventual hosted apply). Read-only inspection (2026-08-11) predicts 230 new rows
-- inserted out of 231 candidate (run_id, code) pairs across the 217 hosted just_eat runs (1
-- already present) — the exact statement used to derive that count is reproduced in
-- docs/09_DECISIONS.md as the production pre-flight record.
create or replace function backfill_legacy_just_eat_query_units()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  with eligible_runs as materialized (
    select r.id as run_id, r.tenant_id, r.derived_query_units
    from discovery_runs r
    where (r.source_config ->> 'source') = 'just_eat'
      and jsonb_typeof(r.derived_query_units) = 'array'
  ),
  candidate_codes as materialized (
    select distinct er.run_id, er.tenant_id, upper(trim(elem.value)) as code
    from eligible_runs er,
      lateral jsonb_array_elements_text(er.derived_query_units) as elem(value)
  )
  insert into query_unit (tenant_id, run_id, code, level, source)
  select tenant_id, run_id, code, 'postcode_district', 'just_eat'
  from candidate_codes
  where code ~ '^[A-Z]{1,2}[0-9][0-9A-Z]?$'
  on conflict (run_id, source, code) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke execute on function backfill_legacy_just_eat_query_units() from public, anon, authenticated;
grant  execute on function backfill_legacy_just_eat_query_units() to service_role;

do $$
declare v_count integer;
begin
  v_count := backfill_legacy_just_eat_query_units();
  raise notice 'backfill_legacy_just_eat_query_units: inserted % historical query_unit row(s)', v_count;
end $$;
