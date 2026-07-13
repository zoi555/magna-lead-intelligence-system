// Run scope model (NEW, additive) — turns an explicit territory selection into a
// concrete, auditable RunScope the pipeline can execute against.
//
// Guiding rule: a run NEVER happens without an explicit scope, and it NEVER silently
// falls back to the pilot set. If the caller gives us nothing, or asks for a full-UK
// scan without the confirmation flag, we return an error and an empty scope.
//
// Deterministic: the caller passes `createdAt` in — we never call new Date() here, so
// the same input always produces the same scope (easy to test and to snapshot).
//
// Self-contained apart from the postcode-hierarchy helper (also new, no network).

import { deriveAreas, deriveOutcodes, deriveSearchUnits } from "./postcode-hierarchy";

export type ScopeType =
  | "postcode_area"
  | "postcode_district"
  | "postcode_sector"
  | "full_postcode"
  | "uploaded_list"
  | "custom_territory"
  | "full_uk_outcodes";

/** All seven scope types, in presentation order. */
export const SCOPE_TYPES: ScopeType[] = [
  "postcode_area",
  "postcode_district",
  "postcode_sector",
  "full_postcode",
  "uploaded_list",
  "custom_territory",
  "full_uk_outcodes",
];

/** Short human labels for each scope type. */
export const SCOPE_TYPE_LABELS: Record<ScopeType, string> = {
  postcode_area: "Postcode area (e.g. UB) — needs expansion",
  postcode_district: "Postcode district / outcode (e.g. UB1)",
  postcode_sector: "Postcode sector (e.g. UB1 1)",
  full_postcode: "Full postcode / unit (e.g. UB1 1AA)",
  uploaded_list: "Uploaded postcode list (CSV)",
  custom_territory: "Custom saved territory (mixed levels)",
  full_uk_outcodes: "Full UK outcodes (national) — guarded",
};

/** Plain-English description of what each scope type means for a run. */
export const SCOPE_TYPE_DESCRIPTIONS: Record<ScopeType, string> = {
  postcode_area:
    "The leading letters only. Broadest selection. Cannot be searched directly — each area must be expanded into its districts using the geo postcode index first (flagged with a trailing '*').",
  postcode_district:
    "A single outward code. The pipeline's natural search unit — resolves straight to one outcode.",
  postcode_sector:
    "An outcode plus the first inward digit. Narrows a district to roughly a few streets; resolves to its parent outcode for searching.",
  full_postcode:
    "A complete postcode down to the delivery point. Most precise; resolves to its outcode and sector.",
  uploaded_list:
    "A CSV of postcodes at any mix of levels. Each row is classified and bucketed; disabled rows are ignored upstream.",
  custom_territory:
    "A saved, reusable set that can mix areas, districts, sectors and full postcodes.",
  full_uk_outcodes:
    "Every UK outcode — a national scan. GUARDED: only runs when FULL_UK_SCAN_CONFIRMED=true, to protect API caps and cost.",
};

/** The concrete, auditable scope a run executes against. */
export interface RunScope {
  run_id: string;
  selected_scope_type: ScopeType;
  /** Exactly what the user selected, normalised (trimmed, non-empty). */
  selected_scope_values: string[];
  /** Areas implied by the selection (deduped). */
  derived_areas: string[];
  /** Outcodes to search. Area-only selections appear flagged as "XX*" (need expansion). */
  derived_outcodes: string[];
  /** Sectors explicitly present in the selection (deduped). */
  derived_sectors: string[];
  /** Full postcodes explicitly present in the selection (deduped). */
  full_postcodes: string[];
  /** Source CSV path, if the selection came from an upload. */
  source_file: string | null;
  /** Raw rows read from the source (before filtering). */
  raw_rows_loaded: number;
  /** Rows that were enabled / usable. */
  enabled_rows_loaded: number;
  /** Free-text operator notes for the audit trail. */
  user_notes: string;
  /** Caller-supplied ISO timestamp (never generated here). */
  created_at: string;
}

/** Input to buildRunScope. Only scope type, values, run_id and createdAt are required. */
export interface BuildRunScopeInput {
  run_id: string;
  selected_scope_type: ScopeType;
  selected_scope_values: string[];
  createdAt: string;
  source_file?: string | null;
  raw_rows_loaded?: number;
  enabled_rows_loaded?: number;
  user_notes?: string;
}

function emptyScope(input: BuildRunScopeInput, values: string[]): RunScope {
  return {
    run_id: input.run_id,
    selected_scope_type: input.selected_scope_type,
    selected_scope_values: values,
    derived_areas: [],
    derived_outcodes: [],
    derived_sectors: [],
    full_postcodes: [],
    source_file: input.source_file ?? null,
    raw_rows_loaded: input.raw_rows_loaded ?? 0,
    enabled_rows_loaded: input.enabled_rows_loaded ?? 0,
    user_notes: input.user_notes ?? "",
    created_at: input.createdAt,
  };
}

/**
 * Build a RunScope from an explicit selection.
 *
 * Guards (in order):
 *   1. No values at all → error "No territory selected". No run.
 *   2. full_uk_outcodes without env FULL_UK_SCAN_CONFIRMED=true →
 *      error "Full UK scan requires FULL_UK_SCAN_CONFIRMED=true". No run.
 * Neither guard ever falls back to the pilot set — on error the returned scope has
 * empty derived arrays so nothing can be searched by accident.
 */
export function buildRunScope(input: BuildRunScopeInput): { scope: RunScope; error?: string } {
  const values = (input.selected_scope_values ?? []).map((v) => v.trim()).filter((v) => v !== "");

  // Guard 1: an explicit scope is mandatory.
  if (values.length === 0) {
    return { scope: emptyScope(input, values), error: "No territory selected" };
  }

  // Guard 2: a national scan requires explicit confirmation.
  if (input.selected_scope_type === "full_uk_outcodes") {
    const confirmed = (process.env.FULL_UK_SCAN_CONFIRMED ?? "").trim().toLowerCase() === "true";
    if (!confirmed) {
      return { scope: emptyScope(input, values), error: "Full UK scan requires FULL_UK_SCAN_CONFIRMED=true" };
    }
  }

  const units = deriveSearchUnits(values);
  const scope: RunScope = {
    run_id: input.run_id,
    selected_scope_type: input.selected_scope_type,
    selected_scope_values: values,
    derived_areas: deriveAreas(values),
    derived_outcodes: deriveOutcodes(values),
    derived_sectors: units.sectors,
    full_postcodes: units.fullPostcodes,
    source_file: input.source_file ?? null,
    raw_rows_loaded: input.raw_rows_loaded ?? 0,
    enabled_rows_loaded: input.enabled_rows_loaded ?? 0,
    user_notes: input.user_notes ?? "",
    created_at: input.createdAt,
  };
  return { scope };
}
