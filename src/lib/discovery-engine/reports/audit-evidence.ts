// Real, database-backed audit/evidence view — no placeholder data, no secrets exposed.
// `response_headers` on je_raw_observations is already sanitised at write time (safe
// headers only — no auth/Set-Cookie, see migration 0004 comment); nothing else in this
// module reads or exposes any credential/token value.

import { createServiceClient, hasServiceCredentials } from "../supabase-client";
import { resolveDefaultTenantId } from "../server";

export interface AuditRecordSummary {
  id: string;
  source: string;
  sourceRecordId: string | null;
  responseType: string;
  fetchedAt: string;
  parseStatus: string;
  duplicateOf: string | null;
  runId: string;
}

export interface AuditRecordDetail {
  configured: boolean;
  found: boolean;
  observation: {
    id: string;
    source: string;
    sourceRecordId: string | null;
    responseType: string;
    runId: string;
    executionId: string;
    fetchedAt: string;
    httpStatus: number | null;
    contentHash: string;
    parserVersion: string;
    adapterVersion: string;
    schemaVersion: number;
    parseStatus: string;
    parseWarnings: unknown[];
    duplicateOf: string | null;
    rawPayloadKeys: string[]; // top-level keys only, not the full payload (keeps the view scannable)
  } | null;
  canonicalOutlet: { id: string; name: string; normalisationVersion: string } | null;
  fieldProvenance: { fieldKey: string; source: string; confidence: number | null; isDerived: boolean; collectedAt: string }[];
  enrichmentProvenance: { fieldKey: string; source: string; confidence: number | null; collectedAt: string }[];
}

export async function fetchRecentAuditRecords(limit = 30): Promise<{ configured: boolean; records: AuditRecordSummary[] }> {
  if (!hasServiceCredentials()) return { configured: false, records: [] };
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();
  const res = await db
    .from("je_raw_observations")
    .select("id,source,source_record_id,response_type,fetched_at,parse_status,duplicate_of,run_id")
    .eq("tenant_id", tenantId)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (res.error) throw new Error(`fetchRecentAuditRecords: ${JSON.stringify(res.error)}`);
  return {
    configured: true,
    records: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), source: String(r.source), sourceRecordId: (r.source_record_id as string) ?? null,
      responseType: String(r.response_type), fetchedAt: String(r.fetched_at),
      parseStatus: String(r.parse_status), duplicateOf: (r.duplicate_of as string) ?? null, runId: String(r.run_id),
    })),
  };
}

export async function fetchAuditRecordDetail(observationId: string): Promise<AuditRecordDetail> {
  const empty: AuditRecordDetail = { configured: false, found: false, observation: null, canonicalOutlet: null, fieldProvenance: [], enrichmentProvenance: [] };
  if (!hasServiceCredentials()) return empty;

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const obsRes = await db.from("je_raw_observations").select("*").eq("tenant_id", tenantId).eq("id", observationId).maybeSingle();
  if (obsRes.error) throw new Error(`fetchAuditRecordDetail.obs: ${JSON.stringify(obsRes.error)}`);
  if (!obsRes.data) return { ...empty, configured: true };
  const o = obsRes.data as Record<string, unknown>;

  const outletRes = await db.from("je_outlets").select("id,trading_name,normalisation_version").eq("tenant_id", tenantId).eq("latest_observation_id", observationId).maybeSingle();
  const outlet = outletRes.data as Record<string, unknown> | null;

  let fieldProvenance: AuditRecordDetail["fieldProvenance"] = [];
  let enrichmentProvenance: AuditRecordDetail["enrichmentProvenance"] = [];
  if (outlet) {
    const provRes = await db.from("je_field_provenance").select("field_key,source,confidence,is_derived,collected_at").eq("tenant_id", tenantId).eq("outlet_id", outlet.id);
    const all = (provRes.data ?? []) as Record<string, unknown>[];
    fieldProvenance = all.filter((p) => p.source === "just_eat").map((p) => ({
      fieldKey: String(p.field_key), source: String(p.source), confidence: (p.confidence as number) ?? null,
      isDerived: Boolean(p.is_derived), collectedAt: String(p.collected_at),
    }));
    enrichmentProvenance = all.filter((p) => p.source !== "just_eat").map((p) => ({
      fieldKey: String(p.field_key), source: String(p.source), confidence: (p.confidence as number) ?? null, collectedAt: String(p.collected_at),
    }));
  }

  const rawPayload = (o.raw_payload as Record<string, unknown>) ?? {};

  return {
    configured: true,
    found: true,
    observation: {
      id: String(o.id), source: String(o.source), sourceRecordId: (o.source_record_id as string) ?? null,
      responseType: String(o.response_type), runId: String(o.run_id), executionId: String(o.execution_id),
      fetchedAt: String(o.fetched_at), httpStatus: (o.http_status as number) ?? null,
      contentHash: String(o.content_hash), parserVersion: String(o.parser_version), adapterVersion: String(o.adapter_version),
      schemaVersion: Number(o.schema_version ?? 1), parseStatus: String(o.parse_status),
      parseWarnings: Array.isArray(o.parse_warnings) ? (o.parse_warnings as unknown[]) : [],
      duplicateOf: (o.duplicate_of as string) ?? null,
      rawPayloadKeys: Object.keys(rawPayload),
    },
    canonicalOutlet: outlet ? { id: String(outlet.id), name: String(outlet.trading_name ?? ""), normalisationVersion: String(outlet.normalisation_version ?? "") } : null,
    fieldProvenance,
    enrichmentProvenance,
  };
}
