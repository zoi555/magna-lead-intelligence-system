// POST /api/geography/resolve — preview how a geography input resolves, WITHOUT saving.
// Powers the Run Builder geography search/selection: result type, expansion count, child
// districts/sectors to inspect, honest unresolved (place/admin) reporting, and exclusions.

import { NextResponse } from "next/server";
import { expandArea, expandDistrict } from "@zoi555/geospatial-map";
import { loadPostcodeReference } from "@/lib/discovery-engine/geography/reference";
import { JUST_EAT_GEOGRAPHY_SUPPORT } from "@/lib/discovery-engine/geography/planner";
import { planTerritoryWithPlaces } from "@/lib/discovery-engine/geography/plan-with-places";
import { createServiceClient } from "@/lib/discovery-engine/supabase-client";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const body = await req.json().catch(() => ({}));
    const input = String(body.input ?? "").trim();
    const exclusions: string[] = Array.isArray(body.exclusions) ? body.exclusions : [];
    if (!input) return NextResponse.json({ ok: false, error: "Enter a postcode area / district / sector, a place, or a mixed list" }, { status: 400 });

    const ref = await loadPostcodeReference();
    const plan = await planTerritoryWithPlaces(createServiceClient(), input, ref, JUST_EAT_GEOGRAPHY_SUPPORT, exclusions);

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

    // place tokens that resolved (uniquely or ambiguously) are no longer "unresolved"
    const resolvedTokens = new Set([...plan.placeResolutions.map((p) => p.token), ...plan.ambiguousPlaces.map((p) => p.token)]);
    const unresolved = plan.unresolved
      .filter((u) => !resolvedTokens.has(u.original.value))
      .map((u) => ({ value: u.original.value, status: u.status, reason: u.reason }));

    return NextResponse.json({
      ok: true,
      selections,
      queryUnits: plan.queryUnits,
      expansionCount: plan.queryUnits.length,
      excluded: plan.excluded,
      placeResolutions: plan.placeResolutions.map((p) => ({ token: p.token, name: p.candidate.name, kind: p.candidate.kind, localAuthority: p.candidate.localAuthority, region: p.candidate.region, districts: p.candidate.districts })),
      ambiguousPlaces: plan.ambiguousPlaces.map((a) => ({ token: a.token, choices: a.candidates.map((c) => ({ placeId: c.placeId, name: c.name, kind: c.kind, localAuthority: c.localAuthority, region: c.region, districts: c.districts })) })),
      unresolved,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
