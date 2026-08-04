// Shared default-output-path + write-safety logic for the lead-production final-output
// generators (generate-master-export.ts, flatten-combined-master-to-csv.ts,
// generate-owner-review-pack.ts, generate-cto-final-review.ts, verify-customer-leakage.ts,
// generate-release-manifest.ts). Additive, generic, never a representative name — every default
// path is derived from a caller-supplied --campaign-id, never hardcoded per-rep.
//
// Required permanent temporary-pipeline layout (2026-08-04 storage restructure,
// docs/02_ARCHITECTURE.md "Temporary local production storage boundary"):
//   /Users/homemac/Data/aspectlead-lead-production/campaigns/<campaign-id>/{review,audit,
//   release,manifests,working,raw,checkpoints,configuration}/
//
// An explicit --out (or --out-xlsx/--out-csv/--out-json) always wins over this default, for
// every script that uses it — this module only supplies the FALLBACK when --campaign-id is
// given and no explicit path is. Nothing here changes behaviour for a caller that always passes
// an explicit path (every campaign-003/004 district run this session did).

import { promises as fs } from "node:fs";
import path from "node:path";

export const CAMPAIGN_DATA_ROOT = "/Users/homemac/Data/aspectlead-lead-production";
export const GIT_REPO_ROOT = "/Users/homemac/Projects/magna/lead-intelligence-engine";

export type CampaignOutputKind = "review" | "audit" | "release" | "manifests" | "working" | "raw" | "checkpoints" | "configuration";

/** The two subdirectories treated as an approved, immutable release — never silently overwritten. */
const PROTECTED_KINDS: readonly CampaignOutputKind[] = ["release", "manifests"];

export function defaultCampaignOutputPath(campaignId: string, kind: CampaignOutputKind, filename: string): string {
  if (!campaignId) throw new Error("defaultCampaignOutputPath: campaignId is required.");
  if (!filename) throw new Error("defaultCampaignOutputPath: filename is required.");
  return path.join(CAMPAIGN_DATA_ROOT, "campaigns", campaignId, kind, filename);
}

/** Directory-only variant, for generators (like generate-master-export.ts) that take a --out=<dir> and write multiple files inside it. */
export function defaultCampaignOutputDir(campaignId: string, kind: CampaignOutputKind): string {
  if (!campaignId) throw new Error("defaultCampaignOutputDir: campaignId is required.");
  return path.join(CAMPAIGN_DATA_ROOT, "campaigns", campaignId, kind);
}

export function isInsideGitRepo(destPath: string): boolean {
  const resolved = path.resolve(destPath);
  const repoResolved = path.resolve(GIT_REPO_ROOT);
  return resolved === repoResolved || resolved.startsWith(repoResolved + path.sep);
}

function isInsideProtectedKind(destPath: string, kind?: CampaignOutputKind): boolean {
  if (kind) return PROTECTED_KINDS.includes(kind);
  // No explicit kind given (e.g. caller passed a fully custom --out) — infer from the path
  // itself, so the same protection still applies to a hand-typed .../release/... or
  // .../manifests/... destination.
  const segments = path.resolve(destPath).split(path.sep);
  return segments.some((s) => (PROTECTED_KINDS as readonly string[]).includes(s));
}

/**
 * Refuses (throws) to let a caller write:
 *  1. anywhere inside the Git repository — generated/production output must never land there.
 *  2. over an existing file inside a release/ or manifests/ directory, unless `force` is true —
 *     an approved release must never be silently clobbered by a routine regeneration.
 */
export async function assertSafeToWrite(destPath: string, opts: { kind?: CampaignOutputKind; force?: boolean } = {}): Promise<void> {
  if (isInsideGitRepo(destPath)) {
    throw new Error(`REFUSING TO WRITE: "${destPath}" resolves inside the Git repository (${GIT_REPO_ROOT}) — generated/production output must never be written into a Git-tracked directory.`);
  }
  const exists = await fs.access(destPath).then(() => true).catch(() => false);
  if (!exists) return;
  if (isInsideProtectedKind(destPath, opts.kind) && !opts.force) {
    throw new Error(`REFUSING TO OVERWRITE: "${destPath}" already exists inside a release/manifests directory — an approved release must never be silently overwritten by a routine regeneration. Pass --force-overwrite-release if this replacement is genuinely intended.`);
  }
}

/** Resolves an output path: explicit --out wins; otherwise falls back to the campaign default (if --campaign-id was supplied); otherwise null (caller decides how to fail). */
export function resolveCampaignOutputPath(explicitOut: string | null, campaignId: string | null, kind: CampaignOutputKind, filename: string): string | null {
  if (explicitOut) return explicitOut;
  if (campaignId) return defaultCampaignOutputPath(campaignId, kind, filename);
  return null;
}
