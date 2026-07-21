// Tenant resolution for authenticated, session-driven code paths — replaces the
// hardcoded 'magna' fallback (resolveDefaultTenantId, still used only by the genuinely
// session-less JE worker) wherever a real user is asking. Rejects outright when the user
// has no active tenant membership — no silent default.

import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export interface SessionTenant {
  tenantId: string;
  role: string;
  userId: string;
}

export class NoTenantMembershipError extends Error {
  constructor() {
    super("No active tenant membership for this user");
    this.name = "NoTenantMembershipError";
  }
}

/** Resolve the tenant + role for the CURRENTLY authenticated session (via RLS — this
 *  query only ever returns the caller's own membership rows, enforced by
 *  tenant_members_select in migration 0001). Throws NoTenantMembershipError if the
 *  signed-in user has no membership — callers must not fall back to a default tenant. */
export async function resolveTenantForSession(): Promise<SessionTenant> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("tenant_members").select("tenant_id, role").limit(1).maybeSingle();
  if (error) throw new Error(`resolveTenantForSession: ${error.message}`);
  if (!data) throw new NoTenantMembershipError();
  return { tenantId: (data as { tenant_id: string }).tenant_id, role: (data as { role: string }).role, userId: userData.user.id };
}
