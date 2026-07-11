// Existing-customers source — Vertical Slice 001 (PLACEHOLDER, import/manual).
//
// Stands in for the real customer master (NetSuite / Sales Pro). Data is mock;
// the MATCH LOGIC is real (normalised name + postcode). No financials stored.
// Later: replace with a server-side import + hashed matching against real data.

import type { ExistingCustomerMatch } from "../pipeline/types";

export interface ExistingCustomer {
  name: string;
  postcode: string;
  status: "active" | "lapsed";
}

// Mock customer master (placeholder). Import source in production.
export const MOCK_EXISTING_CUSTOMERS: ExistingCustomer[] = [
  { name: "Southall Sweet Centre", postcode: "UB1 3EU", status: "active" },
  { name: "Bench Cafe", postcode: "W5 5DA", status: "lapsed" },
  { name: "Greenford Grill", postcode: "UB6 8AA", status: "active" },
];

function key(name: string, postcode: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const p = postcode.toUpperCase().replace(/\s+/g, "");
  return `${n}|${p}`;
}

const INDEX = new Map<string, ExistingCustomer>(MOCK_EXISTING_CUSTOMERS.map((c) => [key(c.name, c.postcode), c]));

/** Match a business against the (mock) customer master. Returns an envelope. */
export function matchExistingCustomer(name: string, postcode: string, checkedAt: string | null = null): ExistingCustomerMatch {
  const hit = INDEX.get(key(name, postcode));
  if (!hit) {
    return {
      source: "existing_customers",
      status: "not_found",
      confidence: 0,
      checked_at: checkedAt,
      matched: false,
      customerStatus: null,
      notes: "No existing-customer match (mock import).",
    };
  }
  return {
    source: "existing_customers",
    status: "found",
    confidence: 0.95,
    checked_at: checkedAt,
    matched: true,
    customerStatus: hit.status,
    notes: `Matched existing ${hit.status} customer (mock import).`,
  };
}

/** True if this business is an existing ACTIVE customer (suppress from new leads). */
export function isExistingActiveCustomer(name: string, postcode: string): boolean {
  const hit = INDEX.get(key(name, postcode));
  return Boolean(hit && hit.status === "active");
}
