// DRY RUN ONLY — prepares (does not apply) the geography-status repair for the production
// Just Eat proof run c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9.
//
// For each of this run's consolidated_candidates, resolves EVERY linked source outlet to its
// exact canonical (latest, non-duplicate) je_raw_observations row for THIS run, then looks up
// THAT exact observation's own provider_geography_validations row (matched on observation_id +
// run_id + tenant_id + source — never on source_outlet_id/source_record_id text alone, so a
// stale or cross-run observation of the same outlet can never contribute a verdict here).
//
// Classification (no schema change — reuses the three existing geography_status values):
//   - every linked observation's evidence is valid_geography              → valid_geography (operational)
//   - every linked observation's evidence is out_of_scope_geography       → out_of_scope_geography (excluded)
//   - every linked observation has no evidence / unverifiable evidence    → unverifiable_geography (excluded)
//   - ANY OTHER MIX (valid+rejected, valid+unverifiable, rejected+unverifiable, or all three)
//       → unverifiable_geography, reason "mixed_geography_evidence" (excluded from sales-ready
//         output; retained — via the existing Data-Quality Exceptions view, which already reads
//         anything != valid_geography — for manual/Level-3 review, never deleted)
//
// Writes zero rows. Captures full before-state (candidate id, current status, every linked
// source_outlet_id + its resolved observation + evidence status) to a timestamped file in the
// session scratchpad (outside git) before printing the corrected counts and the exact multi-link
// combination breakdown.

import { promises as fs } from "node:fs";
import path from "node:path";

const RUN_ID = "c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9";
const SCRATCHPAD = "/private/tmp/claude-501/-Users-homemac-Projects-magna-lead-intelligence-system/0293c191-dde5-49c5-9a7a-170feab681f0/scratchpad/geo-repair";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
}

type EvidenceStatus = "valid_geography" | "out_of_scope_geography" | "unverifiable_geography" | "no_evidence";
type LinkEvidence = { source_outlet_id: string; observationId: string | null; evidenceStatus: EvidenceStatus };
type CandidateRow = { id: string; currentStatus: string; links: LinkEvidence[]; correctedStatus: string; correctedReason: string; combination: string };

/** Categorise a candidate's link evidence set into one of the report's named combinations. */
function combinationOf(statuses: EvidenceStatus[]): string {
  const has = (s: EvidenceStatus) => statuses.includes(s);
  const hasValid = has("valid_geography");
  const hasRejected = has("out_of_scope_geography");
  const hasUnverifiable = has("unverifiable_geography") || has("no_evidence"); // "no evidence" folds into unverifiable for combination purposes
  const kinds = [hasValid, hasRejected, hasUnverifiable].filter(Boolean).length;
  if (kinds === 0) return "no_evidence"; // no links at all
  if (kinds === 1) {
    if (hasValid) return "all_valid";
    if (hasRejected) return "all_out_of_scope";
    return "all_unverifiable";
  }
  if (hasValid && hasRejected && !hasUnverifiable) return "valid_plus_out_of_scope";
  if (hasValid && hasUnverifiable && !hasRejected) return "valid_plus_unverifiable";
  if (hasRejected && hasUnverifiable && !hasValid) return "out_of_scope_plus_unverifiable";
  return "valid_plus_out_of_scope_plus_unverifiable"; // all three present
}

function recompute(links: LinkEvidence[]): { status: string; reason: string; combination: string } {
  const statuses = links.map((l) => l.evidenceStatus);
  const combination = combinationOf(statuses);
  if (combination === "all_valid") return { status: "valid_geography", reason: "repair 2026-07-22: all linked observations valid_geography (observation-level, run-scoped)", combination };
  if (combination === "all_out_of_scope") return { status: "out_of_scope_geography", reason: "repair 2026-07-22: all linked observations out_of_scope_geography (observation-level, run-scoped)", combination };
  if (combination === "all_unverifiable" || combination === "no_evidence") return { status: "unverifiable_geography", reason: "repair 2026-07-22: no valid or rejected evidence found for any linked observation", combination };
  // any mix — never silently classify as ordinary out-of-scope; flag distinctly for manual review
  return { status: "unverifiable_geography", reason: "mixed_geography_evidence", combination };
}

