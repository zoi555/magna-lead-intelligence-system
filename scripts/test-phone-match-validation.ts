// Tests for the name/address match-validation gate added to je-phone-enrichment.ts —
// correctness-critical: a false positive here writes a wrong phone number to a real record.

import { namesMatch, addressMatches } from "../src/lib/discovery-engine/just-eat/phone-match";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function main() {
  console.log("Phone-enrichment match validation:");

  assert(namesMatch("Roosters Piri Piri - Southall", "Roosters Piri Piri") === true, "exact-ish name with suffix stripped still matches");
  assert(namesMatch("Ali Baba's", "Ali Baba's Pizza") === true, "substring name overlap matches");
  assert(namesMatch("Kebab Vibes", "Southall Coffee House") === false, "unrelated names do not match");
  assert(namesMatch("", "Something") === false, "empty name never matches (no false positive on empty)");
  assert(namesMatch("KFC Southall", "KFC") === true, "chain name with locality suffix still matches the bare chain name");

  assert(addressMatches("UB1 2NW", "440 Lady Margaret Road, Southall, UB1 2NW, UK") === true, "full postcode present in address matches");
  assert(addressMatches("UB1 2NW", "440 Lady Margaret Road, Southall, UB1, London") === true, "outward code alone (UB1) is enough when full postcode text differs");
  assert(addressMatches("UB1 2NW", "10 Different Street, Hayes, UB3 1AA") === false, "a different outward code does not match");
  assert(addressMatches("UB1 2NW", null) === false, "null returned address never matches (no false positive)");

  console.log(fails === 0 ? "\nAll match-validation assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
