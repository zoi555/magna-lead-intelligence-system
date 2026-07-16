// POST /api/discovery/runs — persist a discovery run canonically (Supabase).
// The browser posts the mapped Run Builder draft; localStorage remains recovery only.

import { NextResponse } from "next/server";
import { getRepo, resolveDefaultTenantId } from "@/lib/discovery-engine/server";
import { saveRun } from "@/lib/discovery-engine/run-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const territory_input = String(body.territory_input ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Run name is required" }, { status: 400 });
    if (!territory_input) return NextResponse.json({ ok: false, error: "Territory (postcodes/outcodes) is required" }, { status: 400 });

    const tenant_id = await resolveDefaultTenantId();
    const { run, unexpandableAreas } = await saveRun(getRepo(), {
      tenant_id,
      name,
      reference: body.reference ?? null,
      objective: body.objective ?? null,
      territory_mode: body.territory_mode ?? null,
      territory_input,
      search_terms: Array.isArray(body.search_terms) ? body.search_terms : [],
      target_filters: body.target_filters ?? {},
      requested_fields: Array.isArray(body.requested_fields) ? body.requested_fields : [],
      source_config: body.source_config ?? {},
      config_snapshot: body.config_snapshot ?? {},
    });
    return NextResponse.json({ ok: true, run, unexpandableAreas });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
