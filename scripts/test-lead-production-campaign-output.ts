// Regression proofs for campaign-output.ts's default-path resolution + write-safety guards, and
// generate-release-manifest.ts's programmatic hashing (ISS-0037 fix, 2026-08-04).
// npm run test:lead-production-campaign-output

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  CAMPAIGN_DATA_ROOT, GIT_REPO_ROOT,
  defaultCampaignOutputPath, defaultCampaignOutputDir, isInsideGitRepo, assertSafeToWrite, resolveCampaignOutputPath,
} from "./lead-production/campaign-output";
import { buildReleaseManifest } from "./lead-production/generate-release-manifest";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("1. defaultCampaignOutputPath/Dir are generic — never a representative name, work for any campaign id:");
  const p1 = defaultCampaignOutputPath("campaign-999-any-future-campaign", "release", "campaign-999-any-future-campaign-master-combined.xlsx");
  assert(p1 === path.join(CAMPAIGN_DATA_ROOT, "campaigns", "campaign-999-any-future-campaign", "release", "campaign-999-any-future-campaign-master-combined.xlsx"), `resolves under campaigns/<id>/release/ (got ${p1})`);
  assert(!/naseh|kunz|meer/i.test(p1), "no representative name appears anywhere in the resolved default path");
  const d1 = defaultCampaignOutputDir("campaign-999-any-future-campaign", "audit");
  assert(d1 === path.join(CAMPAIGN_DATA_ROOT, "campaigns", "campaign-999-any-future-campaign", "audit"), `directory-only variant resolves correctly (got ${d1})`);

  console.log("\n2. resolveCampaignOutputPath — explicit --out always wins over the campaign-id default:");
  const explicit = resolveCampaignOutputPath("/tmp/some/explicit/path.xlsx", "campaign-999-any-future-campaign", "release", "ignored.xlsx");
  assert(explicit === "/tmp/some/explicit/path.xlsx", "explicit path returned verbatim, campaign-id default never consulted");
  const fallback = resolveCampaignOutputPath(null, "campaign-999-any-future-campaign", "release", "f.xlsx");
  assert(fallback === defaultCampaignOutputPath("campaign-999-any-future-campaign", "release", "f.xlsx"), "no explicit path -> falls back to the campaign default");
  const neither = resolveCampaignOutputPath(null, null, "release", "f.xlsx");
  assert(neither === null, "neither explicit path nor campaign-id -> null (caller decides how to fail closed)");

  console.log("\n3. isInsideGitRepo correctly distinguishes repo paths from data-root paths:");
  assert(isInsideGitRepo(path.join(GIT_REPO_ROOT, "scripts", "lead-production", "foo.ts")) === true, "a path under the Git repo root is detected");
  assert(isInsideGitRepo(GIT_REPO_ROOT) === true, "the repo root itself is detected");
  assert(isInsideGitRepo(path.join(CAMPAIGN_DATA_ROOT, "campaigns", "x", "release", "f.xlsx")) === false, "a path under the data root is NOT flagged as inside the Git repo");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "campaign-output-test-"));

  console.log("\n4. assertSafeToWrite refuses any destination inside the Git repository, even a fresh filename:");
  let threw = false;
  try { await assertSafeToWrite(path.join(GIT_REPO_ROOT, "scripts", "lead-production", "never-write-here.xlsx")); } catch { threw = true; }
  assert(threw, "throws for a destination resolving inside the Git repo");

  console.log("\n5. assertSafeToWrite allows a brand-new file anywhere outside the repo, including inside release/:");
  const freshReleasePath = path.join(tmpDir, "campaigns", "test-campaign", "release", "brand-new-file.xlsx");
  await fs.mkdir(path.dirname(freshReleasePath), { recursive: true });
  threw = false;
  try { await assertSafeToWrite(freshReleasePath); } catch { threw = true; }
  assert(!threw, "no error for a file that doesn't exist yet, even under a release/ path");

  console.log("\n6. assertSafeToWrite refuses to silently overwrite an EXISTING file under a release/ or manifests/ path segment:");
  await fs.writeFile(freshReleasePath, "already here");
  threw = false;
  try { await assertSafeToWrite(freshReleasePath); } catch { threw = true; }
  assert(threw, "throws when the release/ file already exists and force is not set");

  console.log("\n7. --force-overwrite-release (force: true) permits the same overwrite:");
  threw = false;
  try { await assertSafeToWrite(freshReleasePath, { force: true }); } catch { threw = true; }
  assert(!threw, "no error once force is explicitly set");

  console.log("\n8. assertSafeToWrite does NOT protect non-release/manifests directories (audit/review/working) — routine regeneration must stay unblocked:");
  const auditPath = path.join(tmpDir, "campaigns", "test-campaign", "audit", "existing-audit-file.xlsx");
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.writeFile(auditPath, "already here too");
  threw = false;
  try { await assertSafeToWrite(auditPath); } catch { threw = true; }
  assert(!threw, "no error overwriting an existing file under audit/ (or review/, working/) without force");

  console.log("\n9. assertSafeToWrite also honours an explicit `kind` even when the literal path doesn't say so:");
  const genericPath = path.join(tmpDir, "some-other-dir", "output.xlsx");
  await fs.mkdir(path.dirname(genericPath), { recursive: true });
  await fs.writeFile(genericPath, "already here");
  threw = false;
  try { await assertSafeToWrite(genericPath, { kind: "release" }); } catch { threw = true; }
  assert(threw, "throws when the caller explicitly tags the write as kind: 'release', regardless of the literal path text");

  console.log("\n10. generate-release-manifest.ts's buildReleaseManifest computes REAL SHA-256/byte counts from disk, never hand-typed:");
  const campaignDir = path.join(tmpDir, "campaigns", "test-campaign-2");
  const releaseDir = path.join(campaignDir, "release");
  const reviewDir = path.join(campaignDir, "review");
  const auditDir = path.join(campaignDir, "audit");
  await fs.mkdir(releaseDir, { recursive: true });
  await fs.mkdir(reviewDir, { recursive: true });
  await fs.mkdir(auditDir, { recursive: true });
  const fileA = path.join(releaseDir, "a.csv");
  const fileB = path.join(releaseDir, "b.json");
  await fs.writeFile(fileA, "trading_name,postcode\nExample,AB1 2CD\n");
  await fs.writeFile(fileB, JSON.stringify({ hello: "world" }));
  await fs.writeFile(path.join(releaseDir, ".DS_Store"), "ignored"); // hidden files must be skipped
  await fs.mkdir(path.join(releaseDir, "a-subdirectory-should-be-skipped"), { recursive: true });
  const reviewFile = path.join(reviewDir, "owner-review.xlsx");
  await fs.writeFile(reviewFile, "fake-xlsx-bytes-review");
  const auditFile1 = path.join(auditDir, "customer-leakage-audit.xlsx");
  const auditFile2 = path.join(auditDir, "zero-leakage-certificate.json");
  await fs.writeFile(auditFile1, "fake-xlsx-bytes-audit");
  await fs.writeFile(auditFile2, JSON.stringify({ result: "PASS" }));

  const manifest = await buildReleaseManifest({ campaignId: "test-campaign-2", scannedDirectories: { release: releaseDir, review: reviewDir, audit: auditDir } });
  assert(manifest.campaignId === "test-campaign-2", "manifest records the supplied campaign id verbatim");
  assert(manifest.artifactCount === 5, `all 5 real files across release/review/audit are hashed — hidden file and subdirectory skipped (got ${manifest.artifactCount})`);
  const expectedShaA = createHash("sha256").update(await fs.readFile(fileA)).digest("hex");
  const foundA = manifest.artifacts.find((a) => a.filename === "a.csv");
  assert(foundA?.sha256 === expectedShaA, "a.csv's SHA-256 matches an independently-computed hash of the same bytes");
  assert(foundA?.bytes === (await fs.stat(fileA)).size, "a.csv's byte count matches the real file size");
  assert(foundA?.kind === "release", "a.csv is correctly tagged with its own kind (release)");
  const foundReview = manifest.artifacts.find((a) => a.filename === "owner-review.xlsx");
  assert(foundReview?.kind === "review", `the review/ directory's file is scanned and correctly tagged (got kind "${foundReview?.kind}")`);
  const foundAuditFiles = manifest.artifacts.filter((a) => a.kind === "audit");
  assert(foundAuditFiles.length === 2, `both audit/ files (leakage audit + certificate) are scanned (got ${foundAuditFiles.length})`);
  assert(!manifest.artifacts.some((a) => a.filename.includes("release-manifest")), "the manifest never hashes or includes itself as one of its own artifacts");
  assert(manifest.certificate === null, "no certificate path supplied -> certificate field is null, never fabricated");
  assert(manifest.authoritativeCustomerMaster === null, "no customers path supplied -> field is null, never fabricated");
  assert(!/naseh|kunz|meer/i.test(JSON.stringify(manifest)), "no representative name appears anywhere in a generic manifest");

  console.log("\n11. buildReleaseManifest folds in a certificate and customer-master checksum when supplied:");
  const certPath = path.join(tmpDir, "cert.json");
  await fs.writeFile(certPath, JSON.stringify({ result: "PASS", masterResult: "PASS", ctoResult: "PASS", salesProResult: "NOT_CHECKED", confirmedLeakCount: 0, unresolvedProbableLeadCount: 0, releasedLeadCount: 42 }));
  const custPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(custPath, "id,name\n1,Test\n");
  const manifest2 = await buildReleaseManifest({ campaignId: "test-campaign-2", scannedDirectories: { release: releaseDir }, certificatePath: certPath, customersPath: custPath });
  assert(manifest2.certificate?.result === "PASS", "certificate result carried through");
  assert(manifest2.certificate?.releasedLeadCount === 42, "certificate released-lead-count carried through");
  assert(manifest2.authoritativeCustomerMaster?.sha256 === createHash("sha256").update(await fs.readFile(custPath)).digest("hex"), "customer-master checksum is independently recomputed, matches a direct hash of the same file");

  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
