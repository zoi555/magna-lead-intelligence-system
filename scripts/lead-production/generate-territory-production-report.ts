// Representative production report generator — builds the management-facing
// "Lead_Production_Report.xlsx" for one representative's completed Sales Territory: district
// reconciliation, territory reconciliation, source calls, field contribution summary (real
// numbers derived from generate-field-provenance.ts's output, never invented), defects/fixes,
// versions, output paths, and a full Field Provenance tab. Read-only against already-accepted
// checkpoints and exports; makes no external call.
//
// This script is data-driven from a per-territory JSON config (see the TERRITORY_DATA object
// below) rather than re-deriving everything live, because the district-by-district and
// defect/fix history is narrative/investigative record already verified and written up in each
// territory's own TERRITORY-RECONCILIATION-REPORT.md this session — this script's job is to
// repackage that already-verified record into the standard workbook format, plus attach the
// freshly-generated, code-derived Field Provenance data (which IS computed live, from
// generate-field-provenance.ts's own CSV output, not hand-typed).

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { parseCsvObjects } from "./csv";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
}

const NAUMAN_DISTRICTS = [
  ["RM1", 688, 135, 553, 113, 60, 33, 27, 3, 1, 34, 4, 14],
  ["RM2", 639, 46, 593, 39, 21, 11, 10, 1, 0, 14, 0, 4],
  ["RM3", 434, 61, 373, 55, 27, 21, 6, 2, 0, 19, 0, 9],
  ["RM4", 228, 3, 225, 3, 2, 1, 1, 0, 0, 1, 0, 0],
  ["RM5", 628, 38, 590, 29, 17, 15, 2, 3, 0, 8, 0, 4],
  ["RM6", 954, 65, 889, 52, 30, 16, 14, 2, 0, 13, 3, 6],
  ["RM7", 822, 36, 786, 35, 19, 10, 9, 2, 0, 12, 0, 4],
  ["RM8", 870, 86, 784, 81, 48, 29, 19, 8, 0, 24, 5, 4],
  ["RM9", 651, 45, 606, 41, 16, 11, 5, 1, 0, 13, 4, 8],
  ["RM10", 751, 86, 665, 78, 36, 22, 14, 0, 1, 30, 5, 6],
  ["RM11", 655, 63, 592, 54, 30, 19, 11, 1, 1, 18, 2, 3],
  ["RM12", 605, 98, 507, 81, 39, 25, 14, 4, 0, 35, 0, 7],
  ["RM13", 478, 43, 435, 43, 27, 14, 13, 4, 0, 13, 1, 2],
  ["RM14", 139, 50, 89, 44, 26, 15, 11, 0, 0, 11, 2, 5],
];
const NAUMAN_SOURCE_CALLS = [
  ["RM1", 98, 88], ["RM2", 35, 32], ["RM3", 44, 40], ["RM4", 3, 3], ["RM5", 25, 23],
  ["RM6", 45, 43], ["RM7", 31, 28], ["RM8", 73, 67], ["RM9", 32, 28], ["RM10", 67, 60],
  ["RM11", 49, 46], ["RM12", 74, 70], ["RM13", 41, 36], ["RM14", 37, 34],
];
const NAUMAN_DEFECTS = [
  ["1", "run-full-territory.ts's phase1 stage never passed --assignments/--groups to run-comparison.ts", "Orchestrator (phase1 stage invocation)", "Fixed before any live call, zero cost impact", "ed56cbf"],
  ["2", "run-fsa-stage.ts hardcoded a UB1-specific 'expected 84 candidates' warning", "FSA stage script", "Self-derives the expected count now", "ed56cbf"],
  ["3", "Duplicate live discovery run for RM2 (two independent triggers 4 minutes apart)", "je-run.ts (no duplicate-run guard existed)", "Compared in full per an explicit decision rule; run A kept authoritative, run B annotated superseded; je-run.ts given a duplicate-run guard", "02af5a3"],
  ["4", "Cross-district dedup false-merged different chain/franchise premises sharing only a corporate domain/phone (81 of 748 candidates wrongly collapsed)", "district-reconciliation.ts's dedupeAcrossDistricts()", "Fixed to require same-full-postcode corroboration for all identifier tiers; identity-only floor raised 0.3->0.6", "df52f16"],
];
const NAUMAN_TESTS = "test-lead-production-territory-v2.ts (assignment config integrity, range/list expansion, validation failure modes, cross-district dedup tiered-identity fixtures including the real RM1/RM7/RM12 false-merge regression cases, per-district population invariant, territory status derivation precedence, end-to-end --request-plan-only smoke test) — ALL PASSED. npm run typecheck — clean. npm run build — succeeded.";

