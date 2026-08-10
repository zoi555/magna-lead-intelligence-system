// Discovery run draft — canonical, database-ready shape + validation + recovery.
//
// This is the single object the Run Builder produces across its nine explicit stages
// (Identity, Source Mode, Geography, Limits/Cost, Exclusions, Scoring Profile, Assignment,
// Outputs, Review — P4 control decision, 2026-08-10). It is written verbatim into
// discovery_runs.config_snapshot as the complete, immutable source of run configuration
// once a run is queued. Drafts are recovered from localStorage; nothing is written to the
// database on the first screen.
//
// Schema history: v1/v2 (pre-9-stage wizard, "planning" bag of anchors/providers/spend) are
// still accepted by migrateDraft and upgraded losslessly — a previously persisted run must
// remain readable. v3 restructures the same information into the nine stages plus three
// genuinely new stages (Scoring Profile, Assignment, Outputs) that had no prior
// representation anywhere in this codebase.

import { TargetProfile, defaultIndependentFoodserviceProfile, CustomRequestedField } from "./target-profile";
import { slugifyKey } from "./custom-config";

export const CURRENT_SCHEMA_VERSION = 3 as const;

// ---- Stage 3: Geography ----
export interface RunTerritory {
  mode: "pilot" | "manual_outcodes" | "vp_coverage" | "full_uk" | "custom";
  input: string;            // raw pasted postcodes / outcodes
  surrounding: "context" | "include" | "exclude";
  locationRule: "require" | "prefer" | "off";
}

/** A geographic reference point for the run's map/planning context. Not one of the nine
 *  named stages — folded into Geography (it exists to support territory review, not to
 *  define scope on its own). */
export interface RunAnchor { id: string; label: string; lat: number; lng: number }

// ---- Stage 2: Source Mode ----
/** The two product-level source modes preserved from the governing spec. Mode B is
 *  represented honestly: selectable as a product intent, but Uber Eats/Deliveroo remain
 *  non-executable until a provider is authorised (ISS-0021) — selecting Mode B never
 *  silently enables live execution. */
export type SourceModeId = "just_eat_only" | "just_eat_uber_deliveroo";

export interface RunSourceMode {
  mode: SourceModeId;
  /** Providers actually enabled for THIS run — in this vertical slice this can only ever
   *  contain "just_eat" (and "manual_import"), regardless of `mode`, because Uber Eats and
   *  Deliveroo have no authorised production source yet. */
  selectedProviders: string[];
}

export function defaultSourceMode(): RunSourceMode {
  return { mode: "just_eat_only", selectedProviders: ["just_eat"] };
}

// ---- Stage 4: Limits / Cost ----
export interface RunLimitsAndCost {
  estimatedVolume: number | null;   // last-fetched estimate (existing coverage) — recomputed server-side, never trusted as-is
  /** null = no priced model exists for the selected provider(s). We never invent a charge —
   *  Just Eat is genuinely free (open lawful listing endpoint); Uber Eats/Deliveroo have no
   *  approved cost model at all, so their cost is "unavailable", not zero. */
  estimatedCostGbp: number | null;
  spendCeilingGbp: number | null;
  /** Explicit approval gate for paid execution. Always false in this vertical slice — there
   *  is no approved paid provider to approve spend against. Kept as a real field (not
   *  removed) so a future authorised provider only needs this flipped, not a schema change. */
  paidExecutionApproved: boolean;
}

export function defaultLimitsAndCost(): RunLimitsAndCost {
  return { estimatedVolume: null, estimatedCostGbp: null, spendCeilingGbp: null, paidExecutionApproved: false };
}

// ---- Stage 5: Exclusions ----
export interface VersionedProfileRef { id: string; version: string }

export interface ExistingCustomerExclusionConfig {
  requested: boolean;
  /** Always false until ISS-0001 (missing customer postcode file) and its replacement
   *  integration are resolved — matching logic is real, the reference master is mock data.
   *  Never claim this is operational while `ready` is false. */
  ready: boolean;
  referenceIdentity: string | null;
}

