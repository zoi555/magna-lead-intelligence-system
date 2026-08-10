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
//
// P4 independent review, 2026-08-10: existing runs are now compared using the canonical
// query_unit table — the SAME source confirm_and_queue_run (migration 0031) reads to
// compute overlap authoritatively — instead of discovery_runs.derived_query_units, which
// could disagree once a draft was edited after its first save (query_unit is now kept in
// sync on every save, not just the first — see persistQueryUnits in run-service.ts). This
// is not a second overlap algorithm: it is the same "shares >=1 query_unit" comparison,
// just reading the same table the RPC does. The proposed (unsaved) run's side of the
// comparison still comes from the client's freshly-resolved queryUnits — there is nothing
// canonical to read for a run that hasn't been saved yet.

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
    const db = createServiceClient();

    const candidateRuns = runs.filter((r) => r.id !== excludeRunId);
    const unitsByRun = new Map<string, Set<string>>();
    if (candidateRuns.length) {
      // Canonical source (query_unit) — see the header comment above for why this replaced
      // discovery_runs.derived_query_units. Just Eat is the only source this vertical slice
      // can queue, matching confirm_and_queue_run's own default source.
      const qu = await db.from("query_unit").select("run_id, code").eq("source", "just_eat").in("run_id", candidateRuns.map((r) => r.id));
      if (qu.error) throw new Error(`conflicts: query_unit lookup: ${JSON.stringify(qu.error)}`);
      for (const row of (qu.data ?? []) as { run_id: string; code: string }[]) {
        const set = unitsByRun.get(row.run_id) ?? new Set<string>();
        set.add(row.code.toUpperCase());
        unitsByRun.set(row.run_id, set);
      }
    }

    const rawOverlaps: { run: (typeof runs)[number]; overlappingUnits: string[]; overlapType: "exact" | "partial" }[] = [];
    for (const r of candidateRuns) {
      const theirs = unitsByRun.get(r.id) ?? new Set<string>();
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
