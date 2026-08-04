// Regression proof for validate-customer-master-pin.ts (2026-08-04, pre-push acceptance
// verification, item 6): the pointer validator must fail closed on any checksum, row-count, or
// lifecycle-total mismatch, and on any missing referenced index/manifest/quality-report file —
// never silently pass a stale or tampered pointer.
// npm run test:lead-production-validate-customer-master-pin

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("validate-customer-master-pin.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-pin-test-"));
  const snapshotPath = path.join(tmpDir, "snapshot.csv");
  const indexPath = path.join(tmpDir, "index.csv");
  const aliasesPath = path.join(tmpDir, "aliases.csv");
  const manifestPath = path.join(tmpDir, "manifest.json");
  const qualityReportPath = path.join(tmpDir, "quality.xlsx");
  const snapshotCsv = [
    "Inactive,ID,Name",
    "No,C1,Active Customer",
    "Yes,C2,Inactive Customer",
  ].join("\n");
  await fs.writeFile(snapshotPath, snapshotCsv);
  await fs.writeFile(indexPath, "id\nC1\n");
  await fs.writeFile(aliasesPath, "alias\ntest\n");
  await fs.writeFile(manifestPath, "{}");
  await fs.writeFile(qualityReportPath, "");

  const { createHash } = await import("node:crypto");
  const realChecksum = createHash("sha256").update(snapshotCsv).digest("hex");

  const goodPointer = {
    campaignId: "test-campaign",
    customerMasterInUse: {
      rawSnapshotPath: snapshotPath, sha256Checksum: realChecksum,
      identityIndexPath: indexPath, identityAliasesPath: aliasesPath,
      manifestPath, qualityReportPath, totalRows: 2, activeCount: 1, inactiveCount: 1,
    },
    approvalStatus: "pending_owner_review",
  };
  const goodPointerPath = path.join(tmpDir, "pointer-good.json");
  await fs.writeFile(goodPointerPath, JSON.stringify(goodPointer));

  console.log("1. A genuinely correct pointer passes:");
  const goodRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${goodPointerPath}`], { encoding: "utf8", cwd: process.cwd() });
  assert(goodRes.status === 0, `exits 0 for a correct pointer (got ${goodRes.status}); stderr: ${goodRes.stderr}`);

  console.log("\n2. A stale checksum fails closed:");
  const staleChecksumPointer = { ...goodPointer, customerMasterInUse: { ...goodPointer.customerMasterInUse, sha256Checksum: "0".repeat(64) } };
  const staleChecksumPath = path.join(tmpDir, "pointer-stale-checksum.json");
  await fs.writeFile(staleChecksumPath, JSON.stringify(staleChecksumPointer));
  const staleRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${staleChecksumPath}`], { encoding: "utf8", cwd: process.cwd() });
  assert(staleRes.status !== 0, `exits non-zero on a checksum mismatch (got ${staleRes.status})`);
  assert((staleRes.stderr ?? "").includes("Checksum MISMATCH"), "the exact reason (checksum mismatch) is reported, not a generic failure");

  console.log("\n3. A wrong row count fails closed:");
  const wrongRowsPointer = { ...goodPointer, customerMasterInUse: { ...goodPointer.customerMasterInUse, totalRows: 999 } };
  const wrongRowsPath = path.join(tmpDir, "pointer-wrong-rows.json");
  await fs.writeFile(wrongRowsPath, JSON.stringify(wrongRowsPointer));
  const wrongRowsRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${wrongRowsPath}`], { encoding: "utf8", cwd: process.cwd() });
  assert(wrongRowsRes.status !== 0, `exits non-zero on a row-count mismatch (got ${wrongRowsRes.status})`);
  assert((wrongRowsRes.stderr ?? "").includes("Row count MISMATCH"), "the exact reason (row count mismatch) is reported");

  console.log("\n4. A wrong lifecycle total (active/inactive split) fails closed:");
  const wrongLifecyclePointer = { ...goodPointer, customerMasterInUse: { ...goodPointer.customerMasterInUse, activeCount: 2, inactiveCount: 0 } };
  const wrongLifecyclePath = path.join(tmpDir, "pointer-wrong-lifecycle.json");
  await fs.writeFile(wrongLifecyclePath, JSON.stringify(wrongLifecyclePointer));
  const wrongLifecycleRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${wrongLifecyclePath}`], { encoding: "utf8", cwd: process.cwd() });
  assert(wrongLifecycleRes.status !== 0, `exits non-zero on a lifecycle-total mismatch (got ${wrongLifecycleRes.status})`);
  assert((wrongLifecycleRes.stderr ?? "").includes("Active-customer count MISMATCH"), "the exact reason (active-count mismatch) is reported");

  console.log("\n5. A missing referenced index file fails closed:");
  const missingIndexPointer = { ...goodPointer, customerMasterInUse: { ...goodPointer.customerMasterInUse, identityIndexPath: path.join(tmpDir, "does-not-exist.csv") } };
  const missingIndexPath = path.join(tmpDir, "pointer-missing-index.json");
  await fs.writeFile(missingIndexPath, JSON.stringify(missingIndexPointer));
  const missingIndexRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${missingIndexPath}`], { encoding: "utf8", cwd: process.cwd() });
  assert(missingIndexRes.status !== 0, `exits non-zero when a referenced index file is missing (got ${missingIndexRes.status})`);
  assert((missingIndexRes.stderr ?? "").includes("identity index"), "the exact reason (missing identity index) is reported");

  console.log("\n6. An externally-required checksum that doesn't match the pointer's own recorded value also fails closed:");
  const externalRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts", `--pointer=${goodPointerPath}`, "--required-checksum=" + "1".repeat(64)], { encoding: "utf8", cwd: process.cwd() });
  assert(externalRes.status !== 0, `exits non-zero when --required-checksum does not match (got ${externalRes.status})`);

  console.log("\n7. Real campaign-002 pointer (if present) passes with the real required checksum:");
  const realPointerPath = "/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/campaign-002-customer-master-pointer.json";
  const realExists = await fs.access(realPointerPath).then(() => true).catch(() => false);
  if (realExists) {
    const realRes = spawnSync("npx", ["tsx", "scripts/lead-production/validate-customer-master-pin.ts",
      `--pointer=${realPointerPath}`, "--required-checksum=f1b23cce93d878f6fb6764e5dbce36812d579aaa6ac9d14c9342f8f2e6e683f1",
    ], { encoding: "utf8", cwd: process.cwd() });
    assert(realRes.status === 0, `real campaign-002 pointer validates clean (got ${realRes.status}); stderr: ${realRes.stderr}`);
    assert((realRes.stdout ?? "").includes("8050 (4558 active, 3492 inactive)"), "real pointer reports the exact authoritative row/lifecycle totals");
  } else {
    console.log("  (skipped — no real pointer present at", realPointerPath, ")");
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
