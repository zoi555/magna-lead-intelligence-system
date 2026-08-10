// POST /api/discovery/import — validate (and optionally confirm) a controlled Uber Eats or
// Deliveroo CSV/JSON import. Uses the existing provider-neutral adapters
// (uber-eats/import.ts, deliveroo/import.ts) — no new acquisition logic, no live scraping.
//
// Dry-run (default): parses, detects invalid rows, duplicate outlet IDs, and runs every
// record through the same provider-geography-gate used for live discovery — returns a full
// preview, persists nothing.
// Confirm: same validation, plus a content-hash evidence reference. Does NOT write to a
// live outlets table — neither Uber Eats nor Deliveroo has one yet (both are
// PENDING_AUTHORISATION in the source registry); persistence is the next step once a
// source is authorised, not silently implied here.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { UberEatsAdapter } from "@/lib/discovery-engine/uber-eats/adapter";
import { DeliverooAdapter } from "@/lib/discovery-engine/deliveroo/adapter";
import { partitionByGeography } from "@/lib/discovery-engine/geography/provider-geography-gate";
import { createServiceClient, hasServiceCredentials } from "@/lib/discovery-engine/supabase-client";
import type { SourceOutlet } from "@/lib/discovery-engine/consolidation/types";
import { requireSessionAndRole } from "@/lib/auth/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = "uber_eats" | "deliveroo";
type Format = "csv" | "json";

interface InvalidRow { index: number; reason: string; raw: unknown }

function scanInvalidCsvRows(csvText: string): InvalidRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idIdx = header.indexOf("source_outlet_id");
  const nameIdx = header.indexOf("name");
  const invalid: InvalidRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(",");
    const id = idIdx >= 0 ? (cells[idIdx] ?? "").trim() : "";
    const name = nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() : "";
    if (!id || !name) invalid.push({ index: i + 1, reason: !id && !name ? "missing source_outlet_id and name" : !id ? "missing source_outlet_id" : "missing name", raw: line });
  });
  return invalid;
}

function scanInvalidJsonRows(records: unknown[]): InvalidRow[] {
  const invalid: InvalidRow[] = [];
  records.forEach((r, i) => {
    const rec = r as Record<string, unknown>;
    const hasId = Boolean(rec?.uuid ?? rec?.id ?? rec?.storeUuid ?? rec?.slug);
    const hasName = Boolean(rec?.title ?? rec?.name ?? rec?.storeName);
    if (!hasId || !hasName) invalid.push({ index: i, reason: !hasId && !hasName ? "no recognisable id or name field" : !hasId ? "no recognisable id field" : "no recognisable name field", raw: r });
  });
  return invalid;
}

function findDuplicates(outlets: SourceOutlet[]): { source_outlet_id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of outlets) counts.set(o.source_outlet_id, (counts.get(o.source_outlet_id) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c > 1).map(([source_outlet_id, count]) => ({ source_outlet_id, count }));
}

