// POST /api/discovery/runs/conflicts — real duplicate-territory / conflict check for the
// Create New Run review step. Compares the proposed query units against every other
// non-finished run's derived_query_units (a real set-intersection over persisted runs, not a
// guess). "Identical" means the same query-unit set with an active/queued/running status —
// that case blocks Confirm unless the owner override is acknowledged; any other overlap is a
// warning only.

import { NextResponse } from "next/server";
import { getRepo, resolveDefaultTenantId } from "@/lib/discovery-engine/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKING_STATUSES = new Set(["draft", "queued", "running"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const queryUnits: string[] = Array.isArray(body.queryUnits) ? body.queryUnits.map((u: unknown) => String(u).toUpperCase()) : [];
    const excludeRunId: string | null = body.excludeRunId ?? null;
    if (!queryUnits.length) return NextResponse.json({ ok: true, overlaps: [], identicalActiveConflict: false });

    const tenant_id = await resolveDefaultTenantId();
    const runs = await getRepo().listRuns(tenant_id);
    const proposed = new Set(queryUnits);

    const overlaps: { runId: string; name: string; status: string; overlappingUnits: string[] }[] = [];
    let identicalActiveConflict = false;

    for (const r of runs) {
      if (r.id === excludeRunId) continue;
      const theirs = new Set((r.derived_query_units ?? []).map((u) => u.toUpperCase()));
      const overlapping = [...proposed].filter((u) => theirs.has(u));
      if (!overlapping.length) continue;
      overlaps.push({ runId: r.id, name: r.name, status: r.status, overlappingUnits: overlapping });
      const identical = overlapping.length === proposed.size && overlapping.length === theirs.size;
      if (identical && BLOCKING_STATUSES.has(r.status)) identicalActiveConflict = true;
    }

    return NextResponse.json({ ok: true, overlaps, identicalActiveConflict });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
