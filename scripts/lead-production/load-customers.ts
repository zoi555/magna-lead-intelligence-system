// Loads a real Magna customer export (CSV or Excel). NEVER uses mock/sample/seeded/hardcoded
// customer data — the file path is always supplied by the caller.

import { loadTabularFile } from "./file-loader";
import { mapColumns, ColumnMappingError, type FieldSpec } from "./column-mapping";
import type { CustomerRecord, StatusOutcome } from "./types";

// Required: customer/account ID, status, trading name, address, postcode — without these the
// file cannot be used for matching at all. Optional ("where available" in the spec): legal
// name, company number, phone, email, parent/group account, last order date, salesperson.
export const CUSTOMER_FIELD_SPECS: FieldSpec[] = [
  { key: "customerId", aliases: ["customer_code", "customer id", "account id", "account_id", "id", "customer_id"], required: true },
  { key: "status", aliases: ["active_inactive", "account status", "customer status"], required: true },
  // "customer name" (NetSuite) added alongside the existing aliases — a real, unambiguous
  // header this bridge previously failed to map, not a guess.
  { key: "tradingName", aliases: ["trading_name", "trading as", "name", "customer name"], required: true },
  { key: "legalName", aliases: ["legal_name", "registered name", "company name", "registered_name"], required: false },
  { key: "companyNumber", aliases: ["company_number", "companies house number", "ch number", "company reg number"], required: false },
  // "address line 1" and "billing address 1" (NetSuite) added alongside the existing aliases.
  { key: "address", aliases: ["site address", "delivery address", "address1", "address_1", "address line 1", "billing address 1"], required: true },
  // "billing zip" (NetSuite) added alongside the existing aliases.
  { key: "postcode", aliases: ["post code", "post_code", "site postcode", "billing zip"], required: true },
  { key: "phone", aliases: ["telephone", "tel", "phone number", "contact number"], required: false },
  { key: "email", aliases: ["email address", "contact email"], required: false },
  { key: "parentGroupAccount", aliases: ["parent account", "group account", "parent_group", "parent/group", "parent group account"], required: false },
  { key: "lastOrderDate", aliases: ["last_order_date", "last order", "last order date"], required: false },
  { key: "assignedSalesperson", aliases: ["sales rep", "sales_rep", "salesperson", "rep", "account manager"], required: false },
];

// The single, explicit, editable source of truth mapping every APPROVED raw customer status
// value (case/space-insensitive) to one of exactly three operational outcomes. Any status not
// listed here — including blank — is "unapproved" and BLOCKS the run at preflight (see
// preflight.ts / run-comparison.ts). Extend this map before running against a real customer
// export whose status vocabulary differs; never add a silent fallback instead.
export const APPROVED_STATUS_MAP: Record<string, StatusOutcome> = {
  active: "active", current: "active", live: "active", open: "active",
  inactive: "inactive", lapsed: "inactive", dormant: "inactive", suspended: "inactive",
  closed: "excluded_non_prospect", ceased: "excluded_non_prospect", "ceased trading": "excluded_non_prospect",
};

// Kept for backward-compatible preflight reporting of the two broad families.
export const ACTIVE_STATUS_TOKENS = new Set(Object.keys(APPROVED_STATUS_MAP).filter((k) => APPROVED_STATUS_MAP[k] === "active"));
export const INACTIVE_STATUS_TOKENS = new Set(Object.keys(APPROVED_STATUS_MAP).filter((k) => APPROVED_STATUS_MAP[k] === "inactive"));

export function mapStatusOutcome(rawStatus: string): StatusOutcome {
  const key = rawStatus.toLowerCase().trim().replace(/\s+/g, " ");
  if (!key) return "unapproved";
  return APPROVED_STATUS_MAP[key] ?? "unapproved";
}

export interface LoadedCustomers {
  customers: CustomerRecord[];
  header: string[];
  sheetName: string | null;
  rowCount: number;
  columnMapping: Record<string, string | null>;
  unmappedColumns: string[];
  sourcePath: string;
}

export async function loadCustomerFile(filePath: string): Promise<LoadedCustomers> {
  const file = await loadTabularFile(filePath);
  const { mapping, missingRequired, unmappedColumns } = mapColumns(file.header, CUSTOMER_FIELD_SPECS);
  if (missingRequired.length) throw new ColumnMappingError(`Customer file (${filePath})`, missingRequired, file.header);

  const get = (row: Record<string, string>, key: string): string | null => {
    const col = mapping[key];
    if (!col) return null;
    const v = (row[col] ?? "").trim();
    return v || null;
  };

  const customers: CustomerRecord[] = file.rows.map((row, i) => {
    const status = get(row, "status") ?? "";
    const statusOutcome = mapStatusOutcome(status);
    return {
      rowIndex: i + 2, // +1 header row, +1 to be 1-indexed for humans
      customerId: get(row, "customerId") ?? "",
      status,
      statusOutcome,
      // "excluded_non_prospect" (e.g. ceased trading) is treated at least as conservatively as
      // an active customer for MATCHING purposes — never softened into a reactivation target.
      isActive: statusOutcome === "active" || statusOutcome === "excluded_non_prospect",
      tradingName: get(row, "tradingName") ?? "",
      legalName: get(row, "legalName"),
      companyNumber: get(row, "companyNumber"),
      address: get(row, "address"),
      postcode: get(row, "postcode"),
      phone: get(row, "phone"),
      email: get(row, "email"),
      parentGroupAccount: get(row, "parentGroupAccount"),
      lastOrderDate: get(row, "lastOrderDate"),
      assignedSalesperson: get(row, "assignedSalesperson"),
    };
  });

  return { customers, header: file.header, sheetName: file.sheetName, rowCount: file.rows.length, columnMapping: mapping, unmappedColumns, sourcePath: filePath };
}
