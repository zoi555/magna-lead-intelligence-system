// Controlled Uber Eats import paths — the ONLY way live-shaped Uber Eats data enters this
// adapter while `sourceAuthorised: false` (see source-registry.ts). No live scraping, no
// anti-bot bypass. Three accepted inputs:
//   1. Authorised API records (already-parsed JS objects from an official/partner API response)
//   2. Licensed commercial-provider JSON (an array of provider records, any of the shapes
//      `parseUberEatsStore` already tolerates — see parse.ts)
//   3. A controlled CSV in the exact column layout below (manual/licensed-export import)
// All three route through the SAME calibrated mapper (`parseUberEatsStore`) so canonical
// field coverage and honesty rules (never fabricate) are identical regardless of entry point.

import type { SourceOutlet } from "../consolidation/types";
import { parseUberEatsStore } from "./parse";

/** Authorised API records or licensed-provider JSON — an array of raw provider objects. */
export function importUberEatsJson(records: unknown[], observedAt: string): SourceOutlet[] {
  if (!Array.isArray(records)) throw new Error("importUberEatsJson expects an array of records");
  return records.map((r) => parseUberEatsStore(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}

/** Controlled CSV columns (see templates/uber-eats-import-template.csv). Unknown/extra
 *  columns are ignored; missing columns → null (never fabricated), matching parse.ts rules. */
export const UBER_EATS_CSV_COLUMNS = [
  "source_outlet_id", "source_url", "name", "brand", "address", "city", "postcode",
  "latitude", "longitude", "phone", "rating", "review_count", "cuisines",
  "is_delivery", "is_collection", "delivery_fee", "minimum_order", "eta_minutes",
  "is_sponsored", "logo_url", "is_open",
] as const;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function csvBool(v: string | undefined): boolean | null {
  if (v === undefined || v === "") return null;
  const t = v.trim().toLowerCase();
  if (["true", "yes", "1"].includes(t)) return true;
  if (["false", "no", "0"].includes(t)) return false;
  return null;
}
function csvNum(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Controlled CSV import — the licensed/manual-export path. Every row is mapped through the
 *  same field-honesty rules: a blank cell is null, never fabricated or defaulted. */
export function importUberEatsCsv(csvText: string, observedAt: string): SourceOutlet[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(parseCsvLine);

  const outlets: SourceOutlet[] = [];
  for (const row of rows) {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = row[i] ?? ""; });
    if (!rec.source_outlet_id || !rec.name) continue; // required fields absent — skip, never fabricate an id/name

    // Build a raw-shaped object so it flows through the same calibrated mapper as JSON/API input.
    const raw = {
      uuid: rec.source_outlet_id,
      url: rec.source_url || null,
      title: rec.name,
      brand: rec.brand || null,
      address: {
        address: rec.address || null,
        city: rec.city || null,
        postalCode: rec.postcode || null,
        lat: csvNum(rec.latitude),
        lng: csvNum(rec.longitude),
      },
      phoneNumber: rec.phone || null,
      rating: csvNum(rec.rating),
      ratingCount: csvNum(rec.review_count),
      cuisineList: rec.cuisines ? rec.cuisines.split(";").map((c) => c.trim()).filter(Boolean) : [],
      supportedDiningModes: [
        csvBool(rec.is_delivery) ? "DELIVERY" : null,
        csvBool(rec.is_collection) ? "PICKUP" : null,
      ].filter(Boolean),
      deliveryFee: csvNum(rec.delivery_fee) != null ? Number(rec.delivery_fee) * 100 : null, // parser expects minor units
      minOrder: csvNum(rec.minimum_order) != null ? Number(rec.minimum_order) * 100 : null,
      etaMinMinutes: csvNum(rec.eta_minutes),
      sponsored: csvBool(rec.is_sponsored),
      logoUrl: rec.logo_url || null,
      isOpen: csvBool(rec.is_open),
    };
    outlets.push(parseUberEatsStore(raw, observedAt));
  }
  return outlets;
}
