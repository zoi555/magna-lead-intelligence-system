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
  // Canonical (non-duplicate) raw observations for this run, newest first, so the FIRST row
  // seen per source_record_id is the run's own canonical (latest) capture of that outlet — the
  // exact observation the geography gate itself classified (see worker/execute.ts, which builds
  // its outletsByJeId map the same way: last-write-wins per outlet within one execution).
  const obs = await db.from("je_raw_observations").select("id, source_record_id")
    .eq("run_id", runId).is("duplicate_of", null).order("created_at", { ascending: false });
  if (obs.error) throw new Error(`consolidateRun.obs: ${JSON.stringify(obs.error)}`);
  const canonicalObservationBySourceId = new Map<string, string>(); // source_record_id -> its canonical observation id
  for (const o of (obs.data ?? []) as { id: string; source_record_id: string }[]) {
    if (o.source_record_id && !canonicalObservationBySourceId.has(o.source_record_id)) {
      canonicalObservationBySourceId.set(o.source_record_id, o.id);
    }
  }
  if (!canonicalObservationBySourceId.size) return { outlets: 0, candidates: 0 };

  // Fail-closed, OBSERVATION-level geography gate: an outlet may only reach consolidation when
  // its exact canonical observation (not merely "some row sharing this source_record_id") has a
  // provider_geography_validations row for THIS run/tenant/source with status=valid_geography.
  // Joining on observation_id — never on source_record_id/source_outlet_id alone — means a stale
  // or cross-run observation of the same outlet can never lend its verdict to this run's outlet
  // (see test:geography-consolidation-fix's same-source-record-id, different-observation case).
  // Missing, rejected, or unverifiable evidence is excluded here — never treated as valid by absence.
  const canonicalObservationIds = [...canonicalObservationBySourceId.values()];
  const validObservationIds = new Set<string>();
  // Real bug found and fixed 2026-08-03 (campaign-002-five-district-pilot, IG1 live run,
  // 1192 raw outlets): a 500-item .in() batch of full UUIDs serialises to ~19,500 characters in
  // the GET request's query string, exceeding the ~16KB header limit and failing with
  // HeadersOverflowError ("Your request URL is 19765 characters"). UB1/most prior real districts
  // never had enough canonical observations in one run to hit 500 in a single batch, so this was
  // previously latent. IN_BATCH_SIZE=150 keeps a full-UUID batch (~39 chars/id incl. separator)
  // to ~5,850 characters — comfortable headroom below the limit even with the rest of the URL.
  const IN_BATCH_SIZE = 150;
  for (let i = 0; i < canonicalObservationIds.length; i += IN_BATCH_SIZE) {
    const r = await db.from("provider_geography_validations").select("observation_id")
      .eq("run_id", runId).eq("tenant_id", tenantId).eq("source", "just_eat").eq("status", "valid_geography")
      .in("observation_id", canonicalObservationIds.slice(i, i + IN_BATCH_SIZE));
    if (r.error) throw new Error(`consolidateRun.validation: ${JSON.stringify(r.error)}`);
    for (const v of (r.data ?? []) as { observation_id: string | null }[]) if (v.observation_id) validObservationIds.add(v.observation_id);
  }
  const ids: string[] = [];
  for (const [sourceRecordId, observationId] of canonicalObservationBySourceId) {
    if (validObservationIds.has(observationId)) ids.push(sourceRecordId);
  }
  if (!ids.length) return { outlets: 0, candidates: 0 };

  const outletRows: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    const r = await db.from("je_outlets").select("*").eq("tenant_id", tenantId).in("je_outlet_id", ids.slice(i, i + IN_BATCH_SIZE));
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
