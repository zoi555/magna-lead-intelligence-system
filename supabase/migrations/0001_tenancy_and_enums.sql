-- 0001 — Tenancy, enums, and RLS helpers (AspectLead / Just Eat Stage 1)
--
-- Tenant-aware from the start. Every domain table carries tenant_id and is
-- protected by RLS. The `authenticated` role only ever sees rows for tenants it
-- is a member of. The worker uses the service-role key (server-side only), which
-- bypasses RLS for write operations. No service credential ever reaches the browser.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---- enums --------------------------------------------------------------
do $$ begin
  create type run_status as enum
    ('draft','queued','running','completed','completed_with_warnings','failed','cancelling','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type execution_status as enum
    ('queued','running','completed','completed_with_warnings','failed','cancelling','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type parse_status as enum ('parsed','partial','failed');
exception when duplicate_object then null; end $$;

-- ---- tenants + membership ----------------------------------------------
create table if not exists tenants (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists tenant_members (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',   -- owner|admin|management|telesales|member
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Set of tenant ids the current authenticated user belongs to. SECURITY DEFINER so
-- policies can consult tenant_members without granting it to end users directly.
create or replace function app_current_tenant_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select tenant_id from tenant_members where user_id = auth.uid();
$$;

-- Convenience predicate for policies.
create or replace function app_is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_members where tenant_id = p_tenant and user_id = auth.uid());
$$;

-- RLS on the tenancy tables themselves.
alter table tenants enable row level security;
alter table tenant_members enable row level security;

drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select to authenticated
  using (id in (select app_current_tenant_ids()));

drop policy if exists tenant_members_select on tenant_members;
create policy tenant_members_select on tenant_members for select to authenticated
  using (user_id = auth.uid());

-- Default single tenant for the MVP (structure is multi-tenant; content is one org).
insert into tenants (slug, name) values ('magna', 'Magna Foodservice')
  on conflict (slug) do nothing;
