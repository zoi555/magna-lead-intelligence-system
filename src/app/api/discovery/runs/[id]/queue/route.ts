// POST /api/discovery/runs/[id]/queue — queue a Just Eat (Stage 1) execution for a run.
// The locally-runnable worker (npm run je:worker) claims and processes it.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { queueJustEatExecution } from "@/lib/discovery-engine/run-service";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const repo = getRepo();
    const run = await repo.getRun(id);
    if (!run) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    if (run.tenant_id !== session.tenantId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const execution = await queueJustEatExecution(repo, id);
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
