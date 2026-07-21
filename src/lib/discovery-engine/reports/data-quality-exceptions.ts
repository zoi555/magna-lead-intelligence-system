// Real, database-backed data-quality exceptions — no placeholder data. Server-only.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";

export interface OutletRef { id: string; name: string; postcode: string | null }

export interface GeographyMismatchGroup {
  source: string;
  status: string;
  count: number;
  sample: { sourceRecordId: string | null; providerCountry: string | null; providerPostcode: string | null }[];
}

export interface DuplicatePhoneConflict { phone: string; outlets: OutletRef[] }

export interface DataQualityExceptions {
  configured: boolean;
  totalOutlets: number;
  missingPhone: { count: number; sample: OutletRef[] };
  missingAddress: { count: number; sample: OutletRef[] };
  missingPostcode: { count: number; sample: OutletRef[] };
  missingCoordinates: { count: number; sample: OutletRef[] };
  missingRating: { count: number; sample: OutletRef[] };
  duplicatePhoneConflicts: DuplicatePhoneConflict[];
  geographyMismatches: GeographyMismatchGroup[];
  duplicateObservations: { totalCanonical: number; totalDuplicates: number; sample: { sourceRecordId: string; duplicateOfId: string }[] };
  schemaFailures: { count: number; sample: { sourceRecordId: string; source: string; parseStatus: string }[] };
}

function toRef(r: Record<string, unknown>): OutletRef {
  return { id: String(r.id), name: String(r.trading_name ?? ""), postcode: (r.postcode as string) ?? null };
}

export async function fetchDataQualityExceptions(): Promise<DataQualityExceptions> {
  const empty: DataQualityExceptions = {
    configured: false, totalOutlets: 0,
    missingPhone: { count: 0, sample: [] }, missingAddress: { count: 0, sample: [] },
    missingPostcode: { count: 0, sample: [] }, missingCoordinates: { count: 0, sample: [] },
    missingRating: { count: 0, sample: [] },
    duplicatePhoneConflicts: [], geographyMismatches: [],
    duplicateObservations: { totalCanonical: 0, totalDuplicates: 0, sample: [] },
    schemaFailures: { count: 0, sample: [] },
  };
  if (!hasServiceCredentials()) return empty;

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const outletsRes = await db
    .from("je_outlets")
    .select("id,trading_name,telephone_e164,address_first_line,postcode,latitude,longitude,rating_average")
    .eq("tenant_id", tenantId);
  if (outletsRes.error) throw new Error(`fetchDataQualityExceptions.outlets: ${JSON.stringify(outletsRes.error)}`);
  const outlets = (outletsRes.data ?? []) as Record<string, unknown>[];

  const missingPhone = outlets.filter((r) => !r.telephone_e164);
  const missingAddress = outlets.filter((r) => !r.address_first_line);
  const missingPostcode = outlets.filter((r) => !r.postcode);
  const missingCoordinates = outlets.filter((r) => r.latitude == null || r.longitude == null);
  const missingRating = outlets.filter((r) => r.rating_average == null);

  const phoneOwners = new Map<string, OutletRef[]>();
  for (const r of outlets) {
    if (!r.telephone_e164) continue;
    const key = String(r.telephone_e164);
    const list = phoneOwners.get(key) ?? [];
    list.push(toRef(r));
    phoneOwners.set(key, list);
  }
  const duplicatePhoneConflicts = [...phoneOwners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([phone, list]) => ({ phone, outlets: list }));

  // Geography mismatches: candidates whose geography_status is not the valid default.
  const geoRes = await db
    .from("consolidated_candidates")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("geography_status", "valid_geography");
  const mismatchCandidateIds = (geoRes.data ?? []).map((r) => (r as { id: string }).id);
  let geographyMismatches: GeographyMismatchGroup[] = [];
  if (mismatchCandidateIds.length) {
    const linksRes = await db
      .from("candidate_source_links")
      .select("candidate_id,source,source_outlet_id")
      .eq("tenant_id", tenantId)
      .in("candidate_id", mismatchCandidateIds);
    const validationsRes = await db
      .from("provider_geography_validations")
      .select("source,source_record_id,status,provider_country,provider_postcode")
      .eq("tenant_id", tenantId)
      .neq("status", "valid_geography")
      .limit(500);
    const groups = new Map<string, GeographyMismatchGroup>();
    for (const v of (validationsRes.data ?? []) as Record<string, unknown>[]) {
      const key = `${v.source}::${v.status}`;
      const g = groups.get(key) ?? { source: String(v.source), status: String(v.status), count: 0, sample: [] };
      g.count++;
      if (g.sample.length < 5) {
        g.sample.push({
          sourceRecordId: (v.source_record_id as string) ?? null,
          providerCountry: (v.provider_country as string) ?? null,
          providerPostcode: (v.provider_postcode as string) ?? null,
        });
      }
      groups.set(key, g);
    }
    geographyMismatches = [...groups.values()];
    void linksRes; // link data available for future drill-down; counts already come from validations
  }

  const dupObsRes = await db
    .from("je_raw_observations")
    .select("source_record_id,duplicate_of", { count: "exact" })
    .eq("tenant_id", tenantId)
    .not("duplicate_of", "is", null)
    .limit(10);
  const dupTotalRes = await db
    .from("je_raw_observations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("duplicate_of", "is", null);
  const canonicalTotalRes = await db
    .from("je_raw_observations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("duplicate_of", null);

  const schemaFailRes = await db
    .from("je_raw_observations")
    .select("source_record_id,source,parse_status")
    .eq("tenant_id", tenantId)
    .neq("parse_status", "parsed")
    .limit(10);
  const schemaFailCountRes = await db
    .from("je_raw_observations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .neq("parse_status", "parsed");

  return {
    configured: true,
    totalOutlets: outlets.length,
    missingPhone: { count: missingPhone.length, sample: missingPhone.slice(0, 10).map(toRef) },
    missingAddress: { count: missingAddress.length, sample: missingAddress.slice(0, 10).map(toRef) },
    missingPostcode: { count: missingPostcode.length, sample: missingPostcode.slice(0, 10).map(toRef) },
    missingCoordinates: { count: missingCoordinates.length, sample: missingCoordinates.slice(0, 10).map(toRef) },
    missingRating: { count: missingRating.length, sample: missingRating.slice(0, 10).map(toRef) },
    duplicatePhoneConflicts,
    geographyMismatches,
    duplicateObservations: {
      totalCanonical: canonicalTotalRes.count ?? 0,
      totalDuplicates: dupTotalRes.count ?? 0,
      sample: ((dupObsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        sourceRecordId: String(r.source_record_id), duplicateOfId: String(r.duplicate_of),
      })),
    },
    schemaFailures: {
      count: schemaFailCountRes.count ?? 0,
      sample: ((schemaFailRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        sourceRecordId: String(r.source_record_id), source: String(r.source), parseStatus: String(r.parse_status),
      })),
    },
  };
}
