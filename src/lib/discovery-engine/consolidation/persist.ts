// Persist consolidated candidates + full provenance to the database (Workstream A5).
// Server-side (service client). Retains every source link, per-source field provenance,
// evidence, conflicts and completeness. No customer comparison.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsolidatedCandidate } from "./types";
import { candidateCompleteness, type ComparisonReport } from "../reports/comparison";

const PROV_FIELDS = ["name", "rating", "review_count", "cuisines", "phone", "postcode"] as const;

export async function persistConsolidation(
  db: SupabaseClient, tenantId: string, runId: string | null, candidates: ConsolidatedCandidate[], report?: ComparisonReport
): Promise<{ candidateIds: string[] }> {
  const candidateIds: string[] = [];
  for (const c of candidates) {
    const ins = await db.from("consolidated_candidates").insert({
      tenant_id: tenantId, run_id: runId, name: c.name, brand: c.brand, postcode: c.postcode, phone: c.phone,
      latitude: c.latitude, longitude: c.longitude, match_status: c.matchStatus, confidence: c.confidence,
      first_seen: c.firstSeen, last_seen: c.lastSeen,
    }).select("id").single();
    if (ins.error) throw new Error(`persist candidate: ${JSON.stringify(ins.error)}`);
    const cid = (ins.data as { id: string }).id;
    candidateIds.push(cid);

    await insertMany(db, "candidate_source_links", c.sources.map((o) => ({
      candidate_id: cid, tenant_id: tenantId, source: o.source, source_outlet_id: o.source_outlet_id,
      source_url: o.source_url, rating: o.rating, review_count: o.review_count, cuisines: o.cuisines,
      is_delivery: o.is_delivery, is_collection: o.is_collection, observed_at: o.observed_at,
    })));

    const prov = c.sources.flatMap((o) => PROV_FIELDS.map((fk) => ({
      candidate_id: cid, tenant_id: tenantId, field_key: fk, source: o.source, source_outlet_id: o.source_outlet_id,
      value: (o as unknown as Record<string, unknown>)[fk] ?? null,
    })));
    await insertMany(db, "candidate_field_provenance", prov);

    const values = PROV_FIELDS.map((fk) => {
      for (const o of c.sources) {
        const v = (o as unknown as Record<string, unknown>)[fk];
        if (v != null && !(Array.isArray(v) && v.length === 0)) return { candidate_id: cid, tenant_id: tenantId, field_key: fk, value: v, chosen_source: o.source };
      }
      return null;
    }).filter(Boolean) as Record<string, unknown>[];
    await insertMany(db, "candidate_field_values", values);

    await insertMany(db, "candidate_match_evidence", c.evidence.map((e) => ({ candidate_id: cid, tenant_id: tenantId, evidence: e })));
    await insertMany(db, "candidate_conflicts", c.conflicts.map((cf) => ({ candidate_id: cid, tenant_id: tenantId, conflict: cf })));

    const comp = await db.from("candidate_completeness").insert({
      candidate_id: cid, tenant_id: tenantId, status: candidateCompleteness(c),
      missing_fields: c.sources.some((o) => o.phone) ? [] : ["phone"],
    });
    if (comp.error) throw new Error(`persist completeness: ${JSON.stringify(comp.error)}`);
  }
  if (report) {
    const snap = await db.from("source_comparison_snapshots").insert({ tenant_id: tenantId, run_id: runId, report });
    if (snap.error) throw new Error(`persist snapshot: ${JSON.stringify(snap.error)}`);
  }
  return { candidateIds };
}

async function insertMany(db: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const r = await db.from(table).insert(rows);
  if (r.error) throw new Error(`persist ${table}: ${JSON.stringify(r.error)}`);
}
