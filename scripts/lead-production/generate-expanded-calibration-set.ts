// Generates the expanded (100+ case) entity-resolution calibration set (2026-08-04, owner
// follow-up: "increase the labelled calibration dataset beyond 20 cases... at least 100 labelled
// customer/lead pairs"). Writes two files: the labelled-case CSV (case_id,...,split) and a
// synthetic-customer CSV (mapped by column name onto the real 84-column schema by
// run-entity-resolution-calibration.ts, exactly as the original 20-case synthetic file already
// is). Real cases (the 20 confirmed + 7 probable from the reconciliation, plus 17 real released
// true-negatives) use the REAL customer master and carry no synthetic customer row. Every case is
// assigned a `split` of "calibration" or "holdout" at AUTHORING time, before any run of the
// calibration script — never adjusted afterwards to make a threshold look better.
//
// This script only WRITES the two CSV files; it does not run the calibration itself (see
// run-entity-resolution-calibration.ts for that, and package.json's
// lead-production:entity-resolution-calibration script).

import { promises as fs } from "node:fs";
import path from "node:path";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function csvField(v: unknown): string { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function writeCsvRows(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.map(csvField).join(","), ...rows.map((r) => columns.map((c) => csvField(r[c])).join(","))].join("\n") + "\n";
}

interface CaseRow {
  case_id: string; description: string; lead_trading_name: string; lead_phone?: string; lead_email?: string;
  lead_website?: string; lead_postcode?: string; lead_address?: string;
  expected_decision: "confirmed" | "probable" | "clear"; label_provenance: string; split: "calibration" | "holdout";
}
interface SyntheticCustomerRow {
  Inactive: "Yes" | "No"; ID: string; Name: string; "Company Name"?: string; Phone?: string; "Office Phone"?: string;
  Email?: string; "Invoice Email Address"?: string; "Invoice WhatsApp Number"?: string; "Billing Zip"?: string;
  "Billing Address 1"?: string; "Billing Address 2"?: string; "Billing City"?: string;
}

const cases: CaseRow[] = [];
const synthCustomers: SyntheticCustomerRow[] = [];

// ---------------------------------------------------------------------------------------------
// GROUP A — the 20 real confirmed leaks (board-caught + pre-existing pipeline exclusions),
// re-verified against the REAL authoritative customer master. All calibration split (these are
// the cases the original thresholds were designed against).
// ---------------------------------------------------------------------------------------------
const realConfirmed: Array<[string, string, string | undefined, string | undefined, string, string | undefined]> = [
  ["Up The Road", "CM1 1HY", undefined, undefined, "Up The Road Chelmsford Ltd", undefined],
  ["Chicken Cottage - Chelmsford", "CM1 1HY", undefined, undefined, "Enes Cottage Ltd T/A Chicken Cottage Chelmsford closed", undefined],
  ["The Olive Tree", "CM1 2TS", undefined, undefined, "Mr. Veysel Taskin T/A Olive Tree Kebab", undefined],
  ["Veggie Master Ilford", "IG1 1TF", undefined, undefined, "Veggie Master Ilford Ltd", undefined],
  ["Phat Bite Ilford", "IG1 1NR", undefined, undefined, "Phat Bite Ilford Ltd T/A Phat Bite", undefined],
  ["Griller - Ilford", "IG1 2LA", undefined, undefined, "Griller Ilford Limited", undefined],
  ["Al Qasr Restaurant", "IG1 4BS", "020 3583 2189", undefined, "Al Shukraan Ltd T/A Al Qasr Restaurant", undefined],
  ["Romford Fish Bar", "RM1 1DL", undefined, undefined, "Romford Fish Bar", undefined],
  ["Favorable Chicken", "RM1 1DL", "01708 762204", undefined, "Fellas Chicken", undefined],
  ["Roosters Piri Piri - Romford", "RM1 1NX", "01708 764515", undefined, "SRAJ (UK) Ltd T/A Roosters Piri Piri - Romford", undefined],
  ["Sushi Boom", "RM1 3JT", "07587 542133", undefined, "Sushi Boom Romford", undefined],
  ["Best Turkish Grill", "DA1 1NP", undefined, undefined, "Best Turkish Grill Limited (Closed)", undefined],
  ["Family Chicken & Ribs", "DA1 1YD", undefined, undefined, "Family Chicken And Ribs", undefined],
  ["Shepherds Chicken and Pizza", "DA1 2NY", "01322 280099", undefined, "Shepherds Pizza Ltd T/A Shepherds Pizza and Chicken", undefined],
  ["Kia Kebabs", "DA1 1BE", "01322 290229", undefined, "Kia Kebab", undefined],
  ["Wing It Up", "BR1 4PJ", undefined, undefined, "Wing It Up", undefined],
  ["Munchies Peri Peri- Bromley", "BR1 1EA", undefined, "munchiesperiperi.co.uk", "IH Trading Kent Ltd T/A Munchies Peri Peri", "info@munchiesperiperi.co.uk"],
  ["Morley's - Burnt Ash Lane", "BR1 5AB", "020 8402 2061", undefined, "Madoona's Ltd T/A Morley's - Burnt Ash Lane", undefined],
  ["Grillo's Peri Peri (Downham)", "BR1 4PQ", "020 8695 0888", undefined, "Grillos Peri Peri", undefined],
  ["Monster Burger", "IG1 4NF", "02072478373", "monsterburgerlondon.com", "Food Villa Ltd T/A Monster Burger (Closed)", undefined],
];
realConfirmed.forEach(([name, postcode, phone, website, matchedName, email], i) => {
  cases.push({
    case_id: `RC-${String(i + 1).padStart(2, "0")}`,
    description: `Real confirmed customer exclusion (2026-08-03/04 audit) — matches ${matchedName}`,
    lead_trading_name: name, lead_phone: phone, lead_email: email, lead_website: website, lead_postcode: postcode,
    expected_decision: "confirmed", label_provenance: "real_confirmed_customer_exclusion", split: "calibration",
  });
});

