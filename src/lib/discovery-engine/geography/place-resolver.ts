// Resolve a place NAME → its associated postcode districts, from the ingested OS Open Names
// data (Workstream A1). Returns ALL matching places so ambiguous names (e.g. "Newport") are
// surfaced as choices, never auto-guessed. Server-side (service client).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlaceCandidate {
  placeId: string;
  name: string;
  kind: string;
  localAuthority: string | null;
  region: string | null;
  districts: string[];           // associated postcode districts (source_defined)
}

/** Find place candidates by name (case-insensitive exact, then prefix) + their districts. */
export async function resolvePlaceName(db: SupabaseClient, name: string, limit = 10): Promise<PlaceCandidate[]> {
  const q = name.trim();
  if (!q) return [];
  let pr = await db.from("place").select("id,name,kind,local_authority,region").ilike("name", q).limit(limit);
  if (!pr.error && (!pr.data || pr.data.length === 0)) {
    pr = await db.from("place").select("id,name,kind,local_authority,region").ilike("name", `${q}%`).limit(limit);
  }
  if (pr.error || !pr.data || pr.data.length === 0) return [];
  const rows = pr.data as Array<{ id: string; name: string; kind: string; local_authority: string | null; region: string | null }>;
  const ids = rows.map((r) => r.id);
  const lr = await db.from("place_postcode_link").select("place_id,postcode_code").in("place_id", ids);
  const byPlace = new Map<string, string[]>();
  for (const l of (lr.data ?? []) as Array<{ place_id: string; postcode_code: string }>) {
    const a = byPlace.get(l.place_id) ?? []; a.push(l.postcode_code); byPlace.set(l.place_id, a);
  }
  return rows.map((r) => ({ placeId: r.id, name: r.name, kind: r.kind, localAuthority: r.local_authority, region: r.region, districts: byPlace.get(r.id) ?? [] }));
}
