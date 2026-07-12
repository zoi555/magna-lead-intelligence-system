// Existing-customer matching — Phase 4.
// Import-ready structure + matching logic. Real customer data is NOT used yet
// (mock master in mock-existing-customers.ts). No financials stored.

export interface CustomerRecord {
  customer_code: string;
  customer_name: string;
  trading_name: string;
  postcode: string;
  address: string;
  phone: string;
  email: string;
  status: string; // active | lapsed | prospect | closed
  last_order_date: string;
  route: string;
  sales_rep: string;
  notes: string;
}

export type MatchStatus = "existing_customer_match" | "possible_existing_customer" | "no_match";
export interface MatchResult {
  status: MatchStatus;
  confidence: number; // 0..1
  reason: string;
  matched_code?: string;
}

export const CUSTOMER_IMPORT_COLUMNS: (keyof CustomerRecord)[] = [
  "customer_code", "customer_name", "trading_name", "postcode", "address", "phone",
  "email", "status", "last_order_date", "route", "sales_rep", "notes",
];

function normName(s: string): string { return (s || "").toLowerCase().replace(/\b(ltd|limited|the|co|uk|restaurant|cafe|takeaway)\b/g, "").replace(/[^a-z0-9]/g, ""); }
function normPc(s: string): string { return (s || "").toUpperCase().replace(/\s+/g, ""); }
function outward(s: string): string { return (s || "").toUpperCase().trim().split(/\s+/)[0] ?? ""; }
function normPhone(s: string): string { return (s || "").replace(/\D/g, ""); }
function tokens(s: string): Set<string> { return new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)); }
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter++; });
  return inter / (a.size + b.size - inter);
}

/**
 * Match a candidate against the customer master.
 * - exact postcode + normalised name (or trading name) → high-confidence match
 * - phone match (when available) → high-confidence match
 * - fuzzy name overlap + same outward postcode → POSSIBLE (manual review)
 * - postcode-only is NOT sufficient to exclude → at most possible/manual review
 */
export function matchCustomer(name: string, postcode: string, phone: string | undefined, master: CustomerRecord[]): MatchResult {
  const nn = normName(name), npc = normPc(postcode), out = outward(postcode), nph = normPhone(phone ?? "");
  const nameTokens = tokens(name);

  for (const c of master) {
    const cpc = normPc(c.postcode);
    const cn = normName(c.customer_name), ctn = normName(c.trading_name);
    if (npc && cpc === npc && (cn === nn || (ctn && ctn === nn))) {
      return { status: "existing_customer_match", confidence: 0.97, reason: "Exact postcode + name match", matched_code: c.customer_code };
    }
    if (nph && normPhone(c.phone) && normPhone(c.phone) === nph) {
      return { status: "existing_customer_match", confidence: 0.95, reason: "Phone match", matched_code: c.customer_code };
    }
  }

  // fuzzy: strong name overlap in the same outward code → possible (manual review)
  let best: { c: CustomerRecord; j: number } | null = null;
  for (const c of master) {
    if (outward(c.postcode) !== out) continue;
    const j = Math.max(jaccard(nameTokens, tokens(c.customer_name)), jaccard(nameTokens, tokens(c.trading_name)));
    if (j >= 0.5 && (!best || j > best.j)) best = { c, j };
  }
  if (best) return { status: "possible_existing_customer", confidence: Math.min(0.85, best.j), reason: `Similar name in ${out} (review)`, matched_code: best.c.customer_code };

  return { status: "no_match", confidence: 0, reason: "No customer match" };
}
