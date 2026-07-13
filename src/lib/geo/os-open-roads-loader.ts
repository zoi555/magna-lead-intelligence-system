// OS Open Roads loader (GB road network; classified links + labels).
//
// This is a LOADER INTERFACE + safe stub. No large dataset is bundled with the repo.
// If the configured GeoJSON file exists it is parsed; otherwise a clear "data not provided"
// result is returned. This loader NEVER throws and NEVER fabricates data.
//
// Source: OS Open Roads (Ordnance Survey OpenData, OGL / OS OpenData licence).
// Expected local path (gitignored): data/geo/os-open-roads.geojson
// Override with env var OS_OPEN_ROADS_PATH.
//
// See docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md for download + licence details.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Coarse road classification used by the national map engine. */
export type RoadClass = 'motorway' | 'a_road' | 'b_road' | 'local' | 'unknown';

/** A single road link / segment. */
export interface RoadSegment {
  /** Stable identifier (OS TOID or feature id, falling back to a generated id). */
  id: string;
  /** Display name or road number, e.g. "A40", "M4", or a street name. Empty when unlabelled. */
  name: string;
  /** Coarse class used for styling and label priority. */
  roadClass: RoadClass;
  /** Ordered [longitude, latitude] pairs describing the link geometry. */
  coordinates: [number, number][];
}

/** Result envelope returned by the OS Open Roads loader. */
export interface OpenRoadsLoadResult {
  loaded: boolean;
  source: string | null;
  count: number;
  segments: RoadSegment[];
  note: string;
}

const DEFAULT_OPEN_ROADS_PATH = 'data/geo/os-open-roads.geojson';

function resolveOpenRoadsPath(path?: string): string {
  const chosen = path ?? process.env.OS_OPEN_ROADS_PATH ?? DEFAULT_OPEN_ROADS_PATH;
  return resolve(chosen);
}

/**
 * Map an OS Open Roads "class"/"function" attribute (or a road number prefix)
 * onto our coarse RoadClass. Accepts several spellings seen across OS releases.
 */
function classifyRoad(rawClass: string | undefined, roadNumber: string | undefined): RoadClass {
  const c = (rawClass ?? '').toLowerCase();
  if (c.includes('motorway')) return 'motorway';
  if (c.includes('a road') || c === 'a_road' || c === 'a-road') return 'a_road';
  if (c.includes('b road') || c === 'b_road' || c === 'b-road') return 'b_road';
  if (c.includes('local') || c.includes('minor') || c.includes('restricted') || c.includes('classified')) {
    return 'local';
  }

  // Fall back to the road number prefix, e.g. "M4" / "A40" / "B456".
  const n = (roadNumber ?? '').trim().toUpperCase();
  if (/^M\d/.test(n)) return 'motorway';
  if (/^A\d/.test(n)) return 'a_road';
  if (/^B\d/.test(n)) return 'b_road';
  return 'unknown';
}

/** Coerce a GeoJSON coordinate array into strict [lon, lat] number pairs. */
function toLineCoords(input: unknown): [number, number][] {
  if (!Array.isArray(input)) return [];
  const out: [number, number][] = [];
  for (const pair of input) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const lon = Number(pair[0]);
      const lat = Number(pair[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([lon, lat]);
    }
  }
  return out;
}

interface GeoJsonFeature {
  type?: string;
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

/**
 * Load OS Open Roads links from a GeoJSON FeatureCollection.
 *
 * Handles both LineString and MultiLineString geometries. Road class is derived from
 * common OS property names (class / function / roadClassification / roadFunction) with
 * a fallback to the road number prefix. When the file is absent or unparseable a clear
 * status is returned and NO geometry is invented.
 *
 * @param path optional explicit path; otherwise OS_OPEN_ROADS_PATH or the default is used.
 */
export function loadOpenRoads(path?: string): OpenRoadsLoadResult {
  const source = resolveOpenRoadsPath(path);

  if (!existsSync(source)) {
    return {
      loaded: false,
      source: null,
      count: 0,
      segments: [],
      note:
        `OS Open Roads data not provided. Expected GeoJSON at "${source}" ` +
        `(set OS_OPEN_ROADS_PATH or place the file under data/geo/). ` +
        `Download from OS OpenData; see docs/54_OPEN_GEOSPATIAL_DATA_SOURCES.md.`,
    };
  }

  let raw: string;
  try {
    raw = readFileSync(source, 'utf8');
  } catch (err) {
    return {
      loaded: false,
      source,
      count: 0,
      segments: [],
      note: `Failed to read OS Open Roads file at "${source}": ${(err as Error).message}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      loaded: false,
      source,
      count: 0,
      segments: [],
      note: `OS Open Roads file at "${source}" is not valid GeoJSON: ${(err as Error).message}`,
    };
  }

  const collection = parsed as { type?: string; features?: unknown };
  const features = Array.isArray(collection.features) ? (collection.features as GeoJsonFeature[]) : [];
  if (features.length === 0) {
    return {
      loaded: true,
      source,
      count: 0,
      segments: [],
      note: 'OS Open Roads GeoJSON parsed but contained no features.',
    };
  }

  const segments: RoadSegment[] = [];
  let autoId = 0;

  for (const feature of features) {
    const props = feature.properties ?? {};
    const geom = feature.geometry;
    if (!geom || !geom.type) continue;

    const rawClass =
      (props['roadClassification'] as string | undefined) ??
      (props['class'] as string | undefined) ??
      (props['function'] as string | undefined) ??
      (props['roadFunction'] as string | undefined);
    const roadNumber =
      (props['roadNumber'] as string | undefined) ??
      (props['ref'] as string | undefined) ??
      (props['classification_number'] as string | undefined);
    const name =
      (props['name1'] as string | undefined) ??
      (props['name'] as string | undefined) ??
      (props['roadName'] as string | undefined) ??
      roadNumber ??
      '';
    const roadClass = classifyRoad(rawClass, roadNumber);

    const baseId = feature.id !== undefined ? String(feature.id) : `road-${autoId}`;

    if (geom.type === 'LineString') {
      const coords = toLineCoords(geom.coordinates);
      if (coords.length >= 2) {
        segments.push({ id: baseId, name, roadClass, coordinates: coords });
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      // Explode each part into its own segment so index/bbox logic stays simple.
      geom.coordinates.forEach((part, i) => {
        const coords = toLineCoords(part);
        if (coords.length >= 2) {
          segments.push({ id: `${baseId}:${i}`, name, roadClass, coordinates: coords });
        }
      });
    }
    autoId += 1;
  }

  return {
    loaded: true,
    source,
    count: segments.length,
    segments,
    note: `Loaded ${segments.length} road segments from OS Open Roads GeoJSON.`,
  };
}
