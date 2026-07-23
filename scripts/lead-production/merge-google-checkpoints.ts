// Merges the accepted 51-candidate original Google-stage checkpoint (after the postcode-fix
// reprocessing pass) with the 32-candidate supplemental checkpoint (the corrected re-query of
// the original no_google_match bucket) into one final, complete 83-candidate checkpoint.
//
// Reads both source directories READ-ONLY — neither is modified. The 32 candidate IDs present
// in the supplemental directory are treated as authoritative REPLACEMENTS for those same IDs in
// the original directory (the original 32 no_google_match rows for those candidates are
// superseded, never both retained — that would double-count the population).
//
// The original 51 predate the raw-evidence-retention fix (commit 68398d1): their google-results
// rows have no result_count/zero_results/all_returned_place_ids/all_returned_names columns at
// all. These are written into the merged CSV as the literal string
// "n/a (predates raw-evidence-retention fix)" — never a fabricated 0/false/empty value that
// would misrepresent them as having been captured under the new schema.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeCsv, parseCsvObjects } from "./csv";

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
async function md5(filePath: string): Promise<string> {
  return createHash("md5").update(await fs.readFile(filePath)).digest("hex");
}

const PREDATES_FIX = "n/a (predates raw-evidence-retention fix)";

/** Merge two CSV files keyed by candidate_id: original rows minus the superseded IDs, plus every
 *  supplemental row. Columns are the UNION of both files' columns, in the order: original's
 *  columns first, then any supplemental-only columns appended. Any cell missing in a source row
 *  for a column the other source has is filled with PREDATES_FIX (original-only columns absent
 *  from supplemental would mean the reverse — not expected here, but handled the same way for
 *  robustness) rather than left blank (which reads as empty/zero, not "not captured"). */
async function mergeCsv(originalPath: string, supplementalPath: string, supersededIds: Set<string>, outPath: string): Promise<{ mergedCount: number; columns: string[] }> {
  const { header: origHeader, rows: origRows } = parseCsvObjects(await fs.readFile(originalPath, "utf8"));
  const { header: suppHeader, rows: suppRows } = parseCsvObjects(await fs.readFile(supplementalPath, "utf8"));
  const columns = [...origHeader, ...suppHeader.filter((c) => !origHeader.includes(c))];

  const kept = origRows.filter((r) => !supersededIds.has(r.candidate_id));
  const merged = [...kept, ...suppRows].map((r) => {
    const full: Record<string, unknown> = {};
    for (const c of columns) full[c] = c in r ? r[c] : PREDATES_FIX;
    return full;
  });
  await fs.writeFile(outPath, writeCsv(columns, merged));
  return { mergedCount: merged.length, columns };
}

