// Real, DB-backed Just Eat outlet results for the developer-facing results screen.
// Server-only (service-role client) — never import into a client component.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";

export interface OutletResultRow {
  id: string;
  source: string;
  je_outlet_id: string;
  source_url: string | null;
  name: string;
  brand: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  cuisines: string[];
  rating: number | null;
  review_count: number | null;
  is_open_now: boolean | null;
  is_delivery: boolean | null;
  is_collection: boolean | null;
  delivery_cost: number | null;
  minimum_order: number | null;
  observation_count: number;
  last_seen_at: string;
  validation: "validated" | "missing_core_fields";
}

export interface OutletResultsPage {
  configured: boolean;
  outcode: string;
  total: number;
  rows: OutletResultRow[];
}

/** Fetch real, persisted je_outlets rows for an outward code (exact match, e.g. "UB1").
 *  No mock/placeholder data is ever returned — an unconfigured or empty DB returns an
 *  honest empty result, never fabricated rows. */
export async function fetchOutletResults(outcode: string, limit = 200): Promise<OutletResultsPage> {
  const oc = outcode.toUpperCase().replace(/\s+/g, "");
  if (!hasServiceCredentials()) return { configured: false, outcode: oc, total: 0, rows: [] };

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();
  const res = await db
    .from("je_outlets")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("outcode", oc)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (res.error) throw new Error(`fetchOutletResults: ${JSON.stringify(res.error)}`);

  const jeRows: OutletResultRow[] = (res.data ?? []).map((r: Record<string, unknown>) => {
    const hasCore = !!r.trading_name && !!r.postcode && r.latitude != null && r.longitude != null;
    return {
      id: String(r.id),
      source: "just_eat",
      je_outlet_id: String(r.je_outlet_id),
      source_url: (r.source_url as string) ?? null,
      name: (r.trading_name as string) ?? "",
      brand: (r.brand_name as string) ?? null,
      phone: (r.telephone_e164 as string) ?? null,
      address: [r.address_first_line, r.city].filter(Boolean).join(", ") || null,
      postcode: (r.postcode as string) ?? null,
      latitude: (r.latitude as number) ?? null,
      longitude: (r.longitude as number) ?? null,
      cuisines: Array.isArray(r.cuisines) ? (r.cuisines as string[]) : [],
      rating: (r.rating_average as number) ?? null,
      review_count: (r.rating_count as number) ?? null,
      is_open_now: (r.is_open_now as boolean) ?? null,
      is_delivery: (r.is_delivery as boolean) ?? null,
      is_collection: (r.is_collection as boolean) ?? null,
      delivery_cost: (r.delivery_cost as number) ?? null,
      minimum_order: (r.minimum_delivery_value as number) ?? null,
      observation_count: Number(r.observation_count ?? 0),
      last_seen_at: String(r.last_seen_at ?? ""),
      validation: hasCore ? "validated" : "missing_core_fields",
    };
  });

  // Imported/discovered Uber Eats + Deliveroo canonical records live in consolidated_candidates
  // (migration 0015, reused per docs/09_DECISIONS.md — no duplicate schema). Merge them into the
  // same results view, filtered to the same outcode via their postcode.
  // `!inner` restricts to candidates with at least one non-Just-Eat source link at the DB
  // level (an imported Uber Eats/Deliveroo record) — avoids pulling hundreds of pure-JE
  // consolidation rows just to discard them client-side, which previously pushed a fresh
  // import past the result limit before it was ever reached (no ORDER BY + limit(200) against
  // a tenant with 1000+ historical rows). Newest first so a just-completed import is visible.
  const candRes = await db
    .from("consolidated_candidates")
    .select("id,name,brand,postcode,phone,latitude,longitude,last_seen,candidate_source_links!inner(source,source_outlet_id,source_url,rating,review_count,cuisines,is_delivery,is_collection,observed_at)")
    .eq("tenant_id", tenantId)
    .ilike("postcode", `${oc}%`)
    .neq("candidate_source_links.source", "just_eat")
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (candRes.error) throw new Error(`fetchOutletResults.candidates: ${JSON.stringify(candRes.error)}`);

  type CandRow = { id: string; name: string; brand: string | null; postcode: string | null; phone: string | null; latitude: number | null; longitude: number | null; last_seen: string | null; candidate_source_links: { source: string; source_outlet_id: string; source_url: string | null; rating: number | null; review_count: number | null; cuisines: unknown; is_delivery: boolean | null; is_collection: boolean | null; observed_at: string | null }[] };
  const candidateRows: OutletResultRow[] = ((candRes.data ?? []) as unknown as CandRow[])
    .filter((c) => c.candidate_source_links?.some((l) => l.source !== "just_eat")) // only imported/non-JE candidates belong in this merge — JE ones are already covered by je_outlets above
    .map((c) => {
      const link = c.candidate_source_links.find((l) => l.source !== "just_eat") ?? c.candidate_source_links[0];
      const hasCore = !!c.name && !!c.postcode && c.latitude != null && c.longitude != null;
      return {
        id: c.id,
        source: link?.source ?? "unknown",
        je_outlet_id: link?.source_outlet_id ?? "",
        source_url: link?.source_url ?? null,
        name: c.name,
        brand: c.brand,
        phone: c.phone,
        address: null,
        postcode: c.postcode,
        latitude: c.latitude,
        longitude: c.longitude,
        cuisines: Array.isArray(link?.cuisines) ? (link.cuisines as string[]) : [],
        rating: link?.rating ?? null,
        review_count: link?.review_count ?? null,
        is_open_now: null,
        is_delivery: link?.is_delivery ?? null,
        is_collection: link?.is_collection ?? null,
        delivery_cost: null,
        minimum_order: null,
        observation_count: 1,
        last_seen_at: c.last_seen ?? link?.observed_at ?? "",
        validation: hasCore ? "validated" : "missing_core_fields",
      };
    });

  const rows = [...jeRows, ...candidateRows];
  return { configured: true, outcode: oc, total: (res.count ?? jeRows.length) + candidateRows.length, rows };
}

