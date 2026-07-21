-- 0023 — Controlled-import persistence (provider-neutral).
--
-- Adds the two new tables a manual CSV/JSON import needs (import_batches,
-- provider_raw_observations) and reuses the EXISTING consolidation architecture
-- (consolidated_candidates / candidate_source_links / candidate_field_values /
-- candidate_field_provenance, migration 0015) for canonical records — no duplicate schema.
-- Additive-only: two new columns on existing tables (raw_observation_id, for evidence
-- traceability), no drops, no renames, no destructive type changes.
--
-- Transaction safety: `commit_import_batch()` performs the entire batch (raw observations +
-- candidates + source links + field values + field provenance) inside ONE function call. A
-- single Postgres function invocation is already atomically transactional — any exception
-- raised partway through rolls back every write the function made, so a failed import can
-- never leave a partially-persisted batch. SECURITY DEFINER + a tenant-membership check
-- (mirrors app_current_tenant_ids()) so it can only write within the caller's own tenant.

create table if not exists import_batches (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  run_id            uuid references discovery_runs(id) on delete set null,
  source            text not null check (source in ('just_eat','uber_eats','deliveroo')),
  format            text not null check (format in ('csv','json')),
  original_filename text,
  file_checksum     text not null,
  imported_by       uuid references auth.users(id),
  imported_at       timestamptz not null default now(),
  total_rows        int not null default 0,
  accepted_count    int not null default 0,
  rejected_count    int not null default 0,
  duplicate_count   int not null default 0,
  schema_version    int not null default 1,
  parser_version    text,
  provider_version  text,
  status            text not null default 'pending' check (status in ('pending','committed','rolled_back','failed')),
  raw_evidence_reference text,
  created_at        timestamptz not null default now()
);
create index if not exists import_batches_tenant_idx on import_batches (tenant_id, created_at desc);

create table if not exists provider_raw_observations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  import_batch_id  uuid references import_batches(id) on delete cascade,
  run_id           uuid references discovery_runs(id) on delete set null,
  source           text not null,
  source_record_id text,
  response_type    text not null default 'import',
  raw_payload      jsonb not null,
  content_hash     text not null,
  parser_version   text not null,
  provider_version text not null,
  schema_version   int not null default 1,
  fetched_at       timestamptz not null default now(),
  duplicate_of     uuid references provider_raw_observations(id),
  created_at       timestamptz not null default now()
);
create index if not exists provider_raw_obs_batch_idx on provider_raw_observations (import_batch_id);
create index if not exists provider_raw_obs_hash_idx on provider_raw_observations (tenant_id, content_hash);

-- Evidence traceability: link a canonical source-link / field-provenance row back to the
-- exact immutable raw observation it came from. Additive, nullable — existing JE-derived
-- consolidation rows (which never had this) remain valid with a null reference.
alter table candidate_source_links
  add column if not exists raw_observation_id uuid references provider_raw_observations(id);
alter table candidate_field_provenance
  add column if not exists raw_observation_id uuid references provider_raw_observations(id);

alter table import_batches enable row level security;
drop policy if exists import_batches_select on import_batches;
create policy import_batches_select on import_batches for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
revoke all on import_batches from anon;
revoke insert, update, delete, truncate on import_batches from authenticated;
grant select on import_batches to authenticated;

alter table provider_raw_observations enable row level security;
drop policy if exists provider_raw_obs_select on provider_raw_observations;
create policy provider_raw_obs_select on provider_raw_observations for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));
revoke all on provider_raw_observations from anon;
revoke insert, update, delete, truncate on provider_raw_observations from authenticated;
grant select on provider_raw_observations to authenticated;