const MANRAJ_DISTRICTS = [
  ["KT1", 529, 137, 392, 99, 46, 24, 22, 2, 1, 39, 4, 9],
  ["KT2", 708, 63, 645, 53, 27, 12, 15, 1, 0, 18, 3, 5],
  ["KT3", 777, 66, 711, 54, 31, 18, 13, 3, 0, 15, 2, 6],
  ["KT4", 686, 42, 644, 27, 19, 16, 3, 0, 0, 7, 0, 1],
  ["KT5", 601, 9, 592, 9, 5, 4, 1, 1, 0, 2, 0, 2],
  ["KT6", 622, 105, 517, 94, 44, 26, 18, 1, 1, 31, 5, 13],
  ["KT7", 601, 12, 589, 11, 8, 6, 2, 1, 0, 2, 0, 1],
  ["KT8", 568, 38, 530, 34, 15, 12, 3, 1, 0, 16, 1, 2],
  ["KT9", 393, 23, 370, 22, 12, 7, 5, 1, 1, 4, 2, 3],
  ["KT10", 464, 17, 447, 16, 9, 6, 3, 2, 0, 4, 0, 3],
  ["KT11", 113, 19, 94, 19, 8, 4, 4, 1, 0, 4, 0, 7],
  ["KT12", 272, 64, 208, 44, 28, 16, 12, 2, 0, 10, 1, 5],
  ["KT13", 300, 32, 268, 30, 13, 9, 4, 1, 0, 9, 0, 8],
  ["KT14", 317, 28, 289, 23, 11, 3, 8, 0, 0, 8, 2, 2],
  ["KT15", 313, 55, 258, 49, 19, 13, 6, 1, 1, 20, 3, 6],
  ["KT16", 364, 23, 341, 20, 7, 6, 1, 0, 0, 10, 1, 2],
  ["KT17", 551, 56, 495, 45, 1, 1, 0, 0, 0, 39, 0, 5],
  ["KT18", 179, 12, 167, 11, 2, 1, 1, 0, 0, 4, 0, 5],
  ["KT19", 479, 95, 384, 84, 38, 21, 17, 1, 1, 36, 4, 5],
  ["KT20", 204, 17, 187, 16, 7, 4, 3, 1, 0, 7, 1, 1],
  ["KT21", 224, 7, 217, 7, 4, 3, 1, 0, 0, 3, 0, 0],
  ["KT22", 204, 40, 164, 37, 16, 11, 5, 1, 1, 12, 1, 7],
  ["KT23", 91, 5, 86, 5, 1, 1, 0, 0, 0, 2, 1, 1],
  ["KT24", 26, 4, 22, 4, 2, 0, 2, 0, 0, 2, 0, 0],
];
const MANRAJ_SOURCE_CALLS = [
  ["KT1", 89, 72], ["KT2", 45, 43], ["KT3", 47, 44], ["KT4", 26, 25], ["KT5", 7, 7],
  ["KT6", 80, 68], ["KT7", 10, 10], ["KT8", 30, 28], ["KT9", 18, 16], ["KT10", 13, 13],
  ["KT11", 12, 11], ["KT12", 39, 36], ["KT13", 20, 20], ["KT14", 21, 19], ["KT15", 40, 39],
  ["KT16", 15, 13], ["KT17", 40, 40], ["KT18", 6, 6], ["KT19", 79, 69], ["KT20", 11, 9],
  ["KT21", 7, 6], ["KT22", 30, 27], ["KT23", 4, 2], ["KT24", 4, 4],
];
const MANRAJ_DEFECTS: string[][] = [];
const MANRAJ_TESTS = "test-lead-production-territory-v2.ts — ALL PASSED. npm run typecheck — clean. npm run build — succeeded. No new pipeline defect found during KT processing — the already-fixed cross-district dedup tiering and both exporters' independent 25-duplicate agreement carried over cleanly from RM1-RM14.";

