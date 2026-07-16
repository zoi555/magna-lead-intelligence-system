// Build the Just Eat adapter config for a run from the run's derived outcodes plus the
// existing env-driven Just Eat settings (enabled flag, per-run cap, polite delay).

import { getJustEatConfig } from "@/lib/sources/just-eat";
import { deriveSearchUnits } from "@/lib/pipeline/postcode-hierarchy";
import type { AdapterConfig } from "./adapter";

/** Concrete outcodes to query from raw territory text. Area-only tokens (e.g. "UB")
 *  cannot be expanded without a geo index and are returned separately as a warning. */
export function deriveQueryOutcodes(territoryInput: string): { outcodes: string[]; unexpandableAreas: string[] } {
  const tokens = (territoryInput ?? "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const units = deriveSearchUnits(tokens);
  // districts are outcodes; sectors/units imply their outcode
  const fromDistricts = units.districts;
  const fromSectors = units.sectors.map((s) => s.split(/\s+/)[0]);
  const fromUnits = units.fullPostcodes.map((p) => p.toUpperCase().replace(/\s+/g, "").slice(0, -3));
  const outcodes = [...new Set([...fromDistricts, ...fromSectors, ...fromUnits].map((o) => o.toUpperCase()))];
  return { outcodes, unexpandableAreas: units.areas };
}

// The adapter's `outcodes` field maps to the Just Eat API path segment (bypostcode/{code});
// it is fed the run's planned postcode-district query units.
export function buildAdapterConfig(queryUnits: string[]): AdapterConfig {
  const je = getJustEatConfig();
  return { enabled: je.enabled, maxCallsPerRun: je.maxCallsPerRun, requestDelayMs: je.requestDelayMs, outcodes: queryUnits };
}
