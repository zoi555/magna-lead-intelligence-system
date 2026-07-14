// TW map data API — serves the INDEPENDENT review workflow (clean / manual review /
// excluded) at RUNTIME from the sales-safe export files. Falls back to the raw
// platform-first file if the independent files are missing. No lead rows are copied
// into src/; nothing sensitive (API keys, customer internals, directors, CH financials,
// internal scores, raw payloads) is returned. exports/ stays gitignored.

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const CLEAN = "exports/tw-independent-ready-to-call.csv";
const MANUAL = "exports/tw-independent-manual-review-master.csv";
const EXCLUDED = "exports/tw-independent-excluded-brands-and-non-targets.csv";
const WORKFLOW_SUMMARY = "exports/tw-independent-review-workflow-summary.json";
const FALLBACK = "exports/tw-platform-first-sales-list-ready-to-call.csv";

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
  const data = rows.filter((r) => !r[0].startsWith("#"));
  if (!data.length) return [];
  const headers = data[0];
  return data.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}
function readCsv(rel: string): Record<string, string>[] { try { return parseCsv(fs.readFileSync(path.join(process.cwd(), rel), "utf8")); } catch { return []; } }
function exists(rel: string): boolean { try { return fs.existsSync(path.join(process.cwd(), rel)); } catch { return false; } }

function normPc(pc: string): string { const raw = (pc || "").toUpperCase().replace(/\s+/g, ""); if (raw.length < 5 || !/\d[A-Z]{2}$/.test(raw)) return raw; return `${raw.slice(0, raw.length - 3)} ${raw.slice(-3)}`; }
function districtOf(pc: string): string { return normPc(pc).split(" ")[0] ?? ""; }
function sectorOf(pc: string): string { const [o, i] = normPc(pc).split(" "); return i ? `${o} ${i[0]}` : o; }
function coord(r: Record<string, string>) { const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude); const has = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0; return { lat: has ? lat : null, lng: has ? lng : null, has }; }

function cleanLead(r: Record<string, string>, i: number) {
  const pc = normPc(r.postcode); const c = coord(r);
  return {
    id: `c-${i}`, kind: "clean", business_name: r.business_name || "", address: r.address || "", postcode: pc,
    postcode_area: "TW", postcode_district: r.postcode_district || districtOf(pc), postcode_sector: sectorOf(pc), full_postcode: pc,
    lat: c.lat, lng: c.lng, has_coordinates: c.has, phone: r.phone || "", website: r.website || "",
    platform_primary: r.platform_primary || "Just Eat", platform_url: r.platform_url || "",
    fsa_matched: r.fsa_matched || "no", fsa_rating: r.fsa_rating || "", fsa_rating_date: r.fsa_rating_date || "",
    google_rating: r.google_rating || "", google_review_count: r.google_review_count || "", google_maps_url: r.google_maps_url || "",
    halal_signal: r.halal_signal || "unknown", category_focus: r.category_focus || "", cuisine: r.cuisine || "",
    location_confidence: r.location_confidence || "", location_proof_source: r.location_proof_source || "",
    companies_house_status_band: r.companies_house_status_band || "", data_completeness_score: Number(r.data_completeness_score) || 0,
    suggested_sales_action: r.suggested_sales_action || "", source_lineage_summary: r.source_lineage_summary || "", independent_confidence: r.independent_confidence || "high",
  };
}
function manualLead(r: Record<string, string>, i: number) {
  const pc = normPc(r.postcode); const c = coord(r);
  return {
    id: `m-${i}`, kind: "manual", business_name: r.business_name || "", postcode: pc,
    postcode_area: "TW", postcode_district: r.postcode_district || districtOf(pc), postcode_sector: sectorOf(pc), full_postcode: pc,
    lat: c.lat, lng: c.lng, has_coordinates: c.has, phone: r.phone || "", website: r.website || "",
    category_focus: r.category_focus || "", cuisine: r.cuisine || "", halal_signal: r.halal_signal || "unknown",
    review_status: r.review_status || "manual_review", review_reason: r.review_reason || "", review_reason_codes: r.review_reason_codes || "",
    suggested_decision: r.suggested_decision || "", independent_confidence: r.independent_confidence || "medium", reviewer_notes: r.reviewer_notes || "",
  };
}
function excludedLead(r: Record<string, string>, i: number) {
  const pc = normPc(r.postcode); const c = coord(r);
  return {
    id: `x-${i}`, kind: "excluded", business_name: r.business_name || "", postcode: pc,
    postcode_area: "TW", postcode_district: r.postcode_district || districtOf(pc), postcode_sector: sectorOf(pc), full_postcode: pc,
    lat: c.lat, lng: c.lng, has_coordinates: c.has,
    exclusion_reason: r.exclusion_reason || "", exclusion_reason_codes: r.exclusion_reason_codes || "", matched_exclusion_term: r.matched_exclusion_term || "", suggested_action: r.suggested_action || "",
  };
}

