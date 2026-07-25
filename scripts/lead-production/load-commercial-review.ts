// Loads the versioned commercial-review brand decision registry
// (config/lead-production/commercial-review-v1/). Brand decisions are NEVER hardcoded in
// application source — this is the only place they live, supplied by the approved commercial
// review and versioned by directory name (commercial-review-v1, commercial-review-v2, ...),
// exactly the same convention as load-group-registry.ts for the large-group registry.
//
// Three source files, cross-validated against each other on every load (fail closed — refuse to
// run rather than silently proceed on a corrupted or partial registry):
//   - corrected_brand_decisions.csv (Brand Name, Decision) — the authoritative combined list.
//   - brands_to_keep_final.csv (Brand Name) — must exactly equal the "Keep" rows above.
//   - brands_to_exclude_final.csv (Brand Name) — must exactly equal the "Exclude Whole Brand" rows above.
//
// All three files are supplied as UTF-8 CSVs with a BOM and CRLF line endings (Windows-authored,
// confirmed by inspection) — the BOM is stripped on read; the source files themselves are never
// rewritten.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "./csv";
import { normaliseName } from "./normalize";

const DECISION_VALUES = new Set(["Keep", "Exclude Whole Brand"]);

export interface CommercialReviewRegistry {
  version: string; // directory name, e.g. "commercial-review-v1"
  sourcePaths: { corrected: string; keep: string; exclude: string };
  keepBrands: string[]; // original names, as supplied
  excludeBrands: string[]; // original names, as supplied
  keepNormalised: Set<string>;
  excludeNormalised: Set<string>;
  keepOriginalByNormalised: Map<string, string>;
  excludeOriginalByNormalised: Map<string, string>;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

async function readBrandNameCsv(filePath: string): Promise<string[]> {
  const raw = stripBom(await fs.readFile(filePath, "utf8"));
  const { header, rows } = parseCsvObjects(raw);
  if (header[0] !== "Brand Name") {
    throw new Error(`Commercial review (${filePath}): expected first column "Brand Name", got "${header[0]}".`);
  }
  return rows.map((r) => r["Brand Name"].trim()).filter(Boolean);
}

/** Loads and cross-validates the versioned brand-decision registry. Throws (refuses to proceed)
 *  on any count mismatch, overlap, or union discrepancy — this is the permanent form of the
 *  one-off manual verification performed before the registry was first wired into the pipeline,
 *  so every future regeneration re-checks it automatically rather than trusting a stale load. */
export async function loadCommercialReviewRegistry(dir: string): Promise<CommercialReviewRegistry> {
  const version = path.basename(dir);
  const correctedPath = path.join(dir, "corrected_brand_decisions.csv");
  const keepPath = path.join(dir, "brands_to_keep_final.csv");
  const excludePath = path.join(dir, "brands_to_exclude_final.csv");

  const correctedRaw = stripBom(await fs.readFile(correctedPath, "utf8"));
  const { header: correctedHeader, rows: correctedRows } = parseCsvObjects(correctedRaw);
  if (correctedHeader[0] !== "Brand Name" || correctedHeader[1] !== "Decision") {
    throw new Error(`Commercial review (${correctedPath}): expected columns "Brand Name,Decision", got "${correctedHeader.join(",")}".`);
  }
  const decisions = new Map<string, string>();
  for (const r of correctedRows) {
    const name = r["Brand Name"].trim();
    const decision = r["Decision"].trim();
    if (!name) continue;
    if (!DECISION_VALUES.has(decision)) throw new Error(`Commercial review (${correctedPath}): brand "${name}" has an unrecognised Decision "${decision}" — expected "Keep" or "Exclude Whole Brand". Stopping rather than guessing.`);
    if (decisions.has(name)) throw new Error(`Commercial review (${correctedPath}): duplicate brand "${name}" — refusing to proceed on an ambiguous registry.`);
    decisions.set(name, decision);
  }

  const keepBrands = await readBrandNameCsv(keepPath);
  const excludeBrands = await readBrandNameCsv(excludePath);
  const keepSet = new Set(keepBrands);
  const excludeSet = new Set(excludeBrands);
  if (keepSet.size !== keepBrands.length) throw new Error(`Commercial review (${keepPath}): duplicate brand name(s) found — refusing to proceed.`);
  if (excludeSet.size !== excludeBrands.length) throw new Error(`Commercial review (${excludePath}): duplicate brand name(s) found — refusing to proceed.`);

  const overlap = [...keepSet].filter((n) => excludeSet.has(n));
  if (overlap.length) throw new Error(`Commercial review registry (${version}): ${overlap.length} brand(s) appear in BOTH keep and exclude files: ${overlap.join(", ")}. Stopping rather than guessing which decision is authoritative.`);

  const union = new Set([...keepSet, ...excludeSet]);
  const correctedNames = new Set(decisions.keys());
  const inUnionNotCorrected = [...union].filter((n) => !correctedNames.has(n));
  const inCorrectedNotUnion = [...correctedNames].filter((n) => !union.has(n));
  if (inUnionNotCorrected.length || inCorrectedNotUnion.length) {
    throw new Error(
      `Commercial review registry (${version}): union of keep+exclude does not exactly match corrected_brand_decisions.csv. ` +
      `In union but not corrected: [${inUnionNotCorrected.join(", ")}]. In corrected but not union: [${inCorrectedNotUnion.join(", ")}]. Stopping rather than guessing.`,
    );
  }

  // Cross-check every row's own Decision label against which file it actually appears in —
  // catches a brand marked "Keep" in corrected_brand_decisions.csv but missing from
  // brands_to_keep_final.csv (or the exclude equivalent), a class of error the count/overlap/
  // union checks above would not by themselves catch if two errors happened to cancel out.
  const labelMismatches: string[] = [];
  for (const [name, decision] of decisions) {
    if (decision === "Keep" && !keepSet.has(name)) labelMismatches.push(`"${name}" is "Keep" in corrected_brand_decisions.csv but absent from brands_to_keep_final.csv`);
    if (decision === "Exclude Whole Brand" && !excludeSet.has(name)) labelMismatches.push(`"${name}" is "Exclude Whole Brand" in corrected_brand_decisions.csv but absent from brands_to_exclude_final.csv`);
  }
  if (labelMismatches.length) throw new Error(`Commercial review registry (${version}): ${labelMismatches.length} decision-label mismatch(es):\n  ${labelMismatches.join("\n  ")}`);

  const keepNormalised = new Set<string>();
  const excludeNormalised = new Set<string>();
  const keepOriginalByNormalised = new Map<string, string>();
  const excludeOriginalByNormalised = new Map<string, string>();
  for (const name of keepBrands) { const n = normaliseName(name); if (n) { keepNormalised.add(n); keepOriginalByNormalised.set(n, name); } }
  for (const name of excludeBrands) { const n = normaliseName(name); if (n) { excludeNormalised.add(n); excludeOriginalByNormalised.set(n, name); } }

  return {
    version, sourcePaths: { corrected: correctedPath, keep: keepPath, exclude: excludePath },
    keepBrands, excludeBrands, keepNormalised, excludeNormalised, keepOriginalByNormalised, excludeOriginalByNormalised,
  };
}
