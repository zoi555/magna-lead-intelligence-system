// Run-builder custom-configuration assertions — npm run test:custom-config
import { defaultIndependentFoodserviceProfile, standardBusinessTypeOptions } from "../src/lib/discovery/target-profile";
import {
  searchBusinessTypes, allBusinessTypeOptions, addCustomBusinessType, removeCustomBusinessType,
  slugifyKey, validateInternalKey, addCustomRequestedField, removeCustomRequestedField, emptyCustomFieldDraft,
  validateCustomRequestedField,
} from "../src/lib/discovery/custom-config";
import { migrateDraft, newRunDraft, CURRENT_SCHEMA_VERSION } from "../src/lib/discovery/run-draft";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

console.log("Custom-config checks:");

/* ---- business-type search ---- */
const std = standardBusinessTypeOptions();
const chicken = searchBusinessTypes("chicken", std);
assert(chicken.some((g) => g.items.some((i) => /chicken/i.test(i.label))), "search 'chicken' finds Chicken shop");
assert(searchBusinessTypes("CHICKEN", std).length === searchBusinessTypes("chicken", std).length, "search is case-insensitive");
assert(searchBusinessTypes("caf", std).some((g) => g.items.some((i) => /café/i.test(i.label))), "partial 'caf' matches Café");
const empt = searchBusinessTypes("zzznotreal", std);
assert(empt.length === 0, "no matches → no groups (empty groups hidden)");
assert(searchBusinessTypes("pizza", std).every((g) => g.items.length > 0), "returned groups are non-empty");
assert(searchBusinessTypes("", std).length >= 5, "empty query restores the full grouped taxonomy");

/* ---- custom business types ---- */
let prof = defaultIndependentFoodserviceProfile();
const before = prof.businessTypes.length;
let r = addCustomBusinessType(prof, "  Poké bar  ");
assert(!r.error && r.profile.customBusinessTypes.length === 1, "custom business type added (trimmed)");
assert(r.profile.customBusinessTypes[0].source === "custom" && r.profile.customBusinessTypes[0].key === "poke_bar", "stable key generated; marked custom");
assert(r.profile.businessTypes.includes("poke_bar") && r.profile.businessTypes.length === before + 1, "custom type auto-selected");
prof = r.profile;
assert(addCustomBusinessType(prof, "  ").error != null, "blank custom type rejected");
assert(addCustomBusinessType(prof, "POKÉ BAR").error != null, "case-insensitive duplicate custom type rejected");
assert(addCustomBusinessType(prof, "Takeaway").error != null, "duplicate of a standard type rejected");
assert(allBusinessTypeOptions(prof).some((o) => o.key === "poke_bar"), "custom type appears in combined options");
prof = removeCustomBusinessType(prof, "poke_bar");
assert(prof.customBusinessTypes.length === 0 && !prof.businessTypes.includes("poke_bar"), "custom type removed from definitions AND selection");

/* ---- internal keys ---- */
assert(slugifyKey("Number of Branches!") === "number_of_branches", "slugify makes a clean key");
assert(slugifyKey("3 sites").startsWith("f_"), "key starting with a digit is prefixed to start with a letter");
assert(validateInternalKey("bad key", []) != null, "spaces rejected in internal key");
assert(validateInternalKey("Good_Key", []) != null, "uppercase rejected in internal key");
assert(validateInternalKey("good_key", ["good_key"]) != null, "duplicate internal key rejected");
assert(validateInternalKey("good_key", ["other"]) === null, "valid unique key accepted");

/* ---- custom requested fields ---- */
prof = defaultIndependentFoodserviceProfile();
const good = { ...emptyCustomFieldDraft(), label: "Number of branches", internalKey: "number_of_branches", dataType: "number", requirement: "required", intendedSource: "companies_house", visibility: "management_only", exportPermission: "restricted", notes: "count of trading sites" };
let add = addCustomRequestedField(prof, good);
assert(add.validation.ok && add.profile.customFields.length === 1, "valid custom field added");
const cf = add.profile.customFields[0];
assert(cf.dataType === "number" && cf.requirement === "required" && cf.intendedSource === "companies_house" && cf.visibility === "management_only" && cf.exportPermission === "restricted" && cf.notes === "count of trading sites", "all advanced properties persisted");
prof = add.profile;
assert(!addCustomRequestedField(prof, good).validation.ok, "duplicate internal key rejected on add");
const blank = validateCustomRequestedField({ ...emptyCustomFieldDraft(), label: "" }, []);
assert(!blank.ok && blank.errors.label != null, "blank label rejected with field error");
const otherNoNote = validateCustomRequestedField({ ...emptyCustomFieldDraft(), label: "X", internalKey: "x", intendedSource: "other", sourceNote: "" }, []);
assert(!otherNoNote.ok && otherNoNote.errors.sourceNote != null, "'other' source requires a note");
// each data type is accepted
for (const dt of ["text", "number", "boolean", "date", "url", "email", "phone", "single_select", "multi_select"]) {
  const v = validateCustomRequestedField({ ...emptyCustomFieldDraft(), label: "L", internalKey: `k_${dt}`, dataType: dt }, []);
  if (!v.ok) { console.error("  ✗ data type rejected:", dt); fails++; }
}
console.log("  ✓ every supported data type is accepted");
prof = removeCustomRequestedField(prof, cf.id);
assert(prof.customFields.length === 0, "custom field removed");

/* ---- draft migration (v1 → v2) ---- */
const v1 = { ...newRunDraft("mig", null, "Old run"), schemaVersion: 1 } as any;
v1.profile = { ...v1.profile, customFields: [{ id: "old_note", label: "Old note" }] }; // v1 shape
delete v1.profile.customBusinessTypes;
const migrated = migrateDraft(v1);
assert(migrated != null && migrated.schemaVersion === CURRENT_SCHEMA_VERSION, "v1 draft migrates to current schema version");
assert(Array.isArray(migrated!.profile.customBusinessTypes), "customBusinessTypes array added on migration");
assert(migrated!.profile.customFields[0].internalKey === "old_note" && migrated!.profile.customFields[0].dataType === "text", "v1 custom field upgraded with safe defaults (no data loss)");
assert(migrateDraft({ schemaVersion: 99 }) === null, "unknown schema version returns null (caller starts fresh)");
assert(migrateDraft("garbage") === null, "non-object input returns null safely");
const v2ok = migrateDraft(newRunDraft("x", null, "n"));
assert(v2ok != null && Array.isArray(v2ok.profile.customFields), "v2 draft passes through migration");

console.log(fails === 0 ? "\nAll custom-config assertions passed ✓" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
