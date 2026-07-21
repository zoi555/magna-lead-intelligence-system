// POST /api/auth/bootstrap — called once by /auth/callback right after a session is
// established. Records the sign-in, then attempts the owner bootstrap (a no-op unless
// this is genuinely the first, verified, INITIAL_OWNER_EMAIL-matching sign-in). Never
// accepts an email/role from the request body — everything comes from the verified
// session cookie only.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server-client";
import { bootstrapOwnerIfNeeded, recordSignIn } from "@/lib/auth/bootstrap-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  await recordSignIn({ id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at });
  const bootstrap = await bootstrapOwnerIfNeeded({ id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at });

  return NextResponse.json({ ok: true, bootstrap });
}
