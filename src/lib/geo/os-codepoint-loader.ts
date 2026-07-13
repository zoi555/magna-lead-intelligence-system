// OS Code-Point Open loader (GB postcode units -> coordinates + positional quality + admin codes).
//
// This is a LOADER INTERFACE + safe stub. No large dataset is bundled with the repo.
// If the configured CSV file exists it is parsed; otherwise a clear "data not provided"
// result is returned. This loader NEVER throws and NEVER fabricates data.
//
// Source: OS Code-Point Open (Ordnance Survey OpenData, OGL / OS OpenData licence).
// Expected local path (gitignored): data/geo/codepoint-open.csv
// Override with env var OS_CODEPOINT_PATH.
//
// See docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md for download + licence details.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A single GB postcode unit as published by OS Code-Point Open. */
export interface CodePointRecord {
  /** Normalised postcode, e.g. "HA0 1AB" (single space between outcode and incode). */
  postcode: string;
  /** WGS84 latitude in decimal degrees. */
  latitude: number;
  /** WGS84 longitude in decimal degrees. */
  longitude: number;
  /**
   * Positional quality indicator (OS PQI, 10-90). Lower is more precise.
   * 10 = within the building, 90 = imprecise / no exact match. Null if unknown.
   */
  positionalQuality: number | null;
  /**
   * Administrative area GSS codes attached to the unit
   * (e.g. { adminCountyCode, adminDistrictCode, adminWardCode }).
   */
  adminCodes: Record<string, string>;
}

/** Result envelope returned by every geo loader in this module. */
export interface CodePointLoadResult {
  /** True only when a file was found AND at least parsed without a fatal error. */
  loaded: boolean;
  /** Absolute path that was read, or null when no data file was present. */
  source: string | null;
  /** Number of records parsed. */
  count: number;
  /** Parsed records (empty when no data is provided). */
  records: CodePointRecord[];
  /** Human-readable status, always populated. */
  note: string;
}

const DEFAULT_CODEPOINT_PATH = 'data/geo/codepoint-open.csv';

/**
 * Resolve the Code-Point CSV path from (in order): explicit arg, OS_CODEPOINT_PATH env,
 * then the default under data/geo/. Relative paths resolve against process.cwd().
 */
function resolveCodePointPath(path?: string): string {
  const chosen = path ?? process.env.OS_CODEPOINT_PATH ?? DEFAULT_CODEPOINT_PATH;
  return resolve(chosen);
}

/**
 * Normalise a raw postcode into "OUTCODE INCODE" form (uppercase, single space).
 * OS publishes postcodes as a fixed-width 7-char field, e.g. "HA0 1AB" or "HA01AB".
 */
function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) return compact; // too short to split confidently
  const incode = compact.slice(-3);
  const outcode = compact.slice(0, -3);
  return `${outcode} ${incode}`;
}

/**
 * Parse one CSV line into fields, honouring simple double-quoted values.
 * OS Code-Point Open is plain comma-separated with no embedded commas in the
 * fields we use, but we handle quotes defensively.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Load OS Code-Point Open records.
 *
 * Expected CSV shape (OS "CSV" product, header-less by default):
 *   Postcode, PositionalQuality, Eastings, Northings, ... , AdminCounty, AdminDistrict, AdminWard, ...
 *
 * Because the OS distribution is projected in British National Grid (Eastings/Northings)
 * NOT WGS84, this stub only extracts latitude/longitude when columns literally named
 * "latitude"/"longitude" are present in a header row. When a header row is absent or the
 * file supplies eastings/northings, coordinates are left as NaN and flagged in the note so
 * that a downstream reprojection step (not bundled here) can be applied. No coordinate is
 * ever invented.
 *
 * @param path optional explicit path; otherwise OS_CODEPOINT_PATH or the default is used.
 */
export function loadCodePoint(path?: string): CodePointLoadResult {
  const source = resolveCodePointPath(path);

  if (!existsSync(source)) {
    return {
      loaded: false,
      source: null,
      count: 0,
      records: [],
      note:
        `Code-Point Open data not provided. Expected a CSV at "${source}" ` +
        `(set OS_CODEPOINT_PATH or place the file under data/geo/). ` +
        `Download from OS OpenData; see docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md.`,
    };
  }

  let text: string;
  try {
    text = readFileSync(source, 'utf8');
  } catch (err) {
    return {
      loaded: false,
      source,
      count: 0,
      records: [],
      note: `Failed to read Code-Point Open file at "${source}": ${(err as Error).message}`,
    };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { loaded: true, source, count: 0, records: [], note: 'Code-Point Open file is empty.' };
  }

  // Detect an optional header row so we can locate lat/lon columns by name.
  const firstCols = splitCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
  const hasHeader = firstCols.some((c) => c === 'postcode' || c === 'latitude' || c === 'longitude');
  const header = hasHeader ? firstCols : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const idx = (name: string): number => (header ? header.indexOf(name) : -1);
  const latCol = idx('latitude');
  const lonCol = idx('longitude');
  const pqCol = header ? Math.max(idx('positional_quality'), idx('positionalquality'), idx('pqi')) : 1;

  const records: CodePointRecord[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    if (cols.length === 0 || cols[0].trim().length === 0) continue;

    const postcode = normalisePostcode(cols[0]);
    const latitude = latCol >= 0 ? Number(cols[latCol]) : Number.NaN;
    const longitude = lonCol >= 0 ? Number(cols[lonCol]) : Number.NaN;

    const pqRaw = pqCol >= 0 ? cols[pqCol] : undefined;
    const pqNum = pqRaw !== undefined ? Number(pqRaw) : Number.NaN;
    const positionalQuality = Number.isFinite(pqNum) ? pqNum : null;

    // Preserve any header-named admin* columns as GSS codes.
    const adminCodes: Record<string, string> = {};
    if (header) {
      for (let i = 0; i < header.length; i += 1) {
        if (header[i].startsWith('admin') && cols[i] && cols[i].trim().length > 0) {
          adminCodes[header[i]] = cols[i].trim();
        }
      }
    }

    records.push({ postcode, latitude, longitude, positionalQuality, adminCodes });
  }

  const missingCoords = records.filter((r) => !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)).length;
  const note =
    missingCoords > 0
      ? `Loaded ${records.length} Code-Point records; ${missingCoords} have no WGS84 lat/lon ` +
        `(OS ships British National Grid eastings/northings — a reprojection step is required, not bundled here).`
      : `Loaded ${records.length} Code-Point records with WGS84 coordinates.`;

  return { loaded: true, source, count: records.length, records, note };
}
