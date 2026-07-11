// FSA (Food Standards Agency) FHRS source — Vertical Slice 001.
// FSA is FREE / OPEN (OGL) and LIVE-READY. Live pulls are kept small and
// territory-limited. Mock mode is available for offline/deterministic use (pages).
//
// Real API:
//   Base:   https://api.ratings.food.gov.uk
//   Header: x-api-version: 2 ; accept: application/json
//   GET /Establishments?address=<q>&pageNumber=1&pageSize=<n>
// No API key required. We still cap pageSize and query per outward code only.

import type { FsaEstablishment, SourceMode } from "../pipeline/types";

export const FSA_API_BASE = "https://api.ratings.food.gov.uk";
export const FSA_HEADERS = { "x-api-version": "2", accept: "application/json" } as const;

// ---------- mapping ----------
function joinAddress(e: any): string {
  return [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

function isNewlyRegistered(ratingValue: string, ratingDate: string | null, refMs: number): boolean {
  if (/await/i.test(ratingValue)) return true;
  if (!ratingDate) return false;
  const t = Date.parse(ratingDate);
  if (Number.isNaN(t)) return false;
  const days = (refMs - t) / 86_400_000;
  return days >= 0 && days <= 120;
}

function mapApiEstablishment(e: any, refMs: number): FsaEstablishment {
  const geo = e.geocode ?? {};
  const lat = geo.latitude != null ? Number(geo.latitude) : null;
  const lon = geo.longitude != null ? Number(geo.longitude) : null;
  return {
    fhrsId: String(e.FHRSID ?? e.LocalAuthorityBusinessID ?? ""),
    businessName: (e.BusinessName ?? "").toString(),
    businessType: (e.BusinessType ?? "").toString(),
    businessTypeId: e.BusinessTypeID != null ? Number(e.BusinessTypeID) : null,
    ratingValue: (e.RatingValue ?? "").toString(),
    ratingDate: e.RatingDate ?? null,
    postcode: (e.PostCode ?? "").toString(),
    addressLine: joinAddress(e),
    localAuthority: (e.LocalAuthorityName ?? "").toString(),
    latitude: Number.isFinite(lat as number) ? (lat as number) : null,
    longitude: Number.isFinite(lon as number) ? (lon as number) : null,
    newlyRegistered: isNewlyRegistered((e.RatingValue ?? "").toString(), e.RatingDate ?? null, refMs),
  };
}

// ---------- live (small, territory-limited) ----------
export interface FsaLiveOptions {
  pageSize?: number; // capped
  referenceDateMs?: number;
  delayMs?: number; // politeness between prefix calls
}

/** Live search for one address query (outward code). Small page, single page. */
export async function searchFsaByAddress(query: string, opts: FsaLiveOptions = {}): Promise<FsaEstablishment[]> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 200, 1), 500);
  const refMs = opts.referenceDateMs ?? Date.now();
  const url = `${FSA_API_BASE}/Establishments?address=${encodeURIComponent(query)}&pageNumber=1&pageSize=${pageSize}`;
  const res = await fetch(url, { headers: FSA_HEADERS });
  if (!res.ok) throw new Error(`FSA HTTP ${res.status} ${res.statusText} for "${query}"`);
  const data: any = await res.json();
  const list: any[] = Array.isArray(data?.establishments) ? data.establishments : [];
  return list.map((e) => mapApiEstablishment(e, refMs));
}

/**
 * Pull FSA establishments for a set of outward-code prefixes, filter to those
 * prefixes, and dedupe by FHRSID. Sequential + polite. Territory-limited.
 */
