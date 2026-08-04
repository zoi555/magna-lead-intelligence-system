// Regression proofs for address-components.ts (2026-08-04, entity-resolution audit follow-up,
// component-level address matching). Proves the 6 scenarios the owner explicitly required:
// Shop 4 vs Unit 4; High Street vs High St; same postcode different shop number; same address
// different new operator (decision-level, see test-lead-production-customer-leakage-verifier.ts);
// missing unit number; building-name vs street-number variants.
// npm run test:lead-production-address-components

import { parseAddressComponents, compareAddressComponents } from "./lead-production/address-components";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("address-components.ts — regression proofs:\n");

  console.log("1. Shop 4 vs Unit 4 — same unit identifier regardless of generic label word:");
  const shop4 = parseAddressComponents("Shop 4, 12 High Street, Ilford, IG1 4NF")!;
  const unit4 = parseAddressComponents("Unit 4, 12 High Street, Ilford, IG1 4NF")!;
  assert(shop4.unit === "4" && unit4.unit === "4", `both parse unit "4" regardless of label (got "${shop4.unit}"/"${unit4.unit}")`);
  const cmp1 = compareAddressComponents(shop4, unit4);
  assert(cmp1.unitMatch === true && cmp1.compatiblePremises === true, `Shop 4 and Unit 4 are treated as the same premises (got unitMatch=${cmp1.unitMatch}, compatiblePremises=${cmp1.compatiblePremises})`);

  console.log("\n2. High Street vs High St — abbreviation normalisation:");
  const highStreet = parseAddressComponents("12 High Street, Ilford IG1 4NF")!;
  const highSt = parseAddressComponents("12 High St, Ilford IG1 4NF")!;
  assert(highStreet.street === "high street" && highSt.street === "high street", `"St" expands to "street" (got "${highSt.street}")`);
  const cmp2 = compareAddressComponents(highStreet, highSt);
  assert(cmp2.streetMatch === true && cmp2.compatiblePremises === true, "High Street and High St compare as the same street/premises");

  console.log("\n3. Same postcode, DIFFERENT shop number — must NOT be confirmation:");
  const num12 = parseAddressComponents("12 High Street, Ilford IG1 4NF")!;
  const num18 = parseAddressComponents("18 High Street, Ilford IG1 4NF")!;
  const cmp3 = compareAddressComponents(num12, num18);
  assert(cmp3.postcodeMatch === true && cmp3.buildingNumberMatch === false, `same postcode, different building number is detected as a genuine conflict (got buildingNumberMatch=${cmp3.buildingNumberMatch})`);
  assert(cmp3.premisesIdentifierConflict === true, "a different building number at the same postcode+street is flagged premisesIdentifierConflict");
  assert(cmp3.compatiblePremises === false, "a different building number at the same postcode is NEVER compatiblePremises — same postcode alone is not confirmation");

  console.log("\n4. Missing unit number on one side — treated as unknown, not a mismatch:");
  const withUnit = parseAddressComponents("Shop 4, 12 High Street, Ilford IG1 4NF")!;
  const withoutUnit = parseAddressComponents("12 High Street, Ilford IG1 4NF")!;
  const cmp4 = compareAddressComponents(withUnit, withoutUnit);
  assert(cmp4.unitMatch === null, `unit comparison is null (unknown) when only one side has a unit, not treated as a mismatch (got ${cmp4.unitMatch})`);
  assert(cmp4.compatiblePremises === true, "a missing unit number on one side still allows compatiblePremises via matching building number + street + postcode");

  console.log("\n5. Building-name vs street-number variant — a named building compares against a numbered building on the same street:");
  const namedBuilding = parseAddressComponents("Cedar House, High Street, Ilford IG1 4NF")!;
  const numberedBuilding = parseAddressComponents("12 High Street, Ilford IG1 4NF")!;
  assert(namedBuilding.buildingName === "cedar house" && namedBuilding.street === "high street", `building name is parsed separately from the following street segment (got buildingName="${namedBuilding.buildingName}", street="${namedBuilding.street}")`);
  const cmp5 = compareAddressComponents(namedBuilding, numberedBuilding);
  assert(cmp5.streetMatch === true && cmp5.compatiblePremises === true, "a named building and a numbered building on the matching street/postcode are compatible (neither side's building-number/name conflicts, since only one side has each)");

  console.log("\n6. Genuinely different street at the same postcode — must not be confused with a match:");
  const streetA = parseAddressComponents("12 High Street, Ilford IG1 4NF")!;
  const streetB = parseAddressComponents("12 Cranbrook Road, Ilford IG1 4NF")!;
  const cmp6 = compareAddressComponents(streetA, streetB);
  assert(cmp6.streetMatch === false, `a different street name is detected as a genuine mismatch, not left ambiguous (got ${cmp6.streetMatch})`);
  assert(cmp6.compatiblePremises === false, "a different street at the same postcode is not compatiblePremises");

  console.log("\n7. A raw address with no recognisable postcode/structure returns null rather than a guessed partial parse:");
  assert(parseAddressComponents("") === null, "an empty address parses to null");
  assert(parseAddressComponents(null) === null, "a null address parses to null");

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
