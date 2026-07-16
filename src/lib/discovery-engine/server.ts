// Server-side helpers for the discovery API routes. Uses the service-role client
// (server only). Never import this into a client component.

import { createServiceClient } from "./supabase-client";
import { SupabaseRepository } from "./repository/supabase";
import { DEFAULT_TENANT_SLUG } from "./run-service";

export function getRepo(): SupabaseRepository {
  return new SupabaseRepository();
}

/** Resolve the tenant id for the default org. Auth is not wired yet, so runs are
 *  attached to the single seeded tenant; when auth lands this comes from the session. */
export async function resolveDefaultTenantId(): Promise<string> {
  const db = createServiceClient();
  const r = await db.from("tenants").select("id").eq("slug", DEFAULT_TENANT_SLUG).maybeSingle();
  if (r.error || !r.data) throw new Error(`Default tenant '${DEFAULT_TENANT_SLUG}' not found`);
  return (r.data as { id: string }).id;
}