export interface FieldProvenanceRow {
  field_key: string;
  value: unknown;
  original_value: unknown;
  source_field_path: string | null;
  confidence: number | null;
  is_derived: boolean;
}

export interface RatingHistoryRow {
  score: number | null;
  review_count: number | null;
  observed_at: string;
}

export interface OutletDetail {
  configured: boolean;
  found: boolean;
  outlet: Record<string, unknown> | null;
  provenance: FieldProvenanceRow[];
  ratingHistory: RatingHistoryRow[];
  isImportedCandidate?: boolean;
}

/** Real detail view for one canonical outlet: the full row + field provenance + rating
 *  history (historical, never overwritten — see je_rating_history append-only table). Falls
 *  back to consolidated_candidates (imported Uber Eats/Deliveroo records) when the id is not
 *  a je_outlets row. */
export async function fetchOutletDetail(outletId: string): Promise<OutletDetail> {
  if (!hasServiceCredentials()) return { configured: false, found: false, outlet: null, provenance: [], ratingHistory: [] };
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const outletRes = await db.from("je_outlets").select("*").eq("tenant_id", tenantId).eq("id", outletId).maybeSingle();
  if (outletRes.error) throw new Error(`fetchOutletDetail.outlet: ${JSON.stringify(outletRes.error)}`);

  if (outletRes.data) {
    const [provRes, histRes] = await Promise.all([
      db.from("je_field_provenance").select("field_key,value,original_value,source_field_path,confidence,is_derived").eq("tenant_id", tenantId).eq("outlet_id", outletId),
      db.from("je_rating_history").select("score,review_count,observed_at").eq("tenant_id", tenantId).eq("outlet_id", outletId).order("observed_at", { ascending: false }),
    ]);
    if (provRes.error) throw new Error(`fetchOutletDetail.provenance: ${JSON.stringify(provRes.error)}`);
    if (histRes.error) throw new Error(`fetchOutletDetail.history: ${JSON.stringify(histRes.error)}`);
    return {
      configured: true, found: true, outlet: outletRes.data as Record<string, unknown>,
      provenance: (provRes.data ?? []) as FieldProvenanceRow[], ratingHistory: (histRes.data ?? []) as RatingHistoryRow[],
      isImportedCandidate: false,
    };
  }

  // Fall back: an imported Uber Eats / Deliveroo canonical record.
  const candRes = await db.from("consolidated_candidates").select("*, candidate_source_links(*), candidate_field_values(*)").eq("tenant_id", tenantId).eq("id", outletId).maybeSingle();
  if (candRes.error) throw new Error(`fetchOutletDetail.candidate: ${JSON.stringify(candRes.error)}`);
  if (!candRes.data) return { configured: true, found: false, outlet: null, provenance: [], ratingHistory: [] };

  const cand = candRes.data as Record<string, unknown>;
  const link = (cand.candidate_source_links as Record<string, unknown>[])?.[0];
  const fieldValues = (cand.candidate_field_values as { field_key: string; value: unknown }[]) ?? [];
  const fv = (key: string) => fieldValues.find((f) => f.field_key === key)?.value ?? null;

  const provRes = await db.from("candidate_field_provenance").select("field_key,source,value,created_at").eq("tenant_id", tenantId).eq("candidate_id", outletId);
  if (provRes.error) throw new Error(`fetchOutletDetail.candidateProvenance: ${JSON.stringify(provRes.error)}`);

  return {
    configured: true,
    found: true,
    isImportedCandidate: true,
    outlet: {
      id: cand.id, je_outlet_id: link?.source_outlet_id ?? "", trading_name: cand.name, brand_name: cand.brand,
      address_first_line: fv("address"), city: null, postcode: cand.postcode,
      latitude: cand.latitude, longitude: cand.longitude, telephone_e164: cand.phone,
      rating_average: link?.rating ?? null, rating_count: link?.review_count ?? null,
      cuisines: link?.cuisines ?? [], is_delivery: link?.is_delivery ?? null, is_collection: link?.is_collection ?? null,
      is_open_now: null, opening_times: [], delivery_cost: fv("delivery_cost"), minimum_delivery_value: fv("minimum_order"),
      delivery_eta_lower: fv("eta_minutes"), delivery_eta_upper: null, offers: [], source_url: link?.source_url ?? null,
      normalisation_version: "consolidated_candidates (import)", observation_count: 1,
      first_seen_at: cand.first_seen, last_seen_at: cand.last_seen, latest_observation_id: null,
    },
    provenance: (provRes.data ?? []).map((p: Record<string, unknown>) => ({
      field_key: String(p.field_key), value: p.value, original_value: p.value,
      source_field_path: String(p.source), confidence: null, is_derived: false,
    })),
    ratingHistory: [],
  };
}