-- Whole-batch atomic commit. p_records is an array of pre-validated, deduplicated, canonical
-- outlet objects (mapped by the caller from SourceOutlet — same shape the app already uses).
-- Never fabricates: every field is taken as supplied or left null; no defaulting to 0/false.
create or replace function commit_import_batch(
  p_tenant_id uuid,
  p_run_id uuid,
  p_source text,
  p_format text,
  p_original_filename text,
  p_file_checksum text,
  p_parser_version text,
  p_provider_version text,
  p_rejected_count int,
  p_duplicate_count int,
  p_records jsonb  -- array of {source_outlet_id, raw, name, brand, postcode, phone, latitude, longitude, source_url, rating, review_count, cuisines, is_delivery, is_collection, field_values}
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_rec jsonb;
  v_obs_id uuid;
  v_candidate_id uuid;
  v_accepted int := 0;
  v_field_key text;
  v_field_val jsonb;
begin
  if p_tenant_id not in (select tenant_id from tenant_members where user_id = auth.uid())
     and auth.uid() is not null then
    raise exception 'not a member of tenant %', p_tenant_id;
  end if;

  insert into import_batches (
    tenant_id, run_id, source, format, original_filename, file_checksum,
    imported_by, total_rows, accepted_count, rejected_count, duplicate_count,
    parser_version, provider_version, status
  ) values (
    p_tenant_id, p_run_id, p_source, p_format, p_original_filename, p_file_checksum,
    auth.uid(), jsonb_array_length(p_records) + p_rejected_count + p_duplicate_count,
    0, p_rejected_count, p_duplicate_count,
    p_parser_version, p_provider_version, 'pending'
  ) returning id into v_batch_id;

  for v_rec in select * from jsonb_array_elements(p_records)
  loop
    insert into provider_raw_observations (
      tenant_id, import_batch_id, run_id, source, source_record_id, response_type,
      raw_payload, content_hash, parser_version, provider_version
    ) values (
      p_tenant_id, v_batch_id, p_run_id, p_source, v_rec->>'source_outlet_id', 'import',
      coalesce(v_rec->'raw', v_rec), encode(digest(v_rec::text, 'sha256'), 'hex'),
      p_parser_version, p_provider_version
    ) returning id into v_obs_id;

    insert into consolidated_candidates (
      tenant_id, run_id, name, brand, postcode, phone, latitude, longitude,
      match_status, confidence, first_seen, last_seen
    ) values (
      p_tenant_id, p_run_id, v_rec->>'name', v_rec->>'brand', v_rec->>'postcode', v_rec->>'phone',
      nullif(v_rec->>'latitude','')::double precision, nullif(v_rec->>'longitude','')::double precision,
      'confirmed_same', 1.0, now(), now()
    ) returning id into v_candidate_id;

    insert into candidate_source_links (
      candidate_id, tenant_id, source, source_outlet_id, source_url, rating, review_count,
      cuisines, is_delivery, is_collection, observed_at, raw_observation_id
    ) values (
      v_candidate_id, p_tenant_id, p_source, v_rec->>'source_outlet_id', v_rec->>'source_url',
      nullif(v_rec->>'rating','')::numeric, nullif(v_rec->>'review_count','')::int,
      coalesce(v_rec->'cuisines', '[]'::jsonb),
      (v_rec->>'is_delivery')::boolean, (v_rec->>'is_collection')::boolean, now(), v_obs_id
    );

    if v_rec ? 'field_values' then
      for v_field_key, v_field_val in select * from jsonb_each(v_rec->'field_values')
      loop
        insert into candidate_field_values (candidate_id, tenant_id, field_key, value, chosen_source)
          values (v_candidate_id, p_tenant_id, v_field_key, v_field_val, p_source)
          on conflict (candidate_id, field_key) do nothing;
        insert into candidate_field_provenance (candidate_id, tenant_id, field_key, source, source_outlet_id, value, raw_observation_id)
          values (v_candidate_id, p_tenant_id, v_field_key, p_source, v_rec->>'source_outlet_id', v_field_val, v_obs_id);
      end loop;
    end if;

    v_accepted := v_accepted + 1;
  end loop;

  update import_batches set accepted_count = v_accepted, status = 'committed' where id = v_batch_id;

  return jsonb_build_object('batch_id', v_batch_id, 'accepted', v_accepted);
end;
$$;

revoke all on function commit_import_batch(uuid,uuid,text,text,text,text,text,text,int,int,jsonb) from public;
grant execute on function commit_import_batch(uuid,uuid,text,text,text,text,text,text,int,int,jsonb) to service_role;

-- Rollback (manual):
--   drop function if exists commit_import_batch(uuid,uuid,text,text,text,text,text,text,int,int,jsonb);
--   alter table candidate_field_provenance drop column if exists raw_observation_id;
--   alter table candidate_source_links drop column if exists raw_observation_id;
--   drop table if exists provider_raw_observations;
--   drop table if exists import_batches;
-- Safe: every dropped object is additive-only from this migration; existing JE consolidation
-- rows never populate raw_observation_id, so removing the column loses no JE data.
