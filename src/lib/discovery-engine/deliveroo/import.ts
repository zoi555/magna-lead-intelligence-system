// Controlled Deliveroo import paths — mirrors uber-eats/import.ts exactly. No live scraping,
// no anti-bot bypass. The one bounded public-flow test (2026-07-21, docs/72) found the
// assumed public search URL returns Deliveroo's own honest 404 ("Page Not Found") — not a
// bot challenge (no Cloudflare/PerimeterX block page) — so no lawful discovery URL is
// confirmed yet. Three accepted inputs while that remains true:
//   1. Authorised API records (already-parsed JS objects from an official/partner API response)
//   2. Licensed commercial-provider JSON (an array of provider records, any shape
//      `parseDeliverooRestaurant` already tolerates — see parse.ts)
//   3. A controlled CSV in the exact column layout below (manual/licensed-export import)

import type { SourceOutlet } from "../consolidation/types";
import { parseDeliverooRestaurant } from "./parse";

/** Authorised API records or licensed-provider JSON — an array of raw provider objects. */
export function importDeliverooJson(records: unknown[], observedAt: string): SourceOutlet[] {
  if (!Array.isArray(records)) throw new Error("importDeliverooJson expects an array of records");
  return records.map((r) => parseDeliverooRestaurant(r, observedAt)).filter((o) => o.source_outlet_id && o.name);
}

/** Controlled CSV columns (see templates/deliveroo-import-template.csv). */
export const DELIVEROO_CSV_COLUMNS = [
  "source_outlet_id", "source_url", "name", "brand", "address1", "address2", "postcode",
  "latitude", "longitude", "phone", "rating", "review_count", "cuisines",
  "is_delivery", "is_collection", "delivery_fee", "service_fee", "minimum_order", "eta_minutes",
  "is_sponsored", "is_open", "image_url",
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

/** Controlled CSV import — every row maps through the same field-honesty rules as JSON/API
 *  input: a blank cell is null, never fabricated or defaulted. */
export function importDeliverooCsv(csvText: string, observedAt: string): SourceOutlet[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(parseCsvLine);

  const outlets: SourceOutlet[] = [];
  for (const row of rows) {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = row[i] ?? ""; });
    if (!rec.source_outlet_id || !rec.name) continue; // required fields absent — skip, never fabricate

    const raw = {
      id: rec.source_outlet_id,
      url: rec.source_url || null,
      name: rec.name,
      brand: rec.brand || null,
      address: { address1: rec.address1 || null, address2: rec.address2 || null, postcode: rec.postcode || null },
      location: { lat: csvNum(rec.latitude), lon: csvNum(rec.longitude) },
      phone: rec.phone || null,
      rating: csvNum(rec.rating),
      numberOfReviews: csvNum(rec.review_count),
      cuisines: rec.cuisines ? rec.cuisines.split(";").map((c) => c.trim()).filter(Boolean) : [],
      deliverable: csvBool(rec.is_delivery),
      collection: csvBool(rec.is_collection),
      deliveryFee: csvNum(rec.delivery_fee) != null ? Number(rec.delivery_fee) * 100 : null, // parser expects minor units
      serviceFee: csvNum(rec.service_fee) != null ? Number(rec.service_fee) * 100 : null,
      minimumOrderValue: csvNum(rec.minimum_order) != null ? Number(rec.minimum_order) * 100 : null,
      prepTime: csvNum(rec.eta_minutes),
      promoted: csvBool(rec.is_sponsored),
      isOpen: csvBool(rec.is_open),
      image: rec.image_url || null,
    };
    outlets.push(parseDeliverooRestaurant(raw, observedAt));
  }
  return outlets;
}
