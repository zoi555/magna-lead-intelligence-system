// POST /api/discovery/executions/[id]/cancel — request cooperative cancellation.
// The worker sees the flag on its next heartbeat and stops.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const repo = getRepo();
    const execution = await repo.getExecution(id);
    if (!execution) return NextResponse.json({ ok: false, error: "Execution not found" }, { status: 404 });
    if (execution.tenant_id !== session.tenantId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    await repo.requestCancel(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