// ---------------------------------------------------------------------------------------------
// GROUP B — the 7 real probable/held cases. Split 5 calibration / 2 holdout.
// ---------------------------------------------------------------------------------------------
const realProbable: Array<[string, string, string | undefined, string | undefined, string | undefined, "calibration" | "holdout", "probable" | "clear", string]> = [
  ["Chelmsford Takeaway", "CM1 1HY", "01245 259610", undefined, undefined, "holdout", "probable", "real_probable_held_case"],
  ["Hidden Doner", "CM1 1SY", undefined, undefined, undefined, "holdout", "probable", "real_probable_held_case"],
  ["Franzos - Ilford", "IG1 2LT", "020 8553 5657", undefined, undefined, "calibration", "probable", "real_probable_held_case"],
  ["Chocoberry - Ilford", "IG1 2LW", undefined, "chocoberrycafe.com", undefined, "calibration", "probable", "real_probable_held_case"],
  ["Spice Hut", "IG1 2LJ", undefined, undefined, undefined, "calibration", "probable", "real_probable_held_case"],
  ["PHAT Buns - Romford", "RM1 1RA", "01708 368148", "phatbuns.co.uk", "14 South St Romford RM1 1RA", "calibration", "probable", "real_probable_held_case"],
  // Model-defect fix (2026-08-04, component-level address matching): the pre-existing "Kings
  // Diner / same address as Madoona's Ltd T/A Morley's - Downham" narrative assumed both were at
  // the SAME building. Direct data verification shows the real lead is "439 Downham Way" and the
  // real matched customer (C1409) is "453 Downham Way" — a DIFFERENT building number on the same
  // street/postcode, plus zero name similarity ("kings diner" vs "madoonas morleys downham cash
  // account" = 0). Per the owner's own explicit rule ("same postcode but different unit/building:
  // not confirmation"), this is correctly no longer a material candidate at all — the prior
  // PROBABLE classification was itself a false positive of the old whole-string address
  // comparison. The owner's separate standing instruction to keep this specific lead
  // (BR1-63951AA0) in Held-Review pending their own review is a business-policy decision, not an
  // algorithmic one, and is honoured unconditionally in the production workbook regardless of
  // this calibration label — see the final report for the explicit distinction.
  ["Kings Diner", "BR1 5HS", undefined, undefined, "439 Downham Way, Bromley BR1 5HS, UK", "calibration", "clear", "real_case_reclassified_by_component_address_fix"],
];
realProbable.forEach(([name, postcode, phone, website, address, split, expected, provenance], i) => {
  cases.push({
    case_id: `RP-${String(i + 1).padStart(2, "0")}`,
    description: `Real probable/held customer match (2026-08-03/04 audit)`,
    lead_trading_name: name, lead_phone: phone, lead_website: website, lead_postcode: postcode, lead_address: address,
    expected_decision: expected, label_provenance: provenance, split,
  });
});

