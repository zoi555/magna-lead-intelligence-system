// POST /api/geography/resolve — preview how a geography input resolves, WITHOUT saving.
// Powers the Run Builder geography search/selection: result type, expansion count, child
// districts/sectors to inspect, honest unresolved (place/admin) reporting, and exclusions.

import { NextResponse } from "next/server";
import { expandArea, expandDistrict } from "@geospatial/map";
import { loadPostcodeReference } from "@/lib/discovery-engine/geography/reference";
import { planTerritory, JUST_EAT_GEOGRAPHY_SUPPORT } from "@/lib/discovery-engine/geography/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = String(body.input ?? "").trim();
    const exclusions: string[] = Array.isArray(body.exclusions) ? body.exclusions : [];
    if (!input) return NextResponse.json({ ok: false, error: "Enter a postcode area / district / sector, a place, or a mixed list" }, { status: 400 });

    const ref = await loadPostcodeReference();
    const plan = planTerritory(input, ref, JUST_EAT_GEOGRAPHY_SUPPORT, exclusions);

    // per-selection view with children to inspect (areas → districts, districts → sectors)
    const selections = plan.resolved.map((r) => {
      let children: string[] = [];
      if (r.resolvedKind === "postcode_area" && r.resolvedCode) children = expandArea(ref, r.resolvedCode);
      else if (r.resolvedKind === "postcode_district" && r.resolvedCode) children = expandDistrict(ref, r.resolvedCode);
      return {
        original: r.original.value,
        type: r.resolvedKind,
        status: r.status,
        method: r.method,
        expansionCount: r.expansionCount,
        queryUnits: r.queryUnits,
        children,
        reason: r.reason ?? null,
        source: r.source ?? null,
        sourceVersion: r.sourceVersion ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      selections,
      queryUnits: plan.queryUnits,
      expansionCount: plan.queryUnits.length,
      excluded: plan.excluded,
      unresolved: plan.unresolved.map((u) => ({ value: u.original.value, status: u.status, reason: u.reason })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
