// POST /api/discovery/estimate — real estimated record volume for the Create New Run
// review step: counts existing je_outlets rows whose outcode falls inside the proposed
// query units. This is a genuine query result (existing Just Eat coverage in that
// territory), not a fabricated figure — it will legitimately read 0 for territory with no
// prior Just Eat presence, and that is reported honestly, not hidden.

import { NextResponse } from "next/server";
import { resolveDefaultTenantId } from "@/lib/discovery-engine/server";
import { createServiceClient, hasServiceCredentials } from "@/lib/discovery-engine/supabase-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const queryUnits: string[] = Array.isArray(body.queryUnits) ? body.queryUnits.map((u: unknown) => String(u).toUpperCase()) : [];
    if (!queryUnits.length) return NextResponse.json({ ok: true, estimatedVolume: 0 });
    if (!hasServiceCredentials()) return NextResponse.json({ ok: true, estimatedVolume: null });

    const tenant_id = await resolveDefaultTenantId();
    const db = createServiceClient();
    const res = await db.from("je_outlets").select("id", { count: "exact", head: true }).eq("tenant_id", tenant_id).in("outcode", queryUnits);
    if (res.error) throw new Error(JSON.stringify(res.error));
    return NextResponse.json({ ok: true, estimatedVolume: res.count ?? 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