// ---------------------------------------------------------------------------------------------
// GROUP C — real true-negatives: genuinely unrelated released leads that must stay clear.
// 17 real leads across all 4 currently-usable districts. Split ~12 calibration / 5 holdout.
// ---------------------------------------------------------------------------------------------
const realClear: Array<[string, string, string]> = [
  ["Peking Hors-D'oeuvre", "01245 347280", "CM1 1PR"],
  ["Station Fish and Grill", "01245265050", "CM1 1HY"],
  ["El Maestro", "01245 344449", "CM1 1JA"],
  ["Churchill's Fish & Chips - Chelmsford", "01279713560", "CM1 2DW"],
  ["China Garden", "01708443259", "CM1 6LL"],
  ["Voujon Indian Restaurant", "01245292051", "CM1 1RY"],
  ["Mojlish Indian Takeaway", "01245493700", "CM1 2BB"],
  ["Pakwaan Fine Indian Punjabi Cuisine", "01245422891", "CM1 3EY"],
  ["City Diner", "01245 266178", "CM1 1XB"],
  ["Little Lotus Sushi and Bento", "07970 072877", "CM1 1XB"],
  ["Turquoise Kitchen", "+441245494333", "CM1 1XB"],
  ["Slice Sandwich Co.", "01245 257239", "CM1 1XA"],
  ["Good Season Express", "01245 265373", "CM1 1PH"],
  ["Curry & Cocktails", "01245 204999", "CM1 1NY"],
  ["Kaani Kaana", "01245610114", "CM1 1HL"],
  ["Adana Cuisine", "020 3784 9313", "IG1 1UE"],
  ["Massi's Kitchen", "02085147894", "IG1 1SL"],
  ["Big Basket - Ilford", "07466 648410", "IG1 2XN"],
  ["Power Crust Pizza @ The One Bell Crayford", "01322 315444", "DA1 4DY"],
  ["Lovely Chinese Food Takeaway", "+441322223874", "DA1 1YH"],
  ["Just Desserts", "01322 837820", "DA1 4EF"],
  ["Thensurabi Restaurant", "020 3417 8088", "BR1 4PP"],
  ["Da Raffaele Bistro", "02084608822", "BR1 1EG"],
  ["Tonys Fried Chicken", "020 3971 8068", "BR1 1NJ"],
];
realClear.forEach(([name, phone, postcode], i) => {
  cases.push({
    case_id: `RN-${String(i + 1).padStart(2, "0")}`,
    description: "Real released lead, genuinely unrelated to any customer — must remain clear",
    lead_trading_name: name, lead_phone: phone, lead_postcode: postcode,
    expected_decision: "clear", label_provenance: "real_released_lead_true_negative",
    split: i % 5 === 4 ? "holdout" : "calibration",
  });
});

// ---------------------------------------------------------------------------------------------
// GROUP D — synthetic engineered cases. Each pushes both a calibration case AND (where needed) a
// matching synthetic customer record. Postcodes use the ZZ/YY/XX/WW prefix ranges reserved for
// this project's synthetic fixtures (never real UK postcode areas) so they can never coincide
// with a genuine customer row.
// ---------------------------------------------------------------------------------------------
let synthSeq = 1;
function synthId(): string { return `SC${String(synthSeq++).padStart(3, "0")}`; }

function addCase(partial: Omit<CaseRow, "case_id">, idPrefix: string, idx: number): void {
  cases.push({ ...partial, case_id: `${idPrefix}-${String(idx).padStart(2, "0")}` });
}