/** A forward-looking, versioned rule-profile reference with its own honest readiness/block
 *  state — mirrors the RunOutputRequest pattern (P4 control review, 2026-08-10 §3) so
 *  "can this be represented" and "is it actually usable yet" are never conflated. `profile`
 *  stays `null` until a controlled TEMP-PIPELINE -> permanent promotion pass defines a real
 *  id+version to reference; `ready`/`blockedReason` are set independently of that, so a
 *  profile can exist as a reference before the enforcement pipeline for it is wired up. */
export interface ExclusionProfileSlot {
  profile: VersionedProfileRef | null;
  ready: boolean;
  blockedReason: string | null;
}

function unavailableProfileSlot(reason: string): ExclusionProfileSlot {
  return { profile: null, ready: false, blockedReason: reason };
}

/** Exclusions configuration. Also carries the "targeting" criteria (business types,
 *  cuisines, service models, ownership, requested fields, tags, custom types/fields —
 *  `profile` below) that the former "Target profile" wizard step covered: the governing
 *  nine stages do not name a separate targeting stage, and this data defines what counts
 *  as in/out of scope exactly like the rest of Exclusions, so it is kept in this stage
 *  rather than invented as a tenth stage. Recorded as a judgment call in
 *  docs/09_DECISIONS.md. */
export interface RunExclusions {
  geographyExclusions: string[];   // codes excluded from GeographySelector (Geography stage output, applied here)
  manualExclusions: string[];      // free-text manual exclusion notes
  overridePolicy: "none" | "owner_ack_required";
  existingCustomerExclusion: ExistingCustomerExclusionConfig;
  /** Forward-looking only (P4 control addendum, 2026-08-10): referenced by id+version once a
   *  controlled TEMP-PIPELINE -> permanent promotion pass defines them. Never populated or
   *  implemented in this vertical slice; the app must never depend on
   *  scripts/lead-production/** or config/lead-production/** directly. */
  commercialRuleProfile: ExclusionProfileSlot;
  brandGroupDecisionProfile: ExclusionProfileSlot;
  customerSuppressionProfile: ExclusionProfileSlot;
}

const PROMOTION_PENDING_REASON = "Not yet available — pending the controlled TEMP-PIPELINE → permanent promotion pass (next P4 milestone).";

export function defaultExclusions(): RunExclusions {
  return {
    geographyExclusions: [],
    manualExclusions: [],
    overridePolicy: "none",
    existingCustomerExclusion: { requested: false, ready: false, referenceIdentity: null },
    commercialRuleProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
    brandGroupDecisionProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
    customerSuppressionProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
  };
}

// ---- Stage 6: Scoring Profile ----
/** A single, versioned, approved profile — no custom-weight editing in this vertical slice
 *  (P4 control decision). References the one authoritative formula already in the
 *  repository (docs/42_SCORING_AND_COMMERCIAL_FORMULA.md, which supersedes
 *  docs/42_COMMERCIAL_VALUE_MODEL_NOW.md); no new commercial weights are invented here. */
export interface RunScoringProfile { profileId: string; version: string; name: string; summary: string }

export function defaultScoringProfile(): RunScoringProfile {
  return {
    profileId: "independent-foodservice-default-v1",
    version: "docs/42_SCORING_AND_COMMERCIAL_FORMULA.md",
    name: "Independent Foodservice — default scoring & commercial formula",
    summary:
      "Weighted score + estimated-value chain (category baseline × territory fit × platform presence × " +
      "contactability × business-type fit × financial confidence × confidence). Coarse value/opportunity " +
      "bands only ever leave the internal-audit boundary — raw figures never reach a telesales export.",
  };
}

// ---- Stage 7: Assignment ----
/** Downstream assignment POLICY only — this stage never assigns an individual lead during
 *  run creation. Actual assignment happens after qualification/scoring. */
export type AssignmentPolicyId = "manual_management_review" | "territory_based" | "telesales" | "field_sales" | "both";

