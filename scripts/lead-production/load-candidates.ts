// Loads Supabase operational candidates for a run — the ONLY entry point into
// consolidated_candidates this whole bridge uses. Delegates to the application's own
// fetchOperationalCandidatesForRun() (geography_status='valid_geography' gate), so a
// non-valid-geography candidate structurally cannot enter this pipeline: this file contains
// no other query against consolidated_candidates.

import { fetchOperationalCandidatesForRun } from "../../src/lib/discovery-engine/reports/operational-candidates";
import type { OperationalCandidate } from "./types";

export async function loadOperationalCandidates(tenantId: string, runId: string): Promise<OperationalCandidate[]> {
  const rows = await fetchOperationalCandidatesForRun(tenantId, runId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    postcode: r.postcode,
    phone: r.phone,
    latitude: r.latitude,
    longitude: r.longitude,
    companyNumber: null, // no Companies House linkage before enrichment (not run today)
    website: null,       // no website field captured yet
    sources: r.sources.map((s) => ({ source: s.source, sourceOutletId: s.sourceOutletId })),
  }));
}