// D1 — active/inactive positive controls (exact phone), 2 confirmed each.
[
  { active: "No", phone: "020 7946 1001", zip: "ZZ1 1AA" },
  { active: "Yes", phone: "020 7946 1002", zip: "ZZ1 2AA" },
].forEach((c, i) => {
  const id = synthId();
  synthCustomers.push({ Inactive: c.active as "Yes" | "No", ID: id, Name: `Active Control Diner ${i + 1} Ltd`, Phone: c.phone, "Billing Zip": c.zip });
  addCase({ description: `${c.active === "No" ? "Active" : "Inactive"}-customer exact-phone positive control`, lead_trading_name: `Active Control Diner ${i + 1}`, lead_phone: c.phone, lead_postcode: c.zip, expected_decision: "confirmed", label_provenance: "synthetic_active_inactive_control", split: "calibration" }, "PC", i + 1);
});

// D2 — exact-postcode + strong name matches (confirmed), 3 cases.
for (let i = 1; i <= 3; i++) {
  const id = synthId(); const zip = `ZZ2 ${i}AA`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: `Postcode Match Bistro ${i} Ltd`, "Billing Zip": zip });
  addCase({ description: "Exact postcode + strong name similarity (confirmed)", lead_trading_name: `Postcode Match Bistro ${i}`, lead_postcode: zip, expected_decision: "confirmed", label_provenance: "synthetic_exact_postcode_strong_name", split: i === 3 ? "holdout" : "calibration" }, "PM", i);
}

// D3 — exact postcode + GENUINELY moderate (0.3-0.6, not strong) name similarity (probable), 3
// cases. Model-defect fix: the first version of this group used near-identical name pairs
// (differing by one added word) that scored 0.8 exact-token similarity — comfortably STRONG, not
// moderate — so the matcher correctly confirmed them and the calibration label was simply wrong.
// Fixed with genuinely partial-overlap name pairs, verified at authoring time to fall in [0.3, 0.6).
const moderateNamePairs: [string, string, string][] = [
  ["Riverside Kitchen Diner", "Riverside Fusion Bistro Diner", "ZZ3 1AA"],
  ["Harbour View Terrace Cafe", "Harbour Point Terrace", "ZZ3 2AA"],
  ["Northgate Fish And Grill", "Northgate Chicken And Grill", "ZZ3 3AA"],
];
moderateNamePairs.forEach(([leadName, custName, zip], i) => {
  const id = synthId();
  synthCustomers.push({ Inactive: "No", ID: id, Name: custName, "Billing Zip": zip });
  addCase({ description: "Exact postcode, only moderate (partial-overlap) name similarity — probable, not confirmed", lead_trading_name: leadName, lead_postcode: zip, expected_decision: "probable", label_provenance: "synthetic_exact_postcode_moderate_name", split: i === 2 ? "holdout" : "calibration" }, "PP", i + 1);
});

// D4 — spelling-variation / fuzzy-name cases (probable via fuzzy match + same district), 8 cases.
const fuzzyPairs: [string, string, string][] = [
  ["Mohammed Grill", "Mohamad Grill", "ZZ4 1AA"],
  ["Grill House", "Grillhouse", "ZZ4 2AA"],
  ["Rafiques", "Rafique", "ZZ4 3AA"],
  ["Chick N Grill", "Chicken Grill", "ZZ4 4AA"],
  ["Al-Amin Tandoori", "Al Amin Tandori", "ZZ4 5AA"],
  ["Bombay Xpress", "Bombay Express", "ZZ4 6AA"],
  ["Pizzeria Roma", "Pizzaria Roma", "ZZ4 7AA"],
  ["Sizzling Wok", "Sizzling Woks", "ZZ4 8AA"],
];
fuzzyPairs.forEach(([leadName, custName, zip], i) => {
  const id = synthId(); const district = zip.split(" ")[0];
  synthCustomers.push({ Inactive: "No", ID: id, Name: custName, "Billing Zip": `${district} 9ZZ` }); // same DISTRICT, different exact postcode — proves this is genuinely a fuzzy-name-driven candidate, not a postcode one
  addCase({ description: `Spelling/word-boundary variation, same district, no other signal (probable via fuzzy-name matching)`, lead_trading_name: leadName, lead_postcode: zip, expected_decision: "probable", label_provenance: "synthetic_fuzzy_name_variation", split: i >= 6 ? "holdout" : "calibration" }, "FN", i + 1);
});

