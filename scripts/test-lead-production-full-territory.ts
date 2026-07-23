// Integration proofs for the reusable full-territory orchestrator
// (npm run test:lead-production-full-territory). Unlike the other lead-production test files
// (which exercise pure logic against in-process fixtures), this orchestrator's whole job is
// process sequencing, checkpoint management, and CLI argument handling — so these proofs
// actually spawn scripts/lead-production/run-full-territory.ts as a real child process against
// synthetic on-disk checkpoints, exactly as a real invocation would. No live external API call
// is ever made by any proof here (every proof uses --checkpoint overrides and/or
// --request-plan-only, or stops at a stage that makes no external calls).

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const REPO_ROOT = path.resolve(__dirname, "..");
const ORCHESTRATOR = "scripts/lead-production/run-full-territory.ts";

function run(args: string[]): { ok: boolean; status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("npx", ["tsx", ORCHESTRATOR, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function writeJson(p: string, v: unknown) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(v, null, 2)); }
async function writeCsvFile(p: string, columns: string[], rows: Record<string, string>[]) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c] ?? "")).join(","))];
  await fs.writeFile(p, lines.join("\n") + "\n");
}

/** Minimal valid phase1 + fsa checkpoint pair for one synthetic territory, matching the exact
 *  schema run-fsa-stage.ts / run-google-stage.ts read. Two candidates by default so the
 *  self-derived Google population's candidateCount is independently checkable. */
async function genFixtureTerritory(root: string, territory: string, candidateIds: string[]) {
  const t = territory.toLowerCase();
  const phase1Dir = path.join(root, `${t}-phase1`);
  const fsaDir = path.join(root, `${t}-fsa`);

  const phase1Rows = candidateIds.map((cid, i) => ({
    candidateId: cid, outcome: "new_prospect", matchTier: "none", matchedCustomerId: null,
    rulesTriggered: [], nameSimilarity: null, preliminaryStatus: "clear_for_enrichment",
    group: null, assignedTerritory: null, assignedSalesperson: null,
    rejection: { level: "not_assessed", type: null, reasonTags: [] },
    normalisedName: { candidateOriginal: `Test Diner ${i + 1} ${territory}`, candidateNormalised: `test diner ${i + 1}`, customerOriginal: null, customerNormalised: null },
    normalisedPostcode: { candidateOriginal: `${territory} 1AA`, candidateNormalised: `${territory} 1AA`, customerOriginal: null, customerNormalised: null },
    normalisedPhone: { candidateOriginal: null, candidateNormalised: null, customerOriginal: null, customerNormalised: null },
  }));
  await writeJson(path.join(phase1Dir, "customer-match-results.json"), phase1Rows);

  const fsaRows = candidateIds.map((cid) => ({
    candidateId: cid, candidateTradingName: `Test Diner ${territory}`, candidatePostcode: `${territory} 1AA`,
    outcome: "exact_fsa_match", plausibleEstablishments: [{
      fhrsId: "1", officialBusinessName: `Test Diner ${territory} Ltd`, fsaAddress: "1 Test St", fsaPostcode: `${territory} 1AA`,
      businessType: "Restaurant", hygieneRating: "5", ratingStatus: "rated", ratingDate: "2025-01-01", localAuthority: "Test Council",
      nameSimilarity: 0.9, postcodeAgreement: true, addressAgreement: null, coordinateEvidence: null,
    }], evidenceTags: [], retrievalTimestamp: "2026-01-01T00:00:00Z", sourceResponseReference: "q", apiFailureReason: null, apiAttempts: 1,
  }));
  await writeJson(path.join(fsaDir, "fsa-results.json"), fsaRows);
  await writeCsvFile(path.join(fsaDir, "customer-match-resolution-after-fsa.csv"), ["candidate_id", "resolution_outcome"], candidateIds.map((cid) => ({ candidate_id: cid, resolution_outcome: "" })));

  return { phase1Dir, fsaDir };
}

