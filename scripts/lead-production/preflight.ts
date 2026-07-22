// Customer-master preflight — produced BEFORE any real comparison runs. The comparison
// command stops (exit 1) if any blocking preflight error exists (see run-comparison.ts).
//
// Every distinct customer status found is reported with its normalised form, mapped outcome,
// row count, and approval flag. ANY row with a blank, invalid, or unrecognised status — i.e.
// not covered by APPROVED_STATUS_MAP — is a BLOCKING error. Unknown statuses are never
// silently treated as active, inactive, or a clear prospect.

import { normaliseName, normalisePhone, normaliseCompanyNumber, normalisePostcode } from "./normalize";
import { ACTIVE_STATUS_TOKENS, INACTIVE_STATUS_TOKENS, CUSTOMER_FIELD_SPECS, mapStatusOutcome, type LoadedCustomers } from "./load-customers";
import type { StatusOutcome } from "./types";

export interface DuplicateGroup { value: string; rowIndexes: number[] }

export interface StatusInventoryRow {
  originalValue: string; // raw, exactly as it appears in the file (blank shown as "" )
  normalisedStatus: string;
  mappedOutcome: StatusOutcome;
  rowCount: number;
  approved: boolean;
}

export interface CustomerPreflightReport {
  sourceFileHash: string;
  sourceRowCount: number;
  sheetName: string | null;
  columnMapping: Record<string, string | null>;
  requiredColumnsFound: string[];
  optionalColumnsFound: string[];
  unmappedColumns: string[];
  recognisedActiveStatusValues: string[];
  recognisedInactiveStatusValues: string[];
  statusInventory: StatusInventoryRow[];
  rowsMissingRequiredValues: { rowIndex: number; missingFields: string[] }[];
  duplicateCustomerIds: DuplicateGroup[];
  duplicateNormalisedPhones: DuplicateGroup[];
  duplicateCompanyNumbers: DuplicateGroup[];
  duplicatePostcodeNameCombinations: DuplicateGroup[];
  blockingWarnings: string[];
  nonBlockingWarnings: string[];
}

const REQUIRED_VALUE_FIELDS = ["customerId", "status", "tradingName", "address", "postcode"] as const;

function findDuplicates(values: { rowIndex: number; value: string | null }[]): DuplicateGroup[] {
  const byValue = new Map<string, number[]>();
  for (const { rowIndex, value } of values) {
    if (!value) continue;
    byValue.set(value, [...(byValue.get(value) ?? []), rowIndex]);
  }
  return [...byValue.entries()].filter(([, rows]) => rows.length > 1).map(([value, rowIndexes]) => ({ value, rowIndexes }));
}