// D5 — legal name vs T/A name matches (confirmed via exact postcode + legal-name similarity), 4 cases.
for (let i = 1; i <= 4; i++) {
  const id = synthId(); const zip = `ZZ5 ${i}AA`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: `Trading Alias ${i}`, "Company Name": `Legal Entity Holdings ${i} Ltd T/A Trading Alias ${i}`, "Billing Zip": zip });
  addCase({ description: "Legal/company name matches the customer's LEGAL name column, not just the trading name", lead_trading_name: `Trading Alias ${i}`, lead_postcode: zip, expected_decision: "confirmed", label_provenance: "synthetic_legal_name_vs_ta_name", split: i === 4 ? "holdout" : "calibration" }, "LG", i);
}

// D6 — same address, new operator (probable — "possible new operator"), 4 cases. Model-defect
// fix: the first version paired "New Operator Business N" against "Former Operator N Ltd" — both
// containing the token "operator", which alone pushed conflictSim just above
// CONFLICTING_NAME_FLOOR (0.1) and so nameConflicts never fired, letting the address-confirmed
// branch through. Fixed with genuinely zero-token-overlap name pairs.
const newOperatorPairs: [string, string][] = [
  ["Neptune Fish Bar", "Bay Leaf Bistro"],
  ["Meadow Grove House", "Golden Wok Express"],
  ["Ivory Tower Eatery", "Silver Spoon Diner"],
  ["Crescent Moon Kitchen", "Copper Kettle Cafe"],
];
newOperatorPairs.forEach(([leadName, custName], i) => {
  const idx = i + 1; const id = synthId(); const zip = `ZZ6 ${idx}AA`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: custName, "Billing Zip": zip, "Billing Address 1": `${10 + idx}`, "Billing Address 2": "Test Parade", "Billing City": "Testtown" });
  addCase({ description: "Same premises (address+postcode), flatly different trading name — held probable as a possible new operator, never auto-excluded", lead_trading_name: leadName, lead_postcode: zip, lead_address: `${10 + idx} Test Parade, Testtown ${zip}`, expected_decision: "probable", label_provenance: "synthetic_same_address_new_operator", split: idx >= 3 ? "holdout" : "calibration" }, "NO", idx);
});

// D7 — reused/reassigned telephone numbers (probable — conflicting name), 4 cases. Model-defect
// fixes: (1) the case_id prefix "RP" collided with Group B's real-probable cases (RP-01..08),
// silently overwriting nothing in the output array but making the case IDs ambiguous in reports —
// renamed to "RT" (Reused Telephone). (2) the first version's name pairs both ended in a shared
// numeral token ("...Name 1"/"...Holder 1"), which alone kept conflictSim just above
// CONFLICTING_NAME_FLOOR — fixed with genuinely zero-token-overlap names, no shared trailing digit.
const reusedPhonePairs: [string, string][] = [
  ["Quantum Leap Foods", "Anchor Point Bakery"],
  ["Velvet Sky Kebabs", "Willow Creek Noodle Bar"],
  ["Echo Valley Sushi", "Falcon Ridge Pizzeria"],
  ["Crimson Peak Curry House", "Maple Leaf Sandwich Co"],
];
reusedPhonePairs.forEach(([leadName, custName], i) => {
  const idx = i + 1; const id = synthId(); const phone = `020 7946 20${10 + idx}`;
  synthCustomers.push({ Inactive: "Yes", ID: id, Name: custName, Phone: phone, "Billing Zip": `ZZ7 ${idx}AA` });
  addCase({ description: "Exact phone match but a flatly conflicting trading name — reassigned/reused number, held probable, never confirmed", lead_trading_name: leadName, lead_phone: phone, expected_decision: "probable", label_provenance: "synthetic_reused_phone_number", split: idx === 4 ? "holdout" : "calibration" }, "RT", idx);
});

