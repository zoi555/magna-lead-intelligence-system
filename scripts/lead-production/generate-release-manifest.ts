// Generates a metadata-only release manifest for a campaign's release/ directory —
// every artifact's SHA-256 and byte count computed programmatically from the files actually on
// disk, never hand-typed (ISS-0037: both Kunz's and Meer's manifests were previously
// hand-authored). Generic: takes --campaign-id=<id> and works for any campaign — never a
// hardcoded representative name, never reads representative-specific config.
//
// Usage:
//   npx tsx scripts/lead-production/generate-release-manifest.ts \
//     --campaign-id=<id> \
//     [--release-dir=<dir>]        default: campaigns/<id>/release/
//     [--certificate=<path>]       the zero-leakage certificate JSON already written to audit/
//     [--customers=<path>]         recomputes the authoritative customer-master checksum
//     [--out=<path>]               default: campaigns/<id>/manifests/<id>-release-manifest.json
//     [--force-overwrite-release]

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { defaultCampaignOutputDir, defaultCampaignOutputPath, assertSafeToWrite } from "./campaign-output";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

export interface ReleaseManifestArtifact {
  filename: string;
  sha256: string;
  bytes: number;
}

export interface ReleaseManifest {
  campaignId: string;
  releaseDirectory: string;
  generatedAt: string;
  artifactCount: number;
  artifacts: ReleaseManifestArtifact[];
  certificate: {
    result: string; masterResult: string; ctoResult: string; salesProResult: string;
    confirmedLeakCount: number; unresolvedProbableLeadCount: number; releasedLeadCount: number;
  } | null;
  authoritativeCustomerMaster: { path: string; sha256: string; bytes: number } | null;
  note: string;
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/** Pure, exported core — hashes every regular file in releaseDir, optionally folds in a certificate and customer-master checksum. Never writes anything itself. */
export async function buildReleaseManifest(opts: {
  campaignId: string;
  releaseDir: string;
  certificatePath?: string | null;
  customersPath?: string | null;
  now?: () => string;
}): Promise<ReleaseManifest> {
  const entries = await fs.readdir(opts.releaseDir);
  const artifacts: ReleaseManifestArtifact[] = [];
  for (const filename of entries) {
    if (filename.startsWith(".")) continue;
    const full = path.join(opts.releaseDir, filename);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    artifacts.push({ filename, sha256: await sha256File(full), bytes: stat.size });
  }
  artifacts.sort((a, b) => a.filename.localeCompare(b.filename));

  let certificate: ReleaseManifest["certificate"] = null;
  if (opts.certificatePath) {
    const c = JSON.parse(await fs.readFile(opts.certificatePath, "utf8"));
    certificate = {
      result: c.result, masterResult: c.masterResult, ctoResult: c.ctoResult, salesProResult: c.salesProResult,
      confirmedLeakCount: c.confirmedLeakCount, unresolvedProbableLeadCount: c.unresolvedProbableLeadCount,
      releasedLeadCount: c.releasedLeadCount,
    };
  }

  let authoritativeCustomerMaster: ReleaseManifest["authoritativeCustomerMaster"] = null;
  if (opts.customersPath) {
    const buf = await fs.readFile(opts.customersPath);
    authoritativeCustomerMaster = { path: opts.customersPath, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
  }

  const nowIso = (opts.now ?? (() => new Date().toISOString()))();
  return {
    campaignId: opts.campaignId,
    releaseDirectory: opts.releaseDir,
    generatedAt: nowIso,
    artifactCount: artifacts.length,
    artifacts,
    certificate,
    authoritativeCustomerMaster,
    note: "Metadata and hashes only — this file deliberately contains no customer or lead record contents. Every hash is computed programmatically from the actual release/ directory contents, never hand-typed.",
  };
}

async function main() {
  const campaignId = arg("campaign-id");
  if (!campaignId) { console.error("Missing required argument: --campaign-id=<id>"); process.exit(1); }
  const releaseDir = arg("release-dir") ?? defaultCampaignOutputDir(campaignId, "release");
  const certificatePath = arg("certificate");
  const customersPath = arg("customers");
  const outPath = arg("out") ?? defaultCampaignOutputPath(campaignId, "manifests", `${campaignId}-release-manifest.json`);

  const manifest = await buildReleaseManifest({ campaignId, releaseDir, certificatePath, customersPath });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await assertSafeToWrite(outPath, { force: flag("force-overwrite-release") });
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Release manifest written: ${outPath} (${manifest.artifactCount} artifact(s) hashed from ${releaseDir})`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