async function main() {
  const originalDir = arg("original-dir");
  const supplementalDir = arg("supplemental-dir");
  const outDir = arg("out");
  const missing = [!originalDir && "--original-dir=<path>", !supplementalDir && "--supplemental-dir=<path>", !outDir && "--out=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  await fs.mkdir(outDir!, { recursive: true });

  console.log("=== Google-stage checkpoint merge (original 51 + supplemental 32 = final 83) ===");
  console.log(`Original (read-only): ${originalDir}`);
  console.log(`Supplemental (read-only): ${supplementalDir}`);

  const supplementalIds = JSON.parse(await fs.readFile(path.join(supplementalDir!, "supplemental-candidate-ids.json"), "utf8")) as string[];
  const supplementalIdSet = new Set(supplementalIds);
  if (supplementalIdSet.size !== supplementalIds.length) throw new Error("supplemental-candidate-ids.json contains duplicates.");
  console.log(`Supplemental candidate IDs: ${supplementalIds.length} (unique: ${supplementalIdSet.size})`);

  // --- google-results.json: JSON merge (richest source — includes raw-evidence fields where present) ---
  const originalResultsPath = path.join(originalDir!, "google-results.json");
  const supplementalResultsPath = path.join(supplementalDir!, "google-results.json");
  const originalResults = JSON.parse(await fs.readFile(originalResultsPath, "utf8")) as any[];
  const supplementalResults = JSON.parse(await fs.readFile(supplementalResultsPath, "utf8")) as any[];
  const originalChecksum = await md5(originalResultsPath);
  const supplementalChecksum = await md5(supplementalResultsPath);

  const keptOriginal = originalResults.filter((r) => !supplementalIdSet.has(r.candidateId));
  const mergedResults = [...keptOriginal, ...supplementalResults];
  const mergedIds = new Set(mergedResults.map((r) => r.candidateId));
  if (mergedIds.size !== 83) throw new Error(`Merged google-results.json does not reconcile to 83 unique candidates (got ${mergedIds.size} unique of ${mergedResults.length} total).`);
  if (mergedResults.length !== 83) throw new Error(`Merged google-results.json has ${mergedResults.length} rows, expected exactly 83.`);
  await fs.writeFile(path.join(outDir!, "google-results.json"), JSON.stringify(mergedResults, null, 2));
  console.log(`google-results.json merged: ${keptOriginal.length} kept (of ${originalResults.length} original) + ${supplementalResults.length} supplemental = ${mergedResults.length}`);

  // --- CSV merges (candidate_id-keyed union) ---
  const csvFiles = [
    "google-results.csv", "fsa-resolution-after-google.csv", "customer-resolution-after-google.csv",
    "physical-premises-results.csv", "complete-google-evidence-register.csv",
  ];
  const mergeStats: Record<string, number> = {};
  for (const f of csvFiles) {
    const { mergedCount } = await mergeCsv(path.join(originalDir!, f), path.join(supplementalDir!, f), supplementalIdSet, path.join(outDir!, f));
    mergeStats[f] = mergedCount;
    if (mergedCount !== 83) console.warn(`WARNING: ${f} merged to ${mergedCount} rows, expected 83.`);
  }

  // newly-detected-groups.csv is NOT candidate-complete by design (only candidates with a
  // newly-detected group signal appear at all) — merge is a straightforward superseded-ID
  // filter + union, no 83-row expectation.
  {
    const { header: origHeader, rows: origRows } = parseCsvObjects(await fs.readFile(path.join(originalDir!, "newly-detected-groups.csv"), "utf8"));
    const { rows: suppRows } = parseCsvObjects(await fs.readFile(path.join(supplementalDir!, "newly-detected-groups.csv"), "utf8"));
    const kept = origRows.filter((r) => !supplementalIdSet.has(r.candidate_id));
    const merged = [...kept, ...suppRows];
    await fs.writeFile(path.join(outDir!, "newly-detected-groups.csv"), writeCsv(origHeader, merged));
    mergeStats["newly-detected-groups.csv"] = merged.length;
  }

  // --- original-versus-supplemental-diff.csv: before/after for exactly the 32 replaced candidates ---
  const originalByCandidate = new Map(originalResults.map((r) => [r.candidateId, r]));
  const supplementalByCandidate = new Map(supplementalResults.map((r) => [r.candidateId, r]));
  const { rows: origFsaRows } = parseCsvObjects(await fs.readFile(path.join(originalDir!, "fsa-resolution-after-google.csv"), "utf8"));
  const { rows: suppFsaRows } = parseCsvObjects(await fs.readFile(path.join(supplementalDir!, "fsa-resolution-after-google.csv"), "utf8"));
  const { rows: origCustRows } = parseCsvObjects(await fs.readFile(path.join(originalDir!, "customer-resolution-after-google.csv"), "utf8"));
  const { rows: suppCustRows } = parseCsvObjects(await fs.readFile(path.join(supplementalDir!, "customer-resolution-after-google.csv"), "utf8"));
  const { rows: origPremRows } = parseCsvObjects(await fs.readFile(path.join(originalDir!, "physical-premises-results.csv"), "utf8"));
  const { rows: suppPremRows } = parseCsvObjects(await fs.readFile(path.join(supplementalDir!, "physical-premises-results.csv"), "utf8"));
  const byId = (rows: Record<string, string>[]) => new Map(rows.map((r) => [r.candidate_id, r]));
  const origFsaById = byId(origFsaRows), suppFsaById = byId(suppFsaRows);
  const origCustById = byId(origCustRows), suppCustById = byId(suppCustRows);
  const origPremById = byId(origPremRows), suppPremById = byId(suppPremRows);

  const DIFF_COLUMNS = [
    "candidate_id", "candidate_trading_name",
    "original_google_outcome", "supplemental_google_outcome",
    "original_fsa_resolution", "supplemental_fsa_resolution",
    "original_customer_resolution", "supplemental_customer_resolution",
    "original_physical_premises", "supplemental_physical_premises",
    "changed",
  ] as const;
  const diffRows = supplementalIds.map((id) => {
    const orig = originalByCandidate.get(id);
    const supp = supplementalByCandidate.get(id)!;
    const row = {
      candidate_id: id, candidate_trading_name: supp.candidateTradingName,
      original_google_outcome: orig?.outcome ?? "", supplemental_google_outcome: supp.outcome,
      original_fsa_resolution: origFsaById.get(id)?.resolution ?? "", supplemental_fsa_resolution: suppFsaById.get(id)?.resolution ?? "",
      original_customer_resolution: origCustById.get(id)?.resolution_outcome ?? "", supplemental_customer_resolution: suppCustById.get(id)?.resolution_outcome ?? "",
      original_physical_premises: origPremById.get(id)?.result ?? "", supplemental_physical_premises: suppPremById.get(id)?.result ?? "",
      changed: "",
    };
    row.changed = String(row.original_google_outcome !== row.supplemental_google_outcome
      || row.original_customer_resolution !== row.supplemental_customer_resolution
      || row.original_physical_premises !== row.supplemental_physical_premises);
    return row;
  });
  await fs.writeFile(path.join(outDir!, "original-versus-supplemental-diff.csv"), writeCsv([...DIFF_COLUMNS], diffRows));

  // --- Recomputed summary from the FULL merged 83 ---
  const countBy = (rows: unknown[], get: (r: any) => string) => {
    const counts: Record<string, number> = {};
    for (const r of rows) { const k = get(r); counts[k] = (counts[k] ?? 0) + 1; }
    return counts;
  };
  const { rows: mergedFsaRows } = parseCsvObjects(await fs.readFile(path.join(outDir!, "fsa-resolution-after-google.csv"), "utf8"));
  const { rows: mergedCustRows } = parseCsvObjects(await fs.readFile(path.join(outDir!, "customer-resolution-after-google.csv"), "utf8"));
  const { rows: mergedPremRows } = parseCsvObjects(await fs.readFile(path.join(outDir!, "physical-premises-results.csv"), "utf8"));
  const { rows: mergedGroupRows } = parseCsvObjects(await fs.readFile(path.join(outDir!, "newly-detected-groups.csv"), "utf8"));

  const changedCount = diffRows.filter((r) => r.changed === "true").length;
  const summary = {
    mergedFrom: { originalDir, supplementalDir }, mergeTimestamp: new Date().toISOString(),
    candidatesExpected: 83, candidatesProcessed: mergedResults.length,
    supplementalCandidateCount: supplementalIds.length,
    supplementalCandidatesChanged: changedCount,
    correctionNotice: "FINAL MERGED CHECKPOINT. 51 candidates carried forward unchanged from the postcode-fix-reprocessed original Google-stage run (2026-07-23T03-09-14Z). 32 candidates (originally no_google_match) replaced with a supplemental live re-query using the corrected query strategy (no FSA name, + UK locality hint) and full raw-evidence retention. The original 51's google-results rows predate the raw-evidence-retention fix and are marked accordingly in google-results.csv.",
    googleOutcomeCounts: countBy(mergedResults, (r) => r.outcome),
    fsaResolutionCounts: countBy(mergedFsaRows, (r) => r.resolution),
    customerResolutionCounts: countBy(mergedCustRows, (r) => r.resolution_outcome),
    physicalPremisesCounts: countBy(mergedPremRows, (r) => r.result),
    newlyDetectedGroupsCount: mergedGroupRows.length,
    totalReconciled: mergedResults.length,
    notice: "Google Places identity/premises evidence, FSA-multiple-match resolution, customer-match resolution, physical-premises assessment, and group rescreen only. No numeric Level 0-4 score has been assigned. No candidate here is sales-ready. Companies House, websites, scoring and representative exports have NOT been called.",
  };
  await fs.writeFile(path.join(outDir!, "google-processing-summary.json"), JSON.stringify(summary, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(),
    acceptedCodeCheckpoints: { googleStageImplementation: "74bd669", classificationFixes: "c9e7c89", reprocessedCheckpoint: "f55ce66", evidenceRetentionFix: "68398d1" },
    originalDir, originalDirGoogleResultsChecksum: originalChecksum,
    supplementalDir, supplementalDirGoogleResultsChecksum: supplementalChecksum,
    supplementalCandidateIds: supplementalIds,
    supplementalQueryStrategy: "candidate trading name + full postcode + 'UK' locality hint — no FSA establishment name appended under any circumstance (--no-fsa-name-in-query)",
    supplementalRequestControls: { maxCandidates: 32, maxLiveGoogleApiCalls: 32, oneRequestPerCandidate: true, pagination: false, placeDetailsCalls: false, mockOrSyntheticFallback: false },
    mergeStats,
    changedOutcomeCount: changedCount,
  };
  await fs.writeFile(path.join(outDir!, "supplemental-run-manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nMerge stats: ${JSON.stringify(mergeStats)}`);
  console.log(`Google outcome counts (final 83): ${JSON.stringify(summary.googleOutcomeCounts)}`);
  console.log(`\nFinal merged checkpoint written to: ${outDir}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