export interface RunAssignment {
  policy: AssignmentPolicyId;
  /** Whether the existing application configuration actually supports territory-based
   *  routing today. sales_region/sales_territory/delivery_coverage tables exist
   *  (migration 0013) but no rep-assignment table or UI wires them to a run — so this is
   *  false until that is genuinely built, and the policy option is shown as unavailable
   *  rather than silently accepted. */
  territoryBasedAvailable: boolean;
}

export function defaultAssignment(): RunAssignment {
  return { policy: "manual_management_review", territoryBasedAvailable: false };
}

// ---- Stage 8: Outputs ----
/** P4-APP selects requested output TYPES only; P4-EXPORTS owns the actual controlled
 *  schemas/generators (CTO, Sales Pro). This app must never rewrite those field mappings. */
export type OutputTypeId = "canonical_audit" | "representative" | "sales_pro" | "cto" | "maps";

export interface RunOutputRequest {
  type: OutputTypeId;
  requested: boolean;
  ready: boolean;
  blockedReason: string | null;
}

export function defaultOutputs(): RunOutputRequest[] {
  return [
    { type: "canonical_audit", requested: true, ready: true, blockedReason: null },
    { type: "representative", requested: false, ready: false, blockedReason: "Representative output shaping is not yet built in this vertical slice." },
    { type: "sales_pro", requested: false, ready: false, blockedReason: "Sales Pro export schema is owned by P4-EXPORTS — not available from P4-APP." },
    { type: "cto", requested: false, ready: false, blockedReason: "CTO field mapping is owned by P4-EXPORTS — not available from P4-APP." },
    { type: "maps", requested: false, ready: false, blockedReason: "Map output packaging is not yet built in this vertical slice." },
  ];
}

// ---- Stage 9: Review ----
/** Overlap acknowledgement — territory overlap between runs is PERMITTED (P4 control
 *  correction, 2026-08-10 — supersedes the earlier "identical territory blocks unless
 *  owner-overridden" design). AspectLead must allow the same geography to be searched
 *  multiple times; overlap is detected and disclosed, never prohibited. This record is
 *  therefore evidence that the user was WARNED and chose to proceed, not an authorisation
 *  of an otherwise-forbidden action — no owner/admin role check applies to it, unlike a
 *  genuinely restricted action would. `acknowledged`/`note`/`disclosedOverlapRunIds` are
 *  the user's stated intent, captured client-side from exactly what the Review screen
 *  displayed at the moment of ticking the box; `acknowledgedBy`/`acknowledgedByEmail`/
 *  `acknowledgedAt`/`overlappingRunIds` are stamped server-side only, by
 *  confirm_and_queue_run, once it has independently recomputed the overlap evidence AND
 *  verified it still matches `disclosedOverlapRunIds` (P4 independent review correction,
 *  2026-08-10 — an audit race let a run become active between disclosure and confirm, so
 *  the acknowledgement could be stamped against overlap the user never actually saw; the
 *  RPC now rejects with CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE if the disclosed and
 *  recomputed sets differ, forcing a fresh disclosure+acknowledgement instead). So a
 *  queued run always carries real evidence of what was ACTUALLY shown and acknowledged at
 *  confirmation time, not just a client claim. */
export interface RunOverlapAcknowledgement {
  acknowledged: boolean;
  note: string;
  /** The exact set of currently-ACTIVE overlapping run ids the Review screen displayed
   *  when the user ticked the acknowledgement box — client-recorded, then verified
   *  server-side against a fresh recomputation before the run is allowed to queue. */
  disclosedOverlapRunIds: string[];
  /** Server-verified actor who acknowledged — set ONLY by confirm_and_queue_run. */
  acknowledgedBy: string | null;
  /** That actor's email, for human-readable audit evidence. */
  acknowledgedByEmail: string | null;
  /** Server timestamp when the acknowledgement was recorded against real overlap evidence. */
  acknowledgedAt: string | null;
  /** The specific run ids this acknowledgement was recorded against, stamped server-side —
   *  equal to `disclosedOverlapRunIds` by construction once a queue succeeds (the RPC
   *  rejects any mismatch rather than stamping something the user didn't see). */
  overlappingRunIds: string[];
}

