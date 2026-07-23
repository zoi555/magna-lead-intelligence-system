// Phase 6 CLI (spec Phase C): decision-maker public-profile resolution. Reads the Companies
// House checkpoint's decision-maker-candidates.csv and the Website checkpoint's
// website-extracted-data.json as read-only input. No live external calls this run — see the
// module header on public-profile-resolution.ts for why (no lawful public-search connector was
// budgeted tonight; the spec explicitly authorises building/running this stage on official-
// website evidence only in that case, never stopping the rest of the pipeline).

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeCsv, parseCsvObjects } from "./csv";
import { resolvePublicProfile } from "./public-profile-resolution";
import type { WebsiteExtractedData, DecisionMakerCandidate, PublicProfileResult } from "./types";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function md5(filePath: string): Promise<string> { return createHash("md5").update(await fs.readFile(filePath)).digest("hex"); }

const COLUMNS = ["candidate_id", "person_name", "verified_company", "verified_role", "profile_url", "profile_source", "company_agreement", "role_agreement", "location_agreement", "outcome", "confidence", "evidence_tags"] as const;
function row(r: PublicProfileResult): Record<string, unknown> {
  return { candidate_id: r.candidateId, person_name: r.personName, verified_company: r.verifiedCompany ?? "", verified_role: r.verifiedRole ?? "", profile_url: r.profileUrl ?? "", profile_source: r.profileSource, company_agreement: r.companyAgreement ?? "", role_agreement: r.roleAgreement ?? "", location_agreement: r.locationAgreement ?? "", outcome: r.outcome, confidence: r.confidence, evidence_tags: r.evidenceTags.join(";") };
}

async function main() {
  const companiesHouseDir = arg("companies-house-dir");
  const websiteDir = arg("website-dir");
  const outArg = arg("out");
  const territory = arg("territory") ?? "UB1";
  const missing = [!companiesHouseDir && "--companies-house-dir=<path>", !websiteDir && "--website-dir=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });
  console.log("=== Lead-production bridge: Phase 6 — Decision-maker public-profile resolution ===");
  console.log("No lawful external public-search connector is configured for this run — using official-website evidence only, per the spec's explicit safe-fallback authorisation. No candidate is stopped from the rest of the pipeline as a result.");

  const dmPath = path.join(companiesHouseDir!, "decision-maker-candidates.csv");
  const { rows: dmRows } = parseCsvObjects(await fs.readFile(dmPath, "utf8"));
  const dmChecksum = await md5(dmPath);

  const websiteDataPath = path.join(websiteDir!, "website-extracted-data.json");
  const websiteData = JSON.parse(await fs.readFile(websiteDataPath, "utf8")) as WebsiteExtractedData[];
  const websiteChecksum = await md5(websiteDataPath);
  const websiteByCandidate = new Map(websiteData.map((w) => [w.candidateId, w]));

  const decisionMakers: DecisionMakerCandidate[] = dmRows.map((r) => ({
    candidateId: r.candidate_id, companyNumber: r.company_number || null, fullName: r.full_name,
    likelyRole: r.likely_role as DecisionMakerCandidate["likelyRole"], rank: Number(r.rank), sourceType: r.source_type as "officer" | "psc",
    evidenceTags: r.evidence_tags ? r.evidence_tags.split(";") : [],
  }));

  const results = decisionMakers.map((dm) => resolvePublicProfile(dm, websiteByCandidate.get(dm.candidateId) ?? null, null));

  await fs.writeFile(path.join(outDir, "public-profile-results.csv"), writeCsv([...COLUMNS], results.map(row)));
  await fs.writeFile(path.join(outDir, "public-profile-results.json"), JSON.stringify(results, null, 2));

  const countBy = (rows: unknown[], get: (r: any) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = {
    territory, processingTimestamp: new Date().toISOString(), decisionMakerCandidateCount: decisionMakers.length,
    outcomeCounts: countBy(results, (r) => r.outcome),
    scopingNotice: "No lawful external public-search connector was configured for this run. verified_linkedin_profile and strong_probable_public_profile are architecturally supported but were never produced this run — only official_website_profile_only (name found on the candidate's own official website) or no_public_profile_found were used, per the spec's own safe-fallback authorisation.",
    inputChecksums: { decisionMakerCandidatesCsv: dmChecksum, websiteExtractedDataJson: websiteChecksum },
    notice: "No candidate is sales-ready. No final scoring has been run.",
  };
  await fs.writeFile(path.join(outDir, "public-profile-processing-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`Outcome counts: ${JSON.stringify(summary.outcomeCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
