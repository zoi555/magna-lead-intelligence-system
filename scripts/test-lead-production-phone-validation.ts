// Regression proofs for isValidUkPhone()/resolveValidUkPhone() (normalize.ts) — the phone-
// validation defect found and fixed 2026-08-04 during the campaign-002 five-district-pilot
// phone-exception audit. Covers every real rejected-valid raw value found in that audit (all 8
// real phone_resolution_exception candidates), plus every format class the owner's phone policy
// explicitly requires checking: 01/02 landlines, spaces, brackets, hyphens, +44 conversion,
// leading-zero conversion, multiple numbers in one field, extensions, hidden/non-breaking
// characters, and the owner's own 3 example formats that must all resolve to the same number.
// npm run test:lead-production-phone-validation

import { isValidUkPhone, resolveValidUkPhone } from "./lead-production/normalize";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("Phone validation/normalisation — regression proofs:\n");

  console.log("1. The 8 real rejected-valid raw values from the campaign-002 phone-exception audit (must now resolve):");
  const realCases: [string, string, string][] = [
    ["Churchill's Fish & Chips (CM1) — un-decoded tel: href URL-encoding", "%2001279713560", "01279713560"],
    ["Hyderabad Darbar (IG1) — two numbers in one field", "02085488877|02033406787", "02085488877"],
    ["PANDYAS - Ilford (IG1) — +44 retaining redundant leading 0", "+4402075179955", "+442075179955"],
    ["Kahani Cafe (IG1) — URL-encoding mid-number", "0203%204111%20095", "02034111095"],
    ["The Adaalat Lounge (DA1) — URL-encoding", "01322%20470938", "01322470938"],
    ["Munchies Peri Peri (BR1) — +44 with URL-encoded spaces", "+44%201474%20360399", "+441474360399"],
    ["Copper Ceylon (BR1) — +44 retaining redundant leading 0 (mobile)", "+4407745527924", "+447745527924"],
  ];
  for (const [label, raw, expected] of realCases) {
    const resolved = resolveValidUkPhone(raw);
    assert(resolved === expected, `${label}: "${raw}" -> "${resolved}" (expected "${expected}")`);
    assert(isValidUkPhone(raw), `${label}: isValidUkPhone("${raw}") is true`);
  }
  // The 8th real case — "Zing Gants Hill" website phone "1-303-893-0552" — is a genuine US
  // number, correctly NOT recoverable as UK. This candidate is rescued by the separate
  // run-final-scoring-stage-v2.ts fallback-order fix (falls back to Google's valid UK phone),
  // not by phone normalisation — proven here as a negative case.
  assert(!isValidUkPhone("1-303-893-0552"), "genuine US number (\"Zing Gants Hill\" website phone) is correctly still rejected, not force-matched as UK");

  console.log("\n2. Owner's 3 example formats must all resolve as valid (fast path — unchanged formatting):");
  for (const s of ["020 1234 5678", "(020) 1234 5678", "+44 20 1234 5678"]) {
    assert(isValidUkPhone(s), `"${s}" is valid`);
    assert(resolveValidUkPhone(s) === s, `"${s}" is returned verbatim, unchanged (fast path preserves original formatting)`);
  }

  console.log("\n3. Checklist — 01/02 landlines never wrongly rejected:");
  assert(isValidUkPhone("01245 355688"), "01 landline, space-separated");
  assert(isValidUkPhone("0207 946 0958"), "02 landline (0207), space-separated");
  assert(isValidUkPhone("020 3340 6787"), "02 landline (020), space-separated");
  assert(isValidUkPhone("01279713560"), "01 landline, no separators at all");

  console.log("\n4. Checklist — spaces, brackets, hyphens (various real-world combinations):");
  assert(isValidUkPhone("020-1234-5678"), "hyphen-separated");
  assert(isValidUkPhone("(01245) 355688"), "area code in brackets, no leading 0 duplication");
  assert(isValidUkPhone("020 (1234) 5678"), "brackets mid-number");

  console.log("\n5. Checklist — +44 conversion / leading-zero conversion:");
  assert(isValidUkPhone("+442012345678"), "+44 without redundant 0, no separators");
  assert(isValidUkPhone("+44 (0) 20 1234 5678"), "+44 (0) parenthesised zero — common display format");
  assert(resolveValidUkPhone("+44 (0) 20 1234 5678") !== null, "+44 (0) format resolves to a value");
  assert(isValidUkPhone("+447911123456"), "+44 UK mobile, no redundant 0");
  assert(isValidUkPhone("+4407911123456"), "+44 UK mobile WITH redundant 0 (real defect class)");

  console.log("\n6. Checklist — multiple numbers in one field:");
  assert(isValidUkPhone("020 1234 5678 / 020 8765 4321"), "slash-separated pair — first valid number recovered");
  assert(resolveValidUkPhone("020 1234 5678 / 020 8765 4321") === "02012345678", "slash-separated pair resolves to the FIRST number");
  assert(isValidUkPhone("01245 355688; 01245 999999"), "semicolon-separated pair");

  console.log("\n7. Checklist — extensions:");
  assert(isValidUkPhone("020 1234 5678 ext 123"), "\"ext 123\" suffix stripped");
  assert(isValidUkPhone("020 1234 5678 x123"), "\"x123\" suffix stripped");
  assert(resolveValidUkPhone("020 1234 5678 ext. 45") === "02012345678", "extension suffix does not appear in the resolved value");

  console.log("\n8. Checklist — hidden/non-breaking characters:");
  assert(isValidUkPhone("020 1234 5678"), "non-breaking spaces (U+00A0) between digit groups");
  assert(isValidUkPhone("020​1234​5678"), "zero-width spaces (U+200B) between digit groups");

  console.log("\n9. Checklist — website vs Google source formatting (both must validate identically once normalised):");
  assert(isValidUkPhone("01245 355688") && isValidUkPhone("01245355688"), "same number, Google's spaced format and a compact format both validate");

  console.log("\n10. Checklist — validator length assumptions (genuinely invalid numbers must still be rejected — mandatory-phone gate not weakened):");
  assert(!isValidUkPhone("12345"), "too short is still rejected");
  assert(!isValidUkPhone("0123456789012345"), "absurdly long is still rejected");
  assert(!isValidUkPhone(""), "empty string is still rejected");
  assert(!isValidUkPhone(null), "null is still rejected");
  assert(!isValidUkPhone(undefined), "undefined is still rejected");
  assert(!isValidUkPhone("+1 303 893 0552"), "a genuine non-UK (+1 US) number is still rejected, not force-matched");
  assert(!isValidUkPhone("+33 1 42 68 53 00"), "a genuine non-UK (+33 France) number is still rejected");

  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
