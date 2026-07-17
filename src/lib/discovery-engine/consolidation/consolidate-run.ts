// Wire consolidation to a run (Part 8). Reads a run's CANONICAL Just Eat outlets (via
// canonical observations, excluding historical duplicates), consolidates them into
// candidates (never on name alone), and persists candidates + provenance + the comparison
// snapshot to the 0015 tables. Uber/Deliveroo pilot results plug in the same way later.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceOutlet, SourceName } from "./types";
import { consolidate } from "./consolidate";
import { persistConsolidation } from "./persist";
import { buildComparisonReport } from "../reports/comparison";

/** Map a je_outlets DB row to the source-neutral SourceOutlet. */
function jeOutletRowToSourceOutlet(r: Record<string, any>): SourceOutlet {
  return {
    source: "just_eat", source_outlet_id: String(r.je_outlet_id), source_url: r.source_url ?? null,
    name: r.trading_name ?? "", brand: r.brand_name ?? null, address: r.address_first_line ?? null,
    postcode: r.postcode ?? null, latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    phone: r.telephone_e164 ?? null, rating: r.rating_average ?? null, review_count: r.rating_count ?? null,
    cuisines: Array.isArray(r.cuisines) ? r.cuisines : [], is_delivery: r.is_delivery ?? null,
    is_collection: r.is_collection ?? null, delivery_cost: r.delivery_cost ?? null,
    minimum_order: r.minimum_delivery_value ?? null, eta_minutes: r.delivery_eta_lower ?? null,
    is_sponsored: r.is_sponsored ?? null, halal_flag: r.halal_flag ?? null, logo_url: r.logo_url ?? null,
    observed_at: r.last_seen_at ?? new Date().toISOString(),
  };
}

export async function consolidateRun(db: SupabaseClient, tenantId: string, runId: string): Promise<{ outlets: number; candidates: number }> {
  // canonical outlet ids observed in this run (duplicates excluded)
  const obs = await db.from("je_raw_observations").select("source_record_id").eq("run_id", runId).is("duplicate_of", null);
  if (obs.error) throw new Error(`consolidateRun.obs: ${JSON.stringify(obs.error)}`);
  const ids = [...new Set((obs.data ?? []).map((o) => (o as { source_record_id: string }).source_record_id).filter(Boolean))];
  if (!ids.length) return { outlets: 0, candidates: 0 };

  const outletRows: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const r = await db.from("je_outlets").select("*").eq("tenant_id", tenantId).in("je_outlet_id", ids.slice(i, i + 500));
    if (r.error) throw new Error(`consolidateRun.outlets: ${JSON.stringify(r.error)}`);
    outletRows.push(...(r.data ?? []));
  }
  const sourceOutlets = outletRows.map(jeOutletRowToSourceOutlet);
  const candidates = consolidate(sourceOutlets);
  const bySource = { just_eat: sourceOutlets, uber_eats: [] as SourceOutlet[], deliveroo: [] as SourceOutlet[] } as Record<SourceName, SourceOutlet[]>;
  const report = buildComparisonReport(bySource, candidates);
  await persistConsolidation(db, tenantId, runId, candidates, report);
  return { outlets: sourceOutlets.length, candidates: candidates.length };
}