const AYESHA_DISTRICTS = [
  ["NW1", 1751, 232, 1519, 64, 32, 23, 9, 0, 0, 31, 0, 1],
  ["NW2", 1064, 103, 961, 88, 39, 20, 19, 1, 2, 29, 6, 12],
  ["NW3", 1295, 72, 1223, 17, 12, 8, 4, 0, 0, 5, 0, 0],
  ["NW4", 1111, 80, 1031, 17, 7, 1, 6, 0, 0, 7, 2, 1],
  ["NW5", 1301, 81, 1220, 17, 8, 3, 5, 0, 0, 9, 0, 0],
  ["NW6", 1124, 167, 957, 50, 24, 16, 8, 3, 1, 24, 1, 0],
  ["NW7", 853, 38, 815, 23, 9, 8, 1, 0, 0, 10, 0, 4],
  ["NW8", 1506, 27, 1479, 13, 5, 2, 3, 0, 0, 7, 1, 0],
  ["NW9", 993, 179, 814, 150, 69, 40, 29, 5, 6, 50, 9, 16],
  ["NW10", 1200, 243, 957, 86, 39, 22, 17, 2, 2, 34, 5, 6],
];
const AYESHA_SOURCE_CALLS = [
  ["NW1", 61, 53], ["NW2", 73, 65], ["NW3", 17, 16], ["NW4", 14, 14], ["NW5", 17, 15],
  ["NW6", 50, 41], ["NW7", 19, 17], ["NW8", 12, 10], ["NW9", 129, 123], ["NW10", 77, 69],
];
const AYESHA_DEFECTS = [
  ["1", "Website enrichment stage crashed the whole orchestrator process on a real HTTP/2 GOAWAY connection error (reproduced twice, identically, against the same remote host during live NW3 processing)", "website-adapter.ts (fetchWithTimeout's try/catch was bypassed by an EventEmitter 'error' event outside the promise chain)", "Forced HTTP/1.1 for all website-crawl requests via an explicit undici Agent({ allowH2: false }) dispatcher; added undici as an explicit dependency; made the fetch call an exported, reassignable binding so the existing test mocking pattern kept working; regression tests added (connection-level rejection caught gracefully, structural check that allowH2:false stays wired)", "0cec029"],
  ["2", "NW2 discovery run failed transiently (HTTP/2 GOAWAY during provenance write) with the query only 27% complete (286 of the eventual 1064 outlets)", "je-run.ts / discovery worker (transient network failure, not a logic defect)", "Evidence-completeness verified (100% of the failed run's outlets were a strict subset of the bounded replacement run's — zero lost); failed run marked failed_transient_network and preserved; app_audit_log entry written; replacement run used as sole authoritative evidence", "n/a (no code change — transient failure, procedure documented in docs/09_DECISIONS.md)"],
  ["3", "NW7 discovery run failed transiently (HTTP/2 stream timeout during insertRawObservation/finishExecution); additionally left discovery_runs.status stuck at 'queued' (never transitioned to 'failed'), blocking the duplicate-run guard on retry", "je-run.ts discovery worker + src/lib/discovery-engine/repository/supabase.ts's finishExecution (the stuck-status bookkeeping gap is a real robustness issue, logged as ISS-0031 for a future source-level fix)", "Evidence-completeness verified (zero lost outlets); discovery_runs.status corrected directly (documented, audited) to unblock the guard; bounded replacement run performed and used as sole authoritative evidence", "n/a this session (ISS-0031 logged for future root-cause fix; not a final-lead-data defect)"],
];
const AYESHA_TESTS = "test-lead-production-territory-v2.ts — ALL PASSED. test-lead-production-website.ts — ALL PASSED (including 2 new regressions for ISS-0030: a connection-level fetch rejection is caught gracefully, and a structural check that the HTTP/1.1-only dispatcher stays wired). npm run typecheck — clean. npm run build — succeeded.";

