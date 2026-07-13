// Territory selection — NOW SPRINT #2 (territory addendum).
// Defines the supported postcode territory modes. The MODE decides which outcodes
// the pipeline searches. Default is `pilot` (a temporary MVP test set) so behaviour
// never silently expands to national. Set TERRITORY_MODE in .env.local to change.

export type TerritoryMode = "pilot" | "manual_outcodes" | "vp_coverage" | "full_uk_outcodes" | "custom_upload";

/** Temporary MVP test outcodes — West London pilot. NOT national, NOT VP coverage. */
export const PILOT_OUTCODES = ["UB1", "UB2", "UB6", "HA0", "HA9", "W5"] as const;

/** Accepted VP / Magna coverage import locations (first found wins). */
export const VP_COVERAGE_PATHS = [
  "imports/vp-postcodes.csv",
  "imports/magna-coverage-postcodes.csv",
  "imports/target-postcodes.csv",
  "data/imports/target-postcodes.csv",
];

/** Accepted custom-upload import locations (first found wins). */
export const CUSTOM_UPLOAD_PATHS = [
  "imports/custom-postcodes.csv",
  "imports/target-postcodes.csv",
  "data/imports/custom-postcodes.csv",
];

/** Optional national outcode source — kept OUT of git; only used if explicitly provided. */
export const FULL_UK_PATHS = [
  "imports/uk-outcodes.csv",
  "data/imports/uk-outcodes.csv",
];

export const TERRITORY_LABELS: Record<TerritoryMode, string> = {
  pilot: "West London pilot (PILOT ONLY)",
  manual_outcodes: "manual_outcodes (postcode district / outcode)",
  vp_coverage: "VP / Magna coverage",
  full_uk_outcodes: "Full UK outcodes (national)",
  custom_upload: "Custom uploaded postcode list",
};

const VALID: TerritoryMode[] = ["pilot", "manual_outcodes", "vp_coverage", "full_uk_outcodes", "custom_upload"];

/** Resolve the territory mode from env; defaults to `pilot`. */
export function getTerritoryMode(): TerritoryMode {
  const raw = (process.env.TERRITORY_MODE ?? "").trim().toLowerCase();
  return (VALID as string[]).includes(raw) ? (raw as TerritoryMode) : "pilot";
}

export function isPilotMode(mode: TerritoryMode): boolean {
  return mode === "pilot";
}
