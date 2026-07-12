// Telesales safe view — Phase 11. The ONLY boundary that produces telesales rows.
// Safe fields only. NEVER expose: internal score, score reasons, matching internals,
// confidence, Companies House financials, enrichment internals, customer-match details.

import type { FinalLeadRow } from "./types";

export interface TelesalesSafeLead {
  business_name: string;
  postcode: string;
  phone: string;
  category: string;
  trigger_reason: string;
  assigned_rep: string;
  worked_status: "Open" | "In progress" | "Contacted";
  source_warning: string;
}

export const TELESALES_ALLOWED_KEYS: (keyof TelesalesSafeLead)[] = [
  "business_name", "postcode", "phone", "category", "trigger_reason", "assigned_rep", "worked_status", "source_warning",
];

// Defense-in-depth: even an allow-listed key must not contain a restricted token.
// (Note: the allow-list check below is authoritative; this is a second guard.)
const RESTRICTED_KEY = /(^|_)score|score_reason|confidence|financ|companies?_?house|enrichment|internal|disqualif|manual_review|delivery_source|delivery_risk|evidence|customer_?code|company_?number|match_confidence/i;

/** Throws if an object carries any non-allowed or restricted field. */
export function assertNoRestrictedTelesalesFields(obj: Record<string, unknown>): void {
  const allowed = new Set<string>(TELESALES_ALLOWED_KEYS as string[]);
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) throw new Error(`Telesales safe view: unexpected field "${k}"`);
    if (RESTRICTED_KEY.test(k)) throw new Error(`Telesales safe view: restricted field "${k}"`);
  }
}

const REPS = ["Jaspreet S", "Raj K", "Aisha M"];
const WORKED: TelesalesSafeLead["worked_status"][] = ["Open", "In progress", "Contacted"];

/** Project one lead to the safe shape. Phone comes from Google Places (disabled) → empty today. */
export function toTelesalesSafeLead(l: FinalLeadRow, i: number): TelesalesSafeLead {
  const phone = ""; // no phone source enabled yet
  const warns: string[] = [];
  if (!/present/i.test(l.platform_presence_status)) warns.push("delivery not verified");
  if (!phone) warns.push("no phone");
  const safe: TelesalesSafeLead = {
    business_name: l.business_name,
    postcode: l.postcode,
    phone,
    category: l.business_type,
    trigger_reason: l.trigger_reason,
    assigned_rep: REPS[i % REPS.length],
    worked_status: WORKED[i % WORKED.length],
    source_warning: warns.join(" · "),
  };
  assertNoRestrictedTelesalesFields(safe as unknown as Record<string, unknown>);
  return safe;
}

/** Build the telesales queue — only export-eligible leads reach telesales. */
export function toTelesalesSafeQueue(leads: FinalLeadRow[]): TelesalesSafeLead[] {
  return leads.filter((l) => l.export_status === "ready_for_review").map((l, i) => toTelesalesSafeLead(l, i));
}
