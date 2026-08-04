// Generates a metadata-only release manifest covering all of a campaign's authoritative final
// artifacts — every SHA-256 and byte count computed programmatically from the files actually on
// disk, never hand-typed (ISS-0037: both Kunz's and Meer's manifests were previously
// hand-authored). Generic: takes --campaign-id=<id> and works for any campaign — never a
// hardcoded representative name, never reads representative-specific config.
//
// Scans three directories by default (2026-08-05, control-closure fix — the original version
// only scanned release/, missing the owner-review workbook and both audit/ files): release/,
// review/, audit/. The manifests/ directory itself (where this file is written) is never
// scanned, so the manifest never hashes or includes itself as an artifact.
//
// Usage:
//   npx tsx scripts/lead-production/generate-release-manifest.ts \
//     --campaign-id=<id> \
//     [--dir=release:<path>] [--dir=review:<path>] [--dir=audit:<path>]   repeatable, each
//       overrides that one kind's default (campaigns/<id>/<kind>/); other kinds keep their default
//     [--certificate=<path>]       the zero-leakage certificate JSON (default: read from audit/)
//     [--customers=<path>]         recomputes the authoritative customer-master checksum
//     [--out=<path>]               default: campaigns/<id>/manifests/<id>-release-manifest.json
//     [--force-overwrite-release]

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { defaultCampaignOutputDir, defaultCampaignOutputPath, assertSafeToWrite, type CampaignOutputKind } from "./campaign-output";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

export const DEFAULT_SCANNED_KINDS: CampaignOutputKind[] = ["release", "review", "audit"];

export interface ReleaseManifestArtifact {
  kind: string;
  filename: string;
  sha256: string;
  bytes: number;
}

export interface ReleaseManifest {
  campaignId: string;
  scannedDirectories: Record<string, string>;
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

async function hashDir(kind: string, dir: string): Promise<ReleaseManifestArtifact[]> {
  let entries: string[];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const artifacts: ReleaseManifestArtifact[] = [];
  for (const filename of entries) {
    if (filename.startsWith(".")) continue;
    const full = path.join(dir, filename);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    artifacts.push({ kind, filename, sha256: await sha256File(full), bytes: stat.size });
  }
  return artifacts;
}

/** Pure, exported core — hashes every regular file across the given kind->directory map, optionally folds in a certificate and customer-master checksum. Never writes anything itself. */
export async function buildReleaseManifest(opts: {
  campaignId: string;
  scannedDirectories: Record<string, string>;
  certificatePath?: string | null;
  customersPath?: string | null;
  now?: () => string;
}): Promise<ReleaseManifest> {
  let artifacts: ReleaseManifestArtifact[] = [];
  for (const [kind, dir] of Object.entries(opts.scannedDirectories)) {
    artifacts = artifacts.concat(await hashDir(kind, dir));
  }
  artifacts.sort((a, b) => a.kind === b.kind ? a.filename.localeCompare(b.filename) : a.kind.localeCompare(b.kind));

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
    scannedDirectories: opts.scannedDirectories,
    generatedAt: nowIso,
    artifactCount: artifacts.length,
    artifacts,
    certificate,
    authoritativeCustomerMaster,
    note: "Metadata and hashes only — this file deliberately contains no customer or lead record contents. Every hash is computed programmatically from the actual release/review/audit directory contents, never hand-typed. This manifest is never included as one of its own artifacts.",
  };
}

async function main() {
  const campaignId = arg("campaign-id");
  if (!campaignId) { console.error("Missing required argument: --campaign-id=<id>"); process.exit(1); }

  const dirOverrides = new Map<string, string>();
  for (const kv of argAll("dir")) {
    const idx = kv.indexOf(":");
    if (idx <= 0) { console.error(`--dir value "${kv}" must be kind:path (e.g. --dir=release:/some/path)`); process.exit(1); }
    dirOverrides.set(kv.slice(0, idx), kv.slice(idx + 1));
  }
  const scannedDirectories: Record<string, string> = {};
  for (const kind of DEFAULT_SCANNED_KINDS) {
    scannedDirectories[kind] = dirOverrides.get(kind) ?? defaultCampaignOutputDir(campaignId, kind);
  }

  const certificatePath = arg("certificate") ?? defaultCampaignOutputPath(campaignId, "audit", `${campaignId}-zero-leakage-certificate.json`);
  const customersPath = arg("customers");
  const outPath = arg("out") ?? defaultCampaignOutputPath(campaignId, "manifests", `${campaignId}-release-manifest.json`);

  const manifest = await buildReleaseManifest({ campaignId, scannedDirectories, certificatePath, customersPath });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await assertSafeToWrite(outPath, { force: flag("force-overwrite-release") });
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Release manifest written: ${outPath} (${manifest.artifactCount} artifact(s) hashed across ${Object.keys(scannedDirectories).join(", ")})`);
  for (const [kind, dir] of Object.entries(scannedDirectories)) {
    const count = manifest.artifacts.filter((a) => a.kind === kind).length;
    console.log(`  ${kind} (${dir}): ${count} file(s)`);
  }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
