// Qualification rules v2 (2026-07-23, UB1 calibration audit) — separates WHETHER a candidate is
// safe/legal/verifiable to contact (qualification_status, channel_eligibility) from HOW GOOD a
// lead it is (commercial_priority_score) and HOW COMPLETE its evidence is
// (enrichment_completeness). v1 conflated these: a candidate needed hard gates to pass AND a
// 100-point score >= 65 to ever reach "sales-ready" — meaning candidates that had passed every
// genuine hard gate and had a perfectly usable channel could still be held purely because
// optional-enrichment scoring components (filed accounts, decision-maker profile, product-fit
// keywords) pulled the total below an arbitrary cliff. v2 keeps the score for RANKING only.
//
// Reuses, unchanged: evaluateHardGates() (hard-gates.ts), calculateChannelSuitability()
// (channel-suitability.ts — already correctly requires only a phone for telesales and only
// premises+postcode+coordinates for field sales, confirmed by audit, no defect found there),
// calculateScore() (scoring.ts). Territory-agnostic: no territory-specific branching anywhere.

import type { HardGateResult, ChannelSuitabilityResult, ChannelSuitability } from "./types";

// 2026-07-24: "held_for_material_conflict" renamed to "held_for_customer_match_review" — this
// status has always been exclusively about customer-master match conflicts (never a general
// "material conflict" concept), so this is a faithful rename, not a new parallel status.
// "customer_master_exclusion" is included here for type completeness, though in practice a
// CONFIRMED customer-master match is classified as a terminal bucket earlier, in
// run-final-scoring-stage-v2.ts, before a candidate ever reaches this function — it never
// depends on hard gates, score, or channel, exactly like the other terminal buckets
// (active/excluded-group/closed).
export type QualificationStatusV2 = "qualified" | "qualified_with_channel_limit" | "held_for_customer_match_review" | "customer_master_exclusion" | "hard_rejected";

export interface QualificationV2Input {
  hardGates: HardGateResult;
  materialCustomerConflict: boolean; // from customer-match-materiality.ts's "probable" tier — a CONFIRMED match never reaches this function at all
  channelSuitability: ChannelSuitabilityResult;
  stagesWithDecisiveEvidence: number; // 0-4, same input already computed for scoring.ts's dataCompletenessConfidence
  totalStagesConsidered: number;
}

export interface QualificationV2Result {
  qualificationStatus: QualificationStatusV2;
  channelEligibility: ChannelSuitability;
  enrichmentCompletenessBand: "high" | "moderate" | "low" | "minimal";
  enrichmentCompletenessFraction: number;
  reason: string;
}

export function classifyQualificationV2(input: QualificationV2Input): QualificationV2Result {
  const completenessFraction = input.totalStagesConsidered > 0 ? input.stagesWithDecisiveEvidence / input.totalStagesConsidered : 0;
  const enrichmentCompletenessBand: QualificationV2Result["enrichmentCompletenessBand"] =
    completenessFraction >= 0.75 ? "high" : completenessFraction >= 0.5 ? "moderate" : completenessFraction >= 0.25 ? "low" : "minimal";

  if (!input.hardGates.allPassed) {
    return {
      qualificationStatus: "hard_rejected", channelEligibility: input.channelSuitability.suitability,
      enrichmentCompletenessBand, enrichmentCompletenessFraction: completenessFraction,
      reason: `Failed genuine hard gate(s): ${input.hardGates.failedGates.join(", ")}.`,
    };
  }

  if (input.materialCustomerConflict) {
    return {
      qualificationStatus: "held_for_customer_match_review", channelEligibility: input.channelSuitability.suitability,
      enrichmentCompletenessBand, enrichmentCompletenessFraction: completenessFraction,
      reason: "A probable (not yet confirmed, not rejected as coincidence) customer-master match remains unresolved — held until conclusively released or confirmed, never rep-facing in the meantime.",
    };
  }

  if (input.channelSuitability.suitability === "neither") {
    // Passed every genuine hard gate (including the postcode/any-contact-channel check) but
    // still has no channel a rep can actually use (e.g. only a website contact FORM, no phone,
    // and no genuine premises) — not currently actionable by either channel. Closest fit among
    // the four required v2 statuses; documented explicitly rather than silently folded in.
    return {
      qualificationStatus: "hard_rejected", channelEligibility: "neither",
      enrichmentCompletenessBand, enrichmentCompletenessFraction: completenessFraction,
      reason: "Passed every hard gate but has no usable telesales or field-sales channel (no verified phone, and no genuine visitable premises with coordinates).",
    };
  }

  const status: QualificationStatusV2 = input.channelSuitability.suitability === "both" ? "qualified" : "qualified_with_channel_limit";
  return {
    qualificationStatus: status, channelEligibility: input.channelSuitability.suitability,
    enrichmentCompletenessBand, enrichmentCompletenessFraction: completenessFraction,
    reason: status === "qualified" ? "Passed every hard gate, no material customer conflict, usable via both channels." : `Passed every hard gate, no material customer conflict, usable via ${input.channelSuitability.suitability} only.`,
  };
}
