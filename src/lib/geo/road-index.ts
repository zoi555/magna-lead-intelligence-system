// In-memory road index built from OS Open Roads segments.
//
// The map engine needs roads grouped by class (so A-roads and motorways can be styled
// and labelled with priority) and a way to fetch roads within a viewport bounding box.
// This module is pure (no I/O); feed it the segments from os-open-roads-loader.ts.

import type { RoadClass, RoadSegment } from './os-open-roads-loader';

/** Geographic bounding box in WGS84 degrees: [minLon, minLat, maxLon, maxLat]. */
export type BBox = [number, number, number, number];

/** The built road index plus its query helpers. */
export interface RoadIndex {
  /** All segments, unmodified. */
  all: RoadSegment[];
  /** Segments grouped by coarse class (motorway / a_road / b_road / local / unknown). */
  byClass: Map<RoadClass, RoadSegment[]>;
  /** Convenience: every A-road segment. */
  aRoads(): RoadSegment[];
  /** Convenience: every motorway segment. */
  motorways(): RoadSegment[];
  /**
   * Segments whose geometry intersects the given bounding box.
   * STUB: currently a simple vertex-in-box test (a segment is included if any of its
   * points fall inside the bbox). A future implementation should test segment/box edge
   * intersection so links that cross the box without a vertex inside are also returned.
   */
  roadsInBBox(bbox: BBox): RoadSegment[];
}

/** True when point [lon, lat] lies within (or on) the bounding box. */
function pointInBBox(lon: number, lat: number, bbox: BBox): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/** Build the road index and its class buckets. */
export function buildRoadIndex(segments: RoadSegment[]): RoadIndex {
  const byClass = new Map<RoadClass, RoadSegment[]>();
  for (const segment of segments) {
    const bucket = byClass.get(segment.roadClass);
    if (bucket) bucket.push(segment);
    else byClass.set(segment.roadClass, [segment]);
  }

  const aRoads = (): RoadSegment[] => byClass.get('a_road') ?? [];
  const motorways = (): RoadSegment[] => byClass.get('motorway') ?? [];

  const roadsInBBox = (bbox: BBox): RoadSegment[] =>
    segments.filter((seg) => seg.coordinates.some(([lon, lat]) => pointInBBox(lon, lat, bbox)));

  return { all: segments, byClass, aRoads, motorways, roadsInBBox };
}