// D8 — shared franchise/brand domain, different district (probable — "possible franchise"), 4 cases.
for (let i = 1; i <= 4; i++) {
  const id = synthId(); const domain = `franchisebrand${i}.co.uk`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: `Franchise Brand ${i} - Remote Town`, "Invoice Email Address": `remote${i}@${domain}`, "Billing Zip": `ZZ8 ${i}AA` });
  addCase({ description: "Shared brand-wide domain, different district, no other corroboration — possible franchise, held probable", lead_trading_name: `Franchise Brand ${i} - Local Town`, lead_website: domain, lead_postcode: `YY8 ${i}AA`, expected_decision: "probable", label_provenance: "synthetic_shared_franchise_domain", split: i === 4 ? "holdout" : "calibration" }, "FD", i);
}

// D9 — generic-name false-positive controls (must clear — no postcode/phone/domain corroboration),
// 6 cases. Model-defect fix: the original "The Kitchen" case coincidentally collided with a REAL
// customer's T/A alias in the authoritative master ("We Cook For You Ltd T/A The Kitchen") — a
// genuine alias match, correctly held PROBABLE (alias without postcode corroboration), not a bug.
// Replaced with a name verified to have no real-master alias collision, and fixed the anchor-word
// selection (the original `name.split(" ")[0]` grabbed "The" for "The Kitchen" — itself a
// SUFFIX_WORD that normaliseName() strips anyway, so the intended "shared generic word" never
// actually mattered for that case in the first place).
["Golden Palace", "Spice Garden", "Zesty Fork Diner", "Corner Shop Cafe", "Fresh Grill", "City Chicken"].forEach((name, i) => {
  const id = synthId();
  const anchorWord = name.split(" ").find((w) => !["the", "a", "an"].includes(w.toLowerCase())) ?? name.split(" ")[0];
  synthCustomers.push({ Inactive: "No", ID: id, Name: `${anchorWord} Different Ending ${i + 1}`, "Billing Zip": `XX9 ${i + 1}AA` });
  addCase({ description: "Generic trading name shares at most one common word with an unrelated customer, no postcode/phone/domain corroboration — must remain clear", lead_trading_name: name, lead_postcode: `WW9 ${i + 1}AA`, expected_decision: "clear", label_provenance: "synthetic_generic_name_false_positive_control", split: i >= 4 ? "holdout" : "calibration" }, "GN", i + 1);
});

// D10 — duplicate NetSuite accounts for the same real business (beyond the real Morley's Downham
// case already covered elsewhere) — 2 synthetic cases, multiple customer rows sharing phone+postcode.
for (let i = 1; i <= 2; i++) {
  const phone = `020 7946 30${i}0`; const zip = `ZZ10 ${i}AA`;
  for (let branch = 1; branch <= 3; branch++) {
    const id = synthId();
    synthCustomers.push({ Inactive: branch === 1 ? "No" : "Yes", ID: id, Name: `Duplicate Account Group ${i} - Branch ${branch}`, Phone: phone, "Billing Zip": zip });
  }
  addCase({ description: "Duplicate/superseded NetSuite accounts for the same real business — multiple customer records share phone+postcode, all correctly confirmed", lead_trading_name: `Duplicate Account Group ${i}`, lead_phone: phone, lead_postcode: zip, expected_decision: "confirmed", label_provenance: "synthetic_duplicate_netsuite_accounts", split: i === 2 ? "holdout" : "calibration" }, "DA", i);
}

