// POST /api/discovery/runs — persist a discovery run canonically (Supabase).
// Geography selections are planned via the Geography Standard (areas → districts) with
// full provenance. The browser posts the mapped Run Builder draft; localStorage is
// recovery only.

import { NextResponse } from "next/server";
import { getRepo, resolveDefaultTenantId } from "@/lib/discovery-engine/server";
import { saveRun, persistGeographyProvenance } from "@/lib/discovery-engine/run-service";
import { loadPostcodeReference } from "@/lib/discovery-engine/geography/reference";
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
    const { run, plan } = await saveRun(getRepo(), {
      tenant_id,
      name,
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
    }, ref);

    await persistGeographyProvenance(createServiceClient(), run, plan);

    // Surface unresolved selections honestly (places/admin/invalid — never guessed).
    const unresolved = plan.unresolved.map((u) => ({ value: u.original.value, status: u.status, reason: u.reason }));
    return NextResponse.json({ ok: true, run, queryUnits: plan.queryUnits, expansionCount: plan.queryUnits.length, unresolved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
