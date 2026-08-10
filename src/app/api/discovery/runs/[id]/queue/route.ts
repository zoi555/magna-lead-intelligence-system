// POST /api/discovery/runs/[id]/queue — atomically transition a run draft -> queued
// (migration 0031, confirm_and_queue_run) and create its Just Eat execution. The
// locally-runnable worker (npm run je:worker) then claims and processes it.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { queueJustEatExecution } from "@/lib/discovery-engine/run-service";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Maps confirm_and_queue_run's structured error prefixes to the right HTTP status —
 *  see supabase/migrations/0031_confirm_and_queue_run.sql for the exact conditions. */
function statusForError(message: string): number {
  if (message.includes("CONFIRM_QUEUE_RUN_NOT_FOUND")) return 404;
  if (message.includes("CONFIRM_QUEUE_NOT_DRAFT")
    || message.includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED")
    || message.includes("CONFIRM_QUEUE_DUPLICATE_EXECUTION")) return 409;
  if (message.includes("CONFIRM_QUEUE_SOURCE_NOT_SELECTED")
    || message.includes("CONFIRM_QUEUE_SOURCE_NOT_PERMITTED")) return 400;
  return 500;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const repo = getRepo();
    const run = await repo.getRun(id);
    if (!run) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    if (run.tenant_id !== session.tenantId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const execution = await queueJustEatExecution(repo, id, session.userId);
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    return NextResponse.json({ ok: false, error: message }, { status: statusForError(message) });
  }
}