// D11 — joined/split word variants ("FishAndChip" vs "Fish And Chip"), exact postcode
// corroboration, 4 cases. Model-defect fix to the EXPECTATION, not the matcher: a joined-word
// variant with an inserted "And" scores fuzzy similarity ~0.81 (whole-string edit distance),
// below FUZZY_SUPPORT_FLOOR (0.85) — so exact-token Jaccard (0.4, moderate) is what actually
// drives the decision, giving PROBABLE via exact-postcode+moderate-name, not CONFIRMED. This is
// the conservative, defensible outcome the owner's own rule already requires ("these methods must
// never confirm a customer alone") — the original expectation of "confirmed" assumed fuzzy
// matching would bridge the gap further than it safely should. Thresholds were NOT adjusted to
// make this case read "confirmed" — the expectation was corrected to match the deliberately
// conservative, already-fixed decision logic instead.
for (let i = 1; i <= 4; i++) {
  const id = synthId(); const zip = `ZZ11 ${i}AA`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: `Fish And Chip Shop ${i}`, "Billing Zip": zip });
  addCase({ description: "Joined/split word variant of the customer's name, exact postcode corroboration — probable (fuzzy similarity ~0.81 falls short of the confirmation-support threshold), not confirmed", lead_trading_name: `FishAndChip Shop ${i}`, lead_postcode: zip, expected_decision: "probable", label_provenance: "synthetic_joined_split_words", split: i === 4 ? "holdout" : "calibration" }, "JS", i);
}

// D12 — same postal district, weak/no name similarity: must remain clear (district alone is
// never material) — 6 cases, plus 2 more fuzzy-name holdout cases to round the set out past 100.
for (let i = 1; i <= 6; i++) {
  const id = synthId(); const district = `ZZ12`;
  synthCustomers.push({ Inactive: "No", ID: id, Name: `Unrelated District Neighbour ${i} Enterprises`, "Billing Zip": `${district} ${i}BB` });
  addCase({ description: "Same postal district only, weak/no name correspondence — district alone is never material, must remain clear", lead_trading_name: `Completely Different Business Name ${i}`, lead_postcode: `${district} ${i}AA`, expected_decision: "clear", label_provenance: "synthetic_same_district_weak_name_control", split: i >= 5 ? "holdout" : "calibration" }, "DW", i);
}
[["Continental Bakery", "Continental Bakerie", "ZZ13 1AA"], ["Sunrise Diner", "Sun Rise Diner", "ZZ13 2AA"]].forEach(([leadName, custName, zip], i) => {
  const id = synthId(); const district = zip.split(" ")[0];
  synthCustomers.push({ Inactive: "No", ID: id, Name: custName, "Billing Zip": `${district} 9ZZ` });
  addCase({ description: "Spelling/word-boundary variation, same district, no other signal (probable via fuzzy-name matching) — holdout", lead_trading_name: leadName, lead_postcode: zip, expected_decision: "probable", label_provenance: "synthetic_fuzzy_name_variation", split: "holdout" }, "FN", 9 + i);
});

async function main() {
  const outCalibration = arg("out-calibration");
  const outSynthetic = arg("out-synthetic-customers");
  if (!outCalibration || !outSynthetic) {
    console.error("Missing required argument(s): --out-calibration=<path> --out-synthetic-customers=<path>");
    process.exit(1);
  }

  const caseColumns = ["case_id", "description", "lead_trading_name", "lead_phone", "lead_email", "lead_website", "lead_postcode", "lead_address", "expected_decision", "label_provenance", "split"];
  const customerColumns = ["Inactive", "ID", "Name", "Company Name", "Phone", "Office Phone", "Email", "Invoice Email Address", "Invoice WhatsApp Number", "Billing Zip", "Billing Address 1", "Billing Address 2", "Billing City"];

  await fs.mkdir(path.dirname(outCalibration), { recursive: true });
  await fs.writeFile(outCalibration, writeCsvRows(caseColumns, cases as unknown as Record<string, unknown>[]));
  await fs.writeFile(outSynthetic, writeCsvRows(customerColumns, synthCustomers as unknown as Record<string, unknown>[]));

  const calibrationCount = cases.filter((c) => c.split === "calibration").length;
  const holdoutCount = cases.filter((c) => c.split === "holdout").length;
  console.log(`Written ${cases.length} labelled cases (${calibrationCount} calibration, ${holdoutCount} holdout) to ${outCalibration}`);
  console.log(`Written ${synthCustomers.length} synthetic customer records to ${outSynthetic}`);
  const byDecision: Record<string, number> = {};
  for (const c of cases) byDecision[c.expected_decision] = (byDecision[c.expected_decision] ?? 0) + 1;
  console.log(`By expected decision: ${JSON.stringify(byDecision)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