export async function POST(req: Request) {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source as Source;
    const format = body.format as Format;
    const content = String(body.content ?? "");
    const confirm = Boolean(body.confirm);
    const originalFilename: string | null = body.fileName ? String(body.fileName) : null;
    // AspectLead is a Great Britain-wide product — there is no safe national default
    // territory to validate an import's geography against, so this is required, not
    // defaulted (previously defaulted to "UB1", a West London pilot artifact that would
    // have silently mis-validated every import outside that one district; removed
    // 2026-08-10, see docs/09_DECISIONS.md).
    const anchorOutcodes: string[] = Array.isArray(body.anchorOutcodes) ? body.anchorOutcodes.map((v: unknown) => String(v)).filter(Boolean) : [];

    if (source !== "uber_eats" && source !== "deliveroo") return NextResponse.json({ ok: false, error: "source must be 'uber_eats' or 'deliveroo'" }, { status: 400 });
    if (format !== "csv" && format !== "json") return NextResponse.json({ ok: false, error: "format must be 'csv' or 'json'" }, { status: 400 });
    if (!content.trim()) return NextResponse.json({ ok: false, error: "content is empty" }, { status: 400 });
    if (!anchorOutcodes.length) return NextResponse.json({ ok: false, error: "anchorOutcodes is required — specify the postcode district(s) this import's geography should be validated against (no national default exists)." }, { status: 400 });

    const adapter = source === "uber_eats" ? new UberEatsAdapter() : new DeliverooAdapter();
    const observedAt = new Date().toISOString();

    let outlets: SourceOutlet[];
    let invalidRows: InvalidRow[];
    try {
      if (format === "csv") {
        invalidRows = scanInvalidCsvRows(content);
        outlets = adapter.importCsv(content, observedAt);
      } else {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) return NextResponse.json({ ok: false, error: "JSON content must be an array of records" }, { status: 400 });
        invalidRows = scanInvalidJsonRows(parsed);
        outlets = adapter.importJson(parsed, observedAt);
      }
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Parse failed: ${String((e as Error)?.message ?? e)}` }, { status: 400 });
    }

    const duplicates = findDuplicates(outlets);
    const geo = partitionByGeography(outlets, { requestedCountry: "GB", geographySelection: anchorOutcodes.join(", "), resolvedQueryUnits: anchorOutcodes });

    const fieldMappingPreview = outlets.slice(0, 10).map((o) => ({
      source_outlet_id: o.source_outlet_id, name: o.name, brand: o.brand, address: o.address, postcode: o.postcode,
      phone: o.phone, rating: o.rating, review_count: o.review_count, cuisines: o.cuisines,
      is_delivery: o.is_delivery, is_collection: o.is_collection, delivery_cost: o.delivery_cost,
      eta_minutes: o.eta_minutes, source_url: o.source_url,
    }));

    const evidenceReference = `import:${source}:${format}:${createHash("sha256").update(content).digest("hex")}`;

    const summary = {
      source, format, observedAt,
      totalRowsSubmitted: format === "csv" ? Math.max(0, content.split(/\r?\n/).filter((l) => l.trim()).length - 1) : (JSON.parse(content) as unknown[]).length,
      parsedCount: outlets.length,
      invalidRowCount: invalidRows.length,
      invalidRows: invalidRows.slice(0, 20),
      duplicateCount: duplicates.length,
      duplicates,
      geography: {
        anchorOutcodes,
        valid: geo.runStatus.valid,
        outOfScope: geo.runStatus.outOfScope,
        unverifiable: geo.runStatus.unverifiable,
        status: geo.runStatus.status,
        outOfScopeSample: geo.verdicts.filter((v) => v.verdict.status === "out_of_scope_geography").slice(0, 5).map((v) => ({ name: v.outlet.name, reason: v.verdict.reason })),
      },
      fieldMappingPreview,
      evidenceReference,
    };

    if (!confirm) {
      return NextResponse.json({ ok: true, dryRun: true, ...summary });
    }

    // Confirm: persist via commit_import_batch (migration 0023) — one function call, one
    // Postgres transaction, so a failure partway through leaves nothing behind (see
    // scripts/test-migration-local.sh for the rollback proof). Only valid geography +
    // deduplicated (first occurrence per source_outlet_id) + non-invalid records are sent.
    if (!hasServiceCredentials()) {
      return NextResponse.json({ ok: false, error: "Supabase service credentials not configured — cannot persist." }, { status: 500 });
    }

    const seen = new Set<string>();
    const toCommit = geo.valid.filter((o) => {
      if (seen.has(o.source_outlet_id)) return false; // dedupe: keep first occurrence only
      seen.add(o.source_outlet_id);
      return true;
    });

    const db = createServiceClient();
    const tenantId = session.tenantId;

    const runRes = await db.from("discovery_runs").insert({
      tenant_id: tenantId,
      name: `Import: ${source} (${originalFilename ?? format}) ${observedAt}`,
      territory_mode: "import",
      territory_input: anchorOutcodes.join(", "),
      status: "completed",
    }).select("id").single();
    if (runRes.error) return NextResponse.json({ ok: false, error: `Failed to create import run: ${JSON.stringify(runRes.error)}` }, { status: 500 });
    const runId = (runRes.data as { id: string }).id;

    const parserVersion = toCommit[0]?.parser_version ?? "unknown";
    const providerVersion = toCommit[0]?.provider_version ?? "unknown";

    const records = toCommit.map((o) => ({
      source_outlet_id: o.source_outlet_id,
      raw: o, // the canonical parsed record; the original row is recoverable via the batch's file_checksum + this source_outlet_id
      name: o.name,
      brand: o.brand,
      postcode: o.postcode,
      phone: o.phone,
      latitude: o.latitude,
      longitude: o.longitude,
      source_url: o.source_url,
      rating: o.rating,
      review_count: o.review_count,
      cuisines: o.cuisines,
      is_delivery: o.is_delivery,
      is_collection: o.is_collection,
      field_values: {
        address: o.address,
        eta_minutes: o.eta_minutes,
        delivery_cost: o.delivery_cost,
        minimum_order: o.minimum_order,
        is_sponsored: o.is_sponsored,
        logo_url: o.logo_url,
        image_url: o.image_url ?? null,
        service_fee: o.service_fee ?? null,
      },
    }));

    // duplicateRowCount = total rows beyond each source_outlet_id's first occurrence, across
    // every parsed outlet (not just the valid-geography subset) — matches `duplicates` above.
    const duplicateRowCount = duplicates.reduce((sum, d) => sum + (d.count - 1), 0);
    const rejectedFromInvalidAndGeo = invalidRows.length + geo.outOfScope.length + geo.unverifiable.length;
    const rpcRes = await db.rpc("commit_import_batch", {
      p_tenant_id: tenantId,
      p_run_id: runId,
      p_source: source,
      p_format: format,
      p_original_filename: originalFilename,
      p_file_checksum: createHash("sha256").update(content).digest("hex"),
      p_parser_version: parserVersion,
      p_provider_version: providerVersion,
      p_rejected_count: rejectedFromInvalidAndGeo,
      p_duplicate_count: duplicateRowCount,
      p_records: records,
    });

    if (rpcRes.error) {
      return NextResponse.json({ ok: false, error: `Import commit failed — nothing was persisted (transactional): ${JSON.stringify(rpcRes.error)}` }, { status: 500 });
    }
    const committed = rpcRes.data as { batch_id: string; accepted: number };

    return NextResponse.json({
      ok: true,
      dryRun: false,
      confirmed: true,
      persisted: true,
      importBatchId: committed.batch_id,
      runId,
      persistedCount: committed.accepted,
      persistenceNote: `${committed.accepted} record(s) persisted to consolidated_candidates + provider_raw_observations (import batch ${committed.batch_id}). Appears in Discovery Results and Data-Quality Exceptions immediately.`,
      ...summary,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
