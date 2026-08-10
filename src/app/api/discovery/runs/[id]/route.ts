// PATCH /api/discovery/runs/[id] — update an existing draft run in place (Create New Run's
// "reopen a saved draft, edit it, save again" path). Only meaningful while the run is still
// 'draft' — queued/running/completed runs are rejected, matching the review/confirm gate:
// once queued, a run's config is frozen.

import { NextResponse } from "next/server";
import { getRepo } from "@/lib/discovery-engine/server";
import { buildRunInput, persistQueryUnits, type CreateRunParams } from "@/lib/discovery-engine/run-service";
import { loadPostcodeReference } from "@/lib/discovery-engine/geography/reference";
import { JUST_EAT_GEOGRAPHY_SUPPORT } from "@/lib/discovery-engine/geography/planner";
import { planTerritoryWithPlaces } from "@/lib/discovery-engine/geography/plan-with-places";
import { createServiceClient } from "@/lib/discovery-engine/supabase-client";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const repo = getRepo();
    const existing = await repo.getRun(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    if (existing.tenant_id !== session.tenantId) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    if (existing.status !== "draft") {
      return NextResponse.json({ ok: false, error: `Run is '${existing.status}', not 'draft' — its configuration is frozen once queued.` }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const territory_input = String(body.territory_input ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Run name is required" }, { status: 400 });
    if (!territory_input) return NextResponse.json({ ok: false, error: "Territory (postcode districts / places) is required" }, { status: 400 });

    const tenant_id = session.tenantId;
    const ref = await loadPostcodeReference();
    const db = createServiceClient();
    const params2: CreateRunParams = {
      tenant_id, name,
      reference: body.reference ?? null,
      objective: body.objective ?? null,
      territory_mode: body.territory_mode ?? null,
      territory_input,
      exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
      search_terms: Array.isArray(body.search_terms) ? body.search_terms : [],
      target_filters: body.target_filters ?? {},
      requested_fields: Array.isArray(body.requested_fields) ? body.requested_fields : [],
      source_config: body.source_config ?? {},
      config_snapshot: body.config_snapshot ?? {},
    };
    const plan = await planTerritoryWithPlaces(db, territory_input, ref, JUST_EAT_GEOGRAPHY_SUPPORT, params2.exclusions ?? []);
    const patch = buildRunInput(params2, plan);
    const run = await repo.updateRunDraft(id, patch);
    // Keep the canonical query_unit table (read by confirm_and_queue_run and the overlap
    // disclosure endpoint) in sync with an edited-then-resaved draft's territory — see
    // persistQueryUnits' own doc comment (P4 independent review, 2026-08-10).
    await persistQueryUnits(db, run, plan);
    return NextResponse.json({ ok: true, run, queryUnits: plan.queryUnits, expansionCount: plan.queryUnits.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
