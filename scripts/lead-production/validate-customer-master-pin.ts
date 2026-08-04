// Fail-closed validator for the versioned customer-master pointer (2026-08-04, pre-push
// acceptance verification, item 6). campaign-002 must reference the versioned snapshot directly
// — /Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/
// CustomersProjects81_raw_snapshot_2026-08-03.csv — plus its versioned identity/alias indexes,
// never an unversioned mutable filename. This script loads the pointer JSON
// (campaign-002-customer-master-pointer.json), re-derives the checksum/row-count/lifecycle totals
// of the file it actually points at, and THROWS (fail closed, non-zero exit) if any of the
// pointer's recorded values no longer match reality — a stale pointer must never be silently
// trusted. Also verifies the identity index and alias files it references genuinely exist.

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

interface CustomerMasterPointer {
  campaignId: string;
  customerMasterInUse: {
    rawSnapshotPath: string; sha256Checksum: string; identityIndexPath: string;
    identityAliasesPath: string; manifestPath: string; qualityReportPath: string;
    totalRows: number; activeCount: number; inactiveCount: number;
  };
  approvalStatus: string;
}

async function main() {
  const pointerPath = arg("pointer");
  const requiredChecksum = arg("required-checksum");
  if (!pointerPath) {
    console.error("Missing required argument(s): --pointer=<path> [--required-checksum=<sha256, optional extra fail-closed check>]");
    process.exit(1);
  }

  const pointer: CustomerMasterPointer = JSON.parse(await fs.readFile(pointerPath, "utf8"));
  const { rawSnapshotPath, sha256Checksum, identityIndexPath, identityAliasesPath, manifestPath, qualityReportPath, totalRows, activeCount, inactiveCount } = pointer.customerMasterInUse;

  console.log(`Pointer: ${pointerPath}`);
  console.log(`Campaign: ${pointer.campaignId}`);
  console.log(`Pinned snapshot: ${rawSnapshotPath}`);

  const failures: string[] = [];

  const snapshotCsv = await fs.readFile(rawSnapshotPath, "utf8").catch(() => null);
  if (snapshotCsv === null) {
    failures.push(`Pinned snapshot file does not exist at the recorded path: ${rawSnapshotPath}`);
  } else {
    const actualChecksum = createHash("sha256").update(snapshotCsv).digest("hex");
    if (actualChecksum !== sha256Checksum) failures.push(`Checksum MISMATCH: pointer records ${sha256Checksum}, file actually hashes to ${actualChecksum}. The pinned file has changed since it was versioned — fail closed.`);
    if (requiredChecksum && actualChecksum !== requiredChecksum) failures.push(`Checksum does not match the externally-required checksum: required ${requiredChecksum}, got ${actualChecksum}.`);

    const rows = parseCsv(snapshotCsv);
    const header = rows[0];
    const iInactive = header.indexOf("Inactive");
    if (iInactive === -1) {
      failures.push(`Snapshot file is missing the "Inactive" lifecycle column — cannot verify lifecycle totals.`);
    } else {
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c));
      const actualActive = dataRows.filter((r) => (r[iInactive] ?? "").trim().toLowerCase() !== "yes").length;
      const actualInactive = dataRows.length - actualActive;
      if (dataRows.length !== totalRows) failures.push(`Row count MISMATCH: pointer records ${totalRows}, file actually has ${dataRows.length} data rows.`);
      if (actualActive !== activeCount) failures.push(`Active-customer count MISMATCH: pointer records ${activeCount}, file actually has ${actualActive}.`);
      if (actualInactive !== inactiveCount) failures.push(`Inactive-customer count MISMATCH: pointer records ${inactiveCount}, file actually has ${actualInactive}.`);
    }
  }

  for (const [label, p] of [["identity index", identityIndexPath], ["identity aliases", identityAliasesPath], ["manifest", manifestPath], ["quality report", qualityReportPath]] as const) {
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) failures.push(`Referenced ${label} file does not exist at the recorded path: ${p}`);
  }

  if (failures.length) {
    console.error(`\nFAIL CLOSED — ${failures.length} problem(s) found, refusing to certify this pointer as valid:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`\nAll checks passed: checksum, row count, active/inactive lifecycle totals, and all referenced index/manifest/quality-report files match exactly.`);
  console.log(`Total rows: ${totalRows} (${activeCount} active, ${inactiveCount} inactive).`);
  console.log(`Approval status: ${pointer.approvalStatus}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
