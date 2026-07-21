// Live integration test for the report-query layer behind the three new screens
// (data-quality-exceptions, discovery-runs detail, audit/evidence). Skips honestly if
// service credentials are not configured — mirrors the existing test:je-supabase pattern.

import { promises as fs } from "node:fs";
import path from "node:path";

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

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  await loadDotEnv();
  const { hasServiceCredentials } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.log("SKIP: no service credentials configured — cannot test live report queries.");
    process.exit(0);
  }

  console.log("Data-quality exceptions:");
  const { fetchDataQualityExceptions } = await import("../src/lib/discovery-engine/reports/data-quality-exceptions");
  const dq = await fetchDataQualityExceptions();
  assert(dq.configured === true, "reports configured=true when credentials present");
  assert(typeof dq.totalOutlets === "number" && dq.totalOutlets > 0, "totalOutlets is a positive real count");
  assert(dq.missingPhone.count >= 0 && dq.missingPhone.sample.length <= 10, "missingPhone shape sane, sample capped");
  assert(Array.isArray(dq.geographyMismatches), "geographyMismatches is an array (never throws on empty)");
  assert(dq.duplicateObservations.totalCanonical >= 0, "duplicateObservations has a real canonical count");

  console.log("\nRun detail:");
  const { fetchRecentRuns, fetchRunDetail } = await import("../src/lib/discovery-engine/reports/run-detail");
  const recent = await fetchRecentRuns(5);
  assert(recent.configured === true, "fetchRecentRuns configured=true");
  assert(recent.runs.length > 0, "at least one real run exists");
  if (recent.runs.length) {
    const detail = await fetchRunDetail(recent.runs[0].id);
    assert(detail.found === true, "fetchRunDetail finds a real run by id");
    assert(detail.run !== null && detail.run.id === recent.runs[0].id, "run id round-trips correctly");
  }
  const missing = await fetchRunDetail("00000000-0000-0000-0000-000000000000");
  assert(missing.configured === true && missing.found === false, "unknown run id → found=false, never fabricated");

  console.log("\nAudit/evidence:");
  const { fetchRecentAuditRecords, fetchAuditRecordDetail } = await import("../src/lib/discovery-engine/reports/audit-evidence");
  const recentAudit = await fetchRecentAuditRecords(5);
  assert(recentAudit.configured === true, "fetchRecentAuditRecords configured=true");
  assert(recentAudit.records.length > 0, "at least one real observation exists");
  if (recentAudit.records.length) {
    const ad = await fetchAuditRecordDetail(recentAudit.records[0].id);
    assert(ad.found === true, "fetchAuditRecordDetail finds a real observation by id");
    assert(Array.isArray(ad.observation?.rawPayloadKeys), "raw payload keys listed (not the full payload) — scannable, no secrets");
  }
  const missingObs = await fetchAuditRecordDetail("00000000-0000-0000-0000-000000000000");
  assert(missingObs.configured === true && missingObs.found === false, "unknown observation id → found=false, never fabricated");

  console.log(fails === 0 ? "\nAll new-screen report-query assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
