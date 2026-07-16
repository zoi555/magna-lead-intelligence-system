// POST /api/discovery/runs/[id]/queue — queue a Just Eat (Stage 1) execution for a run.
// The locally-runnable worker (npm run je:worker) claims and processes it.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { queueJustEatExecution } from "@/lib/discovery-engine/run-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const execution = await queueJustEatExecution(getRepo(), id);
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
