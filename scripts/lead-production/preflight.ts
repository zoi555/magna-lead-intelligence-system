// Customer-master preflight — produced BEFORE any real comparison runs. The comparison
// command stops (exit 1) if any blocking preflight error exists (see run-comparison.ts).
//
// Lifecycle is read from the preferred source (inactive_flag column when present, else the
// status_field) — see load-customers.ts. Every distinct raw lifecycle value found is reported
// with its normalised form, mapped outcome, row count, and approval flag. The pipeline-style
// "Status" field (e.g. NetSuite deal-stage labels) is reported separately as informational
// metadata ONLY — it never determines lifecycle when an inactive_flag column exists.
//
// Row-level requirements (customer ID, trading name, approved lifecycle, at least one matching
// identifier) quarantine individual rows — they do NOT block the whole file. The file blocks
// only on: duplicate customer IDs (unresolved identity conflict), or zero usable rows remaining.

import { normaliseName, normalisePhone, normaliseCompanyNumber, normalisePostcode } from "./normalize";
import { ACTIVE_STATUS_TOKENS, INACTIVE_STATUS_TOKENS, CUSTOMER_FIELD_SPECS, mapStatusOutcome, mapLifecycleFlag, type LoadedCustomers } from "./load-customers";
import { splitUsableAndQuarantined } from "./row-validation";
import type { StatusOutcome, LifecycleSource } from "./types";

export interface DuplicateGroup { value: string; rowIndexes: number[] }

export interface LifecycleInventoryRow {
  originalValue: string; // raw, exactly as it appears in the file (blank shown as "")
  normalisedValue: string;
  mappedOutcome: StatusOutcome;
  rowCount: number;
  approved: boolean;
}

export interface PipelineStatusMetadataRow {
  value: string;
  rowCount: number;
}

export interface CustomerPreflightReport {
  sourceFileHash: string;
  sourceRowCount: number;
  sheetName: string | null;
  columnMapping: Record<string, string | null>;
  requiredColumnsFound: string[];
  optionalColumnsFound: string[];
  unmappedColumns: string[];
  lifecycleSource: LifecycleSource;
  lifecycleSourceColumn: string;
  recognisedActiveStatusValues: string[];
  recognisedInactiveStatusValues: string[];
  lifecycleInventory: LifecycleInventoryRow[];
  // The raw "Status" pipeline field, retained purely as source metadata — NEVER used to derive
  // lifecycle when lifecycleSource is "inactive_flag".
  pipelineStatusMetadata: PipelineStatusMetadataRow[];
  usableRowCount: number;
  quarantinedRowCount: number;
  quarantinedReasonCounts: Record<string, number>;
  duplicateCustomerIds: DuplicateGroup[];
  duplicateNormalisedPhones: DuplicateGroup[];
  duplicateCompanyNumbers: DuplicateGroup[];
  duplicatePostcodeNameCombinations: DuplicateGroup[];
  blockingWarnings: string[];
  nonBlockingWarnings: string[];
}

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

  // Lifecycle inventory: every distinct raw value from the PREFERRED source (inactive_flag when
  // present, else status_field), with its mapped outcome and approval flag.
  const byRawLifecycle = new Map<string, number>();
  for (const c of loaded.customers) byRawLifecycle.set(c.lifecycleRawValue, (byRawLifecycle.get(c.lifecycleRawValue) ?? 0) + 1);
  const mapFn = loaded.lifecycleSource === "inactive_flag" ? mapLifecycleFlag : mapStatusOutcome;
  const lifecycleInventory: LifecycleInventoryRow[] = [...byRawLifecycle.entries()].map(([originalValue, rowCount]) => {
    const normalisedValue = originalValue.toLowerCase().trim().replace(/\s+/g, " ");
    const mappedOutcome = mapFn(originalValue);
    return { originalValue, normalisedValue, mappedOutcome, rowCount, approved: mappedOutcome !== "unapproved" };
  });

  // Pipeline "Status" field — informational metadata only, always from the raw status column,
  // regardless of which source actually decides lifecycle.
  const byRawStatus = new Map<string, number>();
  for (const c of loaded.customers) byRawStatus.set(c.status, (byRawStatus.get(c.status) ?? 0) + 1);
  const pipelineStatusMetadata: PipelineStatusMetadataRow[] = [...byRawStatus.entries()].map(([value, rowCount]) => ({ value, rowCount }));

  const { usable, quarantined } = splitUsableAndQuarantined(loaded.customers);
  const quarantinedReasonCounts: Record<string, number> = {};
  for (const q of quarantined) for (const r of q.reasons) quarantinedReasonCounts[r] = (quarantinedReasonCounts[r] ?? 0) + 1;

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

  if (duplicateCustomerIds.length) {
    blockingWarnings.push(`${duplicateCustomerIds.length} duplicate customer ID value(s) found — an unresolved identity conflict, since a customer ID must be unique to match unambiguously: ${duplicateCustomerIds.map((d) => d.value).join(", ")}.`);
  }
  if (usable.length === 0) {
    blockingWarnings.push(`No usable customer rows remain after row-level validation — all ${loaded.customers.length} row(s) were quarantined. Reasons: ${JSON.stringify(quarantinedReasonCounts)}.`);
  }

  if (quarantined.length) nonBlockingWarnings.push(`${quarantined.length} row(s) quarantined (excluded from matching, retained in customer-master-rejected-rows.csv) — reason breakdown: ${JSON.stringify(quarantinedReasonCounts)}.`);
  if (duplicateNormalisedPhones.length) nonBlockingWarnings.push(`${duplicateNormalisedPhones.length} phone number(s) shared by more than one customer row (may be legitimate, e.g. a shared head-office line).`);
  if (duplicateCompanyNumbers.length) nonBlockingWarnings.push(`${duplicateCompanyNumbers.length} company number(s) shared by more than one customer row.`);
  if (duplicatePostcodeNameCombinations.length) nonBlockingWarnings.push(`${duplicatePostcodeNameCombinations.length} postcode+name combination(s) shared by more than one customer row.`);
  if (loaded.unmappedColumns.length) nonBlockingWarnings.push(`${loaded.unmappedColumns.length} column(s) in the file were not mapped to any known field: ${loaded.unmappedColumns.join(", ")}.`);

  return {
    sourceFileHash, sourceRowCount: loaded.rowCount, sheetName: loaded.sheetName, columnMapping: loaded.columnMapping,
    requiredColumnsFound, optionalColumnsFound, unmappedColumns: loaded.unmappedColumns,
    lifecycleSource: loaded.lifecycleSource, lifecycleSourceColumn: loaded.lifecycleSourceColumn,
    recognisedActiveStatusValues: [...ACTIVE_STATUS_TOKENS], recognisedInactiveStatusValues: [...INACTIVE_STATUS_TOKENS],
    lifecycleInventory, pipelineStatusMetadata,
    usableRowCount: usable.length, quarantinedRowCount: quarantined.length, quarantinedReasonCounts,
    duplicateCustomerIds, duplicateNormalisedPhones, duplicateCompanyNumbers, duplicatePostcodeNameCombinations,
    blockingWarnings, nonBlockingWarnings,
  };
}
