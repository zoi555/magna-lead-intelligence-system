// Tests for the controlled Uber Eats import paths (authorised API / licensed JSON / CSV).
// No live scraping involved — these are pure functions over supplied records/CSV text.

import { readFileSync } from "node:fs";
import path from "node:path";
import { importUberEatsJson, importUberEatsCsv } from "../src/lib/discovery-engine/uber-eats/import";
import { UberEatsAdapter } from "../src/lib/discovery-engine/uber-eats/adapter";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const AT = "2026-07-21T00:00:00Z";

function main() {
  console.log("Uber Eats controlled import paths:");

  // --- JSON import (authorised API records / licensed provider JSON) ---
  const jsonRecords = [
    { uuid: "au-001", title: "Authorised Grill", url: "https://example.test/store/au-001", address: { postalCode: "UB1 2AA", lat: 51.5, lng: -0.37, city: "Southall" }, rating: 4.2, ratingCount: 88, cuisineList: ["Grill"], phoneNumber: "+442079460111" },
    { uuid: "", title: "No id — must be dropped" },
  ];
  const jsonOutlets = importUberEatsJson(jsonRecords, AT);
  assert(jsonOutlets.length === 1, "record with no source_outlet_id is dropped, not fabricated");
  assert(jsonOutlets[0].source_outlet_id === "au-001" && jsonOutlets[0].name === "Authorised Grill", "authorised API record maps to canonical SourceOutlet");
  assert(jsonOutlets[0].postcode === "UB1 2AA", "postcode normalised via the shared parser");
  assert(Boolean(jsonOutlets[0].provider_version) && Boolean(jsonOutlets[0].parser_version), "provider/parser version stamped on import");

  try { importUberEatsJson({} as unknown as unknown[], AT); assert(false, "non-array input should throw"); }
  catch { assert(true, "non-array input throws (fails safe, no silent fabrication)"); }

  // --- CSV import (controlled/manual/licensed export) ---
  const csv = readFileSync(path.resolve(process.cwd(), "templates/uber-eats-import-template.csv"), "utf8");
  const csvOutlets = importUberEatsCsv(csv, AT);
  assert(csvOutlets.length === 1, "template CSV imports 1 outlet");
  assert(csvOutlets[0].source_outlet_id === "example-uuid-001", "CSV source_outlet_id mapped");
  assert(csvOutlets[0].postcode === "UB1 2AA", "CSV postcode mapped and normalised");
  assert(csvOutlets[0].phone === "+442079460111", "CSV UK phone normalised to E.164");
  assert(csvOutlets[0].cuisines.length === 2 && csvOutlets[0].cuisines.includes("Curry"), "CSV semicolon-separated cuisines split correctly");
  assert(csvOutlets[0].delivery_cost === 2.49, "CSV delivery fee (major units) round-trips through the minor-units mapper");
  assert(csvOutlets[0].is_delivery === true && csvOutlets[0].is_collection === false, "CSV delivery/collection flags mapped");

  const csvMissingRow = "source_outlet_id,name\n,Missing Id Row\n";
  assert(importUberEatsCsv(csvMissingRow, AT).length === 0, "CSV row missing a required id is skipped, not fabricated");
  assert(importUberEatsCsv("", AT).length === 0, "empty CSV text returns no outlets, no crash");

  const blankRow = "source_outlet_id,name,phone,rating\nx-1,Blank Fields Grill,,\n";
  const blankOutlets = importUberEatsCsv(blankRow, AT);
  assert(blankOutlets[0].phone === null && blankOutlets[0].rating === null, "CSV blank cells map to null, never fabricated");

  // --- Adapter wiring ---
  const adapter = new UberEatsAdapter();
  const viaAdapterJson = adapter.importJson(jsonRecords, AT);
  assert(viaAdapterJson.length === 1, "adapter.importJson delegates to importUberEatsJson");
  const viaAdapterCsv = adapter.importCsv(csv, AT);
  assert(viaAdapterCsv.length === 1, "adapter.importCsv delegates to importUberEatsCsv");
  const diag = adapter.exposeDiagnostics();
  assert((diag.lastImport as { method: string }).method === "csv", "adapter diagnostics record the last import method");
  assert(adapter.inspectCapabilities().liveExecution === false, "adapter still reports liveExecution=false (import is not live scraping)");

  console.log(fails === 0 ? "\nAll Uber Eats import assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
