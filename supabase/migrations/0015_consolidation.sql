-- 0015 — Multi-source consolidation persistence (Workstream A5)
--
-- Persists the tested in-memory consolidation model. Tenant-scoped RLS. Every source
-- observation + per-source field is retained; matches are never made on name alone (the
-- match logic lives in code). No customer comparison here.

create table if not exists consolidated_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  run_id uuid references discovery_runs(id) on delete set null,
  name text not null, brand text, postcode text, phone text,
  latitude double precision, longitude double precision,
  match_status text not null check (match_status in ('confirmed_same','probable_same','ambiguous_manual','separate_branch','source_conflict')),
  confidence numeric,
  first_seen timestamptz, last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cc_run_idx on consolidated_candidates (run_id);

create table if not exists candidate_source_links (
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  source text not null,
  source_outlet_id text not null,
  source_url text, rating numeric, review_count integer, cuisines jsonb not null default '[]',
  is_delivery boolean, is_collection boolean, observed_at timestamptz,
  primary key (candidate_id, source, source_outlet_id)
);

create table if not exists candidate_field_values (
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  field_key text not null,
  value jsonb, chosen_source text,
  primary key (candidate_id, field_key)
);

create table if not exists candidate_field_provenance (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  field_key text not null, source text not null, source_outlet_id text, value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists candidate_match_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  evidence text not null,
  created_at timestamptz not null default now()
);

create table if not exists candidate_conflicts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  conflict text not null,
  created_at timestamptz not null default now()
);

create table if not exists candidate_merge_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  decision text not null, note text, decided_by uuid references auth.users(id),
  decided_at timestamptz not null default now()
);

create table if not exists candidate_completeness (
  candidate_id uuid not null references consolidated_candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  status text not null check (status in ('complete','enrichment_required','conflicting','unavailable_after_verified_search','manual_review')),
  missing_fields jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (candidate_id)
);

create table if not exists source_comparison_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  run_id uuid references discovery_runs(id) on delete set null,
  report jsonb not null,
  computed_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['consolidated_candidates','candidate_source_links','candidate_field_values','candidate_field_provenance','candidate_match_evidence','candidate_conflicts','candidate_merge_decisions','candidate_completeness','source_comparison_snapshots'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_select', t);
    execute format('create policy %I on %I for select to authenticated using (tenant_id in (select app_current_tenant_ids()))', t||'_select', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;