export function buildCustomerPreflight(loaded: LoadedCustomers, sourceFileHash: string): CustomerPreflightReport {
  const requiredColumnsFound = CUSTOMER_FIELD_SPECS.filter((s) => s.required && loaded.columnMapping[s.key]).map((s) => s.key);
  const optionalColumnsFound = CUSTOMER_FIELD_SPECS.filter((s) => !s.required && loaded.columnMapping[s.key]).map((s) => s.key);

  // Full status inventory: EVERY distinct raw status value (including blank), with its
  // normalised form, mapped outcome, row count, and approval flag.
  const byRawStatus = new Map<string, number>();
  for (const c of loaded.customers) byRawStatus.set(c.status, (byRawStatus.get(c.status) ?? 0) + 1);
  const statusInventory: StatusInventoryRow[] = [...byRawStatus.entries()].map(([originalValue, rowCount]) => {
    const normalisedStatus = originalValue.toLowerCase().trim().replace(/\s+/g, " ");
    const mappedOutcome = mapStatusOutcome(originalValue);
    return { originalValue, normalisedStatus, mappedOutcome, rowCount, approved: mappedOutcome !== "unapproved" };
  });
  const unapprovedRows = statusInventory.filter((s) => !s.approved);

  const rowsMissingRequiredValues = loaded.customers
    .map((c) => {
      const missingFields = REQUIRED_VALUE_FIELDS.filter((f) => {
        const v = c[f as keyof typeof c];
        return v === null || v === "" || v === undefined;
      });
      return { rowIndex: c.rowIndex, missingFields };
    })
    .filter((r) => r.missingFields.length > 0);

  const duplicateCustomerIds = findDuplicates(loaded.customers.map((c) => ({ rowIndex: c.rowIndex, value: c.customerId || null })));
  const duplicateNormalisedPhones = findDuplicates(loaded.customers.map((c) => ({ rowIndex: c.rowIndex, value: normalisePhone(c.phone).comparison })));
  const duplicateCompanyNumbers = findDuplicates(loaded.customers.map((c) => ({ rowIndex: c.rowIndex, value: normaliseCompanyNumber(c.companyNumber) })));
  const duplicatePostcodeNameCombinations = findDuplicates(loaded.customers.map((c) => {
    const pc = normalisePostcode(c.postcode).canonical;
    const nm = normaliseName(c.tradingName);
    return { rowIndex: c.rowIndex, value: pc && nm ? `${pc}|${nm}` : null };
  }));

  const blockingWarnings: string[] = [];
  const nonBlockingWarnings: string[] = [];

  if (rowsMissingRequiredValues.length) {
    blockingWarnings.push(`${rowsMissingRequiredValues.length} row(s) are missing a required value (customer ID, status, trading name, address, or postcode) — rows: ${rowsMissingRequiredValues.map((r) => r.rowIndex).join(", ")}.`);
  }
  if (duplicateCustomerIds.length) {
    blockingWarnings.push(`${duplicateCustomerIds.length} duplicate customer ID value(s) found — a customer ID must be unique to match unambiguously: ${duplicateCustomerIds.map((d) => d.value).join(", ")}.`);
  }
  if (unapprovedRows.length) {
    const total = unapprovedRows.reduce((sum, s) => sum + s.rowCount, 0);
    blockingWarnings.push(
      `${total} row(s) have a blank, invalid, or unrecognised customer status not covered by the approved status mapping: `
      + unapprovedRows.map((s) => `"${s.originalValue || "(blank)"}" (${s.rowCount} row(s))`).join(", ")
      + `. Extend APPROVED_STATUS_MAP in scripts/lead-production/load-customers.ts to explicitly map each value to active/inactive/excluded_non_prospect before re-running — unknown statuses are never silently treated as active, inactive, or a clear prospect.`,
    );
  }

  if (duplicateNormalisedPhones.length) nonBlockingWarnings.push(`${duplicateNormalisedPhones.length} phone number(s) shared by more than one customer row (may be legitimate, e.g. a shared head-office line).`);
  if (duplicateCompanyNumbers.length) nonBlockingWarnings.push(`${duplicateCompanyNumbers.length} company number(s) shared by more than one customer row.`);
  if (duplicatePostcodeNameCombinations.length) nonBlockingWarnings.push(`${duplicatePostcodeNameCombinations.length} postcode+name combination(s) shared by more than one customer row.`);
  if (loaded.unmappedColumns.length) nonBlockingWarnings.push(`${loaded.unmappedColumns.length} column(s) in the file were not mapped to any known field: ${loaded.unmappedColumns.join(", ")}.`);

  return {
    sourceFileHash, sourceRowCount: loaded.rowCount, sheetName: loaded.sheetName, columnMapping: loaded.columnMapping,
    requiredColumnsFound, optionalColumnsFound, unmappedColumns: loaded.unmappedColumns,
    recognisedActiveStatusValues: [...ACTIVE_STATUS_TOKENS], recognisedInactiveStatusValues: [...INACTIVE_STATUS_TOKENS],
    statusInventory, rowsMissingRequiredValues, duplicateCustomerIds, duplicateNormalisedPhones,
    duplicateCompanyNumbers, duplicatePostcodeNameCombinations, blockingWarnings, nonBlockingWarnings,
  };
}
