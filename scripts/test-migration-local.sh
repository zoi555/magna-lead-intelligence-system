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

psql -v ON_ERROR_STOP=1 -d aspectlead_migration_test -q <<'STUBS'
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
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
