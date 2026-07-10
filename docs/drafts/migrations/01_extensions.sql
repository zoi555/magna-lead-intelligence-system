-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 01_extensions.sql — production-safe extensions only.
-- Source: docs/drafts/SQL_SCHEMA_RLS_DRAFT.md (Rev 3), docs/drafts/MIGRATION_DRAFTING_PLAN.md.
-- Depends on: nothing.

-- pgcrypto: provides hmac() and digest() for suppression/erasure hashing (hash-only in DB;
-- the HMAC pepper is a server-side environment secret, NEVER stored in the database).
-- On Supabase, extensions are conventionally installed into the `extensions` schema; adjust
-- the target schema to match the deployment convention when this is turned into a real migration.
create extension if not exists pgcrypto;

-- NOTE on UUIDs: gen_random_uuid() is built into PostgreSQL 13+ (pg_catalog); no uuid-ossp
-- extension is required. pgcrypto also provides it on older versions.

-- NOTE on test-only extensions: pgTAP (and any other test/dev-only extensions) are installed
-- ONLY in the UAT/CI test bootstrap, NEVER in a production migration. Do not add them here.
