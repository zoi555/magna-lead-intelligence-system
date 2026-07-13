// Customer exclusion — NOW sprint. Matches a lead against the imported customer list
// and returns a CustomerAccountStatus + decision. Strict: postcode-only is never an
// automatic exclusion. Only "New Prospect Candidate" proceeds to the sales export.
//
// A CustomerIndex is built ONCE from the master list (7k+ rows) so per-lead matching
// is O(bucket) instead of O(all customers).

import type { CustomerMatchInfo, CustomerAccountStatus } from "./types";
import type { ImportedCustomer } from "../sources/customer-list-import";

export type ExclusionDecision = "exclude" | "hold" | "proceed";

function normName(s: string): string { return (s || "").toLowerCase().replace(/\b(ltd|limited|the|co|uk|restaurant|cafe|takeaway)\b/g, "").replace(/[^a-z0-9]/g, ""); }
function normPc(s: string): string { return (s || "").toUpperCase().replace(/\s+/g, ""); }
function outward(s: string): string {
  const p = normPc(s);
  // Full UK postcode → strip the 3-char inward part; otherwise treat as an outward code.
  return p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(0, p.length - 3) : p;
}
function normPhone(s: string): string { return (s || "").replace(/\D/g, ""); }
function tokens(s: string): Set<string> { return new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)); }
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach((t) => { if (b.has(t)) inter++; });
  return inter / (a.size + b.size - inter);
}

export interface ExclusionInput {
  businessName: string;
  postcode: string;
  phone?: string;
  fsaCode?: string; // FSA business id (not a customer id, but used to catch exact-id imports)
}

interface IndexedCustomer {
  c: ImportedCustomer;
  nname: string;
  ntrading: string;
  npc: string;
  nphone: string;
  nameTokens: Set<string>;
  tradingTokens: Set<string>;
}

export interface CustomerIndex {
  count: number;
  byId: Map<string, ImportedCustomer>;
  byPhone: Map<string, ImportedCustomer>;
  byNamePc: Map<string, ImportedCustomer>; // `${nname}|${npc}` and `${ntrading}|${npc}`
  byPc: Map<string, ImportedCustomer>; // full postcode → any customer there
  byOutward: Map<string, IndexedCustomer[]>;
}

/** Build the match index once from the whole customer master. */
export function buildCustomerIndex(master: ImportedCustomer[]): CustomerIndex {
  const idx: CustomerIndex = {
    count: master.length,
    byId: new Map(), byPhone: new Map(), byNamePc: new Map(), byPc: new Map(), byOutward: new Map(),
  };
  for (const c of master) {
    const nname = normName(c.customer_name);
    const ntrading = normName(c.trading_name);
    const npc = normPc(c.postcode);
    const nphone = normPhone(c.phone);
    if (c.sales_pro_customer_id) idx.byId.set(c.sales_pro_customer_id, c);
    if (nphone) idx.byPhone.set(nphone, c);
    if (npc) {
      if (nname) idx.byNamePc.set(`${nname}|${npc}`, c);
      if (ntrading) idx.byNamePc.set(`${ntrading}|${npc}`, c);
      if (!idx.byPc.has(npc)) idx.byPc.set(npc, c);
    }
    const out = outward(c.postcode);
    if (out) {
      const bucket = idx.byOutward.get(out) ?? [];
      bucket.push({ c, nname, ntrading, npc, nphone, nameTokens: tokens(c.customer_name), tradingTokens: tokens(c.trading_name) });
      idx.byOutward.set(out, bucket);
    }
  }
  return idx;
}

const EMPTY_INDEX: CustomerIndex = buildCustomerIndex([]);

/** Classify a lead against the customer index. */
export function classifyCustomer(lead: ExclusionInput, index: CustomerIndex = EMPTY_INDEX): { match: CustomerMatchInfo; decision: ExclusionDecision } {
  const nn = normName(lead.businessName), npc = normPc(lead.postcode), out = outward(lead.postcode), nph = normPhone(lead.phone ?? "");
  const nameTokens = tokens(lead.businessName);

  const mk = (status: CustomerAccountStatus, match_type: string, confidence: number, reason: string, c?: ImportedCustomer): CustomerMatchInfo => ({
    status, match_type, confidence, reason, matched_code: c?.customer_code, matched_name: c?.customer_name,
  });
  const excludeStatus = (c: ImportedCustomer): CustomerAccountStatus => c.account_status; // Active/Dormant/Former/Unknown

  // Exact identifiers / phone / name+postcode → exclude at the matched account status.
  if (lead.fsaCode) { const c = index.byId.get(lead.fsaCode); if (c) return { match: mk(excludeStatus(c), "exact_id", 0.99, "Exact Sales Pro id match", c), decision: "exclude" }; }
  if (nph) { const c = index.byPhone.get(nph); if (c) return { match: mk(excludeStatus(c), "phone", 0.96, "Exact phone match", c), decision: "exclude" }; }
  if (npc && nn) { const c = index.byNamePc.get(`${nn}|${npc}`); if (c) return { match: mk(excludeStatus(c), "name_postcode", 0.97, "Exact name + postcode", c), decision: "exclude" }; }

  // Fuzzy within the same outward code only.
  let best: { c: ImportedCustomer; j: number } | null = null;
  for (const ic of index.byOutward.get(out) ?? []) {
    const j = Math.max(jaccard(nameTokens, ic.nameTokens), jaccard(nameTokens, ic.tradingTokens));
    if (j >= 0.4 && (!best || j > best.j)) best = { c: ic.c, j };
  }
  if (best && best.j >= 0.7) return { match: mk(excludeStatus(best.c), "fuzzy_high", best.j, "Strong fuzzy name + postcode", best.c), decision: "exclude" };
  if (best && best.j >= 0.4) return { match: mk("Possible Existing Account", "fuzzy_medium", best.j, "Medium fuzzy name + postcode — review", best.c), decision: "hold" };

  // Postcode-only (a customer exists at this postcode but no name/phone/id match) → hold, never auto-exclude.
  if (npc) { const c = index.byPc.get(npc); if (c) return { match: mk("Possible Existing Account", "postcode_only", 0.3, "Customer at same postcode — review (never auto-excluded)", c), decision: "hold" }; }

  return { match: mk("New Prospect Candidate", "none", 0, "No customer match"), decision: "proceed" };
}
