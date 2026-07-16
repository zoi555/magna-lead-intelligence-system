// Multi-source consolidation (Part 8). Groups likely-same outlets across Just Eat / Uber
// Eats / Deliveroo using strong evidence (phone, full postcode + strong name, same URL, or
// coordinate proximity + name). NEVER merges on name alone. Every source observation is
// retained; conflicts and branch separation are represented, not hidden.

import { randomUUID } from "node:crypto";
import type { SourceOutlet, ConsolidatedCandidate, MatchStatus } from "./types";

const normName = (s: string) => (s ?? "").toLowerCase().replace(/&/g, "and").replace(/\b(ltd|limited|the|restaurant|takeaway)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const normPc = (s: string | null) => (s ?? "").toUpperCase().replace(/\s+/g, "");
const isFullPostcode = (s: string | null) => !!s && /\d[A-Z]{2}$/.test(normPc(s));

function nameOverlap(a: string, b: string): number {
  const ta = new Set(normName(a).split(" ").filter(Boolean));
  const tb = new Set(normName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hits = 0; for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}
function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function urlKey(u: string | null): string | null {
  if (!u) return null;
  try { const url = new URL(u); return `${url.host}${url.pathname}`.toLowerCase().replace(/\/$/, ""); } catch { return u.toLowerCase(); }
}

/** Pairwise evidence between two outlets. Returns null if there is no acceptable link. */
function evidenceFor(a: SourceOutlet, b: SourceOutlet): { kind: MatchStatus; confidence: number; reason: string } | null {
  // exact normalised phone — strongest
  if (a.phone && b.phone && a.phone === b.phone) return { kind: "confirmed_same", confidence: 0.97, reason: "exact phone match" };
  // same public URL (host+path)
  const ua = urlKey(a.source_url), ub = urlKey(b.source_url);
  if (ua && ub && ua === ub) return { kind: "confirmed_same", confidence: 0.95, reason: "same source URL" };
  // full postcode + strong name
  const overlap = nameOverlap(a.name, b.name);
  if (isFullPostcode(a.postcode) && isFullPostcode(b.postcode) && normPc(a.postcode) === normPc(b.postcode)) {
    if (overlap >= 0.5) return { kind: "confirmed_same", confidence: Math.min(0.95, 0.7 + overlap * 0.25), reason: "same full postcode + strong name" };
    if (a.brand && b.brand && normName(a.brand) === normName(b.brand)) return { kind: "ambiguous_manual", confidence: 0.5, reason: "same postcode + brand, weak name — review" };
  }
  // coordinate proximity + name
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    const d = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    if (d <= 120 && overlap >= 0.4) return { kind: "probable_same", confidence: Math.min(0.9, 0.6 + overlap * 0.3), reason: `within ${Math.round(d)}m + name overlap` };
  }
  // same brand, different location → explicitly SEPARATE branches (do not merge)
  if (a.brand && b.brand && normName(a.brand) === normName(b.brand)) return null;   // separate branches; not linked
  return null;   // never merge on name alone
}

/** Consolidate outlets from all sources into candidates. */
export function consolidate(outlets: SourceOutlet[]): ConsolidatedCandidate[] {
  const parent = outlets.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (x: number, y: number) => { parent[find(x)] = find(y); };
  const links: { i: number; j: number; ev: NonNullable<ReturnType<typeof evidenceFor>> }[] = [];

  for (let i = 0; i < outlets.length; i++) {
    for (let j = i + 1; j < outlets.length; j++) {
      const ev = evidenceFor(outlets[i], outlets[j]);
      if (ev) { union(i, j); links.push({ i, j, ev }); }
    }
  }

  const groups = new Map<number, number[]>();
  outlets.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });

  const candidates: ConsolidatedCandidate[] = [];
  for (const idxs of groups.values()) {
    const src = idxs.map((i) => outlets[i]);
    const groupLinks = links.filter((l) => idxs.includes(l.i) && idxs.includes(l.j));
    const evidence = [...new Set(groupLinks.map((l) => l.ev.reason))];
    // conflicts: differing full postcode or brand within a merged group
    const conflicts: string[] = [];
    const fullPcs = [...new Set(src.filter((o) => isFullPostcode(o.postcode)).map((o) => normPc(o.postcode)))];
    if (fullPcs.length > 1) conflicts.push(`differing postcodes: ${fullPcs.join(", ")}`);
    const brands = [...new Set(src.filter((o) => o.brand).map((o) => normName(o.brand!)))];
    if (brands.length > 1) conflicts.push(`differing brands: ${brands.join(", ")}`);

    const strongest = groupLinks.reduce<MatchStatus | null>((acc, l) => rankStatus(l.ev.kind) > rankStatus(acc) ? l.ev.kind : acc, null);
    let matchStatus: MatchStatus = src.length === 1 ? "confirmed_same" : (strongest ?? "ambiguous_manual");
    if (conflicts.length) matchStatus = "source_conflict";
    const confidence = src.length === 1 ? 1 : Math.max(0, ...groupLinks.map((l) => l.ev.confidence));

    const primary = src.find((o) => o.phone) ?? src.find((o) => isFullPostcode(o.postcode)) ?? src[0];
    const times = src.map((o) => o.observed_at).sort();
    candidates.push({
      id: randomUUID(),
      name: primary.name, brand: primary.brand, postcode: primary.postcode, phone: primary.phone,
      latitude: primary.latitude, longitude: primary.longitude,
      sources: src, sourceNames: [...new Set(src.map((o) => o.source))],
      matchStatus, confidence, evidence, conflicts,
      ratingsBySource: Object.fromEntries(src.map((o) => [o.source, { rating: o.rating, count: o.review_count }])),
      firstSeen: times[0], lastSeen: times[times.length - 1],
    });
  }
  return candidates;
}

function rankStatus(s: MatchStatus | null): number {
  return s === "confirmed_same" ? 3 : s === "probable_same" ? 2 : s === "ambiguous_manual" ? 1 : 0;
}
