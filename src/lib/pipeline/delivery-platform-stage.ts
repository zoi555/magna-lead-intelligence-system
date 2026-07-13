// Delivery-platform presence stage — NOW sprint. Just Eat / Uber Eats / Deliveroo.
// Import/manual/evidence-URL only. NO scraping, login, captcha bypass, proxies, or
// bulk copying. Every lead gets a per-platform status; unknown/not_checked never blocks.

import fs from "node:fs";
import path from "node:path";
import { normalisePlatformImportRow, matchPlatformEvidenceToLead, type PlatformEvidenceRow } from "../sources/delivery-platforms";
import type { PlatformStatusValue, PlatformCell, LeadPlatformPresence } from "./types";

export type PlatformKey = "uber_eats" | "deliveroo" | "just_eat";
export const STAGE_PLATFORMS: PlatformKey[] = ["uber_eats", "deliveroo", "just_eat"];

const EVIDENCE_PATHS = ["imports/delivery-platform-presence.csv", "data/imports/delivery-platform-presence.csv"];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export interface DeliveryEvidenceLoad { loaded: boolean; path: string | null; rows: PlatformEvidenceRow[] }
export function loadDeliveryEvidence(): DeliveryEvidenceLoad {
  for (const rel of EVIDENCE_PATHS) {
    const p = path.join(process.cwd(), rel);
    if (!fs.existsSync(p)) continue;
    try {
      const rows = parseCsv(fs.readFileSync(p, "utf8")).map((r) => normalisePlatformImportRow(r));
      return { loaded: true, path: rel, rows };
    } catch { return { loaded: false, path: rel, rows: [] }; }
  }
  return { loaded: false, path: null, rows: [] };
}

/** Public search URL (a link only — no fetching/scraping). */
function searchUrl(platform: PlatformKey, name: string, postcode: string): string {
  const q = encodeURIComponent(`${name} ${postcode}`.trim());
  if (platform === "uber_eats") return `https://www.ubereats.com/gb/search?q=${q}`;
  if (platform === "deliveroo") return `https://deliveroo.co.uk/search?q=${q}`;
  return `https://www.just-eat.co.uk/search?q=${q}`;
}

function mapImportStatus(s: string): PlatformStatusValue {
  if (s === "present" || s === "absent" || s === "unknown" || s === "not_checked" || s === "manual_review_required") return s;
  return "not_checked";
}

/** Build per-platform presence for one lead from imported evidence (falls back to search URLs). */
export function buildDeliveryPresence(lead: { businessName: string; postcode: string }, evidence: PlatformEvidenceRow[]): LeadPlatformPresence {
  const perPlatform = {} as Record<PlatformKey, PlatformCell>;
  const warnings = new Set<string>();
  let confSum = 0, confN = 0;
  for (const p of STAGE_PLATFORMS) {
    let cell: PlatformCell = { status: "not_checked", evidence_url: searchUrl(p, lead.businessName, lead.postcode), confidence: 0 };
    for (const e of evidence.filter((x) => x.platform === p)) {
      const m = matchPlatformEvidenceToLead(e, lead);
      if (m.matched && m.confidence >= 0.5) { cell = { status: mapImportStatus(e.presence_status), evidence_url: e.evidence_url || cell.evidence_url, confidence: Math.min(1, (e.confidence || 0.8) * m.confidence) }; break; }
      if (m.confidence >= 0.3 && cell.status === "not_checked") { cell = { status: "manual_review_required", evidence_url: e.evidence_url || cell.evidence_url, confidence: m.confidence }; }
    }
    perPlatform[p] = cell;
    if (cell.status === "not_checked" || cell.status === "unknown") warnings.add("DELIVERY_PLATFORM_NOT_CHECKED");
    if (cell.status === "manual_review_required") warnings.add("PLATFORM_CHECK_MANUAL_REQUIRED");
    confSum += cell.confidence; confN++;
  }
  warnings.add("PLATFORM_TERMS_RISK");
  const present = STAGE_PLATFORMS.filter((p) => perPlatform[p].status === "present").length;
  const manual = STAGE_PLATFORMS.some((p) => perPlatform[p].status === "manual_review_required");
  const summary = present > 0 ? `present on ${present}/3` : manual ? "manual review" : "not checked";
  return { perPlatform, summary, confidence: confN ? Math.round((confSum / confN) * 100) / 100 : 0, warnings: Array.from(warnings) };
}
