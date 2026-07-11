-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 11_existing_customers.sql — NetSuite customer master, used server-side for deduplication.
-- Depends on: 01_extensions.sql (nothing else; account_code is the PK).
--
-- BLOCKED BY ISS-0001: no real customer data until the completed existing-customer postcode file
-- is supplied. Created empty; stays empty.
--
-- BUCKET 2 — SERVER-SIDE ONLY (ADR-0012): this table gets **NO grant to `authenticated`**.
--   * Telesales must NEVER access it.
--   * Management must NOT read the raw customer master.
--   * Owner/Admin reach it only server-side via the service role (e.g. dedup).
-- RLS is enabled in 19 and there is **no select policy** for it (there is nothing to grant to).
-- All grants/RLS are applied in files 19–21 per MIGRATION_DRAFTING_PLAN.md. None here.
-- No data, no seeds.

create table public.existing_customers (
  account_code    text primary key,
  name            text,
  address         text,
  postcode        text,
  status          text not null check (status in ('active','inactive')),
  last_order_date date,
  source          text not null default 'netsuite',
  synced_at       timestamptz
);
create index existing_customers_postcode_idx   on public.existing_customers (postcode);
create index existing_customers_status_idx     on public.existing_customers (status);
create index existing_customers_lastorder_idx  on public.existing_customers (last_order_date);
create index existing_customers_synced_idx     on public.existing_customers (synced_at);
