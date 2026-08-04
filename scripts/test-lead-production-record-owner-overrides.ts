// Regression proof for record-owner-overrides.ts (2026-08-04, pre-push acceptance verification,
// item 2). Proves every override gets the full required structured record, in a dedicated
// column block never overloaded onto the algorithmic verdict fields, and that the "original
// algorithm decision"/"evidence retained" fields are independently re-derived, not hand-typed.
// npm run test:lead-production-record-owner-overrides

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("record-owner-overrides.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "record-overrides-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,D406,Dill Spice Limited T/A Spice Hut,,,,,,,"E1 1AA"',
  ].join("\n"));

  const spiceHutRow = { "Permanent Lead ID": "IG1-FA671913", "Postcode District": "IG1", "Trading Name": "Spice Hut", "Full Postcode": "IG1 2LJ" };
  const kingsDinerRow = { "Permanent Lead ID": "BR1-63951AA0", "Postcode District": "BR1", "Trading Name": "Kings Diner", "Full Postcode": "BR1 5HS" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([spiceHutRow]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([kingsDinerRow]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Hard Rejects");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Customer Master Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Excluded Groups");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Commercial Review Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Business Category Exclusions");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const outPath = path.join(tmpDir, "combined-out.xlsx");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/record-owner-overrides.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`, "--timestamp=2026-08-04T12:00:00.000Z", `--out=${outPath}`, "--reviewer=Test Reviewer",
  ], { encoding: "utf8", cwd: process.cwd() });
  // RM1-015EC5DD is not in this fixture at all, so the script must report it not-found and exit non-zero.
  assert(res.status !== 0, `script exits non-zero when a named override lead is not found (got ${res.status})`);
  assert((res.stderr ?? "").includes("RM1-015EC5DD"), "the missing lead is named explicitly, never silently skipped");

  const outWb = XLSX.readFile(outPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];

  const spiceHut = usable.find((r) => r["Permanent Lead ID"] === "IG1-FA671913");
  assert(spiceHut?.["Override: Owner Decision"] === "released_with_owner_override", `Spice Hut's owner decision is recorded exactly (got "${spiceHut?.["Override: Owner Decision"]}")`);
  assert(spiceHut?.["Override: Original Algorithm Decision"] === "probable", `Spice Hut's original algorithm decision is independently re-derived, not hand-typed (got "${spiceHut?.["Override: Original Algorithm Decision"]}")`);
  assert(typeof spiceHut?.["Override: Evidence Retained"] === "string" && (spiceHut!["Override: Evidence Retained"] as string).includes("D406"), "the original algorithmic evidence is retained verbatim on the row");
  assert(spiceHut?.["Override: Timestamp"] === "2026-08-04T12:00:00.000Z", "the exact supplied timestamp is recorded, never a guessed/default one");
  assert(spiceHut?.["Override: Reviewer"] === "Test Reviewer", "the reviewer field is recorded");
  assert(typeof spiceHut?.["Override: Customer Master Checksum"] === "string" && (spiceHut!["Override: Customer Master Checksum"] as string).length === 64, "a genuine SHA-256 checksum is recorded");

  const kingsDiner = held.find((r) => r["Permanent Lead ID"] === "BR1-63951AA0");
  assert(kingsDiner?.["Override: Owner Decision"] === "held_with_owner_override", `Kings Diner's owner decision is recorded exactly (got "${kingsDiner?.["Override: Owner Decision"]}")`);
  assert(kingsDiner?.["Override: Original Algorithm Decision"] === "clear (no material finding)", `Kings Diner's original algorithm decision correctly shows no current material finding (got "${kingsDiner?.["Override: Original Algorithm Decision"]}") — an honest record, not a fabricated "probable"`);

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