export interface RunReview {
  overlapAcknowledgement: RunOverlapAcknowledgement | null;
  /** Server-authoritative confirmation timestamp — stamped ONLY by confirm_and_queue_run
   *  inside its atomic transaction (P4 independent review correction, 2026-08-10; a
   *  browser-generated timestamp is never trusted as authoritative, since the wizard could
   *  stamp this locally and then the queue call could still fail, leaving a false
   *  impression the run was confirmed). Stays null until a queue attempt actually commits;
   *  a failed or rolled-back attempt leaves it null. */
  confirmedAtIso: string | null;
}

export function defaultReview(): RunReview {
  return { overlapAcknowledgement: null, confirmedAtIso: null };
}

// ---- The full draft ----
export interface RunDraft {
  schemaVersion: 3;
  id: string;               // client-generated draft id (uuid-like)

  // Stage 1: Identity
  name: string;
  reference: string;
  objective: string;
  createdAtIso: string | null;

  // Stage 2: Source Mode
  sourceMode: RunSourceMode;

  // Stage 3: Geography
  territory: RunTerritory;
  anchors: RunAnchor[];

  // Stage 5: Exclusions (also carries targeting/taxonomy — see RunExclusions doc comment)
  profile: TargetProfile;
  exclusions: RunExclusions;

  // Stage 4: Limits / Cost
  limitsAndCost: RunLimitsAndCost;

  // Stage 6: Scoring Profile
  scoringProfile: RunScoringProfile;

  // Stage 7: Assignment
  assignment: RunAssignment;

  // Stage 8: Outputs
  outputs: RunOutputRequest[];

  // Stage 9: Review
  review: RunReview;

  status: "draft";
  /** Set once this draft has been saved to Supabase (discovery_runs.id) — lets the wizard
   *  distinguish "new, unsaved draft" from "editing an already-persisted draft". */
  savedRunId?: string | null;
}

export function newRunDraft(idSeed: string, nowIso: string | null, defaultName = ""): RunDraft {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: `run_${idSeed}`,
    name: defaultName,
    reference: "",
    objective: "",
    createdAtIso: nowIso,
    sourceMode: defaultSourceMode(),
    territory: { mode: "manual_outcodes", input: "", surrounding: "context", locationRule: "require" },
    anchors: [],
    profile: defaultIndependentFoodserviceProfile(),
    exclusions: defaultExclusions(),
    limitsAndCost: defaultLimitsAndCost(),
    scoringProfile: defaultScoringProfile(),
    assignment: defaultAssignment(),
    outputs: defaultOutputs(),
    review: defaultReview(),
    status: "draft",
    savedRunId: null,
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
  // "full_uk" is the internal/legacy enum value (kept for backwards compatibility with
  // already-persisted runs) — the CURRENT product covers Great Britain only (England,
  // Scotland, Wales; Northern Ireland is out of scope for the geospatial platform), so
  // user-facing wording must never say "UK" (P4 independent review, 2026-08-10).
  if (!d.territory.input.trim() && d.territory.mode !== "full_uk") errors.push("Territory: enter at least one postcode area, district or place, or choose Full Great Britain.");
  if (!d.profile.businessTypes.length) errors.push("Target profile: select at least one business type.");
  if (!d.profile.dataFields.length) errors.push("Requested data: select at least one field to collect.");
  if (!d.sourceMode.selectedProviders.length) errors.push("Source Mode: select at least one provider.");
  if (!d.outputs.some((o) => o.type === "canonical_audit" && o.requested)) errors.push("Outputs: the canonical/management audit output is required and cannot be deselected.");
  if (!d.profile.serviceModels.length) warnings.push("No service models selected — all will be included.");
  if (!d.profile.ownership.length) warnings.push("No ownership types selected — independence filtering is off.");
  if (!d.profile.exclusions.length) warnings.push("No exclusions selected — national chains will not be filtered out.");
  if (d.profile.cuisines.length === 0) warnings.push("No cuisine filter — all cuisines will be included (usually intended).");
  if (d.sourceMode.mode === "just_eat_uber_deliveroo") warnings.push("Multi-platform mode selected — Uber Eats and Deliveroo are represented but not yet executable (no authorised source); only Just Eat will actually run.");
  if (d.exclusions.existingCustomerExclusion.requested && !d.exclusions.existingCustomerExclusion.ready) warnings.push("Existing-customer exclusion requested, but the reference integration is not yet ready — it will not suppress anything operationally.");
  return { ok: errors.length === 0, errors, warnings };
}

