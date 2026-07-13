// Customer list import — NOW sprint. Flexible CSV loader for the real Sales Pro /
// customer master. Real customer data is NEVER committed. If no file is present the
// pipeline still runs (customer exclusion is then NOT guaranteed).

import fs from "node:fs";
import path from "node:path";
import type { CustomerAccountStatus } from "../pipeline/types";

export interface ImportedCustomer {
  customer_code: string;
  sales_pro_customer_id: string;
  customer_name: string;
  trading_name: string;
  account_status: CustomerAccountStatus;
  raw_status: string;
  postcode: string;
  address: string;
  phone: string;
  email: string;
  route: string;
  sales_rep: string;
  last_order_date: string;
  notes: string;
}

const ACCEPTED_PATHS = [
  "imports/customer-list.csv",
  "imports/customers.csv",
  "imports/sales-pro-customers.csv",
  "data/imports/customer-list.csv",
  "data/imports/sales-pro-customers.csv",
];

export function findCustomerImportPath(): string | null {
  for (const rel of ACCEPTED_PATHS) {
    const p = path.join(process.cwd(), rel);
    if (fs.existsSync(p)) return rel;
  }
  return null;
}

// --- minimal CSV parser (quoted fields, commas, newlines) ---
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function pick(r: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (r[k]) return r[k];
  return "";
}

/** Normalise any raw status text into a standard account status. */
export function normaliseAccountStatus(raw: string, hasCode: boolean): CustomerAccountStatus {
  const s = (raw || "").toLowerCase();
  if (/dead|closed|lost|former|terminat|suspend|ceased|do not|blacklist|stop(ped)?/.test(s)) return "Former / Closed Account";
  if (/dormant|inactive|no orders|no recent|lapsed/.test(s)) return "Dormant Account";
  if (/active|live|current|trading|open/.test(s)) return "Active Account";
  return hasCode ? "Unknown Existing Account" : "Unknown Existing Account";
}

export interface CustomerImportResult {
  loaded: boolean;
  path: string | null;
  customers: ImportedCustomer[];
  rowsLoaded: number;
}

export function loadCustomerList(): CustomerImportResult {
  const rel = findCustomerImportPath();
  if (!rel) return { loaded: false, path: null, customers: [], rowsLoaded: 0 };
  let rows: Record<string, string>[] = [];
  try { rows = parseCsv(fs.readFileSync(path.join(process.cwd(), rel), "utf8")); }
  catch { return { loaded: false, path: rel, customers: [], rowsLoaded: 0 }; }

  const customers: ImportedCustomer[] = rows.map((r) => {
    const code = pick(r, "customer_code", "code", "id", "internal_id");
    // Real CRM exports carry an "Inactive" flag and a free-text "Status".
    const inactive = /^(yes|true|t|1|y)$/i.test(pick(r, "inactive"));
    const statusText = pick(r, "account_status", "status");
    const raw_status = statusText || (inactive ? "inactive" : "");
    const address = pick(r, "address", "shipping_address", "billing_address") ||
      [pick(r, "billing_address_1", "address_1"), pick(r, "billing_address_2", "address_2"), pick(r, "billing_city", "town")].filter(Boolean).join(", ");
    // Postcode: prefer a full postcode column, fall back to zip / outward code.
    const postcode = pick(r, "postcode", "post_code", "billing_zip", "shipping_zip", "zip", "outward_code");
    return {
      customer_code: code,
      sales_pro_customer_id: pick(r, "sales_pro_customer_id", "salespro_id", "sales_pro_id", "account_number"),
      customer_name: pick(r, "customer_name", "name", "company_name"),
      trading_name: pick(r, "trading_name", "trading_as", "company_name"),
      account_status: normaliseAccountStatus(raw_status, Boolean(code)),
      raw_status,
      postcode,
      address,
      phone: pick(r, "phone", "telephone", "tel", "office_phone"),
      email: pick(r, "email"),
      route: pick(r, "route", "territory"),
      sales_rep: pick(r, "sales_rep", "rep"),
      last_order_date: pick(r, "last_order_date", "last_order", "date_of_first_sale"),
      notes: pick(r, "notes"),
    };
  });
  return { loaded: true, path: rel, customers, rowsLoaded: customers.length };
}
