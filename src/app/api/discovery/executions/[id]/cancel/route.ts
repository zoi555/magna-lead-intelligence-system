// POST /api/discovery/executions/[id]/cancel — request cooperative cancellation.
// The worker sees the flag on its next heartbeat and stops.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getRepo().requestCancel(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