const KUNZ_DISTRICTS = [
  ["TW1", 622, 88, 534, 70, 38, 23, 15, 3, 0, 21, 4, 7],
  ["TW2", 815, 45, 770, 38, 21, 10, 11, 0, 1, 8, 2, 6],
  ["TW3", 805, 184, 621, 167, 66, 46, 20, 6, 11, 42, 40, 8],
  ["TW4", 750, 53, 697, 47, 16, 11, 5, 0, 3, 18, 9, 1],
  ["TW5", 945, 52, 893, 47, 15, 11, 4, 1, 1, 11, 16, 4],
  ["TW6", 75, 1, 74, 1, 0, 0, 0, 0, 0, 1, 0, 0],
  ["TW7", 1021, 51, 970, 26, 7, 5, 2, 2, 0, 14, 1, 4],
  ["TW8", 998, 41, 957, 34, 9, 6, 3, 1, 2, 14, 2, 7],
  ["TW9", 235, 27, 208, 23, 9, 5, 4, 1, 0, 7, 2, 5],
  ["TW10", 87, 5, 82, 5, 1, 1, 0, 0, 1, 2, 1, 0],
];
const KUNZ_SOURCE_CALLS = [
  ["TW1", 61, 56], ["TW2", 30, 27], ["TW3", 144, 122], ["TW4", 42, 37], ["TW5", 38, 27],
  ["TW6", 1, 1], ["TW7", 20, 16], ["TW8", 26, 23], ["TW9", 18, 15], ["TW10", 4, 4],
];
const KUNZ_DEFECTS: string[][] = [
  ["1", "run-full-territory.ts read map_required directly from a hand-typed assignment CSV column, never cross-checked against the authoritative config/lead-production/sales-territories-v2.json — the CSV was found hardcoded to true for every representative including telesales, and nothing in the reusable pipeline would have caught a wrong value", "run-full-territory.ts's assignment-resolution step (Stage 1); no downstream consumer previously used the resolved value for anything but a log line", "Added scripts/lead-production/resolve-map-required.ts (single authoritative resolver reading sales-territories-v2.json's own mapsRequired field, fails closed on an unrecognised representative); run-full-territory.ts now ignores the CSV's map_required column entirely and refuses on a role mismatch between the CSV and the canonical config; wired assignment into phase1's config-hash dependencies so a changed sales-territories-v2.json invalidates affected checkpoints; added scripts/lead-production/generate-representative-handover.ts (new reusable handover-package builder that gates the map deliverable on the resolved value) and used it to correct Kunz's already-built package (removed the map file it had incorrectly included). 27-assertion regression suite: scripts/test-map-required.ts", "a8f94b4"],
];
const KUNZ_TESTS = "test-lead-production-territory-v2.ts — ALL PASSED. test-discovery-run-recovery.ts (ISS-0031) — ALL PASSED. test-map-required.ts — ALL PASSED (27 assertions), fixed and verified before TW11 started. npm run typecheck — clean. npm run build — succeeded. No lead-data defect found during TW1-TW10 processing.";

