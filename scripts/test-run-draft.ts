// Discovery run-draft + target-profile assertions — npm run test:run-draft
import { newRunDraft, validateRunDraft, summariseRunDraft, migrateDraft } from "../src/lib/discovery/run-draft";
import { defaultIndependentFoodserviceProfile, BUSINESS_TYPES, CUISINES, SERVICE_MODELS, OWNERSHIP_TYPES, DEFAULT_EXCLUSIONS } from "../src/lib/discovery/target-profile";
import { seedChainRegistry, matchesChain, addChain, setChainEnabled } from "../src/lib/discovery/chain-registry";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

console.log("Run-draft & target-profile checks:");

// taxonomies are non-trivial (not a reduced postcode form)
assert(BUSINESS_TYPES.length >= 15, "business-type taxonomy is comprehensive");
assert(CUISINES.length >= 20, "cuisine taxonomy is comprehensive");
assert(SERVICE_MODELS.length >= 8, "service-model taxonomy present");
assert(OWNERSHIP_TYPES.length >= 5, "ownership classification present");
assert(DEFAULT_EXCLUSIONS.some((e) => e.id === "national_chains" && e.defaultOn), "default exclusions include national chains");

// default Independent Foodservice profile
const p = defaultIndependentFoodserviceProfile();
assert(p.businessTypes.length > 0 && p.ownership.includes("independent_single"), "default profile targets independents");
assert(p.exclusions.includes("national_chains") && p.exclusions.includes("major_franchises"), "default profile excludes chains/franchises");

// validation
const draft = newRunDraft("test", null);
let v = validateRunDraft(draft);
assert(!v.ok && v.errors.some((e) => /name/i.test(e)) && v.errors.some((e) => /territory/i.test(e)), "empty draft fails validation (name + territory required)");
draft.name = "TW independents Q3";
draft.territory.input = "TW";
v = validateRunDraft(draft);
assert(v.ok, "named draft with a territory + default profile passes validation");
assert(summariseRunDraft(draft).some((s) => s.label === "Business types"), "live summary includes the target profile");

// confirmedAtIso is server-authoritative only — a fresh draft never carries one, and
// nothing in this module ever invents one client-side (P4 independent review, 2026-08-10).
assert(draft.review.confirmedAtIso === null, "a fresh draft's review.confirmedAtIso is null — only confirm_and_queue_run may set it");
assert(draft.review.overlapAcknowledgement === null, "a fresh draft has no overlap acknowledgement yet");

// Full UK -> Full Great Britain wording correction (P4 independent review, 2026-08-10):
// the CURRENT product covers Great Britain only (England/Scotland/Wales) — no user-facing
// validation text may say "UK". The internal enum value "full_uk" is unchanged (backwards
// compatibility with already-persisted runs).
const ukDraft = newRunDraft("uk-wording-test", null);
ukDraft.name = "GB wording test";
ukDraft.territory.mode = "manual_outcodes";
ukDraft.territory.input = "";
const ukErrors = validateRunDraft(ukDraft).errors.join(" | ");
assert(/Full Great Britain/.test(ukErrors), "the territory-required validation error says 'Full Great Britain', not 'Full UK'");
assert(!/Full UK/.test(ukErrors), "the territory-required validation error never says 'Full UK'");

// migrateDraft defaults disclosedOverlapRunIds on an old (pre-correction) v3 draft that
// never had the field, rather than crashing or leaving it undefined.
const legacyV3 = {
  ...newRunDraft("legacy", null), name: "Legacy v3 draft",
  review: { confirmedAtIso: null, overlapAcknowledgement: { acknowledged: true, note: "old note", acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: ["run-a"] } },
};
const migratedLegacy = migrateDraft(legacyV3);
assert(migratedLegacy != null, "a pre-correction v3 draft (no disclosedOverlapRunIds) still migrates");
assert(Array.isArray(migratedLegacy?.review.overlapAcknowledgement?.disclosedOverlapRunIds) && migratedLegacy!.review.overlapAcknowledgement!.disclosedOverlapRunIds.length === 0, "disclosedOverlapRunIds defaults to an empty array on fold-forward, never trusting stale/absent data");

// chain registry — data, editable, not hardcoded logic
let reg = seedChainRegistry();
assert(matchesChain("McDonald's Twickenham", reg)?.id === "mcdonalds", "seed registry matches a known chain by alias/substring");
assert(matchesChain("Zaza's Independent Pizzeria", reg) === null, "an independent name does not match any chain");
reg = addChain(reg, "Local Regional Group Ltd", "casual_dining");
assert(reg.some((c) => c.name === "Local Regional Group Ltd"), "organisation can add a chain (registry is editable data)");
reg = setChainEnabled(reg, "mcdonalds", false);
assert(matchesChain("McDonald's", reg) === null, "disabling a chain removes it from matching");

console.log(fails === 0 ? "\nAll run-draft assertions passed ✓" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
