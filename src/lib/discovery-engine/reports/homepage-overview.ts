// Real, database-backed homepage overview — no mock data, no fabricated fallback values.
// Every field is either a genuine query result or an honest "Not available" / "Not
// evaluated" string. See docs/16_METRIC_DEFINITIONS.md for what each field means, its
// source table, filter and scope — this file and that doc must not drift apart.
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
  justEat: {
    /** ALL-TIME, ALL-TERRITORY canonical outlet count for the tenant — je_outlets, no
     *  run/date filter. Not the same scope as anything else on this page; never shown
     *  next to a same-looking-but-differently-scoped number without this label. */
    totalCanonicalOutletsAllTime: number | "Not available";
    /** Physically located inside the LATEST run's own territory — real only once the
     *  geography-validation gate has actually run for that run (see
     *  RunDetail.geographyValidationRan). "Not evaluated" (never "0") when it hasn't. */
    physicallyInLatestRunTerritory: number | "Not evaluated" | "Not available";
  };
  dataQuality: {
    /** Distinct restaurants with >=1 exception — never the summed field count. */
    affectedRestaurants: number | "Not available";
    /** Summed field-level exception count — an outlet missing 2 fields counts twice. */
    totalFieldExceptions: number | "Not available";
    /** Needs a human decision, no automated resolution path yet. */
    unresolvedManualReview: number | "Not available";
  };
  newCandidatesLast24h: number | "Not available";
  latestImport: LatestImportSummary | null;
  sourceHealth: { id: string; name: string; marketplaceStatus: string | undefined; statusLabel: string | undefined }[];
}

const EMPTY: HomepageOverview = {
  configured: false, latestRun: null,
  justEat: { totalCanonicalOutletsAllTime: "Not available", physicallyInLatestRunTerritory: "Not available" },
  dataQuality: { affectedRestaurants: "Not available", totalFieldExceptions: "Not available", unresolvedManualReview: "Not available" },
  newCandidatesLast24h: "Not available", latestImport: null, sourceHealth: [],
};

/** tenantId: pass the resolved session tenant from an authenticated page. Falls back to
 *  resolveDefaultTenantId() ONLY when omitted (existing test scripts that call this
 *  directly, outside a request context, where session-based resolution isn't possible —
 *  see docs/09_DECISIONS.md for why the fallback wasn't removed outright here). */
export async function fetchHomepageOverview(tenantId?: string): Promise<HomepageOverview> {
  if (!hasServiceCredentials()) return EMPTY;

  const db = createServiceClient();
  const resolvedTenantId = tenantId ?? (await resolveDefaultTenantId());

  const [recentRuns, exceptions, jeCountRes, newCandidatesRes, latestImportRes] = await Promise.all([
    fetchRecentRuns(1),
    fetchDataQualityExceptions(),
    db.from("je_outlets").select("id", { count: "exact", head: true }).eq("tenant_id", resolvedTenantId),
    // Operational count: only geography-valid candidates (see run-detail.ts for the same rule).
    db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("tenant_id", resolvedTenantId).eq("geography_status", "valid_geography").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    db.from("import_batches").select("id,source,original_filename,accepted_count,status,imported_at").eq("tenant_id", resolvedTenantId).order("imported_at", { ascending: false }).limit(1).maybeSingle(),
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
    justEat: {
      totalCanonicalOutletsAllTime: jeCountRes.error ? "Not available" : (jeCountRes.count ?? 0),
      physicallyInLatestRunTerritory: !latestRun ? "Not available" : latestRun.geographyValidationRan ? latestRun.counts.validGeography : "Not evaluated",
    },
    dataQuality: {
      affectedRestaurants: exceptions.configured ? exceptions.affectedRestaurantsCount : "Not available",
      totalFieldExceptions: exceptions.configured ? exceptions.totalFieldExceptionsCount : "Not available",
      unresolvedManualReview: exceptions.configured ? exceptions.unresolvedManualReviewCount : "Not available",
    },
    newCandidatesLast24h: newCandidatesRes.error ? "Not available" : (newCandidatesRes.count ?? 0),
    latestImport,
    sourceHealth: ["just_eat", "uber_eats", "deliveroo"].map((id) => {
      const s = SOURCE_REGISTRY.find((r) => r.id === id);
      return { id, name: s?.name ?? id, marketplaceStatus: s?.marketplaceStatus, statusLabel: s?.statusLabel };
    }),
  };
}
