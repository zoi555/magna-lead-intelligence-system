-- 0029 — Fix forward: provider_geography_validations' append-only trigger blocked its OWN
-- foreign keys' `ON DELETE SET NULL` action.
--
-- Migration 0018 gave run_id/execution_id/observation_id `references ... on delete set
-- null` (correct — evidence should survive its parent run being deleted) but also added a
-- blanket `before update or delete ... raise exception` trigger with no exception for that
-- FK-driven UPDATE. The two are incompatible: deleting a run whose Just Eat execution had
-- any geography-validation rows failed outright, because Postgres's SET NULL cascade is
-- itself an UPDATE the trigger refused.
--
-- Never triggered before today: nothing wrote real rows into this table via a path whose
-- parent run gets deleted until the Just Eat worker was wired into the gate this session
-- (previously only the Uber pilot scripts used it). Caught immediately by
-- test:je-supabase's own cleanup step failing for real.
--
-- Fix: allow an UPDATE only when it exclusively nulls run_id/execution_id/observation_id
-- (exactly what the FK cascade does) — every other column, including the verdict/reason
-- evidence itself, remains completely immutable. DELETE stays fully forbidden.

create or replace function public.forbid_geo_val_mutation() returns trigger language plpgsql
  set search_path = '' as $$
begin
  if TG_OP = 'UPDATE'
     and (new.run_id is null or new.run_id = old.run_id)
     and (new.execution_id is null or new.execution_id = old.execution_id)
     and (new.observation_id is null or new.observation_id = old.observation_id)
     and new.tenant_id is not distinct from old.tenant_id
     and new.source is not distinct from old.source
     and new.source_record_id is not distinct from old.source_record_id
     and new.requested_country is not distinct from old.requested_country
     and new.requested_geography is not distinct from old.requested_geography
     and new.resolved_query_units is not distinct from old.resolved_query_units
     and new.provider_country is not distinct from old.provider_country
     and new.provider_postcode is not distinct from old.provider_postcode
     and new.provider_postcode_type is not distinct from old.provider_postcode_type
     and new.provider_has_coords is not distinct from old.provider_has_coords
     and new.status is not distinct from old.status
     and new.signal is not distinct from old.signal
     and new.reason is not distinct from old.reason
     and new.created_at is not distinct from old.created_at
  then
    return new; -- only a parent-deleted FK nullification — evidence itself untouched
  end if;
  raise exception 'provider_geography_validations is append-only (audit evidence)';
end $$;
