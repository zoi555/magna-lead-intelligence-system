// Phase 7 CLI (spec Phase D): final ownership/group rescreen. Reads the Google, Companies
// House, and Website checkpoints as read-only input — no live calls, pure consolidation, so
// running it IS the live execution (same as the public-profile stage).

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv, parseCsvObjects } from "./csv";
import { finalGroupRescreen } from "./final-group-rescreen";
import type { NewlyDetectedGroup, FinalGroupRescreenResult } from "./types";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const COLUMNS = ["candidate_id", "classification", "default_outcome", "evidence_sources", "evidence_tags"] as const;
function row(r: FinalGroupRescreenResult): Record<string, unknown> {
  return { candidate_id: r.candidateId, classification: r.classification, default_outcome: r.defaultOutcome ?? "", evidence_sources: r.evidenceSources.join(";"), evidence_tags: r.evidenceTags.join(" | ") };
}

async function main() {
  const googleCheckpointDir = arg("google-checkpoint");
  const companiesHouseDir = arg("companies-house-dir");
  const websiteDir = arg("website-dir");
  const outArg = arg("out");
  const territory = arg("territory") ?? "UB1";
  const missing = [!googleCheckpointDir && "--google-checkpoint=<path>", !companiesHouseDir && "--companies-house-dir=<path>", !websiteDir && "--website-dir=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });
  console.log("=== Lead-production bridge: Phase 7 — Final ownership/group rescreen ===");

  const populationManifest = JSON.parse(await fs.readFile(path.join(companiesHouseDir!, "companies-house-population-manifest.json"), "utf8")) as { eligibleIds: string[] };
  const eligibleIds = populationManifest.eligibleIds;

  const { rows: physicalPremisesRows } = parseCsvObjects(await fs.readFile(path.join(googleCheckpointDir!, "physical-premises-results.csv"), "utf8"));
  const physicalPremisesByCandidate = new Map(physicalPremisesRows.map((r) => [r.candidate_id, r.result]));

  const { rows: newlyDetectedGroups } = parseCsvObjects(await fs.readFile(path.join(googleCheckpointDir!, "newly-detected-groups.csv"), "utf8"));
  const newlyDetectedByCandidate = new Map<string, NewlyDetectedGroup>(newlyDetectedGroups.map((r) => [r.candidate_id, {
    candidateId: r.candidate_id, candidateTradingName: r.candidate_trading_name, signal: r.signal as NewlyDetectedGroup["signal"],
    classification: r.classification as NewlyDetectedGroup["classification"], defaultOutcome: (r.default_outcome || null) as NewlyDetectedGroup["defaultOutcome"], evidenceTags: r.evidence_tags ? r.evidence_tags.split(";") : [],
  }]));

  const { rows: relatedRows } = parseCsvObjects(await fs.readFile(path.join(companiesHouseDir!, "related-companies.csv"), "utf8"));
  const relatedByCandidate = new Map(relatedRows.map((r) => [r.candidate_id, r]));

  const { rows: websiteRows } = parseCsvObjects(await fs.readFile(path.join(websiteDir!, "website-extracted-data.csv"), "utf8"));
  const websiteByCandidate = new Map(websiteRows.map((r) => [r.candidate_id, r]));

  const results: FinalGroupRescreenResult[] = eligibleIds.map((candidateId) => {
    const related = relatedByCandidate.get(candidateId);
    const relatedCategory = (related?.category as any) || null;
    const relatedDefaultOutcome = (related as any)?.default_outcome || null;
    const google = newlyDetectedByCandidate.get(candidateId) ?? null;
    const physicalPremises = (physicalPremisesByCandidate.get(candidateId) as any) || null;
    const websiteRow = websiteByCandidate.get(candidateId);
    const franchiseClues = websiteRow?.franchise_group_clues ? websiteRow.franchise_group_clues.split(";").filter(Boolean) : [];
    return finalGroupRescreen(candidateId, relatedCategory, relatedDefaultOutcome, google, physicalPremises, franchiseClues);
  });

  await fs.writeFile(path.join(outDir, "final-group-rescreen-results.csv"), writeCsv([...COLUMNS], results.map(row)));
  await fs.writeFile(path.join(outDir, "final-group-rescreen-results.json"), JSON.stringify(results, null, 2));

  const countBy = (rows: unknown[], get: (r: any) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = { territory, processingTimestamp: new Date().toISOString(), candidatesProcessed: results.length, classificationCounts: countBy(results, (r) => r.classification), notice: "No candidate is sales-ready. No final scoring has been run." };
  await fs.writeFile(path.join(outDir, "final-group-rescreen-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`Classification counts: ${JSON.stringify(summary.classificationCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
