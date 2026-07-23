// Single source of truth for every independently-versioned rule component in the
// lead-production bridge. Locked 2026-07-23 (UB1 calibration audit, commit 52c124a):
// qualification/scoring rules v2 replaces v1 as the DEFAULT ruleset for every future
// lead-production run (run-full-territory.ts uses RULES_VERSIONS below by default).
//
// v1 remains fully reproducible: run-final-scoring-stage.ts, hard-gates.ts, scoring.ts,
// channel-suitability.ts, and final-outcome.ts are UNCHANGED by the v2 work — running v1's own
// script against the same checkpoints today reproduces the original UB1 output exactly (already
// proven byte-for-byte in the orchestrator's replay test). v2 is a separate script
// (run-final-scoring-stage-v2.ts) that reuses those same v1 modules unchanged and only swaps in
// corrected inputs (Google reclassification, customer-match materiality) plus a new
// qualification layer (qualification-v2.ts) — it never overwrites or requires deleting v1.
//
// Each identifier here is bumped independently the next time ITS OWN component changes — do not
// bump every field just because one changed.

export const RULES_VERSIONS = {
  // Overall ruleset identifier — the one to record in any run's top-level manifest.
  rulesetVersion: "v2",

  // scripts/lead-production/qualification-v2.ts — qualification_status/channel_eligibility
  // decision logic (hard gates + customer-conflict materiality + channel, decoupled from score).
  qualificationRulesVersion: "qualification-v2-2026-07-23",

  // scripts/lead-production/scoring.ts — the 100-point commercial_priority_score formula.
  // UNCHANGED from v1 in this pass (reviewed, no formula defect found) — version string
  // reflects that it is still v1's own scoring.ts, reused as-is.
  scoringRulesVersion: "final-scoring-stage-v1",

  // scripts/lead-production/hard-gates.ts — the 11 named hard gates + trustworthyCompaniesHouseStatus().
  // UNCHANGED from v1 in this pass — reused as-is, only its INPUTS are corrected upstream
  // (Google reclassification) before being passed in.
  hardGateVersion: "hard-gates-v1",

  // scripts/lead-production/customer-match-materiality.ts — NEW in v2. Replaces "any unresolved
  // customer-match state blocks release" with genuine corroboration-strength evidence.
  customerMatchMaterialityVersion: "customer-match-materiality-v1-2026-07-23",

  // The approved group/franchise registry used by screen-large-groups.ts and
  // group-rescreen-after-google.ts — versioned by the registry FILE itself
  // (load-group-registry.ts), not by this bridge's code. Record the actual registry file's own
  // checksum/version per run in that run's manifest; this is a placeholder default only.
  groupRegistryVersion: "as-supplied-per-run",

  // scripts/lead-production/normalize.ts — normaliseName()/nameSimilarity()/decodeHtmlEntities().
  // Bumped in v2: apostrophe-tokenisation fix + "t/a" phrase fix + (in load-customers.ts)
  // HTML-entity decoding for customer-file fields.
  normalisationVersion: "normalize-v2-2026-07-23",

  // scripts/lead-production/channel-suitability.ts — telesales/field-sales eligibility logic.
  // UNCHANGED — audited this session and confirmed already correctly decoupled from
  // optional-enrichment evidence (telesales requires only a phone; field-sales requires only
  // genuine premises + postcode + coordinates). Reused as-is.
  channelRuleVersion: "channel-suitability-v1",

  // The shape of this bridge's output files (column sets, file-naming convention, JSON schemas).
  // Bumped in v2: adds qualification_status/channel_eligibility/enrichment_completeness_band as
  // first-class output columns, adds the *-v2-authoritative-master.json full-detail dump, and
  // introduces the clean passed_*/failed_* hard-gate-reason label convention.
  outputSchemaVersion: "output-schema-v2-2026-07-23",
} as const;

export type RulesVersions = typeof RULES_VERSIONS;
