// Platform public-evidence discovery STAGE — Sprint #49.
//
// A thin, pipeline-shaped wrapper around the platform-public-collector. It:
//   1. runs the compliant collectors across the run's outcodes,
//   2. stages raw + normalised evidence under data/runs/<runId>/ (audit trail),
//   3. writes human-readable exports (CSV + JSON summary),
//   4. returns the normalised records + a stage summary.
//
// It never throws — collector failures are captured and surfaced in the summary.
//
// NOTE: exports/ and data/ are gitignored. Nothing written here is committed.

import fs from "node:fs";
import path from "node:path";
import {
  collectAllPlatforms,
  type CollectOptions,
  type CollectorFailure,
  type CollectorSummary,
} from "../sources/platform-public-collector";
import {
  PLATFORM_RECORD_COLUMNS,
  type PlatformRecord,
} from "./platform-normalisation";
import {
  stagePlatformNormalised,
  stagePlatformRaw,
} from "./platform-evidence-store";

const EXPORTS_DIR = path.join(process.cwd(), "exports");

export interface PlatformDiscoveryResult {
  runId: string;
  records: PlatformRecord[];
  failures: CollectorFailure[];
  summary: CollectorSummary;
  outputs: {
    evidenceCsv: string;
    summaryJson: string;
    failuresCsv: string;
    stagedNormalised: string;
  };
}

// ---------- CSV helpers ----------

/** Escape one CSV field per RFC 4180 (quote if it contains , " or newline). */
function csvEscape(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) {
    s = "";
  } else if (Array.isArray(value)) {
    s = value.join("; "); // arrays flattened with a semicolon separator
  } else if (typeof value === "boolean") {
    s = value ? "true" : "false";
  } else {
    s = String(value);
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function recordsToCsv(records: PlatformRecord[]): string {
  const header = PLATFORM_RECORD_COLUMNS.map(String);
  const rows = records.map((r) => PLATFORM_RECORD_COLUMNS.map((col) => r[col]));
  return toCsv(header, rows);
}

function failuresToCsv(failures: CollectorFailure[]): string {
  const header = ["platform", "area", "status", "reason"];
  const rows = failures.map((f) => [f.platform, f.area, f.status, f.reason]);
  return toCsv(header, rows);
}

// ---------- stage entrypoint ----------

/**
 * Run platform public-evidence discovery for a pipeline run.
 *
 * @param runId    the current run id (used for the local staging paths)
 * @param outcodes outward codes to search
 * @param opts     collector options (imported CSV, per-platform toggles)
 */
export async function runPlatformDiscovery(
  runId: string,
  outcodes: string[],
  opts: CollectOptions = {}
): Promise<PlatformDiscoveryResult> {
  const { records, failures, summary } = await collectAllPlatforms(outcodes, opts);

  // Stage raw payload (the summary + failures form the run's raw audit note) and
  // the normalised record set. Wrapped so a disk error never breaks the stage.
  let stagedNormalised = "";
  try {
    stagePlatformRaw(runId, "all", "batch", { summary, failures });
    stagedNormalised = stagePlatformNormalised(runId, records);
  } catch {
    // Non-fatal: staging is an audit convenience, not a pipeline dependency.
  }

  // Write exports.
  ensureDir(EXPORTS_DIR);
  const evidenceCsv = path.join(EXPORTS_DIR, "platform-public-evidence.csv");
  const summaryJson = path.join(EXPORTS_DIR, "platform-public-evidence-summary.json");
  const failuresCsv = path.join(EXPORTS_DIR, "platform-collection-failures.csv");

  const fieldAvailabilityCsv = path.join(EXPORTS_DIR, "platform-field-availability-report.csv");
  try {
    fs.writeFileSync(evidenceCsv, recordsToCsv(records));
    fs.writeFileSync(
      summaryJson,
      JSON.stringify({ runId, summary, failures_count: failures.length }, null, 2)
    );
    fs.writeFileSync(failuresCsv, failuresToCsv(failures));
    fs.writeFileSync(fieldAvailabilityCsv, fieldAvailabilityToCsv(records, failures));
  } catch {
    // Non-fatal: exports are a convenience; records are still returned in-memory.
  }

  return {
    runId,
    records,
    failures,
    summary,
    outputs: {
      evidenceCsv,
      summaryJson,
      failuresCsv,
      stagedNormalised,
    },
  };
}

/**
 * Phase 5 field-availability audit — for each platform + collector method, report
 * which business-level fields actually came back (evidence-based, no guessing).
 */
function fieldAvailabilityToCsv(records: PlatformRecord[], failures: CollectorFailure[]): string {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const headers = [
    "platform", "method", "business_name_available", "address_available", "postcode_available",
    "phone_available", "website_available", "rating_available", "review_count_available",
    "cuisine_available", "platform_url_available", "opening_status_available",
    "delivery_collection_available", "mapped_to_normalised_output", "reason_if_missing",
  ];
  // Group records by platform + collector_method.
  const groups = new Map<string, PlatformRecord[]>();
  for (const r of records) {
    const key = `${r.platform}|${r.collector_method}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  // Ensure blocked/evidence-only platforms with no records still appear via failures.
  const failurePlatforms = new Set(failures.map((f) => `${(f as { platform?: string }).platform ?? "unknown"}|blocked`));
  for (const key of failurePlatforms) if (!groups.has(key)) groups.set(key, []);

  const any = (rows: PlatformRecord[], pick: (r: PlatformRecord) => unknown) => rows.some((r) => { const v = pick(r); return Array.isArray(v) ? v.length > 0 : v != null && v !== ""; });
  const yn = (b: boolean) => (b ? "yes" : "no");

  const lines = [headers.join(",")];
  for (const [key, rows] of groups) {
    const [platform, method] = key.split("|");
    const hasName = any(rows, (r) => r.business_name);
    const hasPhone = any(rows, (r) => r.phone_number);
    const hasWebsite = any(rows, (r) => r.website);
    const hasRating = any(rows, (r) => r.rating);
    const hasReview = any(rows, (r) => r.review_count);
    let reason = "";
    if (!rows.length) reason = "platform anti-bot protected — public page not fetched (evidence-only; import CSV to populate)";
    else if (platform.toLowerCase().includes("just") && (!hasPhone || !hasWebsite)) reason = "Just Eat bypostcode endpoint does not return phone/website (use Google Places fallback)";
    else if (!hasName) reason = "no business-level fields available for this method";
    lines.push([
      platform, method, yn(hasName), yn(any(rows, (r) => r.address_text)), yn(any(rows, (r) => r.postcode)),
      yn(hasPhone), yn(hasWebsite), yn(hasRating), yn(hasReview),
      yn(any(rows, (r) => r.cuisine_categories)), yn(any(rows, (r) => r.platform_url)),
      yn(any(rows, (r) => r.opening_status)), yn(any(rows, (r) => r.delivery_available != null || r.collection_available != null)),
      "yes", reason,
    ].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
