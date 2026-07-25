// Generates the 20-column CTO_Existing_Lead_Form CSV from an already-regenerated
// *_SalesPro_New_Leads.csv (the same 20 approved columns, in the exact order and with the exact
// labels from config/lead-production/cto-existing-field-mapping-v1.json's rawTemplateHeaderOrder
// — never re-derived independently of that source of truth). Read-only against its input; makes
// no external call. Reusable pipeline component — replaces the ad-hoc extraction performed once
// per representative folder before this was formalised.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvObjects, writeCsv } from "./csv";

function arg(name: string): string | undefined { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : undefined; }

export interface CtoExistingLeadFormResult { sourceRowCount: number; outputRowCount: number; columnCount: number; outPath: string }

export async function generateCtoExistingLeadForm(salesProNewLeadsPath: string, outPath: string): Promise<CtoExistingLeadFormResult> {
  const mapping = JSON.parse(await fs.readFile("config/lead-production/cto-existing-field-mapping-v1.json", "utf8"));
  const columns: string[] = mapping.rawTemplateHeaderOrder;
  if (columns.length !== 20) throw new Error(`generate-cto-existing-lead-form: expected 20 columns in cto-existing-field-mapping-v1.json, got ${columns.length}.`);

  const { header, rows } = parseCsvObjects(await fs.readFile(salesProNewLeadsPath, "utf8"));
  const missing = columns.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`generate-cto-existing-lead-form: source file ${salesProNewLeadsPath} is missing required column(s): ${missing.join(", ")}. Stopping rather than guessing/remapping.`);

  const outRows = rows.map((r) => { const o: Record<string, string> = {}; for (const c of columns) o[c] = r[c] ?? ""; return o; });
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, writeCsv(columns, outRows));

  return { sourceRowCount: rows.length, outputRowCount: outRows.length, columnCount: columns.length, outPath };
}

async function main() {
  const salesProNewLeadsPath = arg("salespro-new-leads");
  const outPath = arg("out");
  if (!salesProNewLeadsPath || !outPath) { console.error("Missing required argument(s): --salespro-new-leads=<path> --out=<path>"); process.exit(1); }
  const result = await generateCtoExistingLeadForm(salesProNewLeadsPath, outPath);
  console.log(`CTO Existing Lead Form: ${result.outputRowCount} row(s), ${result.columnCount} columns -> ${result.outPath}`);
  if (result.sourceRowCount !== result.outputRowCount) { console.error(`FAIL: source row count (${result.sourceRowCount}) does not match output row count (${result.outputRowCount}).`); process.exit(1); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
