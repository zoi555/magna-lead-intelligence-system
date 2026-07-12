// Existing-customers source — Phase 4. Import-ready adapter over the customer master.
// Mock master today (mock-existing-customers.ts). Real import: server-side CSV per
// templates/existing-customers-import-template.csv. No financials stored, no real data yet.

import type { ExistingCustomerMatch } from "../pipeline/types";
import { matchCustomer, type CustomerRecord, type MatchResult } from "../pipeline/customer-matching";
import { MOCK_CUSTOMERS } from "../pipeline/mock-existing-customers";

export type { CustomerRecord } from "../pipeline/customer-matching";

/** Returns the active customer master. Mock now; real import later. */
export function getCustomerMaster(): CustomerRecord[] {
  return MOCK_CUSTOMERS;
}

/** Match a candidate (name + postcode, optional phone) against the master. */
export function matchExistingCustomerRecord(name: string, postcode: string, phone?: string): MatchResult {
  return matchCustomer(name, postcode, phone, getCustomerMaster());
}

/** Envelope wrapper (kept for adapter parity). */
export function matchExistingCustomer(name: string, postcode: string, checkedAt: string | null = null): ExistingCustomerMatch {
  const m = matchExistingCustomerRecord(name, postcode);
  const status = m.status === "existing_customer_match" ? "found" : m.status === "possible_existing_customer" ? "manual_review" : "not_found";
  return {
    source: "existing_customers",
    status,
    confidence: m.confidence,
    checked_at: checkedAt,
    matched: m.status === "existing_customer_match",
    customerStatus: m.status === "existing_customer_match" ? "active" : null,
    notes: m.reason,
  };
}

/** True only for a high-confidence existing match (used for hard suppression). */
export function isExistingActiveCustomer(name: string, postcode: string): boolean {
  return matchExistingCustomerRecord(name, postcode).status === "existing_customer_match";
}
