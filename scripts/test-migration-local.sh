#!/usr/bin/env bash
# Disposable-schema migration test — applies EVERY migration in supabase/migrations/
# (0001 through the latest) against a throwaway local Postgres cluster, then runs
# functional assertions. Never touches the real Supabase project. Requires local
# `initdb`/`pg_ctl`/`psql`/`createdb` (Postgres client+server binaries) on PATH —
# skips with a clear message if unavailable (e.g. in a minimal CI image).
set -euo pipefail

if ! command -v initdb >/dev/null 2>&1; then
  echo "SKIP: no local Postgres (initdb) available — cannot run the disposable-schema migration test."
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
SOCKDIR="$(mktemp -d /tmp/aspectlead-pgtest.XXXXXX)"
PORT=55433
FAILED=0

cleanup() {
  pg_ctl -D "$WORKDIR/pgdata" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$WORKDIR" "$SOCKDIR"
}
trap cleanup EXIT

echo "Migration test: disposable Postgres cluster at $WORKDIR (port $PORT)"
initdb -D "$WORKDIR/pgdata" -U testuser -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$WORKDIR/pgdata" -l "$WORKDIR/pg.log" -o "-p $PORT -k $SOCKDIR" start >/dev/null
sleep 1

export PGHOST="$SOCKDIR" PGPORT="$PORT" PGUSER=testuser PGDATABASE=postgres
createdb aspectlead_migration_test
# Supabase databases default search_path to include `extensions` (where pgcrypto etc. live) —
# match that here so unqualified gen_random_uuid()/digest() calls resolve the same way locally
# as they do on the real project.
psql -q -c 'ALTER DATABASE aspectlead_migration_test SET search_path = "$user", public, extensions;'

psql -v ON_ERROR_STOP=1 -d aspectlead_migration_test -q <<'STUBS'
-- Match Supabase's real convention: pgcrypto (and most extensions) install into a dedicated
-- `extensions` schema, NOT `public`. A local stub that installed pgcrypto into `public` (as
-- vanilla Postgres would by default) missed a real production bug this session — a SECURITY
-- DEFINER function's `search_path = public` could not resolve digest() on Supabase. Fixed here
-- so this class of bug is caught locally before it ever reaches production again.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.email() returns text language sql stable as $$ select null::text $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
STUBS

export PGDATABASE=aspectlead_migration_test
echo "Applying $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations..."
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>"$WORKDIR/last-error.log"; then
    echo "  ✗ MIGRATION FAILED: $(basename "$f")"
    cat "$WORKDIR/last-error.log"
    FAILED=1
    break
  fi
done
[ "$FAILED" -eq 0 ] && echo "  ✓ all migrations applied cleanly"

if [ "$FAILED" -eq 0 ]; then
  RESULT="$(psql -v ON_ERROR_STOP=1 -t -A -q <<'SQL'
select id from tenants where slug = 'magna';
SQL
)"
  TENANT_ID="$(echo "$RESULT" | head -1)"

  psql -v ON_ERROR_STOP=1 -q <<SQL
insert into je_outlets (tenant_id, je_outlet_id, trading_name, address_first_line, city, postcode, outcode, latitude, longitude, cuisines, normalisation_version)
values ('$TENANT_ID', 'old-shape-1', 'Old Shape Grill', '1 Old Road', 'Southall', 'UB1 1AA', 'UB1', 51.5, -0.37, '["Indian"]'::jsonb, 'je-normalise-1.0.0');

insert into je_outlets (tenant_id, je_outlet_id, trading_name, brand_name, address_first_line, city, postcode, outcode, latitude, longitude, telephone_e164, rating_average, rating_count, cuisines, normalisation_version, schema_version, branch_name, address_line2, locality, categories, rating_distribution, service_fee, distance_miles, image_url, hygiene_rating, anchor_id, provider_version, parser_version)
values ('$TENANT_ID', 'full-shape-1', 'Full Shape Diner', 'Full Shape', '2 Full Road', 'Southall', 'UB1 2BB', 'UB1', 51.51, -0.371, '+442079460111', 4.5, 200, '["Indian","Curry"]'::jsonb, 'je-normalise-1.0.0', '1', 'Southall Branch', 'Unit 2', 'Southall', '["Restaurant","Takeaway"]'::jsonb, '{"5":150,"4":30,"3":10}'::jsonb, 0.99, 0.5, 'https://example.test/img.jpg', '5', 'ub1-central', 'je-adapter-1.0.0', 'je-search-1.1.0');
SQL

  ASSERT_FAIL=0
  check() {
    local desc="$1" query="$2" expect="$3"
    local got
    got="$(psql -t -A -q -c "$query")"
    if [ "$got" = "$expect" ]; then echo "  ✓ $desc"; else echo "  ✗ $desc (expected '$expect', got '$got')"; ASSERT_FAIL=1; fi
  }

  check "existing (old-shape) records remain readable" \
    "select count(*) from je_outlets where je_outlet_id = 'old-shape-1';" "1"
  check "old-shape record: new nullable field stays null, never fabricated" \
    "select coalesce(schema_version, '<null>') from je_outlets where je_outlet_id = 'old-shape-1';" "<null>"
  check "old-shape record: new array field defaults to empty, never fabricated" \
    "select categories::text from je_outlets where je_outlet_id = 'old-shape-1';" "[]"
  check "full canonical record inserted with every new field" \
    "select branch_name from je_outlets where je_outlet_id = 'full-shape-1';" "Southall Branch"
  check "new anchor index exists" \
    "select count(*) from pg_indexes where tablename='je_outlets' and indexname='je_outlets_anchor_idx';" "1"
  check "new pipeline-run index exists" \
    "select count(*) from pg_indexes where tablename='je_outlets' and indexname='je_outlets_pipeline_run_idx';" "1"

  OUTLET_ID="$(psql -t -A -q -c "select id from je_outlets where je_outlet_id = 'full-shape-1';")"
  psql -v ON_ERROR_STOP=1 -q <<SQL
