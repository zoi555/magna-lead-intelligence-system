// Tests for the controlled Deliveroo import paths (authorised API / licensed JSON / CSV).
// No live scraping — pure functions over supplied records/CSV text.

import { readFileSync } from "node:fs";
import path from "node:path";
import { importDeliverooJson, importDeliverooCsv } from "../src/lib/discovery-engine/deliveroo/import";
import { DeliverooAdapter } from "../src/lib/discovery-engine/deliveroo/adapter";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const AT = "2026-07-21T00:00:00Z";

function main() {
  console.log("Deliveroo controlled import paths:");

  const jsonRecords = [
    { id: "au-dl-001", name: "Authorised Kitchen", url: "https://example.test/menu/au-dl-001", address: { address1: "1 Road", postcode: "UB1 2AA" }, location: { lat: 51.5, lon: -0.37 }, rating: 4.3, numberOfReviews: 60, cuisines: ["Grill"], phone: "020 7946 0111" },
    { id: "", name: "No id — must be dropped" },
  ];
  const jsonOutlets = importDeliverooJson(jsonRecords, AT);
  assert(jsonOutlets.length === 1, "record with no source_outlet_id is dropped, not fabricated");
  assert(jsonOutlets[0].source_outlet_id === "au-dl-001" && jsonOutlets[0].name === "Authorised Kitchen", "authorised API record maps to canonical SourceOutlet");
  assert(jsonOutlets[0].postcode === "UB1 2AA", "postcode mapped via the shared parser");
  assert(Boolean(jsonOutlets[0].provider_version) && Boolean(jsonOutlets[0].parser_version), "provider/parser version stamped on import");

  try { importDeliverooJson({} as unknown as unknown[], AT); assert(false, "non-array input should throw"); }
  catch { assert(true, "non-array input throws (fails safe, no silent fabrication)"); }

  const csv = readFileSync(path.resolve(process.cwd(), "templates/deliveroo-import-template.csv"), "utf8");
  const csvOutlets = importDeliverooCsv(csv, AT);
  assert(csvOutlets.length === 1, "template CSV imports 1 outlet");
  assert(csvOutlets[0].source_outlet_id === "example-dl-001", "CSV source_outlet_id mapped");
  assert(csvOutlets[0].postcode === "UB1 2AA", "CSV postcode mapped and normalised");
  assert(csvOutlets[0].phone === "+442079460111", "CSV UK phone normalised to E.164");
  assert(csvOutlets[0].cuisines.length === 2 && csvOutlets[0].cuisines.includes("Curry"), "CSV semicolon-separated cuisines split correctly");
  assert(csvOutlets[0].delivery_cost === 1.99, "CSV delivery fee (major units) round-trips through the minor-units mapper");
  assert(csvOutlets[0].service_fee === 0.5, "CSV service fee mapped");
  assert(csvOutlets[0].is_delivery === true && csvOutlets[0].is_collection === false, "CSV delivery/collection flags mapped");

  const csvMissingRow = "source_outlet_id,name\n,Missing Id Row\n";
  assert(importDeliverooCsv(csvMissingRow, AT).length === 0, "CSV row missing a required id is skipped, not fabricated");
  assert(importDeliverooCsv("", AT).length === 0, "empty CSV text returns no outlets, no crash");

  const blankRow = "source_outlet_id,name,phone,rating\nx-1,Blank Fields Kitchen,,\n";
  const blankOutlets = importDeliverooCsv(blankRow, AT);
  assert(blankOutlets[0].phone === null && blankOutlets[0].rating === null, "CSV blank cells map to null, never fabricated");

  const adapter = new DeliverooAdapter();
  assert(adapter.importJson(jsonRecords, AT).length === 1, "adapter.importJson delegates to importDeliverooJson");
  assert(adapter.importCsv(csv, AT).length === 1, "adapter.importCsv delegates to importDeliverooCsv");
  const diag = adapter.exposeDiagnostics();
  assert((diag.lastImport as { method: string }).method === "csv", "adapter diagnostics record the last import method");
  assert(adapter.inspectCapabilities().liveExecution === false, "adapter still reports liveExecution=false (import is not live scraping)");

  console.log(fails === 0 ? "\nAll Deliveroo import assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
