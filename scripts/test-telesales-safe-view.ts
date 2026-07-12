// Phase 11 — verifies the telesales safe view never leaks restricted fields.

import fs from "node:fs";
import path from "node:path";
import { toTelesalesSafeQueue, assertNoRestrictedTelesalesFields, TELESALES_ALLOWED_KEYS } from "../src/lib/pipeline/telesales-safe-view";

let failures = 0;
const fail = (m: string) => { console.error("  ✗", m); failures++; };

const jsonPath = path.join(process.cwd(), "exports", "first-fsa-leads.json");
if (!fs.existsSync(jsonPath)) { console.log("No export bundle — run npm run leads:first first (skipping data check)."); }
else {
  const bundle = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const queue = toTelesalesSafeQueue(bundle.leads ?? []);
  const allowed = new Set<string>(TELESALES_ALLOWED_KEYS as string[]);
  for (const row of queue) {
    for (const k of Object.keys(row)) if (!allowed.has(k)) fail(`unexpected key "${k}" in a telesales row`);
  }
  const FORBIDDEN = ["score", "score_reasons", "warnings", "manual_review_flags", "companies_house_status", "google_places_status", "delivery_risk_flag", "delivery_source_method", "grade", "export_status"];
  for (const f of FORBIDDEN) if (queue.some((r) => f in (r as any))) fail(`FORBIDDEN field "${f}" present in telesales output`);
  console.log(`  ${queue.length} safe telesales rows checked`);
}

// assertNoRestrictedTelesalesFields must reject bad objects
for (const bad of [{ score: 5 }, { grade: "A" }, { company_number: "1" }, { match_confidence: 0.9 }, { warnings: "x" }]) {
  let threw = false;
  try { assertNoRestrictedTelesalesFields(bad as any); } catch { threw = true; }
  if (!threw) fail(`assert did not throw for ${JSON.stringify(bad)}`);
}

console.log(failures === 0 ? "\nTelesales safe view: PASS ✓" : `\nTelesales safe view: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
