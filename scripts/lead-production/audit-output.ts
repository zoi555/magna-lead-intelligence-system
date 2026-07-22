// Writes the dated audit output set outside the application runtime (scripts/lead-production/
// output/<timestamp>/ — never under src/app or public/). Every file listed in the spec is
// written; processing-summary.json carries source-file hashes, row counts, run/tenant id,
// timestamp, matching-rule version, group-registry version (its content hash), and any
// warnings/unmapped columns surfaced while loading the input files.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv } from "./csv";
import type { ProcessedCandidate } from "./types";
import type { CustomerPreflightReport } from "./preflight";

export function sha256File(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function fileHash(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return sha256File(buf);
}

export async function writePreflightReport(outDir: string, report: CustomerPreflightReport): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "customer-master-preflight.json"), JSON.stringify(report, null, 2));
}

const RESULT_COLUMNS = [
  "candidate_id", "candidate_name_original", "candidate_name_normalised",
  "candidate_brand", "candidate_postcode_original", "candidate_postcode_normalised", "candidate_phone_original", "candidate_phone_normalised",
  "customer_id", "customer_name_original", "customer_name_normalised", "customer_status",
  "match_tier", "match_outcome", "rules_triggered", "name_similarity",
  "preliminary_status",
  "group_classification", "group_default_outcome", "group_rules_triggered",
  "assigned_territory", "assigned_salesperson",
  "rejection_level", "rejection_type", "reason_tags",
] as const;

export function toResultRow(p: ProcessedCandidate): Record<string, unknown> {
  const m = p.match;
  return {
    candidate_id: m.candidate.id,
    candidate_name_original: m.normalisedName.candidateOriginal, candidate_name_normalised: m.normalisedName.candidateNormalised,
    candidate_brand: m.candidate.brand,
    candidate_postcode_original: m.normalisedPostcode.candidateOriginal, candidate_postcode_normalised: m.normalisedPostcode.candidateNormalised,
    candidate_phone_original: m.normalisedPhone.candidateOriginal, candidate_phone_normalised: m.normalisedPhone.candidateNormalised,
    customer_id: m.matchedCustomerId,
    customer_name_original: m.normalisedName.customerOriginal, customer_name_normalised: m.normalisedName.customerNormalised,
    customer_status: m.matchedCustomer?.status ?? null,
    match_tier: m.matchTier, match_outcome: m.outcome, rules_triggered: m.rulesTriggered.join(";"),
    name_similarity: m.nameSimilarity === null ? "" : m.nameSimilarity.toFixed(3),
    preliminary_status: p.preliminaryStatus,
    group_classification: p.group?.classification ?? "", group_default_outcome: p.group?.defaultOutcome ?? "",
    group_rules_triggered: (p.group?.rulesTriggered ?? []).join(";"),
    assigned_territory: p.assignedTerritory ?? "", assigned_salesperson: p.assignedSalesperson ?? "",
    rejection_level: p.rejection.level, rejection_type: p.rejection.type ?? "", reason_tags: p.rejection.reasonTags.join(";"),
  };
}

export interface RunMetadata {
  runId: string;
  tenantId: string;
  processingTimestamp: string;
  matchingRuleVersion: string;
  groupRegistryVersion: string;
  sourceFileHashes: Record<string, string>;
  inputCounts: { candidates: number; customers: number; assignments: number; groupRegistryEntries: number };
  outputCounts: Record<string, number>;
  warnings: string[];
  unmappedColumns: Record<string, string[]>;
  syntheticTestRun: boolean;
  notice: string;
}

export async function writeAuditOutputs(outDir: string, processed: ProcessedCandidate[], metadata: RunMetadata): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });

  const rows = processed.map(toResultRow);
  await fs.writeFile(path.join(outDir, "customer-match-results.csv"), writeCsv([...RESULT_COLUMNS], rows));
  await fs.writeFile(path.join(outDir, "customer-match-results.json"), JSON.stringify(processed.map((p) => ({
    candidateId: p.match.candidate.id, outcome: p.match.outcome, matchTier: p.match.matchTier,
    matchedCustomerId: p.match.matchedCustomerId, rulesTriggered: p.match.rulesTriggered, nameSimilarity: p.match.nameSimilarity,
    preliminaryStatus: p.preliminaryStatus, group: p.group, assignedTerritory: p.assignedTerritory,
    assignedSalesperson: p.assignedSalesperson, rejection: p.rejection,
    normalisedName: p.match.normalisedName, normalisedPostcode: p.match.normalisedPostcode, normalisedPhone: p.match.normalisedPhone,
  })), null, 2));

  const bucket = (pred: (p: ProcessedCandidate) => boolean) => rows.filter((_, i) => pred(processed[i]));

  await fs.writeFile(path.join(outDir, "active-customers-excluded.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "active_customer" || p.preliminaryStatus === "branch_of_active_customer")));
  await fs.writeFile(path.join(outDir, "inactive-customer-reactivation.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "inactive_customer" || p.preliminaryStatus === "branch_of_inactive_customer")));
  await fs.writeFile(path.join(outDir, "probable-customer-matches.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "probable_customer_match")));
  await fs.writeFile(path.join(outDir, "clear-prospects.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "clear_for_enrichment" || p.preliminaryStatus === "possible_customer_match")));
  await fs.writeFile(path.join(outDir, "large-group-exclusions.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "excluded_large_group" || p.preliminaryStatus === "ownership_unclear")));
  await fs.writeFile(path.join(outDir, "key-account-opportunities.csv"), writeCsv([...RESULT_COLUMNS],
    bucket((p) => p.preliminaryStatus === "key_account_opportunity")));

  await fs.writeFile(path.join(outDir, "processing-summary.json"), JSON.stringify(metadata, null, 2));
}
