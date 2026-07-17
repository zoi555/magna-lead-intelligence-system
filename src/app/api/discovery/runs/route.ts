// POST /api/discovery/runs — persist a discovery run canonically (Supabase).
// Geography selections are planned via the Geography Standard (areas → districts) with
// full provenance. The browser posts the mapped Run Builder draft; localStorage is
// recovery only.

import { NextResponse } from "next/server";
import { getRepo, resolveDefaultTenantId } from "@/lib/discovery-engine/server";
import { saveRunFromPlan, persistGeographyProvenance, type CreateRunParams } from "@/lib/discovery-engine/run-service";
import { loadPostcodeReference } from "@/lib/discovery-engine/geography/reference";
import { JUST_EAT_GEOGRAPHY_SUPPORT } from "@/lib/discovery-engine/geography/planner";
import { planTerritoryWithPlaces } from "@/lib/discovery-engine/geography/plan-with-places";
import { createServiceClient } from "@/lib/discovery-engine/supabase-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const territory_input = String(body.territory_input ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Run name is required" }, { status: 400 });
    if (!territory_input) return NextResponse.json({ ok: false, error: "Territory (postcode districts / places) is required" }, { status: 400 });

    const tenant_id = await resolveDefaultTenantId();
    const ref = await loadPostcodeReference();
    const db = createServiceClient();
    const params: CreateRunParams = {
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
    const plan = await planTerritoryWithPlaces(db, territory_input, ref, JUST_EAT_GEOGRAPHY_SUPPORT, params.exclusions ?? []);
    const { run } = await saveRunFromPlan(getRepo(), params, plan);
    await persistGeographyProvenance(db, run, plan);

    const resolvedTokens = new Set([...plan.placeResolutions.map((p) => p.token), ...plan.ambiguousPlaces.map((p) => p.token)]);
    const unresolved = plan.unresolved.filter((u) => !resolvedTokens.has(u.original.value)).map((u) => ({ value: u.original.value, status: u.status, reason: u.reason }));
    return NextResponse.json({
      ok: true, run, queryUnits: plan.queryUnits, expansionCount: plan.queryUnits.length,
      placeResolutions: plan.placeResolutions.map((p) => ({ token: p.token, name: p.candidate.name, districts: p.candidate.districts })),
      ambiguousPlaces: plan.ambiguousPlaces.map((a) => ({ token: a.token, choices: a.candidates.length })),
      unresolved,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
