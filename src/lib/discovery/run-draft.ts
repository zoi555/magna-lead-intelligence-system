// Discovery run draft — canonical, database-ready shape + validation + recovery.
//
// This is the single object the Discovery Run Builder first screen produces. The
// field names + nesting are chosen to map 1:1 onto a future `discovery_runs` table
// (see docs/03_DATA_MODEL) so persistence is a straight insert. Drafts are recovered
// from localStorage; nothing is written to a database on the first screen.

import { TargetProfile, defaultIndependentFoodserviceProfile, CustomRequestedField } from "./target-profile";
import { slugifyKey } from "./custom-config";

export const CURRENT_SCHEMA_VERSION = 2 as const;

export interface RunTerritory {
  mode: "pilot" | "manual_outcodes" | "vp_coverage" | "full_uk" | "custom";
  input: string;            // raw pasted postcodes / outcodes
  surrounding: "context" | "include" | "exclude";
  locationRule: "require" | "prefer" | "off";
}

export interface RunDraft {
  schemaVersion: 2;
  id: string;               // client-generated draft id (uuid-like)
  name: string;             // run identity
  reference: string;        // human reference / code
  objective: string;        // free text
  createdAtIso: string | null;
  territory: RunTerritory;
  profile: TargetProfile;   // target profile (taxonomies + terms + fields + tags)
  status: "draft";
}

export function newRunDraft(idSeed: string, nowIso: string | null, defaultName = ""): RunDraft {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: `run_${idSeed}`,
    name: defaultName,
    reference: "",
    objective: "",
    createdAtIso: nowIso,
    territory: { mode: "manual_outcodes", input: "", surrounding: "context", locationRule: "require" },
    profile: defaultIndependentFoodserviceProfile(),
    status: "draft",
  };
}

/** A friendly, editable default run name, e.g. "Discovery run — 14 Jul 2026". */
export function generateDefaultRunName(now: Date): string {
  const d = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `Discovery run — ${d}`;
}

/** Reset the target profile (and its taxonomies/exclusions/fields) to the Independent
 *  Foodservice recommended defaults, leaving identity + territory untouched. */
export function resetProfileToDefaults(d: RunDraft): RunDraft {
  return { ...d, profile: defaultIndependentFoodserviceProfile() };
}

export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[] }

export function validateRunDraft(d: RunDraft): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.name.trim()) errors.push("Run name is required.");
  if (!d.territory.input.trim() && d.territory.mode !== "full_uk") errors.push("Territory: enter at least one postcode area/outcode, or choose Full UK.");
  if (!d.profile.businessTypes.length) errors.push("Target profile: select at least one business type.");
  if (!d.profile.dataFields.length) errors.push("Requested data: select at least one field to collect.");
  if (!d.profile.serviceModels.length) warnings.push("No service models selected — all will be included.");
  if (!d.profile.ownership.length) warnings.push("No ownership types selected — independence filtering is off.");
  if (!d.profile.exclusions.length) warnings.push("No exclusions selected — national chains will not be filtered out.");
  if (d.profile.cuisines.length === 0) warnings.push("No cuisine filter — all cuisines will be included (usually intended).");
  return { ok: errors.length === 0, errors, warnings };
}

/** Human-readable live configuration summary. */
export function summariseRunDraft(d: RunDraft): { label: string; value: string }[] {
  const p = d.profile;
  return [
    { label: "Run", value: d.name || "(unnamed)" },
    { label: "Reference", value: d.reference || "—" },
    { label: "Territory", value: `${d.territory.mode} · ${d.territory.input || (d.territory.mode === "full_uk" ? "Great Britain" : "—")}` },
    { label: "Business types", value: `${p.businessTypes.length} selected` },
    { label: "Cuisines", value: p.cuisines.length ? `${p.cuisines.length} selected` : "all" },
    { label: "Service models", value: p.serviceModels.length ? `${p.serviceModels.length} selected` : "all" },
    { label: "Ownership", value: p.ownership.length ? `${p.ownership.length} selected` : "any" },
    { label: "Exclusions", value: `${p.exclusions.length} active` },
    { label: "Include terms", value: p.includeTerms.length ? p.includeTerms.join(", ") : "—" },
    { label: "Exclude terms", value: p.excludeTerms.length ? p.excludeTerms.join(", ") : "—" },
    { label: "Data fields", value: `${p.dataFields.length} collected` },
    { label: "Custom business types", value: (p.customBusinessTypes?.length ?? 0) ? String(p.customBusinessTypes.length) : "—" },
    { label: "Custom fields", value: (p.customFields?.length ?? 0) ? String(p.customFields.length) : "—" },
    { label: "Result tags", value: p.tags.length ? `${p.tags.length}` : "—" },
  ];
}

/**
 * Migrate any persisted draft to the current schema. v1 drafts (no customBusinessTypes,
 * and customFields as {id,label}) are upgraded without data loss; v2 is validated for the
 * new arrays; unknown/malformed input returns null so the caller starts fresh (no crash).
 */
export function migrateDraft(raw: unknown): RunDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, any>;
  if (d.schemaVersion !== 1 && d.schemaVersion !== 2) return null;
  if (!d.profile || typeof d.profile !== "object" || !d.territory) return null;
  const profile = d.profile as Record<string, any>;
  // ensure new arrays exist and are the right shape
  if (!Array.isArray(profile.customBusinessTypes)) profile.customBusinessTypes = [];
  if (d.schemaVersion === 1) {
    // v1 customFields were { id, label } — upgrade to full CustomRequestedField with safe defaults
    const old = Array.isArray(profile.customFields) ? profile.customFields : [];
    profile.customFields = old.map((c: any): CustomRequestedField => ({
      id: c.id || `cf_${slugifyKey(c.label || "field")}`,
      label: String(c.label ?? c.id ?? "Custom field"),
      internalKey: slugifyKey(String(c.label ?? c.id ?? "field")),
      dataType: "text", requirement: "optional", intendedSource: "manual",
      visibility: "all_internal", exportPermission: "allowed",
    }));
  } else if (!Array.isArray(profile.customFields)) {
    profile.customFields = [];
  }
  d.schemaVersion = CURRENT_SCHEMA_VERSION;
  return d as RunDraft;
}

// ---- persistence / draft recovery ----
const KEY = "aspectlead.run-draft.v1"; // storage key name is historical; content carries schemaVersion
export function saveRunDraft(d: RunDraft): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore quota */ }
}
export function loadRunDraft(): RunDraft | null {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(KEY); if (!raw) return null; return migrateDraft(JSON.parse(raw)); } catch { return null; }
}
export function clearRunDraft(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
