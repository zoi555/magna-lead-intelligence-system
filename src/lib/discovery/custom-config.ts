// Run-builder custom-configuration logic — business-type search, run-specific custom
// business types, and advanced custom requested fields. Pure + testable; no UI, no I/O.

import {
  BusinessTypeOption, TargetProfile, standardBusinessTypeOptions, CustomRequestedField,
  CUSTOM_FIELD_DATA_TYPES, CUSTOM_FIELD_SOURCES, CUSTOM_FIELD_VISIBILITY, CUSTOM_FIELD_EXPORT,
} from "./target-profile";

/* ---------- business-type search ---------- */

export interface BusinessTypeGroup { group: string; items: BusinessTypeOption[] }

/** All selectable business types for a profile = standard taxonomy + its custom types. */
export function allBusinessTypeOptions(profile: TargetProfile): BusinessTypeOption[] {
  return [...standardBusinessTypeOptions(), ...(profile.customBusinessTypes || [])];
}

/** Case-insensitive, partial-word search over display names; grouped; empty groups hidden.
 *  Empty/whitespace query returns the full grouped taxonomy. Selections are unaffected. */
export function searchBusinessTypes(query: string, options: BusinessTypeOption[]): BusinessTypeGroup[] {
  const q = query.trim().toLowerCase();
  const match = (o: BusinessTypeOption) => !q || o.label.toLowerCase().includes(q);
  const byGroup = new Map<string, BusinessTypeOption[]>();
  for (const o of options) {
    if (!match(o)) continue;
    if (!byGroup.has(o.group)) byGroup.set(o.group, []);
    byGroup.get(o.group)!.push(o);
  }
  return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
}

/* ---------- keys ---------- */

/** Stable internal key from a label: lowercase, a–z/0–9/_, must start with a letter.
 *  Diacritics are folded (é→e) so accented labels still produce clean keys. */
export function slugifyKey(label: string): string {
  const folded = label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let k = folded.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!k) k = "field";
  if (!/^[a-z]/.test(k)) k = `f_${k}`;
  return k;
}
export function validateInternalKey(key: string, existingKeys: string[]): string | null {
  if (!key.trim()) return "Internal key is required.";
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return "Internal key must be lowercase letters, numbers and underscores, starting with a letter.";
  if (existingKeys.map((k) => k.toLowerCase()).includes(key.toLowerCase())) return "Internal key already exists.";
  return null;
}

/* ---------- custom business types ---------- */

export interface AddResult<T> { profile: T; error?: string }

export function addCustomBusinessType(profile: TargetProfile, label: string): AddResult<TargetProfile> {
  const trimmed = label.trim();
  if (!trimmed) return { profile, error: "Enter a business type name." };
  const lower = trimmed.toLowerCase();
  const clash = allBusinessTypeOptions(profile).some((o) => o.label.toLowerCase() === lower);
  if (clash) return { profile, error: "A business type with this name already exists." };
  // stable, unique key
  let key = slugifyKey(trimmed);
  const taken = new Set(allBusinessTypeOptions(profile).map((o) => o.key));
  if (taken.has(key)) { let i = 2; while (taken.has(`${key}_${i}`)) i++; key = `${key}_${i}`; }
  const option: BusinessTypeOption = { id: key, key, label: trimmed, group: "Custom", source: "custom" };
  return {
    profile: {
      ...profile,
      customBusinessTypes: [...(profile.customBusinessTypes || []), option],
      businessTypes: profile.businessTypes.includes(key) ? profile.businessTypes : [...profile.businessTypes, key], // auto-select
    },
  };
}

export function removeCustomBusinessType(profile: TargetProfile, key: string): TargetProfile {
  return {
    ...profile,
    customBusinessTypes: (profile.customBusinessTypes || []).filter((o) => o.key !== key),
    businessTypes: profile.businessTypes.filter((b) => b !== key),
  };
}

/* ---------- advanced custom requested fields ---------- */

const enumIds = <T extends { id: string }>(a: T[]) => a.map((x) => x.id);

export interface CustomFieldDraft {
  label: string; internalKey: string; dataType: string; requirement: string;
  intendedSource: string; visibility: string; exportPermission: string; notes?: string; sourceNote?: string;
}
export interface CustomFieldValidation { ok: boolean; errors: Record<string, string>; summary?: string }

export function validateCustomRequestedField(f: CustomFieldDraft, existingKeys: string[]): CustomFieldValidation {
  const errors: Record<string, string> = {};
  if (!f.label.trim()) errors.label = "Label is required.";
  const keyErr = validateInternalKey(f.internalKey, existingKeys);
  if (keyErr) errors.internalKey = keyErr;
  if (!enumIds(CUSTOM_FIELD_DATA_TYPES).includes(f.dataType as never)) errors.dataType = "Select a data type.";
  if (!["required", "optional"].includes(f.requirement)) errors.requirement = "Select required or optional.";
  if (!enumIds(CUSTOM_FIELD_SOURCES).includes(f.intendedSource as never)) errors.intendedSource = "Select an intended source.";
  if (f.intendedSource === "other" && !(f.sourceNote || "").trim()) errors.sourceNote = "Describe the 'Other' source.";
  if (!enumIds(CUSTOM_FIELD_VISIBILITY).includes(f.visibility as never)) errors.visibility = "Select a visibility.";
  if (!enumIds(CUSTOM_FIELD_EXPORT).includes(f.exportPermission as never)) errors.exportPermission = "Select an export permission.";
  return { ok: Object.keys(errors).length === 0, errors, summary: Object.keys(errors).length ? "Custom requested field could not be added. Fix the highlighted fields." : undefined };
}

export function addCustomRequestedField(profile: TargetProfile, f: CustomFieldDraft): AddResult<TargetProfile> & { validation: CustomFieldValidation } {
  const existingKeys = (profile.customFields || []).map((c) => c.internalKey);
  const validation = validateCustomRequestedField(f, existingKeys);
  if (!validation.ok) return { profile, validation, error: validation.summary };
  const field: CustomRequestedField = {
    id: `cf_${f.internalKey}`,
    label: f.label.trim(), internalKey: f.internalKey.trim(),
    dataType: f.dataType as CustomRequestedField["dataType"],
    requirement: f.requirement as CustomRequestedField["requirement"],
    intendedSource: f.intendedSource as CustomRequestedField["intendedSource"],
    visibility: f.visibility as CustomRequestedField["visibility"],
    exportPermission: f.exportPermission as CustomRequestedField["exportPermission"],
    notes: f.notes?.trim() || undefined,
    sourceNote: f.intendedSource === "other" ? f.sourceNote?.trim() || undefined : undefined,
  };
  return { profile: { ...profile, customFields: [...(profile.customFields || []), field] }, validation };
}

export function removeCustomRequestedField(profile: TargetProfile, id: string): TargetProfile {
  return { ...profile, customFields: (profile.customFields || []).filter((c) => c.id !== id) };
}

export function emptyCustomFieldDraft(): CustomFieldDraft {
  return { label: "", internalKey: "", dataType: "text", requirement: "optional", intendedSource: "discovery_platform", visibility: "all_internal", exportPermission: "allowed", notes: "", sourceNote: "" };
}
