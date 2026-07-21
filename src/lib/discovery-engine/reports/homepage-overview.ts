// Real, database-backed homepage overview — no mock data, no fabricated fallback values.
// Every field is either a genuine query result or the literal string "Not available".
// Server-only.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";
import { fetchRecentRuns, fetchRunDetail, type RunDetail } from "./run-detail";
import { fetchDataQualityExceptions } from "./data-quality-exceptions";
import { SOURCE_REGISTRY } from "@/lib/sources/source-registry";

export interface LatestImportSummary {
  id: string;
  source: string;
  originalFilename: string | null;
  acceptedCount: number;
  status: string;
  importedAt: string;
}

export interface HomepageOverview {
  configured: boolean;
  latestRun: (RunDetail & { runId: string; runName: string }) | null;
  justEatOutletCount: number | "Not available";
  dataQualityExceptionsTotal: number | "Not available";
  newCandidatesLast24h: number | "Not available";
  latestImport: LatestImportSummary | null;
  sourceHealth: { id: string; name: string; marketplaceStatus: string | undefined; statusLabel: string | undefined; recordsAvailable: number | null | undefined }[];
}

export async function fetchHomepageOverview(): Promise<HomepageOverview> {
  const empty: HomepageOverview = {
    configured: false, latestRun: null, justEatOutletCount: "Not available",
    dataQualityExceptionsTotal: "Not available", newCandidatesLast24h: "Not available",
    latestImport: null, sourceHealth: [],
  };
  if (!hasServiceCredentials()) return empty;

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const [recentRuns, exceptions, jeCountRes, newCandidatesRes, latestImportRes] = await Promise.all([
    fetchRecentRuns(1),
    fetchDataQualityExceptions(),
    db.from("je_outlets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    db.from("import_batches").select("id,source,original_filename,accepted_count,status,imported_at").eq("tenant_id", tenantId).order("imported_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  let latestRun: HomepageOverview["latestRun"] = null;
  if (recentRuns.configured && recentRuns.runs.length) {
    const r = recentRuns.runs[0];
    const detail = await fetchRunDetail(r.id);
    if (detail.found) latestRun = { ...detail, runId: r.id, runName: r.name };
  }

  const latestImport: LatestImportSummary | null = latestImportRes.data
    ? {
        id: String((latestImportRes.data as Record<string, unknown>).id),
        source: String((latestImportRes.data as Record<string, unknown>).source),
        originalFilename: ((latestImportRes.data as Record<string, unknown>).original_filename as string) ?? null,
        acceptedCount: Number((latestImportRes.data as Record<string, unknown>).accepted_count ?? 0),
        status: String((latestImportRes.data as Record<string, unknown>).status),
        importedAt: String((latestImportRes.data as Record<string, unknown>).imported_at),
      }
    : null;

  return {
    configured: true,
    latestRun,
    justEatOutletCount: jeCountRes.error ? "Not available" : (jeCountRes.count ?? 0),
    dataQualityExceptionsTotal: exceptions.configured
      ? exceptions.missingPhone.count + exceptions.missingAddress.count + exceptions.missingPostcode.count +
        exceptions.missingCoordinates.count + exceptions.missingRating.count + exceptions.duplicatePhoneConflicts.length +
        exceptions.geographyMismatches.reduce((s, g) => s + g.count, 0) + exceptions.duplicateObservations.totalDuplicates +
        exceptions.schemaFailures.count
      : "Not available",
    newCandidatesLast24h: newCandidatesRes.error ? "Not available" : (newCandidatesRes.count ?? 0),
    latestImport,
    sourceHealth: ["just_eat", "uber_eats", "deliveroo"].map((id) => {
      const s = SOURCE_REGISTRY.find((r) => r.id === id);
      return { id, name: s?.name ?? id, marketplaceStatus: s?.marketplaceStatus, statusLabel: s?.statusLabel, recordsAvailable: s?.recordsAvailable };
    }),
  };
}
