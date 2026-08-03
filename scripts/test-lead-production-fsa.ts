// Fixture-driven proofs for the FSA stage (npm run test:lead-production-fsa). Pure logic —
// constructs FsaQueryResult objects directly (never calls the real network / searchFsaByAddress).

import { promises as fs } from "node:fs";
import path from "node:path";
import { classifyFsaMatch } from "./lead-production/fsa-match";
import { classifyNameOverlap, resolveCustomerMatchAfterFsa } from "./lead-production/customer-resolution-after-fsa";
import type { OperationalCandidate, CustomerRecord } from "./lead-production/types";
import type { FsaQueryResult } from "./lead-production/fsa-adapter";
import type { FsaEstablishment } from "../src/lib/pipeline/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkCandidate(o: Partial<OperationalCandidate> = {}): OperationalCandidate {
  return { id: o.id ?? "cand-1", name: o.name ?? "Test Diner", brand: null, postcode: o.postcode ?? "UB1 1AA", phone: null, latitude: o.latitude ?? null, longitude: o.longitude ?? null, companyNumber: null, website: null, sources: [] };
}
function mkEstablishment(o: Partial<FsaEstablishment> = {}): FsaEstablishment {
  return {
    fhrsId: o.fhrsId ?? "FHRS-1", businessName: o.businessName ?? "Test Diner", businessType: o.businessType ?? "Restaurant/Cafe/Canteen",
    businessTypeId: 1, ratingValue: o.ratingValue ?? "5", ratingDate: o.ratingDate ?? "2026-01-01", postcode: o.postcode ?? "UB1 1AA",
    addressLine: o.addressLine ?? "1 Test Street", localAuthority: o.localAuthority ?? "Ealing", latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    newlyRegistered: false,
  };
}
function mkQuery(ok: boolean, establishments: FsaEstablishment[] = [], errorMessage: string | null = null): FsaQueryResult {
  return { ok, establishments, attempts: ok ? 1 : 3, errorMessage, queryString: "UB1 1AA", retrievedAt: new Date().toISOString() };
}
function mkCustomer(o: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    rowIndex: 1, customerId: o.customerId ?? "C1", status: o.status ?? "CUSTOMER-Closed Won", lifecycleSource: "inactive_flag",
    lifecycleRawValue: o.isActive === false ? "Yes" : "No", statusOutcome: o.isActive === false ? "inactive" : "active",
    isActive: o.isActive ?? true, tradingName: o.tradingName ?? "Test Diner Ltd", legalName: null, companyNumber: null,
    address: null, postcode: o.postcode ?? "UB1 1AA", phone: null, alternatePhones: [], email: null, alternateEmails: [], parentGroupAccount: null, lastOrderDate: null, assignedSalesperson: null,
  };
}