const TERRITORIES: Record<string, any> = {
  ayesha: {
    representative: "Ayesha", role: "Field Sales", salesTerritory: "NW1-NW10", filePrefix: "Ayesha_NW1-NW10",
    districts: AYESHA_DISTRICTS, sourceCalls: AYESHA_SOURCE_CALLS, defects: AYESHA_DEFECTS, tests: AYESHA_TESTS,
    totalRaw: 12198, totalValid: 1222, totalRejected: 10976, totalCandidates: 525, duplicatesRemoved: 14, uniqueCandidates: 511,
    usable: 238, premium: 140, releasableL1: 98, keyAccounts: 10, held: 10, hardRejected: 200, customerExclusions: 23, excludedGroups: 40,
    salesProNewLeads: 228, salesProKeyAccounts: 10, salesProCustExclusions: 23,
    commitSha: "0cec029 (ISS-0030 website-crawl HTTP/1.1 fix, applied mid-territory)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring rules v2, assignment v2",
    handoverDir: "/Users/homemac/Data/aspectlead-lead-production/handover/ayesha-nw1-nw10",
    territoryReportPath: "/Users/homemac/Data/aspectlead-lead-production/output/territories/ayesha/combined-2026-07-24/NW1-NW10-TERRITORY-RECONCILIATION-REPORT.md",
  },
  kunz: {
    representative: "Kunz", role: "Telesales", salesTerritory: "TW1-TW10", filePrefix: "Kunz_TW1-TW10",
    districts: KUNZ_DISTRICTS, sourceCalls: KUNZ_SOURCE_CALLS, defects: KUNZ_DEFECTS, tests: KUNZ_TESTS,
    totalRaw: 6353, totalValid: 547, totalRejected: 5806, totalCandidates: 458, duplicatesRemoved: 8, uniqueCandidates: 450,
    usable: 181, premium: 118, releasableL1: 63, keyAccounts: 14, held: 19, hardRejected: 132, customerExclusions: 76, excludedGroups: 42,
    salesProNewLeads: 167, salesProKeyAccounts: 14, salesProCustExclusions: 76,
    commitSha: "a8f94b4 (map_required resolver fix, applied after TW1-TW10 completed — corrected this package retroactively from existing evidence, no new discovery/enrichment calls)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring rules v2, assignment v2",
    handoverDir: "/Users/homemac/Data/aspectlead-lead-production/handover/kunz-tw1-tw10",
    territoryReportPath: "/Users/homemac/Data/aspectlead-lead-production/output/territories/kunz/combined-2026-07-24/TW1-TW10-TERRITORY-RECONCILIATION-REPORT.md",
  },
  nauman: {
    representative: "Nauman", role: "Field Sales", salesTerritory: "RM1-RM14", filePrefix: "Nauman_RM1-RM14",
    districts: NAUMAN_DISTRICTS, sourceCalls: NAUMAN_SOURCE_CALLS, defects: NAUMAN_DEFECTS, tests: NAUMAN_TESTS,
    totalRaw: 8542, totalValid: 855, totalRejected: 7687, totalCandidates: 748, duplicatesRemoved: 25, uniqueCandidates: 723,
    usable: 388, premium: 236, releasableL1: 152, keyAccounts: 30, held: 2, hardRejected: 231, customerExclusions: 26, excludedGroups: 76,
    salesProNewLeads: 358, salesProKeyAccounts: 30, salesProCustExclusions: 26,
    commitSha: "fbd2d61", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring rules v2, assignment v2",
    handoverDir: "/Users/homemac/Data/aspectlead-lead-production/handover/nauman-rm1-rm14",
    territoryReportPath: "/Users/homemac/Data/aspectlead-lead-production/output/territories/nauman/combined-2026-07-24/RM1-RM14-TERRITORY-RECONCILIATION-REPORT.md",
  },
  manraj: {
    representative: "Manraj", role: "Field Sales", salesTerritory: "KT1-KT24", filePrefix: "Manraj_KT1-KT24",
    districts: MANRAJ_DISTRICTS, sourceCalls: MANRAJ_SOURCE_CALLS, defects: MANRAJ_DEFECTS, tests: MANRAJ_TESTS,
    totalRaw: 9586, totalValid: 969, totalRejected: 8617, totalCandidates: 813, duplicatesRemoved: 25, uniqueCandidates: 788,
    usable: 364, premium: 221, releasableL1: 143, keyAccounts: 21, held: 6, hardRejected: 290, customerExclusions: 29, excludedGroups: 99,
    salesProNewLeads: 343, salesProKeyAccounts: 21, salesProCustExclusions: 29,
    commitSha: "fbd2d61 (no new code required for KT processing)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring rules v2, assignment v2 (pipeline unchanged from RM1-RM14)",
    handoverDir: "/Users/homemac/Data/aspectlead-lead-production/handover/manraj-kt1-kt24",
    territoryReportPath: "/Users/homemac/Data/aspectlead-lead-production/output/territories/manraj/combined-2026-07-24/KT1-KT24-TERRITORY-RECONCILIATION-REPORT.md",
  },
};