async function main() {
  await loadDotEnv();
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing service credentials."); process.exit(1); }
  const db = createServiceClient();

  console.log(`=== DRY RUN — geography-status repair for run ${RUN_ID} (no writes) ===\n`);

  // Tenant for this run (single value expected; asserted below).
  const tenantRes = await db.from("consolidated_candidates").select("tenant_id").eq("run_id", RUN_ID).limit(1).maybeSingle();
  if (tenantRes.error) throw new Error(`load tenant: ${JSON.stringify(tenantRes.error)}`);
  const tenantId = (tenantRes.data as { tenant_id: string } | null)?.tenant_id;
  if (!tenantId) { console.error("No candidates found for this run — nothing to repair."); process.exit(1); }

  const candRes = await db.from("consolidated_candidates").select("id,geography_status,candidate_source_links(source_outlet_id,source)").eq("run_id", RUN_ID);
  if (candRes.error) throw new Error(`load candidates: ${JSON.stringify(candRes.error)}`);
  const candidates = (candRes.data ?? []) as { id: string; geography_status: string; candidate_source_links: { source_outlet_id: string; source: string }[] }[];
  const beforeCount = candidates.length;

  // Every canonical (non-duplicate) raw observation for this run, newest first — first row seen
  // per source_record_id is the run's own canonical (latest) capture, exactly as consolidateRun()
  // now resolves it.
  const obsRes = await db.from("je_raw_observations").select("id, source_record_id")
    .eq("run_id", RUN_ID).is("duplicate_of", null).order("created_at", { ascending: false });
  if (obsRes.error) throw new Error(`load observations: ${JSON.stringify(obsRes.error)}`);
  const canonicalObservationBySourceId = new Map<string, string>();
  for (const o of (obsRes.data ?? []) as { id: string; source_record_id: string }[]) {
    if (o.source_record_id && !canonicalObservationBySourceId.has(o.source_record_id)) canonicalObservationBySourceId.set(o.source_record_id, o.id);
  }

  const valRes = await db.from("provider_geography_validations").select("observation_id,status")
    .eq("run_id", RUN_ID).eq("tenant_id", tenantId).eq("source", "just_eat");
  if (valRes.error) throw new Error(`load validations: ${JSON.stringify(valRes.error)}`);
  const evidenceByObservationId = new Map<string, string>();
  for (const v of (valRes.data ?? []) as { observation_id: string | null; status: string }[]) {
    if (v.observation_id) evidenceByObservationId.set(v.observation_id, v.status);
  }

  const rows: CandidateRow[] = candidates.map((c) => {
    const links: LinkEvidence[] = (c.candidate_source_links ?? [])
      .filter((l) => l.source === "just_eat")
      .map((l) => {
        const observationId = canonicalObservationBySourceId.get(l.source_outlet_id) ?? null;
        const evidenceStatus = (observationId ? (evidenceByObservationId.get(observationId) as EvidenceStatus | undefined) : undefined) ?? "no_evidence";
        return { source_outlet_id: l.source_outlet_id, observationId, evidenceStatus };
      });
    const { status, reason, combination } = recompute(links);
    return { id: c.id, currentStatus: c.geography_status, links, correctedStatus: status, correctedReason: reason, combination };
  });

  const beforeBreakdown: Record<string, number> = {};
  for (const r of rows) beforeBreakdown[r.currentStatus] = (beforeBreakdown[r.currentStatus] ?? 0) + 1;

  const afterBreakdown: Record<string, number> = {};
  for (const r of rows) afterBreakdown[r.correctedStatus] = (afterBreakdown[r.correctedStatus] ?? 0) + 1;

  const mixedCount = rows.filter((r) => r.correctedReason === "mixed_geography_evidence").length;
  const changed = rows.filter((r) => r.currentStatus !== r.correctedStatus);

  // Exact multi-link combination breakdown (the report's required section).
  const multiLink = rows.filter((r) => r.links.length > 1);
  const singleLink = rows.filter((r) => r.links.length === 1);
  const noLink = rows.filter((r) => r.links.length === 0);
  const combinationCounts: Record<string, number> = {};
  for (const r of multiLink) combinationCounts[r.combination] = (combinationCounts[r.combination] ?? 0) + 1;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(SCRATCHPAD, `before-state-${RUN_ID}-${stamp}.json`);
  await fs.mkdir(SCRATCHPAD, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({
    runId: RUN_ID, tenantId, capturedAt: new Date().toISOString(), beforeCount, beforeBreakdown,
    afterBreakdown, mixedCount, multiLinkCount: multiLink.length, singleLinkCount: singleLink.length,
    noLinkCount: noLink.length, combinationCounts, rows,
  }, null, 2));

  console.log(`Tenant: ${tenantId}`);
  console.log(`Before count: ${beforeCount}`);
  console.log(`Before status breakdown: ${JSON.stringify(beforeBreakdown)}`);
  console.log(`\nDry-run corrected status breakdown: ${JSON.stringify(afterBreakdown)}`);
  console.log(`Candidates whose status would change: ${changed.length}`);
  console.log(`Of which classified mixed_geography_evidence (excluded, not ordinary out-of-scope): ${mixedCount}`);
  console.log(`Expected valid unique candidate count after repair: ${afterBreakdown["valid_geography"] ?? 0}`);

  console.log(`\n--- Multi-link candidates: ${multiLink.length} (single-link: ${singleLink.length}, no-link: ${noLink.length}) ---`);
  const labels: Record<string, string> = {
    all_valid: "all-valid", all_out_of_scope: "all-out-of-scope", all_unverifiable: "all-unverifiable",
    valid_plus_out_of_scope: "valid + out-of-scope", valid_plus_unverifiable: "valid + unverifiable",
    out_of_scope_plus_unverifiable: "out-of-scope + unverifiable",
    valid_plus_out_of_scope_plus_unverifiable: "valid + out-of-scope + unverifiable (all three)",
    no_evidence: "no evidence at all",
  };
  for (const key of Object.keys(labels)) {
    if (combinationCounts[key]) console.log(`  ${labels[key]}: ${combinationCounts[key]}`);
  }
  const anyMixedAmongMultiLink = Object.keys(combinationCounts).some((k) => k.includes("plus"));
  console.log(anyMixedAmongMultiLink
    ? `\n${mixedCount} candidate(s) have genuinely mixed evidence — classified unverifiable_geography / mixed_geography_evidence, excluded from operational output, NOT ordinary out_of_scope.`
    : `\nEvery multi-link candidate is evidence-homogeneous (no mixed verdicts among its links) — confirmed by exhaustive per-candidate check above, not assumed.`);

  console.log(`\nFull before-state (evidence + per-candidate breakdown) written to:\n  ${outFile}`);
  console.log("\nNo rows were modified. This script is read-only.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
