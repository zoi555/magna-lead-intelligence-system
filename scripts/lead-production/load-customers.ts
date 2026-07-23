// Loads a real Magna customer export (CSV or Excel). NEVER uses mock/sample/seeded/hardcoded
// customer data — the file path is always supplied by the caller.
//
// LIFECYCLE SOURCE: some real exports (confirmed against a real NetSuite "Customers" export)
// carry a "Status" column that is actually a sales/deal-stage pipeline label (e.g.
// "CUSTOMER-Closed Won", "CUSTOMER-Renewal", "CUSTOMER-Lost Customer") — NOT a customer
// active/inactive indicator. When a genuine binary lifecycle flag column ("Inactive": Yes/No)
// is present, it is ALWAYS preferred and the Status column is retained purely as passthrough
// metadata, never consulted for lifecycle. When no such flag column exists, Status is used as
// before via APPROVED_STATUS_MAP. This decision is made ONCE per file (based on whether the
// column is mapped at all), never per-row — see loadCustomerFile().

import { loadTabularFile } from "./file-loader";
import { mapColumns, ColumnMappingError, type FieldSpec } from "./column-mapping";
import type { CustomerRecord, StatusOutcome, LifecycleSource } from "./types";

// Model-defect fix (2026-07-23, UB1 calibration audit): the real Magna customer master export
// carries un-decoded HTML entities in trading names (519 occurrences of "&apos;" alone in one
// real export — e.g. "Ali Baba&apos;s Ltd T/A Ali Baba&apos;s"). Left undecoded, every
// name-similarity comparison against this customer's trading name is computed against garbage
// tokens ("apos"/"s" fragments) instead of the real name, corrupting both customer-match
// materiality assessment and any other name comparison that reads this file. Only the small,
// standard named/numeric entity set is decoded — never a general HTML-stripping pass.
const HTML_NAMED_ENTITIES: Record<string, string> = { apos: "'", amp: "&", quot: '"', lt: "<", gt: ">", nbsp: " " };
export function decodeHtmlEntities(raw: string): string {
  if (!raw || !raw.includes("&")) return raw;
  return raw
    .replace(/&([a-zA-Z]+);/g, (m, name) => HTML_NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

// Required: customer/account ID and trading name — without these a row cannot be matched or
// even identified. address/postcode are NOT required columns any more — see row-validation.ts;
// AspectLead candidates carry no free-text address pre-enrichment, so address cannot be a
// mandatory *matching* field at this stage, and postcode is only one of three acceptable
// per-row matching identifiers (postcode / phone / company number), not mandatory on its own.
export const CUSTOMER_FIELD_SPECS: FieldSpec[] = [
  { key: "customerId", aliases: ["customer_code", "customer id", "account id", "account_id", "id", "customer_id"], required: true },
  { key: "status", aliases: ["active_inactive", "account status", "customer status"], required: false },
  // The genuine binary lifecycle flag, when the export has one — always preferred over "status".
  { key: "inactiveFlag", aliases: ["inactive", "is_inactive", "is inactive", "customer inactive"], required: false },
  // "customer name" (NetSuite) added alongside the existing aliases — a real, unambiguous
  // header this bridge previously failed to map, not a guess.
  { key: "tradingName", aliases: ["trading_name", "trading as", "name", "customer name"], required: true },
  { key: "legalName", aliases: ["legal_name", "registered name", "company name", "registered_name"], required: false },
  { key: "companyNumber", aliases: ["company_number", "companies house number", "ch number", "company reg number"], required: false },
  // "address line 1" and "billing address 1" (NetSuite) added alongside the existing aliases.
  { key: "address", aliases: ["site address", "delivery address", "address1", "address_1", "address line 1", "billing address 1"], required: false },
  // "billing zip" (NetSuite) added alongside the existing aliases.
  { key: "postcode", aliases: ["post code", "post_code", "site postcode", "billing zip"], required: false },
  { key: "phone", aliases: ["telephone", "tel", "phone number", "contact number"], required: false },
  { key: "email", aliases: ["email address", "contact email"], required: false },
  { key: "parentGroupAccount", aliases: ["parent account", "group account", "parent_group", "parent/group", "parent group account"], required: false },
  { key: "lastOrderDate", aliases: ["last_order_date", "last order", "last order date"], required: false },
  { key: "assignedSalesperson", aliases: ["sales rep", "sales_rep", "salesperson", "rep", "account manager"], required: false },
];

// The single, explicit, editable source of truth mapping every APPROVED raw "Status" text value
// (case/space-insensitive) to one of exactly three operational outcomes. Used ONLY when the
// file has no inactiveFlag column. Any status not listed here — including blank — is
// "unapproved". Extend this map before running against a real customer export whose status
// vocabulary differs; never add a silent fallback instead.
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

// The binary lifecycle-flag vocabulary. Deliberately narrow and explicit — no fuzzy matching.
export const LIFECYCLE_FLAG_MAP: Record<string, StatusOutcome> = {
  false: "active", no: "active", n: "active", f: "active", "0": "active",
  true: "inactive", yes: "inactive", y: "inactive", t: "inactive", "1": "inactive",
};

export function mapLifecycleFlag(rawValue: string): StatusOutcome {
  const key = rawValue.toLowerCase().trim();
  if (!key) return "unapproved";
  return LIFECYCLE_FLAG_MAP[key] ?? "unapproved";
}

export interface LoadedCustomers {
  customers: CustomerRecord[];
  header: string[];
  sheetName: string | null;
  rowCount: number;
  columnMapping: Record<string, string | null>;
  unmappedColumns: string[];
  sourcePath: string;
  lifecycleSource: LifecycleSource;
  lifecycleSourceColumn: string; // the actual header text used
}

export async function loadCustomerFile(filePath: string): Promise<LoadedCustomers> {
  const file = await loadTabularFile(filePath);
  const { mapping, missingRequired, unmappedColumns } = mapColumns(file.header, CUSTOMER_FIELD_SPECS);
  if (missingRequired.length) throw new ColumnMappingError(`Customer file (${filePath})`, missingRequired, file.header);

  // File-level decision, made once: prefer a genuine inactiveFlag column when present. If
  // NEITHER an inactiveFlag NOR a status column exists at all, lifecycle cannot be interpreted
  // for this file at all — a hard, file-level block (distinct from any individual row's value
  // being unrecognised).
  const lifecycleSource: LifecycleSource = mapping.inactiveFlag ? "inactive_flag" : "status_field";
  const lifecycleSourceColumn = mapping.inactiveFlag ?? mapping.status ?? "";
  if (!mapping.inactiveFlag && !mapping.status) {
    throw new Error(
      `Customer file (${filePath}): the customer lifecycle cannot be interpreted — neither an ` +
      `Inactive-flag column nor a Status column was found. Actual columns found: [${file.header.join(", ")}].`,
    );
  }

  const get = (row: Record<string, string>, key: string): string | null => {
    const col = mapping[key];
    if (!col) return null;
    const v = decodeHtmlEntities((row[col] ?? "").trim());
    return v || null;
  };

  const customers: CustomerRecord[] = file.rows.map((row, i) => {
    const status = get(row, "status") ?? ""; // retained as metadata only
    const lifecycleRawValue = lifecycleSource === "inactive_flag" ? (get(row, "inactiveFlag") ?? "") : status;
    const statusOutcome = lifecycleSource === "inactive_flag" ? mapLifecycleFlag(lifecycleRawValue) : mapStatusOutcome(lifecycleRawValue);
    return {
      rowIndex: i + 2, // +1 header row, +1 to be 1-indexed for humans
      customerId: get(row, "customerId") ?? "",
      status,
      lifecycleSource,
      lifecycleRawValue,
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

  return {
    customers, header: file.header, sheetName: file.sheetName, rowCount: file.rows.length, columnMapping: mapping,
    unmappedColumns, sourcePath: filePath, lifecycleSource, lifecycleSourceColumn,
  };
}