async function fieldContributionSummary(provenanceCsvPath: string) {
  const content = await fs.readFile(provenanceCsvPath, "utf-8");
  const { rows } = parseCsvObjects(content);
  const f = (field: string) => rows.filter((r) => r["Final Field"] === field);
  const phone = f("Main Phone");
  const website = f("Website");
  const email = f("Verified Email");
  const legal = f("Legal Company Name");
  const directors = f("Directors");
  const pscs = f("PSCs");
  const dm = f("Ranked Decision-Maker");
  const hygiene = f("Hygiene Rating");
  const businessType = f("Business Type");
  const address = f("Full Operating Address");
  const group = f("Group / Franchise Classification");
  const hours = f("Opening Hours");
  const productFit = f("Product Fit (Cuisine Tags / Service Model)");
  const nonEmpty = (r: any) => r["Final Value"] && r["Final Value"] !== "";

  return [
    { Item: "Total leads with a phone field", Count: phone.length },
    { Item: "Phone from official website (validated)", Count: phone.filter((r) => r["Source Stage"] === "Website").length },
    { Item: "Phone from Google Places", Count: phone.filter((r) => r["Source Stage"] === "Google").length },
    { Item: "Phone unresolved (no valid value from either source)", Count: phone.filter((r) => r["Source Stage"] === "Unresolved").length },
    { Item: "Phone: website value replaced by Google (failed UK format validation)", Count: phone.filter((r) => r["Replaced or Supplemented"]?.startsWith("Replaced")).length },
    { Item: "Website from website-stage crawl (confirmed domain)", Count: website.filter((r) => r["Source Stage"] === "Website").length },
    { Item: "Website supplied by Google Places (fallback, no confirmed domain)", Count: website.filter((r) => r["Source Stage"] === "Google").length },
    { Item: "Website unresolved", Count: website.filter((r) => r["Source Stage"] === "Unresolved").length },
    { Item: "Email supplied by official website", Count: email.filter(nonEmpty).length + " / " + email.length },
    { Item: "Legal company name resolved via Companies House", Count: legal.filter(nonEmpty).length + " / " + legal.length },
    { Item: "Leads with at least one current director from Companies House", Count: directors.filter(nonEmpty).length + " / " + directors.length },
    { Item: "Leads with at least one current PSC from Companies House", Count: pscs.filter(nonEmpty).length + " / " + pscs.length },
    { Item: "Leads with a ranked decision-maker from Companies House", Count: dm.filter(nonEmpty).length + " / " + dm.length },
    { Item: "FSA hygiene ratings resolved", Count: hygiene.filter(nonEmpty).length + " / " + hygiene.length },
    { Item: "Business type from FSA", Count: businessType.filter((r) => r["Source Stage"] === "FSA").length },
    { Item: "Business type from Google (fallback)", Count: businessType.filter((r) => r["Source Stage"] === "Google").length },
    { Item: "Business type unresolved", Count: businessType.filter((r) => r["Source Stage"] === "Unresolved").length },
    { Item: "Full operating address from Google", Count: address.filter((r) => r["Source Stage"] === "Google").length },
    { Item: "Full operating address from FSA (fallback)", Count: address.filter((r) => r["Source Stage"] === "FSA").length },
    { Item: "Group/franchise classification resolved (not ownership_unresolved)", Count: group.filter((r) => r["Final Value"] !== "ownership_unresolved").length + " / " + group.length },
    { Item: "Opening hours resolved from official website", Count: hours.filter(nonEmpty).length + " / " + hours.length },
    { Item: "Product fit (cuisine/service model) resolved from website crawl", Count: productFit.filter((r) => r["Source Stage"] === "Website").length + " / " + productFit.length },
    { Item: "Total field-values where a later/alternate source replaced an initial value", Count: rows.filter((r) => r["Replaced or Supplemented"]?.startsWith("Replaced")).length },
    { Item: "Total field-values supplemented by a fallback source (primary had no value)", Count: rows.filter((r) => r["Replaced or Supplemented"]?.startsWith("Supplemented")).length },
  ];
}

