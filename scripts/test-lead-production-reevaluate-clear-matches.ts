// Regression proofs for reevaluate-and-clear-probable-matches.ts (2026-08-04, entity-resolution
// audit follow-up, item 5: re-evaluate Spice Hut / PHAT Buns against the owner's explicit
// clearance criteria — "do not hold or exclude solely because of a generic name or shared
// franchise domain"). Proves both the CLEAR path (generic-alias-only / uncorroborated-domain-only
// evidence) and the REFUSE path (a lead with genuine stronger evidence must never be silently
// cleared just because it was named on the command line).
// npm run test:lead-production-reevaluate-clear-matches

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("reevaluate-and-clear-probable-matches.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reevaluate-clear-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    // Generic alias, unrelated postcode/phone — the CLEAR case.
    'No,G001,Some Unrelated Ltd T/A Generic Hut,,,,,,,"ZZ1 1AA"',
    'No,G002,Another Unrelated Ltd T/A Generic Hut,,,,,,,"ZZ2 2AA"',
    // A DIFFERENT lead's matched customer carries a genuinely strong signal (exact phone) — the
    // REFUSE case, proving the script never clears just because it was asked to.
    'No,S001,Strong Evidence Diner Ltd,,020 7946 0999,,,,,"ZZ3 3AA"',
  ].join("\n"));

  const genericAliasLead = {
    "Permanent Lead ID": "ZZ1-GENERIC1", "Postcode District": "ZZ1", "Trading Name": "Generic Hut", "Main Phone": "",
    "Verified Email": "", Website: "", "Full Postcode": "ZZ1 9ZZ", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };
  const strongEvidenceLead = {
    "Permanent Lead ID": "ZZ3-STRONG1", "Postcode District": "ZZ3", "Trading Name": "Totally Different Business", "Main Phone": "020 7946 0999",
    "Verified Email": "", Website: "", "Full Postcode": "", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([genericAliasLead, strongEvidenceLead]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Premium Level 0");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const outPath = path.join(tmpDir, "combined-out.xlsx");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`, "--lead-ids=ZZ1-GENERIC1,ZZ3-STRONG1", `--out=${outPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status !== 0, `script exits non-zero when at least one requested lead is refused (got ${res.status})`);
  assert((res.stderr ?? "").includes("REFUSED"), "the refusal is reported explicitly, not silently swallowed");

  const outWb = XLSX.readFile(outPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const premium = XLSX.utils.sheet_to_json(outWb.Sheets["Premium Level 0"], { defval: null }) as Record<string, unknown>[];

  assert(usable.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the generic-alias-only lead is moved to Operationally Usable Leads");
  assert(!held.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the generic-alias-only lead is removed from Held-Review");
  const clearedRow = usable.find((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1");
  assert(!!clearedRow && String(clearedRow["Customer Match Audit Warning"]).includes("AUDIT WARNING"), "an explicit audit warning is recorded on the cleared row, never a silent clear");
  assert(premium.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the cleared lead is re-inserted into its pre-hold overlay tier (Final Lead Level = Level 0 -> Premium Level 0)");

  assert(held.some((r) => r["Permanent Lead ID"] === "ZZ3-STRONG1"), "a lead with genuine stronger evidence (exact phone) is left in Held-Review, never cleared just because it was requested");
  assert(!usable.some((r) => r["Permanent Lead ID"] === "ZZ3-STRONG1"), "the strong-evidence lead is NOT moved to Usable");

  console.log("\nOwner-authorized override (2026-08-17, field-sales batch 018-020) — a lead with same-district fuzzy-name-only evidence (NOT algorithmically clearable) can be cleared when explicitly named in --owner-authorized-lead-ids:");
  const customersPath2 = path.join(tmpDir, "customers2.csv");
  await fs.writeFile(customersPath2, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    // Same district, fuzzy-name-similar, but no phone/email/postcode/address overlap — exactly the
    // real-world "same_district_strong_name"/"fuzzy_name_variation_same_district" shape, never
    // safe-list-clearable by the algorithm alone.
    'No,M234,SSS and K Pvt Ltd T/A Morleys Fried Chicken - Deptford High Street,,,,,,,"SE8 3NT"',
    // A wholly separate customer with a genuinely strong signal (exact phone) — proves the owner
    // override still cannot bypass a confirmed-tier finding.
    'No,S002,Confirmed Match Diner Ltd,,020 7946 0111,,,,,"ZZ4 4AA"',
  ].join("\n"));
  const fuzzyOnlyLead = {
    "Permanent Lead ID": "SE8-7FC3313A", "Postcode District": "SE8", "Trading Name": "Perfect Fried Chicken - Deptford", "Main Phone": "020 8694 2409",
    "Verified Email": "", Website: "", "Full Postcode": "SE8 4NS", "Full Operating Address": "108 Deptford High St, London SE8 4NS, UK", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };
  const confirmedMatchLead = {
    "Permanent Lead ID": "ZZ4-CONFIRMED1", "Postcode District": "ZZ4", "Trading Name": "Confirmed Match Diner", "Main Phone": "020 7946 0111",
    "Verified Email": "", Website: "", "Full Postcode": "", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet([]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet([fuzzyOnlyLead, confirmedMatchLead]), "Held-Review");
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet([]), "Premium Level 0");
  const wbPath2 = path.join(tmpDir, "combined2.xlsx");
  XLSX.writeFile(wb2, wbPath2);

  console.log("\n  Without --owner-authorized-lead-ids, the same fuzzy-only lead is refused (default rule unchanged):");
  const outPathNoAuth = path.join(tmpDir, "combined2-out-noauth.xlsx");
  const resNoAuth = spawnSync("npx", ["tsx", "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    `--combined-master=${wbPath2}`, `--customers=${customersPath2}`, "--lead-ids=SE8-7FC3313A", `--out=${outPathNoAuth}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(resNoAuth.status !== 0, `script still refuses same-district-fuzzy-only evidence when no owner authorization is supplied (got ${resNoAuth.status})`);
  assert((resNoAuth.stderr ?? "").includes("REFUSED"), "refusal reported explicitly");

  console.log("\n  WITH --owner-authorized-lead-ids + reason + timestamp, the fuzzy-only lead clears; the confirmed-match lead (not requested here) is untouched:");
  const outPathAuth = path.join(tmpDir, "combined2-out-auth.xlsx");
  const resAuth = spawnSync("npx", ["tsx", "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    `--combined-master=${wbPath2}`, `--customers=${customersPath2}`, "--lead-ids=SE8-7FC3313A",
    "--owner-authorized-lead-ids=SE8-7FC3313A", "--owner-decision-reason=Distinct business/premises; fuzzy same-district name similarity only, no phone/email/postcode/address corroboration.",
    "--timestamp=2026-08-17T00:00:00.000Z", `--out=${outPathAuth}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(resAuth.status === 0, `owner-authorized clearance succeeds (got exit ${resAuth.status}, stderr: ${resAuth.stderr})`);
  const outWbAuth = XLSX.readFile(outPathAuth);
  const usableAuth = XLSX.utils.sheet_to_json(outWbAuth.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const heldAuth = XLSX.utils.sheet_to_json(outWbAuth.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const clearedRowAuth = usableAuth.find((r) => r["Permanent Lead ID"] === "SE8-7FC3313A");
  assert(!!clearedRowAuth, "the owner-authorized lead is moved to Operationally Usable Leads");
  assert(String(clearedRowAuth?.["Customer Match Audit Warning"] ?? "").includes("OWNER OVERRIDE"), "the audit warning is distinctly labelled OWNER OVERRIDE, never presented as an ordinary algorithmic clearance");
  assert(clearedRowAuth?.["Override: Owner Decision"] === "released_with_owner_override", "structured override provenance (Override: Owner Decision) is recorded on the row");
  assert(clearedRowAuth?.["Override: Reason"] === "Distinct business/premises; fuzzy same-district name similarity only, no phone/email/postcode/address corroboration.", "the exact owner reason is recorded verbatim");
  assert(heldAuth.some((r) => r["Permanent Lead ID"] === "ZZ4-CONFIRMED1"), "a lead not named in --lead-ids is left untouched in Held-Review");

  console.log("\n  A confirmed-tier finding is NEVER overridable, even when explicitly named in --owner-authorized-lead-ids:");
  const outPathConfirmed = path.join(tmpDir, "combined2-out-confirmed.xlsx");
  const resConfirmed = spawnSync("npx", ["tsx", "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    `--combined-master=${wbPath2}`, `--customers=${customersPath2}`, "--lead-ids=ZZ4-CONFIRMED1",
    "--owner-authorized-lead-ids=ZZ4-CONFIRMED1", "--owner-decision-reason=Attempted override of a confirmed match — must be refused.",
    "--timestamp=2026-08-17T00:00:00.000Z", `--out=${outPathConfirmed}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(resConfirmed.status !== 0, `a confirmed-tier finding is refused even when explicitly owner-authorized (got exit ${resConfirmed.status})`);
  assert((resConfirmed.stderr ?? "").includes("CONFIRMED") && (resConfirmed.stderr ?? "").includes("never overridable"), "the refusal explicitly states the finding is confirmed and never overridable");

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
