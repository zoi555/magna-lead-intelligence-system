// Postcode source resolver — NOW SPRINT #2 (territory addendum).
// Resolves the set of target OUTCODES the pipeline searches, based on the territory
// mode. Loads VP / custom postcode lists from CSV (flexible columns), derives an
// outcode from a full postcode, dedupes, ignores disabled rows, and keeps
// route/sales_rep/priority metadata for exports.
//
// Safety: full_uk_outcodes mode is IMPLEMENTED but only reads an explicitly-provided
// national outcode file — it never auto-generates a national scan, so it can't
// blindly hammer Just Eat / FSA / Companies House.

import fs from "node:fs";
import path from "node:path";
import {
  type TerritoryMode, PILOT_OUTCODES, VP_COVERAGE_PATHS, CUSTOM_UPLOAD_PATHS, FULL_UK_PATHS, TERRITORY_LABELS,
} from "@/config/territory-config";

export interface TargetOutcode {
  outcode: string;
  route?: string;
  salesRep?: string;
  priority?: string;
  area?: string;
  region?: string;
  notes?: string;
}

export interface PostcodeSourceResult {
  mode: TerritoryMode;
  label: string;
  loaded: boolean; // was a source file successfully loaded (false for pilot / missing file)
  sourceFile: string | null;
  rawRows: number; // raw postcode rows read from the file
  outcodes: string[]; // unique, uppercased outcodes to search
  targets: TargetOutcode[]; // per-outcode metadata (first occurrence wins)
  isPilotOnly: boolean;
  warning: string | null;
  note: string;
}

// --- minimal CSV parser (quoted fields, commas, newlines) ---
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function pick(r: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (r[k]) return r[k];
  return "";
}

/** Derive an outward code from a full postcode, a district, or a bare outcode. */
export function deriveOutcode(row: Record<string, string>): string {
  const explicit = pick(row, "outcode", "postcode_district", "district");
  if (explicit) return normaliseOutcode(explicit);
  const full = pick(row, "postcode", "post_code", "zip", "billing_zip");
  if (full) return normaliseOutcode(outwardFromPostcode(full));
  return "";
}

function outwardFromPostcode(pc: string): string {
  const p = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  // Full UK postcode ends in <digit><2 letters>; strip that inward part.
  return p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(0, p.length - 3) : p;
}

function normaliseOutcode(s: string): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function firstExisting(paths: string[]): string | null {
  for (const rel of paths) {
    if (fs.existsSync(path.join(process.cwd(), rel))) return rel;
  }
  return null;
}

function loadFromFile(rel: string): { rawRows: number; targets: TargetOutcode[] } {
  const rows = parseCsv(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  const seen = new Set<string>();
  const targets: TargetOutcode[] = [];
  for (const r of rows) {
    // Ignore disabled rows.
    const enabled = pick(r, "enabled");
    if (enabled && /^(no|false|0|n|disabled)$/i.test(enabled)) continue;
    const outcode = deriveOutcode(r);
    if (!outcode || seen.has(outcode)) continue;
    seen.add(outcode);
    targets.push({
      outcode,
      route: pick(r, "route") || undefined,
      salesRep: pick(r, "sales_rep", "rep") || undefined,
      priority: pick(r, "priority") || undefined,
      area: pick(r, "area") || undefined,
      region: pick(r, "region") || undefined,
      notes: pick(r, "notes") || undefined,
    });
  }
  return { rawRows: rows.length, targets };
}

function pilotResult(mode: TerritoryMode, warning: string | null, note: string): PostcodeSourceResult {
  return {
    mode, label: TERRITORY_LABELS[mode], loaded: false, sourceFile: null,
    rawRows: 0, outcodes: [...PILOT_OUTCODES], targets: PILOT_OUTCODES.map((o) => ({ outcode: o })),
    isPilotOnly: true, warning, note,
  };
}

/** Resolve the target outcodes for a territory mode. Never runs a national scan by itself. */
export function loadTargetOutcodes(mode: TerritoryMode): PostcodeSourceResult {
  if (mode === "pilot") {
    return pilotResult("pilot", "THIS RUN IS PILOT ONLY — NOT NATIONAL / NOT VP COVERAGE", "Pilot MVP test outcodes.");
  }

  if (mode === "manual_outcodes") {
    // Explicitly selected outcodes via env MANUAL_OUTCODES (comma/space separated).
    const raw = (process.env.MANUAL_OUTCODES ?? "").split(/[,\s]+/).map((s) => normaliseOutcode(s)).filter(Boolean);
    const outcodes = [...new Set(raw)];
    if (!outcodes.length) {
      return { mode, label: TERRITORY_LABELS.manual_outcodes, loaded: false, sourceFile: null, rawRows: 0, outcodes: [], targets: [], isPilotOnly: false, warning: "manual_outcodes selected but MANUAL_OUTCODES env is empty — no run.", note: "No manual outcodes provided." };
    }
    return {
      mode, label: TERRITORY_LABELS.manual_outcodes, loaded: true, sourceFile: "env:MANUAL_OUTCODES",
      rawRows: raw.length, outcodes, targets: outcodes.map((o) => ({ outcode: o })), isPilotOnly: false, warning: null,
      note: `${outcodes.length} manually-selected outcodes (postcode district / outcode level).`,
    };
  }

  if (mode === "vp_coverage" || mode === "custom_upload") {
    const paths = mode === "vp_coverage" ? VP_COVERAGE_PATHS : CUSTOM_UPLOAD_PATHS;
    const file = firstExisting(paths);
    if (!file) {
      return pilotResult(mode, `${TERRITORY_LABELS[mode]} selected but no import file found (${paths.join(", ")}) — FELL BACK TO PILOT ONLY.`, "No postcode import found — using pilot outcodes.");
    }
    const { rawRows, targets } = loadFromFile(file);
    if (!targets.length) {
      return pilotResult(mode, `${file} loaded but produced no usable outcodes — FELL BACK TO PILOT ONLY.`, "Empty/invalid postcode import — using pilot outcodes.");
    }
    return {
      mode, label: TERRITORY_LABELS[mode], loaded: true, sourceFile: file, rawRows,
      outcodes: targets.map((t) => t.outcode), targets, isPilotOnly: false, warning: null,
      note: `${targets.length} unique outcodes from ${file}.`,
    };
  }

  // full_uk_outcodes — implemented but intentionally NOT auto-generated. Requires an
  // explicit national outcode file so we never blind-scan the whole country.
  const file = firstExisting(FULL_UK_PATHS);
  if (!file) {
    return {
      mode: "full_uk_outcodes", label: TERRITORY_LABELS.full_uk_outcodes, loaded: false, sourceFile: null,
      rawRows: 0, outcodes: [], targets: [], isPilotOnly: false,
      warning: "FULL UK MODE IS IMPLEMENTED BUT NOT POPULATED — provide imports/uk-outcodes.csv to run a national scan (batched/cached/resumable). No outcodes searched.",
      note: "National mode structure present; no national scan run.",
    };
  }
  const { rawRows, targets } = loadFromFile(file);
  return {
    mode: "full_uk_outcodes", label: TERRITORY_LABELS.full_uk_outcodes, loaded: true, sourceFile: file, rawRows,
    outcodes: targets.map((t) => t.outcode), targets, isPilotOnly: false,
    warning: "FULL UK / NATIONAL scan — ensure API caps and batching are configured before running.",
    note: `${targets.length} national outcodes from ${file}.`,
  };
}
