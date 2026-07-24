// Resume geography validation + consolidation from RETAINED raw evidence, without re-fetching
// from Just Eat (ISS-0031 requirement 7 — "Resume must use retained evidence where complete").
//
// Scenario this exists for: a run's discovery query fully completed (its raw observations are
// a complete, correct capture of what Just Eat returned) but a LATER step — geography
// validation or consolidation — failed on a transient error before the run reached a terminal
// completed status. Re-running discovery from scratch would spend real API/scrape cost a
// second time for data that is already fully and correctly retained. This reconstructs the
// same ParsedOutlet objects the original execution would have built (by re-running the exact
// same parser against each raw observation's own stored `raw_payload`), then runs the same
// geography-gate + persist + consolidate steps `executeJustEatRun()`'s success path runs.
//
// Goes entirely through the DiscoveryRepository abstraction (never a raw Supabase client) so
// this is testable against MemoryRepository with no network, matching every other module in
// this package. Read-only against retained raw observations (append-only, never modified
// here); writes only geography validations / consolidated candidates / the run's own status.

import type { DiscoveryRepository } from "../repository/repository";
import type { ParsedOutlet } from "../types";
import type { SourceOutlet } from "../consolidation/types";
import { parseSearchRestaurant } from "../just-eat/parse";
import { partitionByGeography } from "../geography/provider-geography-gate";

export interface ResumeGeographyResult {
  ok: boolean;
  reason?: string;
  rawObservationsUsed: number;
  uniqueOutlets: number;
  geographyValidationsInserted: number;
  consolidation?: { outlets: number; candidates: number };
}

function parsedOutletToSourceOutlet(o: ParsedOutlet, observedAt: string): SourceOutlet {
  return {
    source: "just_eat", source_outlet_id: o.je_outlet_id, source_url: null,
    name: o.trading_name, brand: o.brand_name, address: o.address_first_line, postcode: o.postcode,
    latitude: o.latitude, longitude: o.longitude, phone: o.telephone_e164,
    rating: o.rating_average, review_count: o.rating_count, cuisines: o.cuisines,
    is_delivery: o.open_for_delivery, is_collection: o.open_for_collection,
    delivery_cost: null, minimum_order: null, eta_minutes: null, is_sponsored: null,
    halal_flag: null, logo_url: null, observed_at: observedAt,
  };
}

/** Checks whether a run is a genuine "raw retained, geography incomplete" candidate for
 *  resume: it has canonical (non-duplicate) raw observations, but zero geography validation
 *  rows recorded against it. Exported separately so callers (e.g. je-run.ts's pre-flight
 *  check) can detect and offer this path without committing to running it. */
export async function checkResumableFromRetainedEvidence(
  repo: DiscoveryRepository, runId: string,
): Promise<{ resumable: boolean; rawCount: number; geographyValidationCount: number }> {
  const [rows, geoCount] = await Promise.all([
    repo.listCanonicalRawObservationsForRun(runId),
    repo.countGeographyValidationsForRun(runId),
  ]);
  return { resumable: rows.length > 0 && geoCount === 0, rawCount: rows.length, geographyValidationCount: geoCount };
}

export async function resumeGeographyProcessing(
  repo: DiscoveryRepository, tenantId: string, runId: string,
): Promise<ResumeGeographyResult> {
  const run = await repo.getRun(runId);
  if (!run) return { ok: false, reason: `Run ${runId} not found.`, rawObservationsUsed: 0, uniqueOutlets: 0, geographyValidationsInserted: 0 };

  const check = await checkResumableFromRetainedEvidence(repo, runId);
  if (!check.resumable) {
    return {
      ok: false,
      reason: check.rawCount === 0
        ? "No retained raw observations for this run — nothing to resume from; a fresh discovery run is required."
        : `Geography validation already has ${check.geographyValidationCount} row(s) for this run — resuming would risk duplicating validation records; investigate before proceeding.`,
      rawObservationsUsed: check.rawCount, uniqueOutlets: 0, geographyValidationsInserted: 0,
    };
  }

  const rows = await repo.listCanonicalRawObservationsForRun(runId);
  const outletsByJeId = new Map<string, ParsedOutlet>();
  const latestObservationIdByJeId = new Map<string, string>();
  const pilotOutcodes = run.derived_query_units ?? [];
  for (const row of rows) {
    const outcode = (row.query_context as Record<string, unknown> | null)?.outcode as string | undefined;
    const { outlet } = parseSearchRestaurant(row.raw_payload, outcode ?? "", pilotOutcodes);
    if (!outlet.je_outlet_id) continue;
    outletsByJeId.set(outlet.je_outlet_id, outlet);
    latestObservationIdByJeId.set(outlet.je_outlet_id, row.id);   // rows are oldest-first, so the last write per key is the latest observation
  }

  if (outletsByJeId.size === 0) {
    return { ok: false, reason: "Raw observations exist but none parsed into a valid outlet — refusing to fabricate a result.", rawObservationsUsed: rows.length, uniqueOutlets: 0, geographyValidationsInserted: 0 };
  }

  const observedAt = new Date().toISOString();
  const sourceOutlets = [...outletsByJeId.values()].map((o) => parsedOutletToSourceOutlet(o, observedAt));
  const partition = partitionByGeography(sourceOutlets, {
    requestedCountry: "GB", geographySelection: run.territory_input ?? null, resolvedQueryUnits: run.derived_query_units ?? [],
  });
  const persisted = await repo.persistGeographyValidations({
    tenantId, runId, executionId: null, source: "just_eat",
    ctx: { requestedCountry: "GB", geographySelection: run.territory_input ?? null, resolvedQueryUnits: run.derived_query_units ?? [] },
    verdicts: partition.verdicts, observationIdBySourceId: latestObservationIdByJeId,
  });

  const consolidation = await repo.consolidateRun(tenantId, runId);
  await repo.setRunStatus(runId, "completed");

  return {
    ok: true, rawObservationsUsed: rows.length, uniqueOutlets: outletsByJeId.size,
    geographyValidationsInserted: persisted.inserted, consolidation,
  };
}