async function main() {
  const key = arg("territory");
  if (!key || !TERRITORIES[key]) { console.error("Usage: --territory=nauman|manraj"); process.exit(1); }
  const t = TERRITORIES[key];
  const { resolveMapRequired } = await import("./resolve-map-required");
  const mapResolution = await resolveMapRequired(t.representative);

  const districtHeader = ["District", "Raw", "Geo-Valid", "Rejected", "Candidates", "Usable", "Premium L0", "Releasable L1", "Key Accounts", "Held", "Hard Rejected", "Customer Exclusions", "Excluded Groups"];
  const districtRows = t.districts.map((d: any[]) => Object.fromEntries(districtHeader.map((h, i) => [h, d[i]])));

  const sourceCallHeader = ["District", "Google Places (cap 800)", "Companies House Eligible Population (cap 600 + 250 docs)"];
  const sourceCallRows = t.sourceCalls.map((d: any[]) => Object.fromEntries(sourceCallHeader.map((h, i) => [h, d[i]])));

  const overview = [{
    "Representative": t.representative, "Role": t.role, "Sales Territory": t.salesTerritory,
    "Districts": t.districts.map((d: any[]) => d[0]).join(", "), "District Count": t.districts.length,
    "Map Required": mapResolution.mapRequired,
    "Pipeline Commit SHA": t.commitSha, "Schema Version": t.schemaVersion, "Rules Version": t.rulesVersion,
    "Territory Status": "ACCEPTED", "Handover Readiness": "Ready — package verified, zero leakage, all Sales Pro Lead IDs traced to Master",
    "Generated": "2026-07-24",
  }];

  const territoryReconciliation = [{
    "Total Raw": t.totalRaw, "Geography-Valid": t.totalValid, "Rejected": t.totalRejected,
    "Total Candidates (pre-dedup)": t.totalCandidates, "Cross-District Duplicates Removed": t.duplicatesRemoved,
    "Unique Candidates (post-dedup)": t.uniqueCandidates,
    "Usable": t.usable, "Premium Level 0": t.premium, "Releasable Level 1": t.releasableL1, "Key Accounts": t.keyAccounts,
    "Held for Review": t.held, "Hard Rejected": t.hardRejected, "Customer Master Exclusions": t.customerExclusions, "Excluded Groups": t.excludedGroups,
    "Sum Check (usable+held+hardrej+custexcl+exclgrp)": t.usable + t.held + t.hardRejected + t.customerExclusions + t.excludedGroups,
    "Matches Unique Candidates": (t.usable + t.held + t.hardRejected + t.customerExclusions + t.excludedGroups) === t.uniqueCandidates,
  }];

  const salesProReconciliation = [{
    "Ordinary New Leads (exported)": t.salesProNewLeads, "Key Accounts (exported)": t.salesProKeyAccounts,
    "Customer Master Exclusions (exported, audit-only)": t.salesProCustExclusions,
    "Sum (new leads + key accounts)": t.salesProNewLeads + t.salesProKeyAccounts, "Matches Usable": (t.salesProNewLeads + t.salesProKeyAccounts) === t.usable,
    "Total Exported Sales Pro Lead IDs": t.salesProNewLeads + t.salesProKeyAccounts + t.salesProCustExclusions,
    "Note": "Held, hard-rejected, and excluded-group candidates exist only in the Master workbook and correctly have no Sales Pro export.",
  }];

  const defectsHeader = ["#", "Defect", "Source Stage / Component", "Resolution", "Commit"];
  const defectRows = t.defects.length ? t.defects.map((d: string[]) => Object.fromEntries(defectsHeader.map((h, i) => [h, d[i]]))) : [{ "#": "-", "Defect": "None found during this territory's processing", "Source Stage / Component": "n/a", "Resolution": "Pipeline already fixed and accepted at the end of the prior territory", "Commit": "n/a" }];

  const testsRow = [{ "Tests / Build": t.tests }];

  const outputPaths = [
    { File: "Representative Master (rep-facing, ordinary leads only)", Path: `${t.handoverDir}/${t.filePrefix}_Representative_Master.xlsx` },
    { File: "Sales Pro New Leads CSV (rep-facing)", Path: `${t.handoverDir}/${t.filePrefix}_SalesPro_New_Leads.csv` },
    // map_required fix (2026-07-24): only listed when the representative's role genuinely
    // requires a map deliverable (resolved from sales-territories-v2.json) — a telesales
    // package must never contain or reference a map file.
    ...(mapResolution.mapRequired ? [{ File: "New Leads Map (rep-facing)", Path: `${t.handoverDir}/${t.filePrefix}_New_Leads_Map.xlsx` }] : []),
    { File: "Key Accounts Management Review (management-only)", Path: `${t.handoverDir}/${t.filePrefix}_Key_Accounts_Management_Review.xlsx` },
    { File: "Customer Master Exclusions Audit (management-only)", Path: `${t.handoverDir}/${t.filePrefix}_Customer_Master_Exclusions_Audit.xlsx` },
    { File: "Lead Production Report (this file, management-only)", Path: `${t.handoverDir}/${t.filePrefix}_Lead_Production_Report.xlsx` },
    { File: "Field Provenance CSV", Path: `${t.handoverDir}/${t.filePrefix}_Field_Provenance.csv` },
    { File: "README", Path: `${t.handoverDir}/README.md` },
    { File: "Full territory reconciliation report (internal, not part of the handover package)", Path: t.territoryReportPath },
  ];
  if (!mapResolution.mapRequired) console.log(`${t.representative} is telesales (mapRequired=false) — no map file listed in Output Paths, matching the handover package.`);

  const provenanceCsvPath = `${t.handoverDir}/${t.filePrefix}_Field_Provenance.csv`;
  const contribution = await fieldContributionSummary(provenanceCsvPath);
  const provenanceContent = await fs.readFile(provenanceCsvPath, "utf-8");
  const { rows: provenanceRows } = parseCsvObjects(provenanceContent);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), "Overview");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(districtRows), "District Reconciliation");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(territoryReconciliation), "Territory Reconciliation");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesProReconciliation), "Sales Pro Reconciliation");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceCallRows), "Source Calls");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contribution), "Field Contribution Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(defectRows), "Defects and Fixes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(testsRow), "Tests and Build");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outputPaths), "Output Paths");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(provenanceRows), "Field Provenance");

  const outPath = `${t.handoverDir}/${t.filePrefix}_Lead_Production_Report.xlsx`;
  XLSX.writeFile(wb, outPath);
  console.log(`Wrote ${outPath}`);
  console.log(`Sheets: ${wb.SheetNames.join(", ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
