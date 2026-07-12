// Phase 1 — Lead Quality Audit. Reads the latest export bundle and produces
// machine-readable reports + a summary for docs/22. No network, no secrets.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXPORTS = path.join(ROOT, "exports");
const REPORTS = path.join(EXPORTS, "reports");
const JSON_PATH = path.join(EXPORTS, "first-fsa-leads.json");

interface Lead {
  run_id: string; lead_id: string; business_name: string; address: string; postcode: string;
  local_authority: string; business_type: string; fsa_rating: string; rating_date: string;
  fsa_business_id: string; latitude: string; longitude: string; territory_code: string;
  trigger_reason: string; score: number; grade: string; score_reasons: string; warnings: string;
  companies_house_status: string; google_places_status: string; platform_presence_status: string;
  delivery_source_method?: string; delivery_risk_flag?: string; delivery_evidence_url?: string;
  export_status: string;
}

function norm(s: string): string { return s.toLowerCase().replace(/\b(ltd|limited|the|co|uk)\b/g, "").replace(/[^a-z0-9]/g, ""); }

const LOW_VALUE_RE = /school|colleg|univ|nurser|childcare|care home|caring|hospital|clinic|club|hall|church|mosque|temple|gurdwara|prison|retail|newsagent|off licence|pharmac|hostel|hotel|b&b|guest house/i;
const STRONG_FOOD_RE = /takeaway|restaurant|cafe|café|canteen|caterer|sandwich|pizza|kebab|chicken|burger|grill|bakery|dessert|coffee|fried|sweet|kitchen|deli/i;

function csvEscape(v: unknown): string { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCsv<T extends Record<string, unknown>>(rows: T[], headers: (keyof T)[]): string {
  return headers.join(",") + "\n" + rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n") + "\n";
}

function main() {
  if (!fs.existsSync(JSON_PATH)) { console.error("No export at", JSON_PATH, "— run npm run leads:first first."); process.exit(1); }
  const bundle = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const leads: Lead[] = bundle.leads ?? [];
  fs.mkdirSync(REPORTS, { recursive: true });

  const by = <K extends string>(fn: (l: Lead) => K) => {
    const m: Record<string, number> = {};
    for (const l of leads) { const k = fn(l); m[k] = (m[k] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  const missingCoords = leads.filter((l) => !l.latitude || !l.longitude || Number.isNaN(parseFloat(l.latitude)));
  const missingPhone = leads; // no phone field in the internal export (Google disabled) — all missing
  const weak = leads.filter((l) => l.score < 45 || l.grade === "D" || l.grade === "C");
  const lowValueCat = leads.filter((l) => LOW_VALUE_RE.test(l.business_type) || LOW_VALUE_RE.test(l.business_name));
  const notStrongFood = leads.filter((l) => !STRONG_FOOD_RE.test(l.business_type) && !STRONG_FOOD_RE.test(l.business_name));

  // duplicate-looking: same normalised name across 2+ records
  const nameGroups: Record<string, Lead[]> = {};
  for (const l of leads) { const k = norm(l.business_name); (nameGroups[k] ??= []).push(l); }
  const dupes = Object.values(nameGroups).filter((g) => g.length > 1);
  const dupeCount = dupes.reduce((n, g) => n + g.length, 0);

  const manualReview = leads.filter((l) => LOW_VALUE_RE.test(l.business_type) || l.grade === "D" || (nameGroups[norm(l.business_name)]?.length ?? 1) > 2);

  const sortByScore = (a: Lead, b: Lead) => b.score - a.score;
  const top50 = [...leads].sort(sortByScore).slice(0, 50);
  const weak50 = [...leads].sort((a, b) => a.score - b.score).slice(0, 50);
  const manual25 = manualReview.slice(0, 25);

  const summary = {
    generated_from: bundle.run_id,
    total_final_leads: leads.length,
    export_eligible: (bundle.exportEligible ?? []).length,
    by_territory: by((l) => l.territory_code || "—"),
    by_business_type: by((l) => l.business_type || "—"),
    by_fsa_rating: by((l) => l.fsa_rating || "—"),
    by_grade: by((l) => l.grade || "—"),
    missing_coordinates: missingCoords.length,
    missing_phone: missingPhone.length,
    weak_score_lt45_or_CD: weak.length,
    low_value_categories: lowValueCat.length,
    not_strong_foodservice: notStrongFood.length,
    duplicate_looking_records: dupeCount,
    duplicate_groups: dupes.length,
    needs_manual_review: manualReview.length,
    score: {
      min: Math.min(...leads.map((l) => l.score)),
      max: Math.max(...leads.map((l) => l.score)),
      avg: Math.round(leads.reduce((n, l) => n + l.score, 0) / Math.max(1, leads.length)),
    },
  };

  fs.writeFileSync(path.join(REPORTS, "first-leads-quality-summary.json"), JSON.stringify(summary, null, 2));
  const cols: (keyof Lead)[] = ["lead_id", "business_name", "postcode", "territory_code", "business_type", "fsa_rating", "grade", "score", "trigger_reason", "platform_presence_status", "export_status"];
  fs.writeFileSync(path.join(REPORTS, "top-50-leads.csv"), toCsv(top50 as any, cols as any));
  fs.writeFileSync(path.join(REPORTS, "weak-leads.csv"), toCsv([...weak].sort((a, b) => a.score - b.score) as any, cols as any));
  fs.writeFileSync(path.join(REPORTS, "manual-review-leads.csv"), toCsv(manualReview as any, cols as any));

  console.log("Lead quality audit for", bundle.run_id);
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nReports written to exports/reports/: first-leads-quality-summary.json, top-50-leads.csv, weak-leads.csv, manual-review-leads.csv");
  console.log("top50/weak50/manual25 counts:", top50.length, weak50.length, manual25.length);

  // emit small markdown fragments for docs/22 (top/weak/manual tables)
  const mdRow = (l: Lead) => `| ${l.business_name} | ${l.postcode} | ${l.territory_code} | ${l.business_type} | ${l.fsa_rating} | ${l.grade} | ${l.score} |`;
  const table = (rows: Lead[]) => "| Business | Postcode | Terr | Type | FSA | Grade | Score |\n|---|---|---|---|---|---|---|\n" + rows.map(mdRow).join("\n");
  fs.writeFileSync(path.join(REPORTS, "_top50.md"), table(top50));
  fs.writeFileSync(path.join(REPORTS, "_weak50.md"), table(weak50));
  fs.writeFileSync(path.join(REPORTS, "_manual25.md"), table(manual25));
}

main();