async function main() {
  console.log("FSA stage — fixture-driven proofs:\n");

  // --- classifyFsaMatch: all 9 outcomes ---
  {
    const r = classifyFsaMatch(mkCandidate(), mkQuery(false, [], "FSA HTTP 503"));
    assert(r.outcome === "fsa_api_failure" && r.apiFailureReason === "FSA HTTP 503", "fsa_api_failure retains the real error, never falls back to fabricated data");
  }
  {
    const r = classifyFsaMatch(mkCandidate(), mkQuery(true, []));
    assert(r.outcome === "no_fsa_match", "no_fsa_match when zero establishments returned");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner", postcode: "UB1 1AA" })]));
    assert(r.outcome === "exact_fsa_match", "exact_fsa_match: postcode exact + strong name agreement");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Test Diner Southall Branch" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner Foods", postcode: "UB1 1AA" })]));
    assert(r.outcome === "strong_probable_fsa_match", `strong_probable_fsa_match: postcode exact + moderate name agreement (got ${r.outcome})`);
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Completely Unrelated Name" }), mkQuery(true, [mkEstablishment({ businessName: "Zebra Fish Bar", postcode: "UB1 1AA" })]));
    assert(r.outcome === "fsa_name_conflict", "fsa_name_conflict: postcode exact but name has no meaningful agreement");
  }
  {
    const r = classifyFsaMatch(mkCandidate(), mkQuery(true, [mkEstablishment({ fhrsId: "A", postcode: "UB1 1AA" }), mkEstablishment({ fhrsId: "B", postcode: "UB1 1AA" })]));
    assert(r.outcome === "multiple_fsa_matches" && r.plausibleEstablishments.length === 2, "multiple_fsa_matches: two establishments share the exact postcode — both retained, not just the first");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner", postcode: "SW1A 1AA" })]));
    assert(r.outcome === "fsa_address_conflict", "fsa_address_conflict: strong name match but postcode differs");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner", postcode: "UB1 1AA", ratingValue: "AwaitingInspection" })]));
    assert(r.outcome === "fsa_pending", "fsa_pending: matched establishment's own rating is awaiting inspection");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner", postcode: "UB1 1AA", ratingValue: "Exempt" })]));
    assert(r.outcome === "fsa_exempt", "fsa_exempt: matched establishment's rating is Exempt");
  }
  {
    const r = classifyFsaMatch(mkCandidate({ postcode: null }), mkQuery(true, []));
    assert(r !== null, "classifyFsaMatch handles a null candidate postcode without throwing");
  }

  // --- classifyNameOverlap ---
  {
    assert(classifyNameOverlap("Iceland - Southall", "FATTWINS (Southall)") === "location_only_name_overlap", "location-only overlap detected (shared 'southall' only)");
    assert(classifyNameOverlap("Test Diner", "Test Diner Ltd") === "business_name_overlap", "genuine business-name overlap detected");
    assert(classifyNameOverlap("The Kebab House", "Southall Kebab") === "generic_name_token_overlap", "generic food-service word overlap ('kebab') alone is not a business-name match");
    assert(classifyNameOverlap("Zebra Fish Bar", "Totally Unrelated Ltd") === "no_overlap", "no shared tokens at all");
  }

  // --- resolveCustomerMatchAfterFsa ---
  {
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", postcode: "UB1 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner Ltd", postcode: "UB1 1AA" })]));
    const res = resolveCustomerMatchAfterFsa("cand-1", "probable_customer_match", "C1", "Test Diner", cust, fsa);
    assert(res.resolutionOutcome === "confirmed_active_customer_after_fsa", "strong FSA + active Magna Inactive flag -> confirmed_active_customer_after_fsa");
    assert(res.evidenceUsed.some((e) => e.includes("Magna Inactive field is authoritative")), "confirmation evidence explicitly cites the Magna Inactive field as lifecycle authority");
  }
  {
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", postcode: "UB1 1AA", isActive: false });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner Ltd", postcode: "UB1 1AA" })]));
    const res = resolveCustomerMatchAfterFsa("cand-1", "probable_customer_match", "C1", "Test Diner", cust, fsa);
    assert(res.resolutionOutcome === "confirmed_inactive_customer_after_fsa", "strong FSA + inactive Magna Inactive flag -> confirmed_inactive_customer_after_fsa");
  }
  {
    const cust = mkCustomer({ tradingName: "Some Other Business", postcode: "UB1 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Completely Unrelated Name" }), mkQuery(true, [mkEstablishment({ businessName: "Zebra Fish Bar", postcode: "UB1 1AA" })]));
    const res = resolveCustomerMatchAfterFsa("cand-1", "probable_customer_match", "C1", "Completely Unrelated Name", cust, fsa);
    assert(res.resolutionOutcome === "clear_for_enrichment_after_fsa", "fsa_name_conflict releases the candidate from customer-match hold");
  }
  {
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", postcode: "SW1A 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Test Diner", postcode: "UB1 1AA" }), mkQuery(true, [mkEstablishment({ businessName: "Test Diner", postcode: "SW1A 1AA" })]));
    assert(fsa.outcome === "fsa_address_conflict", `fixture sanity check: FSA outcome is fsa_address_conflict (got ${fsa.outcome})`);
    const res = resolveCustomerMatchAfterFsa("cand-1", "possible_customer_match", "C1", "Test Diner", cust, fsa);
    assert(res.resolutionOutcome === "clear_for_enrichment_after_fsa", "fsa_address_conflict releases the candidate from customer-match hold");
  }
  {
    const cust = mkCustomer({ tradingName: "FATTWINS (Southall)", postcode: "UB1 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Iceland - Southall" }), mkQuery(true, []));
    const res = resolveCustomerMatchAfterFsa("cand-1", "possible_customer_match", "C1", "Iceland - Southall", cust, fsa);
    assert(res.priorOverlapCategory === "location_only_name_overlap" && res.resolutionOutcome === "clear_for_enrichment_after_fsa", "a location-only-overlap match with no FSA confirmation is released, not left hanging");
  }
  {
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", postcode: "UB1 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(true, [mkEstablishment({ fhrsId: "A", businessName: "Test Diner", postcode: "UB1 1AA" }), mkEstablishment({ fhrsId: "B", businessName: "Test Diner Express", postcode: "UB1 1AA" })]));
    const res = resolveCustomerMatchAfterFsa("cand-1", "probable_customer_match", "C1", "Test Diner", cust, fsa);
    assert(res.resolutionOutcome === "unresolved_customer_match", "genuine business-name overlap + multiple_fsa_matches (ambiguous) -> remains unresolved, not forced into confirm or release");
  }
  {
    // No candidate ever forced into active/inactive/clear without qualifying evidence.
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", postcode: "UB1 1AA", isActive: true });
    const fsa = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkQuery(false, [], "timeout"));
    const res = resolveCustomerMatchAfterFsa("cand-1", "probable_customer_match", "C1", "Test Diner", cust, fsa);
    assert(res.resolutionOutcome === "unresolved_customer_match", "an FSA API failure on a genuine-overlap candidate remains unresolved (never silently confirmed or released)");
  }

  // --- Structural: the adapter never falls back to fabricated/mock data on failure ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/fsa-adapter.ts"), "utf8");
    assert(!/MOCK_FSA|getFsaEstablishmentsMock/.test(text), "fsa-adapter.ts never references the legacy mock-fallback data — a failure is always reported, never faked");
    assert(text.includes("searchFsaByAddress"), "fsa-adapter.ts reuses the existing, real searchFsaByAddress() rather than reimplementing the HTTP call");
  }

  // --- Structural: FSA is the only external source called in this stage ---
  {
    const dir = path.resolve(process.cwd(), "scripts/lead-production");
    const fsaFiles = ["fsa-adapter.ts", "fsa-match.ts", "customer-resolution-after-fsa.ts", "run-fsa-stage.ts"];
    for (const f of fsaFiles) {
      const text = await fs.readFile(path.join(dir, f), "utf8");
      const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
      // Deliberately NOT a bare word-match on "companies house"/"google"/"website" — these
      // files legitimately (and helpfully) document IN THEIR OWN LOG OUTPUT that those
      // sources were NOT called (e.g. "No Companies House, Google Places... have NOT been
      // called"), which would false-positive on a naive word search. The only thing that
      // actually matters is whether an outbound call exists to anything but the FSA API.
      const outboundCall = /fetch\(\s*[`'"]https?:\/\/(?!api\.ratings\.food\.gov\.uk)/i.test(withoutComments);
      assert(!outboundCall, `${f} makes no outbound HTTP call to anything other than the FSA API`);
    }
  }

  console.log(fails === 0 ? "\nAll FSA-stage assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
