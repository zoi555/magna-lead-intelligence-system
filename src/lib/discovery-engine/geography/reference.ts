// Load the canonical PostcodeReference (package type) from the seeded postcode_reference
// table. Cached per process. Server-side only (service client). The package owns the
// generic index + expansion; AspectLead just supplies the data from its own DB.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPostcodeReference, type PostcodeReference, type PostcodeReferenceEntry } from "@geospatial/map";
import { createServiceClient } from "../supabase-client";

let cached: PostcodeReference | null = null;

/** Build a PostcodeReference from an explicit set of entries (used by tests, no DB). */
export function referenceFromEntries(entries: PostcodeReferenceEntry[], source = "postcode_reference", sourceVersion = "gb-2026-07-14"): PostcodeReference {
  return buildPostcodeReference(entries, { source, sourceVersion });
}

/** Load all postcode_reference rows (paginated past the 1000-row API cap) and index them. */
export async function loadPostcodeReference(client?: SupabaseClient): Promise<PostcodeReference> {
  if (cached) return cached;
  const db = client ?? createServiceClient();
  const entries: PostcodeReferenceEntry[] = [];
  let sourceVersion = "gb-2026-07-14";
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await db.from("postcode_reference")
      .select("code, level, centroid_lng, centroid_lat, unit_count, source_version")
      .range(from, from + PAGE - 1);
    if (r.error) throw new Error(`loadPostcodeReference: ${JSON.stringify(r.error)}`);
    const rows = (r.data ?? []) as Array<{ code: string; level: string; centroid_lng: number | null; centroid_lat: number | null; unit_count: number | null; source_version: string }>;
    for (const row of rows) {
      if (row.level !== "area" && row.level !== "district" && row.level !== "sector") continue;
      entries.push({
        level: row.level, code: row.code,
        centroid: row.centroid_lng != null && row.centroid_lat != null ? [row.centroid_lng, row.centroid_lat] : undefined,
        unitCount: row.unit_count ?? undefined,
      });
      if (row.source_version) sourceVersion = row.source_version;
    }
    if (rows.length < PAGE) break;
  }
  cached = buildPostcodeReference(entries, { source: "postcode_reference", sourceVersion });
  return cached;
}

/** Test/maintenance: drop the process cache. */
export function _clearReferenceCache() { cached = null; }
