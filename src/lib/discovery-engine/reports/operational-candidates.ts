// The single, explicitly-gated read of consolidated_candidates for OPERATIONAL use (leads,
// enrichment, exports, scoring). Every consumer that needs "candidates safe to act on" — not
// "every candidate ever persisted for this run" — should call this, not query
// consolidated_candidates directly, so the geography gate can never be forgotten by a new
// screen or script (see docs/10_BUGS_AND_FIXES.md — the geography-consolidation defect this
// closes). Evidence/exception views (data-quality-exceptions.ts) intentionally do NOT use
// this — they need the rejected rows too.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";

export interface OperationalCandidate {
  id: string;
  name: string;
  brand: string | null;
  postcode: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  matchStatus: string;
  confidence: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  sources: { source: string; sourceOutletId: string; rating: number | null; reviewCount: number | null; cuisines: string[] }[];
}

/** Every consolidated_candidates row for a run that is currently geography_status='valid_geography'.
 *  Never fabricates rows — an unconfigured DB or a run with no valid candidates returns empty. */
export async function fetchOperationalCandidatesForRun(tenantId: string, runId: string): Promise<OperationalCandidate[]> {
  if (!hasServiceCredentials()) return [];
  const db = createServiceClient();
  const res = await db
    .from("consolidated_candidates")
    .select("id,name,brand,postcode,phone,latitude,longitude,match_status,confidence,first_seen,last_seen,candidate_source_links(source,source_outlet_id,rating,review_count,cuisines)")
    .eq("tenant_id", tenantId)
    .eq("run_id", runId)
    .eq("geography_status", "valid_geography")
    .order("last_seen", { ascending: false });
  if (res.error) throw new Error(`fetchOperationalCandidatesForRun: ${JSON.stringify(res.error)}`);

  type Row = { id: string; name: string; brand: string | null; postcode: string | null; phone: string | null; latitude: number | null; longitude: number | null; match_status: string; confidence: number | null; first_seen: string | null; last_seen: string | null; candidate_source_links: { source: string; source_outlet_id: string; rating: number | null; review_count: number | null; cuisines: unknown }[] };
  return ((res.data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, name: r.name, brand: r.brand, postcode: r.postcode, phone: r.phone,
    latitude: r.latitude, longitude: r.longitude, matchStatus: r.match_status, confidence: r.confidence,
    firstSeen: r.first_seen, lastSeen: r.last_seen,
    sources: (r.candidate_source_links ?? []).map((l) => ({
      source: l.source, sourceOutletId: l.source_outlet_id, rating: l.rating, reviewCount: l.review_count,
      cuisines: Array.isArray(l.cuisines) ? (l.cuisines as string[]) : [],
    })),
  }));
}
