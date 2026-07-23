// Row-level usability for customer matching. A row that fails these checks is QUARANTINED
// (excluded from matching, retained with explicit reasons) — it does NOT block the whole file
// unless every row ends up quarantined (see preflight.ts).
//
// A usable customer row must have:
//   - customer/account ID
//   - trading name
//   - an APPROVED lifecycle status (see load-customers.ts)
//   - at least one usable matching identifier: full postcode, normalised phone, or company number
// Address is OPTIONAL — AspectLead candidates carry no free-text address pre-enrichment, so it
// cannot be a mandatory matching field at this stage. A missing address ALONE never quarantines
// a row.

import { normalisePostcode, normalisePhone, normaliseCompanyNumber } from "./normalize";
import type { CustomerRecord, RowValidationResult } from "./types";

export const REJECTION_REASONS = {
  MISSING_CUSTOMER_ID: "MISSING_CUSTOMER_ID",
  MISSING_TRADING_NAME: "MISSING_TRADING_NAME",
  UNAPPROVED_LIFECYCLE_STATUS: "UNAPPROVED_LIFECYCLE_STATUS",
  NO_USABLE_MATCHING_IDENTIFIER: "NO_USABLE_MATCHING_IDENTIFIER",
} as const;

export function evaluateCustomerRowUsability(c: CustomerRecord): RowValidationResult {
  const reasons: string[] = [];
  if (!c.customerId) reasons.push(REJECTION_REASONS.MISSING_CUSTOMER_ID);
  if (!c.tradingName) reasons.push(REJECTION_REASONS.MISSING_TRADING_NAME);
  if (c.statusOutcome === "unapproved") reasons.push(REJECTION_REASONS.UNAPPROVED_LIFECYCLE_STATUS);

  const hasPostcode = !!normalisePostcode(c.postcode).canonical;
  const hasPhone = !!normalisePhone(c.phone).comparison;
  const hasCompanyNumber = !!normaliseCompanyNumber(c.companyNumber);
  if (!hasPostcode && !hasPhone && !hasCompanyNumber) reasons.push(REJECTION_REASONS.NO_USABLE_MATCHING_IDENTIFIER);

  return { usable: reasons.length === 0, reasons };
}

export interface QuarantinedCustomerRow {
  customer: CustomerRecord;
  reasons: string[];
}

export function splitUsableAndQuarantined(customers: CustomerRecord[]): { usable: CustomerRecord[]; quarantined: QuarantinedCustomerRow[] } {
  const usable: CustomerRecord[] = [];
  const quarantined: QuarantinedCustomerRow[] = [];
  for (const c of customers) {
    const result = evaluateCustomerRowUsability(c);
    if (result.usable) usable.push(c);
    else quarantined.push({ customer: c, reasons: result.reasons });
  }
  return { usable, quarantined };
}
