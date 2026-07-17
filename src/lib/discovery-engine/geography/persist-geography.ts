// Persist per-observation geography verdicts (append-only audit) to provider_geography_validations.
// Server-side (service client). Verdicts are evidence — the table forbids UPDATE/DELETE.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeographyVerdict, GeographyRunContext } from "./provider-geography-gate";
import type { SourceOutlet } from "../consolidation/types";

export async function persistGeographyValidations(
  db: SupabaseClient,
  args: {
    tenantId: string;
    runId: string | null;
    executionId: string | null;
    source: string;
    ctx: GeographyRunContext;
    verdicts: { outlet: SourceOutlet; verdict: GeographyVerdict }[];
    observationIdBySourceId?: Map<string, string>;
  },
): Promise<{ inserted: number }> {
  const { tenantId, runId, executionId, source, ctx, verdicts, observationIdBySourceId } = args;
  if (!verdicts.length) return { inserted: 0 };
  const rows = verdicts.map(({ outlet, verdict }) => ({
    tenant_id: tenantId,
    run_id: runId,
    execution_id: executionId,
    observation_id: observationIdBySourceId?.get(outlet.source_outlet_id) ?? null,
    source,
    source_record_id: outlet.source_outlet_id,
    requested_country: verdict.requestedCountry,
    requested_geography: ctx.geographySelection ?? null,
    resolved_query_units: ctx.resolvedQueryUnits ?? [],
    provider_country: verdict.providerCountry,
    provider_postcode: outlet.postcode ?? ((outlet.source_extra?.source_postcode as string) ?? null),
    provider_postcode_type: verdict.providerPostcodeType,
    provider_has_coords: outlet.latitude != null && outlet.longitude != null,
    status: verdict.status,
    signal: verdict.signal,
    reason: verdict.reason,
  }));
  const r = await db.from("provider_geography_validations").insert(rows);
  if (r.error) throw new Error(`persistGeographyValidations: ${JSON.stringify(r.error)}`);
  return { inserted: rows.length };
}