export async function pullFsaForTerritories(
  prefixes: string[],
  opts: FsaLiveOptions = {}
): Promise<FsaEstablishment[]> {
  const norm = prefixes.map((p) => p.toUpperCase().replace(/\s+/g, ""));
  const seen = new Set<string>();
  const out: FsaEstablishment[] = [];
  const delay = opts.delayMs ?? 200;
  for (let i = 0; i < prefixes.length; i++) {
    const rows = await searchFsaByAddress(prefixes[i], opts);
    for (const r of rows) {
      const pc = r.postcode.toUpperCase().replace(/\s+/g, "");
      if (!norm.some((p) => pc.startsWith(p))) continue;
      const key = r.fhrsId || `${r.businessName}|${pc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    if (i < prefixes.length - 1 && delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
  return out;
}

// ---------- mock (offline / pages) ----------
const MOCK_FSA: FsaEstablishment[] = [
  { fhrsId: "FHRS-100201", businessName: "Chick & Grill", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "5", ratingDate: "2026-06-30", postcode: "UB1 2AA", addressLine: "12 Broadway, Southall", localAuthority: "Ealing", latitude: 51.5079, longitude: -0.3776, newlyRegistered: true },
  { fhrsId: "FHRS-100204", businessName: "New Flame BBQ", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "5", ratingDate: "2026-07-01", postcode: "HA0 1LT", addressLine: "5 Ealing Rd, Wembley", localAuthority: "Brent", latitude: 51.5442, longitude: -0.2965, newlyRegistered: true },
  { fhrsId: "FHRS-100211", businessName: "Punjab Karahi House", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "5", ratingDate: "2026-06-28", postcode: "UB1 3EU", addressLine: "77 The Broadway", localAuthority: "Ealing", latitude: 51.5096, longitude: -0.3699, newlyRegistered: true },
  { fhrsId: "FHRS-100203", businessName: "Wing It", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "3", ratingDate: "2025-11-02", postcode: "UB2 4RS", addressLine: "88 Norwood Rd", localAuthority: "Ealing", latitude: 51.505, longitude: -0.376, newlyRegistered: false },
  { fhrsId: "FHRS-100206", businessName: "Peri Peri Palace", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "4", ratingDate: "2025-12-10", postcode: "UB2 4RS", addressLine: "9 The Green", localAuthority: "Ealing", latitude: 51.504, longitude: -0.377, newlyRegistered: false },
  { fhrsId: "FHRS-100213", businessName: "Fresh Bites", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "AwaitingInspection", ratingDate: null, postcode: "HA0 2BB", addressLine: "31 Wembley Hill", localAuthority: "Brent", latitude: 51.552, longitude: -0.3, newlyRegistered: true },
  { fhrsId: "FHRS-100220", businessName: "Wembley Grill House", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "4", ratingDate: "2026-06-05", postcode: "HA9 8AA", addressLine: "2 Olympic Way", localAuthority: "Brent", latitude: 51.556, longitude: -0.279, newlyRegistered: true },
  { fhrsId: "FHRS-100221", businessName: "Greenford Fried Chicken", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "2", ratingDate: "2025-08-14", postcode: "UB6 8AB", addressLine: "10 Oldfield Ln", localAuthority: "Ealing", latitude: 51.528, longitude: -0.349, newlyRegistered: false },
  { fhrsId: "FHRS-100212", businessName: "Bench Cafe", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "4", ratingDate: "2025-06-18", postcode: "W5 5DA", addressLine: "2 Haven Green", localAuthority: "Ealing", latitude: 51.514, longitude: -0.301, newlyRegistered: false },
  { fhrsId: "FHRS-100205", businessName: "Old Town Fry", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "1", ratingDate: "2025-09-14", postcode: "UB1 2JJ", addressLine: "40 South Rd", localAuthority: "Ealing", latitude: 51.506, longitude: -0.378, newlyRegistered: false },
  { fhrsId: "FHRS-100208", businessName: "MJ Hardware", businessType: "Retailers - other", businessTypeId: 4613, ratingValue: "Exempt", ratingDate: null, postcode: "UB1 3AA", addressLine: "22 Trade Park", localAuthority: "Ealing", latitude: 51.51, longitude: -0.37, newlyRegistered: false },
  { fhrsId: "FHRS-100207", businessName: "Southall Sweet Centre", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "5", ratingDate: "2025-08-01", postcode: "UB1 3EU", addressLine: "1 The Crescent", localAuthority: "Ealing", latitude: 51.509, longitude: -0.371, newlyRegistered: false },
  { fhrsId: "FHRS-100230", businessName: "W5 Poke Bar", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1, ratingValue: "5", ratingDate: "2026-05-20", postcode: "W5 2NU", addressLine: "44 Uxbridge Rd", localAuthority: "Ealing", latitude: 51.513, longitude: -0.303, newlyRegistered: true },
  { fhrsId: "FHRS-100231", businessName: "Northolt Kebab", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "3", ratingDate: "2026-02-10", postcode: "UB6 0AA", addressLine: "7 Mandeville Rd", localAuthority: "Ealing", latitude: 51.548, longitude: -0.368, newlyRegistered: false },
];

export function getFsaEstablishmentsMock(prefixes: string[]): FsaEstablishment[] {
  const norm = prefixes.map((p) => p.toUpperCase().replace(/\s+/g, ""));
  return MOCK_FSA.filter((e) => {
    const pc = e.postcode.toUpperCase().replace(/\s+/g, "");
    return norm.some((p) => pc.startsWith(p));
  });
}

/** Unified entry: live for mode="live" (script), deterministic mock otherwise (pages). */
export async function getFsaEstablishments(
  prefixes: string[],
  mode: SourceMode,
  opts: FsaLiveOptions = {}
): Promise<FsaEstablishment[]> {
  if (mode === "live") return pullFsaForTerritories(prefixes, opts);
  return getFsaEstablishmentsMock(prefixes);
}
