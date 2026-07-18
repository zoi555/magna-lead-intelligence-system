// Offline REPLAY of the borderline diagnostic — re-parse + re-validate a SAVED provider payload
// WITHOUT calling Apify (no spend). Used to calibrate the parser and re-check geography/fidelity.
//   npm run uber:borderline:replay [path-to-saved-json]

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBorderlineSearch } from "../src/lib/discovery-engine/uber-eats/parse-borderline";
import { analyseBorderline, printBorderlineReport } from "../src/lib/discovery-engine/providers/borderline-diagnostic";

const DEFAULT = "/private/tmp/claude-501/-Users-homemac-Projects-magna-lead-intelligence-system/ecfebd28-c44e-4d10-850a-4175d6a0fad6/scratchpad/uber-pilot-raw/uber-borderline-UB1.json";

function main() {
  const file = process.argv[2] ?? DEFAULT;
  const raw = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  const items: any[] = Array.isArray(raw?.stores) ? raw.stores : (Array.isArray(raw) ? raw : []);
  console.log(`Replay (offline, no Apify): ${file} — ${items.length} items`);
  console.log("Observed fields:", [...new Set(items.flatMap((r) => Object.keys(r ?? {})))].sort().join(", "));
  const outlets = parseBorderlineSearch({ stores: items }, "2026-07-18T00:00:00Z");
  const geoCtx = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };
  const analysis = analyseBorderline(outlets, geoCtx, { targetDistrict: "UB1" });
  printBorderlineReport(analysis, geoCtx);
  process.exit(0);
}
main();
