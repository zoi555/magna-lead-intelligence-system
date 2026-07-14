// Feeder-road engine assertions — npm run test:feeders
// The engine now lives in the portable package (@geospatial-map).
import { isFeederCandidate, suggestFeeders, addManualFeeder, addFeederByName, includedFeederNumbers, setFeederStatus } from "@geospatial-map";
import type { FeederRoadEntry } from "@geospatial-map";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

console.log("Feeder-road engine checks:");

// Not every A road is a feeder — only strategic (primary/trunk) connectors. Booleans OR 1.
assert(isFeederCandidate({ road_function: "A Road", primary_route: true }) === true, "primary-route A road IS a feeder candidate (boolean)");
assert(isFeederCandidate({ road_function: "A Road", trunk_road: 1 }) === true, "trunk A road IS a feeder candidate (numeric 1)");
assert(isFeederCandidate({ road_function: "A Road" }) === false, "an ordinary A road is NOT a feeder candidate");
assert(isFeederCandidate({ road_function: "B Road", primary_route: true }) === false, "a B road is not a feeder candidate");

const feats = [
  { road_classification_number: "A316", road_function: "A Road", primary_route: true, name_1: "Chertsey Road" },
  { road_classification_number: "A316", road_function: "A Road", primary_route: true },
  { road_classification_number: "A4", road_function: "A Road", trunk_road: true },
  { road_classification_number: "A305", road_function: "A Road" },
];
const sugg = suggestFeeders(feats, []);
assert(sugg.length === 2, "suggestions dedupe by number and exclude non-strategic A roads (A316, A4)");
assert(sugg.find((s) => s.id === "A4")!.priority === "primary", "trunk road suggested at primary priority");
assert(suggestFeeders(feats, sugg).length === 0, "already-curated numbers are not re-suggested");

let e: FeederRoadEntry[] = addManualFeeder([], "a316", "connects M3 to Twickenham");
assert(e.length === 1 && e[0].roadNumber === "A316" && e[0].status === "included", "manual feeder added, normalised, included");
e = addManualFeeder(e, "A316", "dup");
assert(e.length === 1, "duplicate manual feeder ignored");
e = addFeederByName(e, "Chertsey Road", "by name");
assert(e.length === 2 && e[1].roadName === "Chertsey Road", "feeder can be added by road name");
assert(includedFeederNumbers(e).join() === "A316", "included feeder numbers reflect included, numbered entries only");
e = setFeederStatus(e, "A316", "excluded");
assert(includedFeederNumbers(e).length === 0, "excluded feeder is not in the included set");

console.log(fails === 0 ? "\nAll feeder-road assertions passed ✓" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
