// Registers the PMTiles protocol with a MapLibre global exactly once.
// MapLibre is provided by the host (window.maplibregl); pmtiles is a peer dependency.
import { Protocol } from "pmtiles";

export function registerPmtilesProtocol(maplibregl: { addProtocol: (n: string, fn: unknown) => void; __pmtilesRegistered?: boolean }): void {
  if (maplibregl.__pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile as unknown as (n: string, fn: unknown) => void);
  maplibregl.__pmtilesRegistered = true;
}
