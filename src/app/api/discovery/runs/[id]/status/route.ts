// GET /api/discovery/runs/[id]/status — run + executions + latest data-quality report.
// Sanitised: never returns raw payloads.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { getRunStatus } from "@/lib/discovery-engine/run-service";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const status = await getRunStatus(getRepo(), id);
    if (!status) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    if (status.run.tenant_id !== session.tenantId) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
