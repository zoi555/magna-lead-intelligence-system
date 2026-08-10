// POST /api/discovery/runs/overlaps (route path kept as /conflicts for compatibility) —
// real territory-overlap DISCLOSURE for the Create New Run review step.
//
// P4 control correction, 2026-08-10: territory overlap between runs is PERMITTED —
// AspectLead must allow the same geography to be searched multiple times. This endpoint
// detects and discloses overlap (who else searched this territory, when, what status,
// exact vs partial) so the user can make an informed acknowledgement; it never reports a
// "blocking conflict". Historical (completed/completed_with_warnings/failed/cancelled)
// overlaps are included as informational context — how many times this geography has
// already been searched — not flagged as active. `materialOverlap` (any overlap with a
// currently ACTIVE run — queued/running/cancelling) is the one signal the UI uses to
// require an explicit acknowledgement before Confirm; it is not a rejection.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { requireSessionAndRole } from "@/lib/auth/require-session";
import { createServiceClient } from "@/lib/discovery-engine/supabase-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs in these statuses are "currently active" — overlapping one of these is what makes
 *  disclosure material enough to require acknowledgement. Matches the definition used by
 *  confirm_and_queue_run (migration 0031) so the client-side prompt and the server-side
 *  authoritative check agree on what counts as active. */
const ACTIVE_STATUSES = new Set(["queued", "running", "cancelling"]);

export async function POST(req: Request) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const body = await req.json().catch(() => ({}));
    const queryUnits: string[] = Array.isArray(body.queryUnits) ? body.queryUnits.map((u: unknown) => String(u).toUpperCase()) : [];
    const excludeRunId: string | null = body.excludeRunId ?? null;
    if (!queryUnits.length) return NextResponse.json({ ok: true, overlaps: [], materialOverlap: false });

    const tenant_id = session.tenantId;
    const runs = await getRepo().listRuns(tenant_id);
    const proposed = new Set(queryUnits);

    const rawOverlaps: { run: (typeof runs)[number]; overlappingUnits: string[]; overlapType: "exact" | "partial" }[] = [];
    for (const r of runs) {
      if (r.id === excludeRunId) continue;
      const theirs = new Set((r.derived_query_units ?? []).map((u) => u.toUpperCase()));
      const overlapping = [...proposed].filter((u) => theirs.has(u));
      if (!overlapping.length) continue;
      const exact = overlapping.length === proposed.size && overlapping.length === theirs.size;
      rawOverlaps.push({ run: r, overlappingUnits: overlapping, overlapType: exact ? "exact" : "partial" });
    }

    // Best-effort owner-email resolution — never fabricated; falls back to a truncated id.
    const ownerIds = [...new Set(rawOverlaps.map((o) => o.run.created_by).filter((x): x is string => !!x))];
    const emailById = new Map<string, string>();
    if (ownerIds.length) {
      try {
        const db = createServiceClient();
        const usersRes = await db.auth.admin.listUsers({ perPage: 200 });
        for (const u of usersRes.data?.users ?? []) if (u.email) emailById.set(u.id, u.email);
      } catch { /* best-effort only */ }
    }

    const overlaps = rawOverlaps.map(({ run: r, overlappingUnits, overlapType }) => {
      const sc = (r.source_config as Record<string, unknown>) ?? {};
      const sourceMode = typeof sc.mode === "string" ? sc.mode : (typeof sc.source === "string" ? sc.source : null);
      // Only Just Eat is a permitted, priced source in this vertical slice — its lawful
      // listing endpoint genuinely has no per-record cost. No other source can be queued
      // yet, so there is no real "additional paid cost" scenario to estimate honestly.
      const estimatedAdditionalCostGbp = sourceMode === "just_eat" || sc.source === "just_eat" ? 0 : null;
      return {
        runId: r.id,
        name: r.name,
        reference: r.reference ?? null,
        ownerLabel: r.created_by ? (emailById.get(r.created_by) ?? `${r.created_by.slice(0, 8)}…`) : "—",
        sourceMode,
        status: r.status,
        territoryInput: r.territory_input ?? null,
        overlappingUnits,
        overlapType,
        createdAt: r.created_at,
        estimatedAdditionalCostGbp,
      };
    });

    const materialOverlap = overlaps.some((o) => ACTIVE_STATUSES.has(o.status));

    return NextResponse.json({ ok: true, overlaps, materialOverlap });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
