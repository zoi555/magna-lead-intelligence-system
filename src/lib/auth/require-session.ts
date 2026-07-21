// Shared guard for sensitive API routes — every one of them calls this itself, rather
// than trusting that the page wrapping it was protected by middleware. Returns the
// session's tenant/role on success, or a ready-to-return NextResponse (401/403) on
// failure, so callers can `const guard = await requireSessionAndRole(...); if (guard instanceof
// NextResponse) return guard;`.

import { NextResponse } from "next/server";
import { resolveTenantForSession, NoTenantMembershipError, type SessionTenant } from "./resolve-tenant";

export async function requireSessionAndRole(opts?: { roles?: string[] }): Promise<SessionTenant | NextResponse> {
  let session: SessionTenant;
  try {
    session = await resolveTenantForSession();
  } catch (e) {
    if (e instanceof NoTenantMembershipError) {
      return NextResponse.json({ ok: false, error: "No active tenant membership" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (opts?.roles && !opts.roles.includes(session.role)) {
    return NextResponse.json({ ok: false, error: `Requires role: ${opts.roles.join(" or ")}` }, { status: 403 });
  }
  return session;
}
