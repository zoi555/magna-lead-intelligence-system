// Accounts document parser — NOW SPRINT #2 (CH-FIN-1).
// Best-effort iXBRL / XBRL extraction of a FEW headline figures from a Companies
// House accounts document. We NEVER invent values: a field is null unless it was
// actually present in the document. PDF-only accounts are not parsed tonight.
//
// iXBRL tags look like:
//   <ix:nonFraction name="core:NetAssetsLiabilities" ... sign="-">1,234</ix:nonFraction>
// Concept names vary across taxonomies, so we match by keyword on the name attribute.

export interface ExtractedFinancials {
  fields: Record<string, number | string | null>;
  extractionConfidence: number; // 0..1
  extractionSource: string; // xbrl | ixbrl | unavailable
  parsedCount: number;
}

// Map our output field → keyword patterns to match against the XBRL concept name.
const FIELD_PATTERNS: Record<string, RegExp> = {
  turnover: /turnover(?!.*cost)|revenuefromcontracts|grossrevenue\b/i,
  revenue: /\brevenue\b|turnoverrevenue/i,
  gross_profit: /grossprofit/i,
  operating_profit: /operatingprofit/i,
  profit_loss_before_tax: /profitlossbeforetax|profitlossonordinaryactivitiesbeforetax/i,
  profit_loss_after_tax: /profitloss\b|profitlossfortheperiod|profitlossaftertax/i,
  cash_bank_in_hand: /cashbank(onhand|inhand)|cashcashequivalents/i,
  current_assets: /(?<!net)currentassets\b/i,
  current_liabilities: /currentliabilities|creditorsfallingduewithinoneyear/i,
  net_current_assets_liabilities: /netcurrentassets/i,
  total_assets_less_current_liabilities: /totalassetslesscurrentliabilities/i,
  net_assets_liabilities: /netassetsliabilities|shareholdersfunds|equity\b/i,
  creditors_due_within_one_year: /creditors.*withinoneyear/i,
  creditors_due_after_one_year: /creditors.*afteroneyear/i,
  employees_average_number: /averagenumberemployees|employeestotal/i,
};

function toNumber(raw: string, sign: string | null, scale: string | null): number | null {
  const cleaned = raw.replace(/[,\s£$€]/g, "").replace(/[()]/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (scale) { const s = Number(scale); if (Number.isFinite(s)) n *= Math.pow(10, s); }
  if (sign === "-" || /^\(.*\)$/.test(raw.trim())) n = -Math.abs(n);
  return n;
}

/** Parse iXBRL/XBRL text. Returns only fields actually present. */
export function parseAccountsDocument(content: string | null, format: string | null): ExtractedFinancials {
  const out: ExtractedFinancials = { fields: {}, extractionConfidence: 0, extractionSource: "unavailable", parsedCount: 0 };
  if (!content) return out;

  // Collect every tagged numeric fact: name attr + inner text + sign/scale.
  const facts: { name: string; value: string; sign: string | null; scale: string | null }[] = [];
  const tagRe = /<(?:ix:nonFraction|ix:nonNumeric)\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ix:nonFraction|ix:nonNumeric)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    const name = m[1];
    const inner = m[2].replace(/<[^>]+>/g, "").trim();
    const attrs = m[0];
    const sign = /\bsign="(-)"/i.exec(attrs)?.[1] ?? null;
    const scale = /\bscale="(-?\d+)"/i.exec(attrs)?.[1] ?? null;
    facts.push({ name, value: inner, sign, scale });
  }
  // Plain XBRL (non-inline): <ns:Turnover ...>123</ns:Turnover>
  if (!facts.length) {
    const xbrlRe = /<([a-zA-Z][\w-]*:[A-Za-z][\w-]+)\b[^>]*>([\d.,()\-\s]+)<\/\1>/g;
    while ((m = xbrlRe.exec(content)) !== null) facts.push({ name: m[1], value: m[2].trim(), sign: null, scale: null });
  }
  if (!facts.length) return out;

  const source = /<ix:/i.test(content) ? "ixbrl" : "xbrl";
  const compact = (s: string) => s.replace(/[^a-z0-9]/gi, "");
  for (const [field, pat] of Object.entries(FIELD_PATTERNS)) {
    // First matching fact wins (documents usually list the current period first).
    const hit = facts.find((f) => pat.test(compact(f.name)));
    if (!hit) continue;
    if (field === "employees_average_number") {
      const n = toNumber(hit.value, hit.sign, hit.scale);
      if (n != null) { out.fields[field] = n; out.parsedCount++; }
      continue;
    }
    const n = toNumber(hit.value, hit.sign, hit.scale);
    if (n != null) { out.fields[field] = n; out.parsedCount++; }
  }

  // Period + currency (best-effort).
  const startCtx = /<(?:xbrli:)?startDate>([\d-]+)<\/(?:xbrli:)?startDate>/i.exec(content);
  const endCtx = /<(?:xbrli:)?endDate>([\d-]+)<\/(?:xbrli:)?endDate>/i.exec(content);
  const instant = /<(?:xbrli:)?instant>([\d-]+)<\/(?:xbrli:)?instant>/i.exec(content);
  if (startCtx) out.fields.period_start = startCtx[1];
  if (endCtx) out.fields.period_end = endCtx[1];
  else if (instant) out.fields.period_end = instant[1];
  const cur = /unitRef="[^"]*"|<(?:xbrli:)?measure>iso4217:([A-Z]{3})/i.exec(content);
  out.fields.currency = /iso4217:GBP/i.test(content) ? "GBP" : (cur?.[1] ?? "GBP");

  out.extractionSource = source;
  out.extractionConfidence = out.parsedCount >= 4 ? 0.8 : out.parsedCount >= 2 ? 0.6 : out.parsedCount >= 1 ? 0.4 : 0;
  return out;
}
