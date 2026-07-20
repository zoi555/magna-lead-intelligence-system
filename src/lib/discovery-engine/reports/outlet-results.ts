// Real, DB-backed Just Eat outlet results for the developer-facing results screen.
// Server-only (service-role client) — never import into a client component.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";

export interface OutletResultRow {
  id: string;
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

  const rows: OutletResultRow[] = (res.data ?? []).map((r: Record<string, unknown>) => {
    const hasCore = !!r.trading_name && !!r.postcode && r.latitude != null && r.longitude != null;
    return {
      id: String(r.id),
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

  return { configured: true, outcode: oc, total: res.count ?? rows.length, rows };
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
}

/** Real detail view for one canonical outlet: the full row + field provenance + rating
 *  history (historical, never overwritten — see je_rating_history append-only table). */
export async function fetchOutletDetail(outletId: string): Promise<OutletDetail> {
  if (!hasServiceCredentials()) return { configured: false, found: false, outlet: null, provenance: [], ratingHistory: [] };
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const outletRes = await db.from("je_outlets").select("*").eq("tenant_id", tenantId).eq("id", outletId).maybeSingle();
  if (outletRes.error) throw new Error(`fetchOutletDetail.outlet: ${JSON.stringify(outletRes.error)}`);
  if (!outletRes.data) return { configured: true, found: false, outlet: null, provenance: [], ratingHistory: [] };

  const [provRes, histRes] = await Promise.all([
    db.from("je_field_provenance").select("field_key,value,original_value,source_field_path,confidence,is_derived").eq("tenant_id", tenantId).eq("outlet_id", outletId),
    db.from("je_rating_history").select("score,review_count,observed_at").eq("tenant_id", tenantId).eq("outlet_id", outletId).order("observed_at", { ascending: false }),
  ]);
  if (provRes.error) throw new Error(`fetchOutletDetail.provenance: ${JSON.stringify(provRes.error)}`);
  if (histRes.error) throw new Error(`fetchOutletDetail.history: ${JSON.stringify(histRes.error)}`);

  return {
    configured: true,
    found: true,
    outlet: outletRes.data as Record<string, unknown>,
    provenance: (provRes.data ?? []) as FieldProvenanceRow[],
    ratingHistory: (histRes.data ?? []) as RatingHistoryRow[],
  };
}