/** Human-readable live configuration summary — spans all nine stages. */
export function summariseRunDraft(d: RunDraft): { label: string; value: string }[] {
  const p = d.profile;
  const ex = d.exclusions;
  const requestedOutputs = d.outputs.filter((o) => o.requested).map((o) => o.type);
  const profileSlotValue = (slot: ExclusionProfileSlot) => slot.profile ? `${slot.profile.id} (${slot.profile.version})${slot.ready ? "" : " — not ready"}` : (slot.blockedReason ?? "Not yet available");
  return [
    { label: "Run", value: d.name || "(unnamed)" },
    { label: "Reference", value: d.reference || "—" },
    { label: "Objective", value: d.objective || "—" },
    { label: "Source mode", value: d.sourceMode.mode === "just_eat_only" ? "Just Eat only" : "Just Eat + Uber Eats + Deliveroo (multi-platform)" },
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
    { label: "Geography exclusions", value: ex.geographyExclusions.length ? ex.geographyExclusions.join(", ") : "—" },
    { label: "Manual exclusions", value: ex.manualExclusions.length ? ex.manualExclusions.join(", ") : "—" },
    { label: "Exclusion override policy", value: ex.overridePolicy === "owner_ack_required" ? "Owner acknowledgement required" : "None" },
    { label: "Existing-customer exclusion", value: ex.existingCustomerExclusion.requested ? (ex.existingCustomerExclusion.ready ? "Requested — operational" : "Requested — NOT operational (reference integration unresolved)") : "Not requested" },
    { label: "Commercial rule profile", value: profileSlotValue(ex.commercialRuleProfile) },
    { label: "Brand/group decision profile", value: profileSlotValue(ex.brandGroupDecisionProfile) },
    { label: "Customer suppression profile", value: profileSlotValue(ex.customerSuppressionProfile) },
    { label: "Estimated volume", value: d.limitsAndCost.estimatedVolume != null ? String(d.limitsAndCost.estimatedVolume) : "not available" },
    { label: "Estimated cost", value: d.limitsAndCost.estimatedCostGbp != null ? `£${d.limitsAndCost.estimatedCostGbp.toFixed(2)}` : "not available" },
    { label: "Spend ceiling", value: d.limitsAndCost.spendCeilingGbp != null ? `£${d.limitsAndCost.spendCeilingGbp}` : "none set" },
    { label: "Paid execution approved", value: d.limitsAndCost.paidExecutionApproved ? "Yes" : "No" },
    { label: "Scoring profile", value: `${d.scoringProfile.name} (${d.scoringProfile.profileId})` },
    { label: "Assignment policy", value: ASSIGNMENT_LABELS[d.assignment.policy] },
    { label: "Outputs requested", value: requestedOutputs.length ? requestedOutputs.map((t) => OUTPUT_LABELS[t]).join(", ") : "none" },
    { label: "Confirmed at", value: d.review.confirmedAtIso ? new Date(d.review.confirmedAtIso).toLocaleString("en-GB") : "not yet confirmed" },
  ];
}

export const OUTPUT_LABELS: Record<OutputTypeId, string> = {
  canonical_audit: "Canonical / management audit",
  representative: "Representative output",
  sales_pro: "Sales Pro",
  cto: "CTO",
  maps: "Maps",
};

