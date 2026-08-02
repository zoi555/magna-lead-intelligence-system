// Final Level 0-4 outcome assignment — Phase 8 (spec Phase E6). A hard-gate failure caps the
// candidate at Level 4 regardless of score ("a hard failure cannot be rescued by points" —
// explicit instruction). Above that floor, score bands and specific unresolved-conflict
// evidence determine the level. Level 0 additionally requires the candidate to have passed
// EVERY hard gate AND cleared a minimum score threshold — score alone can never promote a
// hard-gate failure to Level 0.

import type { HardGateResult, ScoringResult, RejectionLevel, RejectionReasonTag, FinalOutcomeResult, ChannelSuitabilityResult } from "./types";

const LEVEL_0_MIN_SCORE = 65; // out of 100 — a defensible, documented threshold: high scores cluster candidates with strong evidence across most components, never a single dominant factor
const LEVEL_1_MIN_SCORE = 50;
const LEVEL_2_MIN_SCORE = 30;

export function assignFinalOutcome(
  candidateId: string,
  hardGates: HardGateResult,
  scoring: ScoringResult | null,
  channelSuitability: ChannelSuitabilityResult | null,
  hasUnresolvedCustomerConflict: boolean,
  hasValidPhone: boolean = true, // defaults true so existing v1 callers (which never validated phone here) are unaffected — only run-final-scoring-stage-v2.ts passes this explicitly
): FinalOutcomeResult {
  const reasonTags: RejectionReasonTag[] = [];

  if (!hardGates.allPassed) {
    reasonTags.push("global_rejection");
    if (hardGates.failedGates.includes("correct_territory")) reasonTags.push("territory_rejection");
    if (hardGates.failedGates.includes("not_an_excluded_supermarket_chain_or_group") || hardGates.failedGates.includes("not_an_active_magna_customer")) reasonTags.push("campaign_rejection");
    return {
      candidateId, level: "level_4", levelReason: `Hard gate failure: ${hardGates.failedGates.join(", ")}. A hard failure cannot be rescued by points.`,
      reasonTags, hardGates, scoring, channelSuitability,
    };
  }

  if (!scoring) {
    return { candidateId, level: "level_4", levelReason: "No scoring was performed for this candidate.", reasonTags: ["global_rejection"], hardGates, scoring: null, channelSuitability };
  }

  if (hasUnresolvedCustomerConflict) {
    reasonTags.push("campaign_rejection");
    return { candidateId, level: "level_3", levelReason: `An unresolved, genuine business-name-overlap customer conflict remains after every enrichment stage — held for controlled review rather than scored to Level 0/1 (score ${scoring.totalScore}/${scoring.maxPossibleScore}).`, reasonTags, hardGates, scoring, channelSuitability };
  }

  if (channelSuitability && channelSuitability.suitability === "neither") {
    reasonTags.push("channel_rejection");
    return { candidateId, level: "level_2", levelReason: `Passed all hard gates but has no usable telesales or field-sales channel (no phone, no verified/probable premises with coordinates) — score ${scoring.totalScore}/${scoring.maxPossibleScore}.`, reasonTags, hardGates, scoring, channelSuitability };
  }

  if (!hasValidPhone) {
    // Locked policy (2026-08-02): mirrors qualification-v2.ts's phone_resolution_exception —
    // kept consistent with the same "held for controlled review, not scored to Level 0/1"
    // treatment already used for hasUnresolvedCustomerConflict above, so Level and
    // qualification_status never disagree about whether this candidate is really releasable.
    reasonTags.push("channel_rejection");
    return { candidateId, level: "level_3", levelReason: `Passed all hard gates and has a usable channel by the old definition, but no valid UK phone number was resolved — every released lead requires one. Held for phone-resolution review rather than scored to Level 0/1 (score ${scoring.totalScore}/${scoring.maxPossibleScore}).`, reasonTags, hardGates, scoring, channelSuitability };
  }

  if (scoring.totalScore >= LEVEL_0_MIN_SCORE) {
    return { candidateId, level: "level_0", levelReason: `Passed all hard gates, no unresolved conflict, at least one usable channel, score ${scoring.totalScore}/${scoring.maxPossibleScore} >= ${LEVEL_0_MIN_SCORE}.`, reasonTags, hardGates, scoring, channelSuitability };
  }
  if (scoring.totalScore >= LEVEL_1_MIN_SCORE) {
    return { candidateId, level: "level_1", levelReason: `Minor recoverable evidence gaps — score ${scoring.totalScore}/${scoring.maxPossibleScore} (${LEVEL_1_MIN_SCORE}-${LEVEL_0_MIN_SCORE - 0.01}).`, reasonTags, hardGates, scoring, channelSuitability };
  }
  if (scoring.totalScore >= LEVEL_2_MIN_SCORE) {
    return { candidateId, level: "level_2", levelReason: `Promising but incomplete evidence — score ${scoring.totalScore}/${scoring.maxPossibleScore} (${LEVEL_2_MIN_SCORE}-${LEVEL_1_MIN_SCORE - 0.01}).`, reasonTags, hardGates, scoring, channelSuitability };
  }
  reasonTags.push("global_rejection");
  return { candidateId, level: "level_3", levelReason: `Significant evidence gaps or weak overall confidence — score ${scoring.totalScore}/${scoring.maxPossibleScore} (< ${LEVEL_2_MIN_SCORE}), held for controlled review rather than a hard reject since all hard gates passed.`, reasonTags, hardGates, scoring, channelSuitability };
}
