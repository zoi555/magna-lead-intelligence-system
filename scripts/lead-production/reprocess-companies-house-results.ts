// One-off, NO-NEW-API-CALLS correction pass for the live UB1 Companies House run, which was
// executed BEFORE the company_name_conflict/registered_address_conflict mislabel was found and
// fixed (see commit 3a48839). Relabels ONLY the specific buggy cases — identified precisely by
// the OLD literal evidence tag "NAME_MATCHES_DIFFERENT_REGISTERED_ADDRESS", which the fixed
// classifyCompanyMatch() never produces again — never touches any other outcome, and makes
// ZERO Companies House requests. Downstream officer/PSC/financial/customer-resolution/related-
// company outputs are UNCHANGED and NOT rewritten: both the old (company_name_conflict) and new
// (registered_address_conflict) labels are non-decisive outcomes, so no candidate's downstream
// processing (which only runs for exact/strong-probable matches) is affected by this relabel —
// verified before writing this script, not assumed.

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv, parseCsvObjects } from "./csv";
import type { CompanyLegalIdentityResult } from "./types";

const OLD_BUGGY_TAG = "NAME_MATCHES_DIFFERENT_REGISTERED_ADDRESS";
const NEW_TAGS = ["NAME_MATCHES_DIFFERENT_POSTAL_DISTRICT_REGISTERED_ADDRESS", "REGISTERED_OFFICE_LIKELY_ACCOUNTANT_OR_FORMATION_AGENT"];

const CH_RESULT_COLUMNS = [
  "candidate_id", "candidate_trading_name", "candidate_postcode", "outcome", "companies_house_status",
  "num_plausible_companies", "best_company_number", "best_company_name", "best_company_status",
  "best_registered_office_address", "best_registered_postcode", "best_legal_name_similarity", "best_postcode_agreement",
  "evidence_tags", "search_queries_used", "retrieval_timestamp", "api_failure_reason", "api_attempts",
] as const;
function chResultRow(r: CompanyLegalIdentityResult): Record<string, unknown> {
  const best = r.plausibleCompanies[0] ?? null;
  return {
    candidate_id: r.candidateId, candidate_trading_name: r.candidateTradingName, candidate_postcode: r.candidatePostcode ?? "",
    outcome: r.outcome, companies_house_status: r.companiesHouseStatus ?? "",
    num_plausible_companies: r.plausibleCompanies.length, best_company_number: best?.companyNumber ?? "", best_company_name: best?.companyName ?? "",
    best_company_status: best?.companyStatus ?? "", best_registered_office_address: best?.registeredOfficeAddress ?? "", best_registered_postcode: best?.registeredPostcode ?? "",
    best_legal_name_similarity: best ? best.legalNameSimilarity.toFixed(3) : "", best_postcode_agreement: best?.postcodeAgreement ?? "",
    evidence_tags: r.evidenceTags.join(";"), search_queries_used: r.searchQueriesUsed.join(";"), retrieval_timestamp: r.retrievalTimestamp,
    api_failure_reason: r.apiFailureReason ?? "", api_attempts: r.apiAttempts,
  };
}

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

async function main() {
  const dir = arg("dir");
  if (!dir) { console.error("Missing required argument: --dir=<existing companies-house-stage output dir>"); process.exit(1); }

  console.log("=== Companies House reprocessing pass (ZERO new Companies House calls) ===");
  console.log(`Directory: ${dir}`);

  const resultsPath = path.join(dir, "companies-house-results.json");
  const results = JSON.parse(await fs.readFile(resultsPath, "utf8")) as CompanyLegalIdentityResult[];

  const changedIds = new Set<string>();
  const relabelled = results.map((r) => {
    if (r.outcome === "company_name_conflict" && r.evidenceTags.includes(OLD_BUGGY_TAG)) {
      changedIds.add(r.candidateId);
      return { ...r, outcome: "registered_address_conflict" as const, evidenceTags: NEW_TAGS };
    }
    return r;
  });
  console.log(`Relabelled ${changedIds.size} of ${results.length} candidates (company_name_conflict -> registered_address_conflict).`);

  await fs.writeFile(resultsPath, JSON.stringify(relabelled, null, 2));
  await fs.writeFile(path.join(dir, "companies-house-results.csv"), writeCsv([...CH_RESULT_COLUMNS], relabelled.map(chResultRow)));

  const bucket = (pred: (r: CompanyLegalIdentityResult) => boolean) => relabelled.filter(pred).map(chResultRow);
  await fs.writeFile(path.join(dir, "exact-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], bucket((r) => r.outcome === "exact_company_match")));
  await fs.writeFile(path.join(dir, "probable-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], bucket((r) => r.outcome === "strong_probable_company_match")));
  await fs.writeFile(path.join(dir, "multiple-or-conflicting-company-matches.csv"), writeCsv([...CH_RESULT_COLUMNS], bucket((r) => ["multiple_company_matches", "company_name_conflict", "registered_address_conflict", "dissolved_company_conflict", "dormant_company_conflict"].includes(r.outcome))));
  await fs.writeFile(path.join(dir, "no-company-record.csv"), writeCsv([...CH_RESULT_COLUMNS], bucket((r) => r.outcome === "no_company_record" || r.outcome === "probable_sole_trader_or_partnership")));
  await fs.writeFile(path.join(dir, "companies-house-api-failures.csv"), writeCsv([...CH_RESULT_COLUMNS], bucket((r) => r.outcome === "companies_house_api_failure")));

  // --- Evidence register: rewrite only the outcome-dependent columns for the relabelled rows,
  // preserving every other (unaffected) column exactly as originally written. ---
  const registerPath = path.join(dir, "complete-companies-house-evidence-register.csv");
  const { header: registerHeader, rows: registerRows } = parseCsvObjects(await fs.readFile(registerPath, "utf8"));
  const relabelledById = new Map(relabelled.filter((r) => changedIds.has(r.candidateId)).map((r) => [r.candidateId, r]));
  const updatedRegisterRows = registerRows.map((row) => {
    const r = relabelledById.get(row.candidate_id);
    if (!r) return row;
    return { ...row, outcome: r.outcome, evidence_tags: r.evidenceTags.join(";") };
  });
  await fs.writeFile(registerPath, writeCsv(registerHeader, updatedRegisterRows));

  // --- Summary counts ---
  const summaryPath = path.join(dir, "companies-house-processing-summary.json");
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  const countBy = (rows: unknown[], get: (r: any) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  summary.legalIdentityOutcomeCounts = countBy(relabelled, (r) => r.outcome);
  summary.correctionNotice = `REPROCESSED — ${changedIds.size} candidates relabelled from company_name_conflict to registered_address_conflict after fixing a mislabel found in the live run (see commit 3a48839). ZERO new Companies House API calls were made for this correction.`;
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\nUpdated legal identity outcome counts: ${JSON.stringify(summary.legalIdentityOutcomeCounts)}`);
  console.log(`\nOutputs rewritten to: ${dir}`);
  console.log("ZERO new Companies House API calls were made in this reprocessing pass.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
