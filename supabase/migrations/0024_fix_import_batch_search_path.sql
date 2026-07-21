-- 0024 — Fix commit_import_batch(): pgcrypto's digest() lives in the `extensions` schema on
-- Supabase (not `public`), so the function's `search_path = public` could not resolve it
-- ("function digest(text, unknown) does not exist"). Caught by the transaction safety itself
-- — the failed call rolled back cleanly with nothing persisted, exactly as designed. Fix-
-- forward migration (does not edit the already-applied 0023) — same function body, corrected
-- search_path only.

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
  p_records jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