insert into je_rating_history (tenant_id, outlet_id, je_outlet_id, score, review_count, observed_at)
values ('$TENANT_ID', '$OUTLET_ID', 'full-shape-1', 4.5, 200, now() - interval '2 days');
insert into je_rating_history (tenant_id, outlet_id, je_outlet_id, score, review_count, observed_at)
values ('$TENANT_ID', '$OUTLET_ID', 'full-shape-1', 4.6, 210, now());
insert into je_field_provenance (tenant_id, outlet_id, field_key, value, original_value, source, source_url, confidence, is_derived, enrichment_evidence_reference)
values ('$TENANT_ID', '$OUTLET_ID', 'telephone', '"+442079460111"'::jsonb, '"020 7946 0111"'::jsonb, 'google_places', 'https://maps.google.com/?cid=12345', 0.85, false, 'evidence/google_places_full-shape-1.json');
SQL

  check "rating history retains multiple distinct timestamps (never overwritten)" \
    "select count(*) from je_rating_history where outlet_id = '$OUTLET_ID';" "2"
  check "enrichment provenance: source_url column works" \
    "select source_url from je_field_provenance where outlet_id = '$OUTLET_ID' and field_key = 'telephone';" "https://maps.google.com/?cid=12345"
  check "enrichment provenance: non-JE evidence reference column works" \
    "select enrichment_evidence_reference from je_field_provenance where outlet_id = '$OUTLET_ID' and field_key = 'telephone';" "evidence/google_places_full-shape-1.json"

  # --- commit_import_batch: successful commit ---
  GOOD_RECORDS='[{"source_outlet_id":"imp-1","name":"Import Test Diner","postcode":"UB1 1AA","latitude":"51.5","longitude":"-0.37","field_values":{"phone":"+442079460111"}},{"source_outlet_id":"imp-2","name":"Import Test Cafe","postcode":"UB1 2BB","latitude":"51.51","longitude":"-0.38"}]'
  COMMIT_RESULT="$(psql -t -A -q -c "select commit_import_batch('$TENANT_ID'::uuid, null, 'uber_eats', 'csv', 'test.csv', 'abc123hash', 'test-parser-1.0', 'test-adapter-1.0', 0, 0, '$GOOD_RECORDS'::jsonb);")"
  check "commit_import_batch returns accepted=2 for a valid 2-record batch" \
    "select ('$COMMIT_RESULT')::jsonb->>'accepted';" "2"
  check "committed batch has 2 provider_raw_observations rows" \
    "select count(*) from provider_raw_observations where source_record_id in ('imp-1','imp-2');" "2"
  check "committed batch has 2 consolidated_candidates rows" \
    "select count(*) from consolidated_candidates where name in ('Import Test Diner','Import Test Cafe');" "2"
  check "import_batches row marked committed with correct accepted_count" \
    "select status || ':' || accepted_count from import_batches where file_checksum = 'abc123hash';" "committed:2"
  check "candidate_source_links.raw_observation_id populated (evidence traceability)" \
    "select count(*) from candidate_source_links where source_outlet_id in ('imp-1','imp-2') and raw_observation_id is not null;" "2"
  check "candidate_field_provenance populated with the field_values payload" \
    "select value::text from candidate_field_provenance where source_outlet_id='imp-1' and field_key='phone';" "\"+442079460111\""

  # --- commit_import_batch: transaction rollback on a mid-batch failure ---
  # Record 2's latitude is not numeric — the cast inside the function raises an exception
  # partway through the loop (after record 1 has already been inserted within the SAME
  # function call). One function invocation is one transaction, so this must roll back
  # BOTH records and the import_batches row — never a partial batch.
  BAD_RECORDS='[{"source_outlet_id":"bad-imp-1","name":"Should Not Persist One","postcode":"UB1 3CC","latitude":"51.5","longitude":"-0.37"},{"source_outlet_id":"bad-imp-2","name":"Should Not Persist Two","postcode":"UB1 4DD","latitude":"NOT_A_NUMBER","longitude":"-0.37"}]'
  psql -q -c "select commit_import_batch('$TENANT_ID'::uuid, null, 'uber_eats', 'csv', 'bad.csv', 'deadbeefhash', 'test-parser-1.0', 'test-adapter-1.0', 0, 0, '$BAD_RECORDS'::jsonb);" >/dev/null 2>&1 || true
  check "rollback: no import_batches row for the failed checksum" \
    "select count(*) from import_batches where file_checksum = 'deadbeefhash';" "0"
  check "rollback: record 1 (which succeeded before the failure) was NOT left behind" \
    "select count(*) from consolidated_candidates where name = 'Should Not Persist One';" "0"
  check "rollback: record 1's raw observation was NOT left behind either" \
    "select count(*) from provider_raw_observations where source_record_id = 'bad-imp-1';" "0"

  # --- 0025: auth bootstrap support + audit log ---
  check "app_audit_log accepts an insert" \
    "insert into app_audit_log (tenant_id, action, actor_email) values ('$TENANT_ID', 'owner_bootstrap', 'owner@example.test') returning action;" "owner_bootstrap"
  AUDIT_ROW_ID="$(psql -t -A -q -c "select id from app_audit_log where tenant_id = '$TENANT_ID' order by created_at desc limit 1;")"
  psql -q -c "update app_audit_log set reason = 'tampered' where id = '$AUDIT_ROW_ID';" >/dev/null 2>&1 || true
  check "app_audit_log rejects UPDATE (append-only)" \
    "select (reason is null) from app_audit_log where id = '$AUDIT_ROW_ID';" "t"
  psql -q -c "delete from app_audit_log where id = '$AUDIT_ROW_ID';" >/dev/null 2>&1 || true
  check "app_audit_log rejects DELETE (append-only)" \
    "select count(*) from app_audit_log where id = '$AUDIT_ROW_ID';" "1"
  check "app_has_tenant_role function exists and is callable" \
    "select app_has_tenant_role('$TENANT_ID'::uuid, array['owner']);" "f"

  TEST_USER_ID="$(psql -t -A -q -c "insert into auth.users default values returning id;")"
  psql -q -c "insert into tenant_members (tenant_id, user_id, role) values ('$TENANT_ID', '$TEST_USER_ID', 'owner');" >/dev/null 2>&1
  check "one owner per tenant: first owner insert succeeds" \
    "select count(*) from tenant_members where tenant_id = '$TENANT_ID' and role = 'owner';" "1"
  TEST_USER_ID_2="$(psql -t -A -q -c "insert into auth.users default values returning id;")"
  psql -q -c "insert into tenant_members (tenant_id, user_id, role) values ('$TENANT_ID', '$TEST_USER_ID_2', 'owner');" >/dev/null 2>&1 || true
  check "one owner per tenant: second owner insert is rejected by the unique index" \
    "select count(*) from tenant_members where tenant_id = '$TENANT_ID' and role = 'owner';" "1"

  # --- 0027: persisted tenant settings + settings-change audit trigger ---
  check "tenant_settings seeded a row for the default tenant" \
    "select count(*) from tenant_settings where tenant_id = '$TENANT_ID';" "1"
  check "source_operational_settings seeded 4 rows for the default tenant" \
    "select count(*) from source_operational_settings where tenant_id = '$TENANT_ID';" "4"
  check "just_eat seeded as enabled (matches its real code-level support)" \
    "select enabled from source_operational_settings where tenant_id = '$TENANT_ID' and source_id = 'just_eat';" "t"
  check "uber_eats seeded as disabled (matches PENDING_AUTHORISATION status)" \
    "select enabled from source_operational_settings where tenant_id = '$TENANT_ID' and source_id = 'uber_eats';" "f"

  psql -q -c "update tenant_settings set default_spend_ceiling_gbp = 42 where tenant_id = '$TENANT_ID';" >/dev/null 2>&1
  check "updating tenant_settings writes a settings_update audit row" \
    "select count(*) from app_audit_log where tenant_id = '$TENANT_ID' and action = 'settings_update' and target_table = 'tenant_settings';" "1"
  check "the audit row's new_value reflects the change" \
    "select (new_value->>'default_spend_ceiling_gbp') from app_audit_log where tenant_id = '$TENANT_ID' and action = 'settings_update' and target_table = 'tenant_settings' order by created_at desc limit 1;" "42"

  if [ "$ASSERT_FAIL" -eq 1 ]; then FAILED=1; fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo ""
  echo "All migration assertions passed ✓"
  exit 0
else
  echo ""
  echo "Migration test FAILED ✗"
  exit 1
fi
