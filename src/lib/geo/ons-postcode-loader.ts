// ONSPD / NSPL loader (postcode -> admin & geographic codes, region / LA / ward, live or terminated).
//
// This is a LOADER INTERFACE + safe stub. No large dataset is bundled with the repo.
// If the configured CSV file exists it is parsed; otherwise a clear "data not provided"
// result is returned. This loader NEVER throws and NEVER fabricates data.
//
// Source: ONS Postcode Directory (ONSPD) or National Statistics Postcode Lookup (NSPL),
// published by the Office for National Statistics under the Open Government Licence (OGL).
// Expected local path (gitignored): data/geo/onspd.csv
// Override with env var ONSPD_PATH.
//
// See docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md for download + licence details.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A single postcode row derived from ONSPD / NSPL. */
export interface OnsPostcodeRecord {
  /** Normalised postcode, e.g. "HA0 1AB" (single space between outcode and incode). */
  postcode: string;
  /** Outward code (the part before the space), e.g. "HA0". */
  outcode: string;
  /** WGS84 latitude in decimal degrees (NaN when not supplied). */
  latitude: number;
  /** WGS84 longitude in decimal degrees (NaN when not supplied). */
  longitude: number;
  /** Local authority district name (or GSS code when only the code is present). */
  localAuthority: string;
  /** Region / country name (or GSS code when only the code is present). */
  region: string;
  /** Electoral ward name (or GSS code when only the code is present). */
  ward: string;
  /** True when the postcode has been terminated (ONSPD "doterm" is populated). */
  terminated: boolean;
}

/** Result envelope returned by the ONSPD loader. */
export interface OnspdLoadResult {
  loaded: boolean;
  source: string | null;
  count: number;
  records: OnsPostcodeRecord[];
  note: string;
}

const DEFAULT_ONSPD_PATH = 'data/geo/onspd.csv';

function resolveOnspdPath(path?: string): string {
  const chosen = path ?? process.env.ONSPD_PATH ?? DEFAULT_ONSPD_PATH;
  return resolve(chosen);
}

/** Normalise a raw postcode into "OUTCODE INCODE" form (uppercase, single space). */
function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) return compact;
  const incode = compact.slice(-3);
  const outcode = compact.slice(0, -3);
  return `${outcode} ${incode}`;
}

/** Extract the outward code (text before the space) from a normalised postcode. */
function outcodeOf(normalised: string): string {
  const space = normalised.indexOf(' ');
  return space > 0 ? normalised.slice(0, space) : normalised;
}

/** Split a CSV line honouring simple double-quoted fields. */
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
 * Find the first present column index from a list of candidate header names.
 * ONSPD uses short codes (pcds, lat, long, doterm, oslaua, rgn, osward); NSPL differs
 * slightly, so several aliases are accepted.
 */
function pickColumn(header: string[], candidates: string[]): number {
  for (const name of candidates) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Load ONSPD / NSPL postcode records.
 *
 * A header row is required (ONSPD and NSPL both ship one). Column names are matched
 * case-insensitively against the known ONSPD/NSPL aliases. Rows with a populated
 * termination date ("doterm") are flagged terminated. Coordinates are read from
 * "lat"/"long" when present (these products already supply WGS84 degrees).
 *
 * @param path optional explicit path; otherwise ONSPD_PATH or the default is used.
 */
export function loadOnspd(path?: string): OnspdLoadResult {
  const source = resolveOnspdPath(path);

  if (!existsSync(source)) {
    return {
      loaded: false,
      source: null,
      count: 0,
      records: [],
      note:
        `ONSPD/NSPL data not provided. Expected a CSV at "${source}" ` +
        `(set ONSPD_PATH or place the file under data/geo/). ` +
        `Download from the ONS Open Geography Portal; see docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md.`,
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
      note: `Failed to read ONSPD/NSPL file at "${source}": ${(err as Error).message}`,
    };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { loaded: true, source, count: 0, records: [], note: 'ONSPD/NSPL file is empty.' };
  }

  const header = splitCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
  const pcCol = pickColumn(header, ['pcds', 'pcd', 'postcode']);
  if (pcCol < 0) {
    return {
      loaded: false,
      source,
      count: 0,
      records: [],
      note: `ONSPD/NSPL file at "${source}" has no recognisable postcode column (expected pcds/pcd/postcode).`,
    };
  }

  const latCol = pickColumn(header, ['lat', 'latitude']);
  const lonCol = pickColumn(header, ['long', 'lon', 'longitude']);
  const dotermCol = pickColumn(header, ['doterm', 'terminated']);
  const laCol = pickColumn(header, ['laua', 'oslaua', 'localauthority', 'local_authority']);
  const rgnCol = pickColumn(header, ['rgn', 'gor', 'region']);
  const wardCol = pickColumn(header, ['ward', 'osward']);

  const records: OnsPostcodeRecord[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (!cols[pcCol] || cols[pcCol].trim().length === 0) continue;

    const postcode = normalisePostcode(cols[pcCol]);
    const outcode = outcodeOf(postcode);
    const latitude = latCol >= 0 ? Number(cols[latCol]) : Number.NaN;
    const longitude = lonCol >= 0 ? Number(cols[lonCol]) : Number.NaN;
    const terminated = dotermCol >= 0 ? (cols[dotermCol]?.trim().length ?? 0) > 0 : false;

    records.push({
      postcode,
      outcode,
      latitude,
      longitude,
      localAuthority: laCol >= 0 ? (cols[laCol]?.trim() ?? '') : '',
      region: rgnCol >= 0 ? (cols[rgnCol]?.trim() ?? '') : '',
      ward: wardCol >= 0 ? (cols[wardCol]?.trim() ?? '') : '',
      terminated,
    });
  }

  const live = records.filter((r) => !r.terminated).length;
  return {
    loaded: true,
    source,
    count: records.length,
    records,
    note: `Loaded ${records.length} ONSPD/NSPL records (${live} live, ${records.length - live} terminated).`,
  };
}
