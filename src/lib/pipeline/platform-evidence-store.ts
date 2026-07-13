// Platform evidence store — Sprint #49.
//
// Stages the collector's RAW payloads and NORMALISED records to local disk under
// the run directory, so a run keeps an audit trail of exactly what each collector
// produced. Local-file based (node:fs), no database.
//
//   Raw:        data/runs/<runId>/raw/platform/<platform>-<area>-<ts>.json
//   Normalised: data/runs/<runId>/staged/platform/normalised.json
//
// IMPORTANT: these paths live under data/, which is gitignored. This evidence is
// run-local working state and MUST NOT be committed.

import fs from "node:fs";
import path from "node:path";
import type { PlatformName, PlatformRecord } from "./platform-normalisation";

/** Root of the local run store (mirrors run-store.ts RUNS_DIR). */
const RUNS_DIR = path.join(process.cwd(), "data", "runs");

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Directory for a run's raw platform payloads. */
export function platformRawDir(runId: string): string {
  return path.join(RUNS_DIR, runId, "raw", "platform");
}

/** Directory for a run's staged (normalised) platform records. */
export function platformStagedDir(runId: string): string {
  return path.join(RUNS_DIR, runId, "staged", "platform");
}

/** Make a filesystem-safe token from an area/platform string. */
function safeToken(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

/**
 * Stage a raw collector payload for one platform + area. `payload` is whatever
 * the collector saw (e.g. the Just Eat API response, or the evidence-URL stub for
 * Deliveroo/Uber). Returns the written file path.
 */
export function stagePlatformRaw(
  runId: string,
  platform: PlatformName | string,
  area: string,
  payload: unknown
): string {
  const dir = platformRawDir(runId);
  ensureDir(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${safeToken(String(platform))}-${safeToken(area)}-${ts}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { runId, platform, area, staged_at: new Date().toISOString(), payload },
      null,
      2
    )
  );
  return file;
}

/**
 * Stage the full set of normalised PlatformRecords for a run. Overwrites the
 * single normalised.json file. Returns the written file path.
 */
export function stagePlatformNormalised(runId: string, records: PlatformRecord[]): string {
  const dir = platformStagedDir(runId);
  ensureDir(dir);
  const file = path.join(dir, "normalised.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      { runId, staged_at: new Date().toISOString(), count: records.length, records },
      null,
      2
    )
  );
  return file;
}

/** Read back staged normalised records (empty array if none). */
export function loadStagedPlatformNormalised(runId: string): PlatformRecord[] {
  try {
    const file = path.join(platformStagedDir(runId), "normalised.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { records?: PlatformRecord[] };
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}