export const ASSIGNMENT_LABELS: Record<AssignmentPolicyId, string> = {
  manual_management_review: "Manual management review",
  territory_based: "Territory-based assignment",
  telesales: "Telesales",
  field_sales: "Field sales",
  both: "Telesales + field sales",
};

/**
 * Migrate any persisted draft to the current schema. v1 drafts (no customBusinessTypes,
 * customFields as {id,label}, a flat `planning` bag) and v2 drafts (the same `planning`
 * bag, richer customFields) are upgraded to v3's nine-stage shape without data loss. v3 is
 * validated for its own new arrays/objects. Unknown/malformed input returns null so the
 * caller starts fresh (no crash) — this is also how an old config_snapshot pulled back out
 * of the database stays renderable: run it through migrateDraft before display.
 */
export function migrateDraft(raw: unknown): RunDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, any>;
  if (d.schemaVersion !== 1 && d.schemaVersion !== 2 && d.schemaVersion !== 3) return null;
  if (!d.profile || typeof d.profile !== "object" || !d.territory) return null;
  const profile = d.profile as Record<string, any>;

  // ---- profile-level fixes (v1 -> v2, shared by all versions below 3) ----
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

  // ---- v1/v2 -> v3: fold the old flat `planning` bag into the nine-stage shape ----
  if (d.schemaVersion === 1 || d.schemaVersion === 2) {
    const pl = (d.planning && typeof d.planning === "object") ? d.planning as Record<string, any> : {};
    const anchors = Array.isArray(pl.anchors) ? pl.anchors : [];
    const selectedProviders = Array.isArray(pl.selectedProviders) && pl.selectedProviders.length ? pl.selectedProviders : ["just_eat"];
    const spendCeilingGbp = typeof pl.spendCeilingGbp === "number" ? pl.spendCeilingGbp : null;
    const legacyOverride = (pl.ownerOverride && typeof pl.ownerOverride === "object") ? pl.ownerOverride as Record<string, any> : null;
    const overlapAcknowledgement: RunOverlapAcknowledgement | null = legacyOverride
      ? { acknowledged: Boolean(legacyOverride.acknowledged), note: String(legacyOverride.note ?? ""), disclosedOverlapRunIds: [], acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: [] }
      : null;
    const existingCustomerExclusionRequested = Boolean(pl.existingCustomerExclusion);

    d.sourceMode = { mode: "just_eat_only", selectedProviders };
    d.anchors = anchors;
    d.limitsAndCost = { estimatedVolume: null, estimatedCostGbp: null, spendCeilingGbp, paidExecutionApproved: false };
    d.exclusions = {
      geographyExclusions: [],
      manualExclusions: [],
      overridePolicy: "none",
      existingCustomerExclusion: { requested: existingCustomerExclusionRequested, ready: false, referenceIdentity: null },
      commercialRuleProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
      brandGroupDecisionProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
      customerSuppressionProfile: unavailableProfileSlot(PROMOTION_PENDING_REASON),
    };
    d.scoringProfile = defaultScoringProfile();
    d.assignment = defaultAssignment();
    d.outputs = defaultOutputs();
    d.review = { overlapAcknowledgement, confirmedAtIso: null };
    delete d.planning;
  } else {
    // already v3 shape — ensure new sub-objects exist defensively (forward-compat with partial writes)
    if (!d.sourceMode || typeof d.sourceMode !== "object") d.sourceMode = defaultSourceMode();
    if (!Array.isArray(d.anchors)) d.anchors = [];
    if (!d.limitsAndCost || typeof d.limitsAndCost !== "object") d.limitsAndCost = defaultLimitsAndCost();
    if (!d.exclusions || typeof d.exclusions !== "object") d.exclusions = defaultExclusions();
    else {
      const ex = d.exclusions as Record<string, any>;
      if (!Array.isArray(ex.geographyExclusions)) ex.geographyExclusions = [];
      if (!Array.isArray(ex.manualExclusions)) ex.manualExclusions = [];
      if (ex.overridePolicy !== "none" && ex.overridePolicy !== "owner_ack_required") ex.overridePolicy = "none";
      if (!ex.existingCustomerExclusion || typeof ex.existingCustomerExclusion !== "object") ex.existingCustomerExclusion = { requested: false, ready: false, referenceIdentity: null };
      // Normalise the three profile slots: accept either the current { profile, ready,
      // blockedReason } shape, a bare VersionedProfileRef|null (a pre-fix v3 draft, see
      // docs/09_DECISIONS.md 2026-08-10 P4 control review §3), or a missing key.
      for (const key of ["commercialRuleProfile", "brandGroupDecisionProfile", "customerSuppressionProfile"] as const) {
        const v = ex[key];
        if (v && typeof v === "object" && "ready" in v) continue; // already the current slot shape
        if (v && typeof v === "object" && "id" in v && "version" in v) ex[key] = { profile: v, ready: false, blockedReason: PROMOTION_PENDING_REASON };
        else ex[key] = unavailableProfileSlot(PROMOTION_PENDING_REASON);
      }
    }
    if (!d.scoringProfile || typeof d.scoringProfile !== "object") d.scoringProfile = defaultScoringProfile();
    if (!d.assignment || typeof d.assignment !== "object") d.assignment = defaultAssignment();
    if (!Array.isArray(d.outputs) || !d.outputs.length) d.outputs = defaultOutputs();
    if (!d.review || typeof d.review !== "object") d.review = defaultReview();
    else {
      const rv = d.review as Record<string, any>;
      // Pre-correction v3 drafts (2026-08-10, before the "overlap is permitted" business-rule
      // fix) used review.ownerOverride with authorisedActorId/approvedBy/approvedAt — fold
      // forward onto the new overlapAcknowledgement shape, never trusting the old
      // authorisedActorId as if it were a fresh server stamp.
      if (!rv.overlapAcknowledgement && rv.ownerOverride && typeof rv.ownerOverride === "object") {
        const oo = rv.ownerOverride as Record<string, any>;
        rv.overlapAcknowledgement = {
          acknowledged: Boolean(oo.acknowledged), note: String(oo.note ?? ""), disclosedOverlapRunIds: [],
          acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: [],
        };
      }
      delete rv.ownerOverride;
      const oa = rv.overlapAcknowledgement;
      if (oa && typeof oa === "object") {
        // Pre-correction v3 drafts (2026-08-10, before the audit-race fix) never had
        // disclosedOverlapRunIds — default to empty rather than trusting anything stale.
        if (!Array.isArray(oa.disclosedOverlapRunIds)) oa.disclosedOverlapRunIds = [];
        if (typeof oa.acknowledgedBy === "undefined") oa.acknowledgedBy = null;
        if (typeof oa.acknowledgedByEmail === "undefined") oa.acknowledgedByEmail = null;
        if (typeof oa.acknowledgedAt === "undefined") oa.acknowledgedAt = null;
        if (!Array.isArray(oa.overlappingRunIds)) oa.overlappingRunIds = [];
      }
    }
  }

  if (typeof d.savedRunId !== "string") d.savedRunId = null;
  d.schemaVersion = CURRENT_SCHEMA_VERSION;
  return d as RunDraft;
}

/** Tolerant summariser for a config_snapshot pulled straight out of the database (any
 *  schema version, including malformed ones) — used by run-detail screens that must show
 *  "the saved immutable configuration snapshot" without ever crashing on an old run. */
export function describeConfigSnapshot(snapshot: unknown): { label: string; value: string }[] {
  const migrated = migrateDraft(snapshot);
  if (migrated) return summariseRunDraft(migrated);
  if (snapshot && typeof snapshot === "object") {
    return Object.entries(snapshot as Record<string, unknown>).slice(0, 20).map(([k, v]) => ({
      label: k, value: typeof v === "object" ? JSON.stringify(v).slice(0, 120) : String(v),
    }));
  }
  return [{ label: "Configuration snapshot", value: "Not available or unrecognised format." }];
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
