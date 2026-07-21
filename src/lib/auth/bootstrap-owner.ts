// Owner bootstrap — grants the 'owner' tenant_members role exactly once, to exactly one
// email, using only server-side signals never trusted from the client:
//
//   1. the authenticated user's email is verified (email_confirmed_at is set);
//   2. it matches INITIAL_OWNER_EMAIL (server-only env var, case-insensitive compare —
//      real-world email matching is case-insensitive per RFC, the exact-match requirement
//      is about the address itself, not byte-for-byte casing);
//   3. no 'owner' membership exists yet for the tenant (this IS the "retired" state — no
//      separate flag table; the DB-level partial unique index from migration 0025 backs
//      this up as a second, race-proof guard).
//
// Uses the service-role client deliberately (the one narrow, documented exception to
// "settings-shaped writes never use service-role as a shortcut" — this is a one-time
// tenant-membership bootstrap during auth-callback processing, not a settings mutation).

import { createServiceClient } from "@/lib/discovery-engine/supabase-client";
import { DEFAULT_TENANT_SLUG } from "@/lib/discovery-engine/run-service";

export interface BootstrapUser {
  id: string;
  email: string | null | undefined;
  email_confirmed_at: string | null | undefined;
}

export interface BootstrapResult {
  granted: boolean;
  reason: string;
}

export async function bootstrapOwnerIfNeeded(user: BootstrapUser): Promise<BootstrapResult> {
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) return { granted: false, reason: "INITIAL_OWNER_EMAIL is not configured" };
  if (!user.email_confirmed_at) return { granted: false, reason: "email not verified" };
  if (!user.email || user.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    return { granted: false, reason: "authenticated email does not match INITIAL_OWNER_EMAIL" };
  }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", DEFAULT_TENANT_SLUG).maybeSingle();
  if (tenantRes.error || !tenantRes.data) return { granted: false, reason: "default tenant not found" };
  const tenantId = (tenantRes.data as { id: string }).id;

  const existingOwner = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").maybeSingle();
  if (existingOwner.data) return { granted: false, reason: "bootstrap already retired — an owner already exists for this tenant" };

  const existingMembership = await db.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", user.id).maybeSingle();
  if (existingMembership.data) {
    return { granted: false, reason: `user already has a membership (role: ${(existingMembership.data as { role: string }).role})` };
  }

  const insertRes = await db.from("tenant_members").insert({ tenant_id: tenantId, user_id: user.id, role: "owner" });
  if (insertRes.error) {
    // A concurrent request most likely won the race first (the migration-0025 unique
    // index rejects a second owner) — treat as "already retired," not a hard failure.
    return { granted: false, reason: `owner insert rejected (likely a concurrent bootstrap already succeeded): ${insertRes.error.message}` };
  }

  await db.from("app_audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    actor_email: user.email,
    action: "owner_bootstrap",
    target_table: "tenant_members",
    target_id: user.id,
    new_value: { role: "owner" },
    reason: "initial owner bootstrap — verified email matched INITIAL_OWNER_EMAIL",
  });

  return { granted: true, reason: "owner membership created" };
}

/** Records a sign-in event for any authenticated user, regardless of bootstrap outcome —
 *  service-role because this happens during auth-callback processing (see bootstrap
 *  above), not a settings mutation. Attributed to the single default tenant (this is a
 *  single-tenant internal beta) even for a user with no membership yet. */
export async function recordSignIn(user: BootstrapUser): Promise<void> {
  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", DEFAULT_TENANT_SLUG).maybeSingle();
  if (tenantRes.error || !tenantRes.data) return;
  const tenantId = (tenantRes.data as { id: string }).id;
  await db.from("app_audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    actor_email: user.email,
    action: "sign_in",
  });
}