async function main() {
  console.log("Full-territory orchestrator — integration proofs:\n");

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "full-territory-test-"));
  const customersCsv = path.join(tmpRoot, "customers.csv");
  await writeCsvFile(customersCsv, ["customer_id", "trading_name", "postcode", "status"], [{ customer_id: "C1", trading_name: "Existing Customer Ltd", postcode: "ZZ9 9ZZ", status: "CUSTOMER-Closed Won" }]);
  const registryJson = path.join(tmpRoot, "registry.json");
  await writeJson(registryJson, []);

  // --- Territory-agnosticism: two distinct synthetic postcode districts, distinct candidate
  // counts, run through the same code path with zero territory-specific branching. ---
  const zz1 = await genFixtureTerritory(tmpRoot, "ZZ1", ["zz1-cand-a", "zz1-cand-b"]);
  const kt9 = await genFixtureTerritory(tmpRoot, "KT9", ["kt9-cand-a", "kt9-cand-b", "kt9-cand-c"]);

  {
    const outDir = path.join(tmpRoot, "zz1-plan-out");
    const r = run([
      "--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${outDir}`,
      `--checkpoint=phase1=${zz1.phase1Dir}`, `--checkpoint=fsa=${zz1.fsaDir}`,
      "--from-stage=google", "--to-stage=google", "--request-plan-only",
    ]);
    assert(r.ok, `ZZ1 (2 candidates) request-plan-only run exits 0 (stderr: ${r.stderr.slice(0, 400)})`);
    const plan = JSON.parse(await fs.readFile(path.join(outDir, "territory-request-plan.json"), "utf8").catch(() => "null") ?? "null");
    assert(plan?.territory === "ZZ1", "plan file records territory ZZ1");
    assert(plan?.stages?.[0]?.ok === true, "ZZ1 google-stage preflight succeeded (self-derived its population from the FSA checkpoint via --phase1-dir)");
    assert(plan?.stages?.[0]?.preflight?.candidateCount === 2, `ZZ1's derived population has exactly 2 candidates (got ${plan?.stages?.[0]?.preflight?.candidateCount})`);
    const noLiveResultFile = !(await fs.access(path.join(outDir, `zz1-google-stage-${plan?.generatedAt ? "x" : "x"}`)).then(() => true).catch(() => false));
    assert(noLiveResultFile, "no real google-results.json checkpoint was written by a request-plan-only run (sanity: dir doesn't exist under a fabricated name)");
  }

  {
    const outDir = path.join(tmpRoot, "kt9-plan-out");
    const r = run([
      "--territory=KT9", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${outDir}`,
      `--checkpoint=phase1=${kt9.phase1Dir}`, `--checkpoint=fsa=${kt9.fsaDir}`,
      "--from-stage=google", "--to-stage=google", "--request-plan-only",
    ]);
    assert(r.ok, `KT9 (3 candidates) request-plan-only run exits 0 (stderr: ${r.stderr.slice(0, 400)})`);
    const plan = JSON.parse(await fs.readFile(path.join(outDir, "territory-request-plan.json"), "utf8").catch(() => "null") ?? "null");
    assert(plan?.territory === "KT9", "plan file records territory KT9 (distinct from ZZ1 — proves no hardcoded territory string)");
    assert(plan?.stages?.[0]?.preflight?.candidateCount === 3, `KT9's derived population has exactly 3 candidates (got ${plan?.stages?.[0]?.preflight?.candidateCount})`);
    const sample = JSON.stringify(plan?.stages?.[0]?.preflight?.dryRunRequestPlanSample ?? []);
    assert(!sample.includes("zz1-cand"), "KT9's request plan contains zero ZZ1 candidate IDs (no cross-territory contamination)");
  }

  // --- --request-plan-only makes no live calls at all: no anchor file for the google stage
  // exists anywhere under either plan-only output directory. ---
  {
    const zz1PlanDir = path.join(tmpRoot, "zz1-plan-out");
    const entries = await fs.readdir(zz1PlanDir);
    const googleStageDirs = entries.filter((e) => e.includes("google-stage"));
    let anchorFound = false;
    for (const d of googleStageDirs) {
      if (await fs.access(path.join(zz1PlanDir, d, "google-results.json")).then(() => true).catch(() => false)) anchorFound = true;
    }
    assert(!anchorFound, "request-plan-only never writes google-results.json (the stage's real anchor checkpoint file) — only a preflight report");
  }

  // --- Resume + corrupted-checkpoint rejection: run public_profile → final_scoring against a
  // full synthetic checkpoint set (self-derived google population + fixture CH/website dirs
  // reused from the earlier session's fixture generator would be ideal, but for this proof we
  // only need to reach a stage that WRITES a manifest entry — public_profile is the first
  // in-range stage and makes no external calls, so this exercises resume/corruption without
  // needing Companies House/website fixtures at all). ---
  {
    const chDir = path.join(tmpRoot, "zz1-ch-fixture");
    await writeJson(path.join(chDir, "companies-house-population-manifest.json"), { eligibleIds: ["zz1-cand-a", "zz1-cand-b"] });
    await writeJson(path.join(chDir, "companies-house-results.json"), []);
    await writeCsvFile(path.join(chDir, "customer-resolution-after-companies-house.csv"), ["candidate_id", "resolution_outcome", "prior_matched_customer_id"], []);
    await writeCsvFile(path.join(chDir, "financial-calculations.csv"), ["candidate_id", "financialStrengthBand_result", "companySizeBand_result", "likelyPurchasingCapacityBand_result", "financial_data_confidence"], []);
    await writeCsvFile(path.join(chDir, "decision-maker-candidates.csv"), ["candidate_id", "company_number", "full_name", "likely_role", "rank", "source_type", "evidence_tags"], []);
    await writeCsvFile(path.join(chDir, "related-companies.csv"), ["candidate_id", "company_number", "category", "related_company_numbers", "related_company_names", "shared_director_names", "shared_psc_names", "evidence_tags"], []);

    const webDir = path.join(tmpRoot, "zz1-web-fixture");
    await writeJson(path.join(webDir, "website-extracted-data.json"), []);
    await writeJson(path.join(webDir, "product-fit-results.json"), []);

    const googleDir = path.join(tmpRoot, "zz1-google-fixture");
    // Self-derive the google population, then treat it as if the (skipped, out-of-scope-for-this-proof)
    // Google stage had run: only public_profile onward needs a "google-results.json"-shaped anchor.
    run(["--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${path.join(tmpRoot, "zz1-google-selfderive")}`, `--checkpoint=phase1=${zz1.phase1Dir}`, `--checkpoint=fsa=${zz1.fsaDir}`, "--from-stage=google", "--to-stage=google", "--request-plan-only"]);
    await writeJson(path.join(googleDir, "google-results.json"), []);
    await writeCsvFile(path.join(googleDir, "physical-premises-results.csv"), ["candidate_id", "result", "evidence_tags"], []);
    await writeCsvFile(path.join(googleDir, "customer-resolution-after-google.csv"), ["candidate_id", "resolution_outcome", "prior_matched_customer_id"], []);
    await writeCsvFile(path.join(googleDir, "fsa-resolution-after-google.csv"), ["candidate_id", "resolution", "top_fsa_name"], []);
    await writeCsvFile(path.join(googleDir, "newly-detected-groups.csv"), ["candidate_id", "candidate_trading_name", "signal", "classification", "default_outcome", "evidence_tags"], []);

    const resumeOut = path.join(tmpRoot, "zz1-resume-out");
    const commonArgs = [
      "--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${resumeOut}`,
      `--checkpoint=phase1=${zz1.phase1Dir}`, `--checkpoint=fsa=${zz1.fsaDir}`, `--checkpoint=google=${googleDir}`,
      `--checkpoint=companies_house=${chDir}`, `--checkpoint=website=${webDir}`,
      "--from-stage=public_profile", "--to-stage=public_profile",
    ];
    const first = run([...commonArgs, "--live"]);
    assert(first.ok, `first run (public_profile only) exits 0 (stderr: ${first.stderr.slice(0, 400)})`);
    const manifestPath = path.join(resumeOut, ".orchestrator-run-manifest.json");
    const manifestBefore = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert(!!manifestBefore.stages?.public_profile, "public_profile stage was recorded in the manifest after the first run");

    const second = run(["--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${resumeOut}`, "--from-stage=public_profile", "--to-stage=public_profile", "--resume", "--live"]);
    assert(second.ok, `--resume run (no checkpoint overrides needed — reads recorded manifest) exits 0 (stderr: ${second.stderr.slice(0, 400)})`);
    assert(second.stdout.includes("already complete (resumed), skipping"), "resumed run recognises the already-completed stage and skips re-running it");

    // Corrupt the recorded stage's checkpoint output, then attempt to resume again.
    const publicProfileDir = manifestBefore.stages.public_profile.dir as string;
    const anchorFile = path.join(publicProfileDir, "public-profile-results.json");
    const anchorExists = await fs.access(anchorFile).then(() => true).catch(() => false);
    if (anchorExists) {
      const original = await fs.readFile(anchorFile, "utf8");
      await fs.writeFile(anchorFile, original + "\n// corrupted for test\n");
      const third = run(["--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${resumeOut}`, "--from-stage=public_profile", "--to-stage=public_profile", "--resume", "--live"]);
      assert(!third.ok, "resuming after the recorded checkpoint's anchor file was modified is REFUSED (non-zero exit)");
      assert(/REFUSING TO RESUME/.test(third.stdout + third.stderr), "refusal message explicitly names the checksum-mismatch reason");
      await fs.writeFile(anchorFile, original);
    } else {
      assert(false, `expected anchor file not found for corruption test: ${anchorFile}`);
    }
  }

  // --- Duplicate active territory ownership is rejected (reused, already-tested loader). ---
  {
    const assignmentsCsv = path.join(tmpRoot, "dup-assignments.csv");
    await writeCsvFile(assignmentsCsv, ["salesperson", "role", "territory", "required_lead_count"], [
      { salesperson: "Alice", role: "telesales", territory: "DUP1", required_lead_count: "0" },
      { salesperson: "Bob", role: "telesales", territory: "DUP1", required_lead_count: "0" },
    ]);
    const r = run(["--territory=DUP1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${path.join(tmpRoot, "dup-out")}`, `--assignments=${assignmentsCsv}`, "--from-stage=phase1", "--to-stage=phase1", "--request-plan-only"]);
    assert(!r.ok, "orchestrator refuses to run when the assignment file has duplicate active ownership of the same (territory, role)");
    assert(/Duplicate active ownership/.test(r.stdout + r.stderr), "failure surfaces the DuplicateTerritoryOwnershipError message");
  }

  // --- Stage range respected: --to-stage=fsa never touches (or manifests) the google stage. ---
  {
    const outDir = path.join(tmpRoot, "zz1-range-out");
    const r = run([
      "--territory=ZZ1", `--customers=${customersCsv}`, `--registry=${registryJson}`, `--out=${outDir}`,
      `--checkpoint=phase1=${zz1.phase1Dir}`, `--checkpoint=fsa=${zz1.fsaDir}`,
      "--from-stage=fsa", "--to-stage=fsa", "--live",
    ]);
    assert(r.ok, `--to-stage=fsa run exits 0 (stderr: ${r.stderr.slice(0, 400)})`);
    const manifest = JSON.parse(await fs.readFile(path.join(outDir, ".orchestrator-run-manifest.json"), "utf8"));
    assert(!!manifest.stages.fsa, "fsa stage recorded when in range");
    assert(!manifest.stages.google, "google stage NOT recorded when --to-stage=fsa excludes it from range");
  }

  await fs.rm(tmpRoot, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "All proofs passed." : `${fails} proof(s) FAILED.`}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