export async function GET() {
  const fallbackUsed = !exists(CLEAN);
  if (fallbackUsed) {
    const rows = readCsv(FALLBACK);
    if (!rows.length) return NextResponse.json({ ok: false, error: "No TW export found. Run: npm run leads:tw-platform-first", mode: "none" });
    const clean = rows.map(cleanLead);
    return NextResponse.json({
      ok: true, mode: "platform_first_fallback", warning: "Independent workflow files missing — showing platform-first data.",
      summary: { postcode_area: "TW", clean_ready_to_call: clean.length, manual_review: 0, excluded: 0, research_phone: 0, possible_existing_review: 0, company_status_review: 0, location_review: 0, chain_category_review: 0, halal_confirmed_clean: 0, halal_likely_clean: 0, average_completeness_clean: 0 },
      clean_leads: clean, manual_review_leads: [], excluded_leads: [],
      districts: [...new Set(clean.map((l) => l.postcode_district))].sort(), sectors: [...new Set(clean.map((l) => l.postcode_sector))].sort(), fullPostcodes: [...new Set(clean.map((l) => l.full_postcode))].sort(),
      metadata: { clean_file: FALLBACK, manual_review_file: null, excluded_file: null, generated_at: null, fallback_used: true },
    });
  }

  const clean = readCsv(CLEAN).map(cleanLead);
  const manual = readCsv(MANUAL).map(manualLead);
  const excluded = readCsv(EXCLUDED).map(excludedLead);
  let wf: any = null; try { wf = JSON.parse(fs.readFileSync(path.join(process.cwd(), WORKFLOW_SUMMARY), "utf8")); } catch { /* optional */ }

  const all = [...clean, ...manual, ...excluded];
  const districts = [...new Set(all.map((l) => l.postcode_district))].filter(Boolean).sort((a, b) => (parseInt(a.slice(2)) || 0) - (parseInt(b.slice(2)) || 0));
  const sectors = [...new Set(all.map((l) => l.postcode_sector))].filter(Boolean).sort();
  const fullPostcodes = [...new Set(all.map((l) => l.full_postcode))].filter(Boolean).sort();
  const avg = clean.length ? Math.round(clean.reduce((s, l) => s + (l as any).data_completeness_score, 0) / clean.length) : 0;

  return NextResponse.json({
    ok: true, mode: "independent_review_workflow",
    summary: {
      postcode_area: "TW",
      clean_ready_to_call: clean.length, manual_review: manual.length, excluded: excluded.length,
      research_phone: wf?.review_research_phone_count ?? 0, possible_existing_review: wf?.review_possible_existing_count ?? 0,
      company_status_review: wf?.review_company_status_count ?? 0, location_review: wf?.review_location_count ?? 0, chain_category_review: wf?.review_chain_category_ambiguity_count ?? 0,
      halal_confirmed_clean: clean.filter((l) => l.halal_signal === "confirmed").length, halal_likely_clean: clean.filter((l) => l.halal_signal === "likely").length,
      average_completeness_clean: avg,
    },
    clean_leads: clean, manual_review_leads: manual, excluded_leads: excluded,
    districts, sectors, fullPostcodes,
    metadata: { clean_file: CLEAN, manual_review_file: MANUAL, excluded_file: EXCLUDED, generated_at: null, fallback_used: false },
  });
}
