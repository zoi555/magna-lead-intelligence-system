// TW platform-first lead run — Just Eat is the PRIMARY discovery source.
// FSA = validation only (never creates leads). Google Places = contact enrichment
// only. Companies House = status/risk only. No source other than a delivery
// platform may create a lead. Produces a restaurant/cafe/halal-focused TW handover.
//
//   npm run leads:tw-platform-first
//
// Writes exports/tw-*.csv/json. Nothing is committed (exports/ is gitignored).

import { promises as fsp } from "node:fs";
import path from "node:path";

import fs from "node:fs";
// Load .env.local / .env so keys + flags apply (never logged).
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
}

import { pullJustEatForOutcodes, type JustEatRestaurant } from "../src/lib/sources/just-eat";
import { searchFsaByAddress } from "../src/lib/sources/fsa";
import type { FsaEstablishment } from "../src/lib/pipeline/types";
import { loadCustomerList } from "../src/lib/sources/customer-list-import";
import { buildCustomerIndex, classifyCustomer } from "../src/lib/pipeline/customer-exclusion";
import { GooglePlacesRunner, isGooglePlacesEnabled } from "../src/lib/sources/google-places";
import { CompaniesHouseRunner, isCompaniesHouseEnabled } from "../src/lib/sources/companies-house";
import { gateCompaniesHouse } from "../src/lib/pipeline/companies-house-status-gate";
import { scoreCompleteness } from "../src/lib/pipeline/data-completeness";
import { nameScore, postcodeScore } from "../src/lib/pipeline/address-matching";

const TW = ["TW1","TW2","TW3","TW4","TW5","TW6","TW7","TW8","TW9","TW10","TW11","TW12","TW13","TW14","TW15","TW16","TW17","TW18","TW19","TW20"];
const EXPORTS = path.resolve(process.cwd(), "exports");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- csv ----------
function esc(v: unknown) { const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCsv(headers: string[], rows: Record<string, unknown>[]) { return headers.join(",") + "\n" + rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n") + "\n"; }
async function write(name: string, content: string) { await fsp.mkdir(EXPORTS, { recursive: true }); await fsp.writeFile(path.join(EXPORTS, name), content, "utf8"); return `exports/${name}`; }

function outcodeOf(pc: string) { const p = (pc || "").toUpperCase().replace(/\s+/g, ""); return p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(0, p.length - 3) : p; }
function normName(s: string) { return (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim(); }

// ---------- category focus + non-target exclusion ----------
const TARGET_RE = /restaurant|cafe|café|coffee|takeaway|fast\s*food|pizza|chicken|burger|kebab|dessert|bakery|grill|curry|indian|chinese|thai|turkish|lebanese|peri|noodle|sushi|shawarma|wrap|fish\s*and\s*chips|fried|breakfast|brunch|juice|bubble|boba/i;
const NONTARGET_RE = /costco|bestway|cash\s*(and|&|'n')?\s*carry|wholesal|supermarket|hypermarket|grocery|warehouse|distribut|manufactur|school|college|nursery|hospital|care\s*home|pharmacy|community\s*centre|mosque|church|temple|gurdwara|petrol|off\s*licence|convenience\s*store|corner\s*shop/i;

function categoryFocus(r: JustEatRestaurant): { focus: string; target: boolean; nonTargetReason: string } {
  const hay = `${r.businessName} ${r.cuisines.join(" ")}`;
  if (NONTARGET_RE.test(hay)) return { focus: "non_target", target: false, nonTargetReason: (hay.match(NONTARGET_RE) || [""])[0] };
  if (TARGET_RE.test(hay)) {
    const c = r.cuisines[0] ?? (/(pizza)/i.test(hay) ? "Pizza" : /(chicken)/i.test(hay) ? "Chicken" : /(kebab|grill|turkish)/i.test(hay) ? "Kebab/Grill" : /(cafe|coffee)/i.test(hay) ? "Cafe" : "Restaurant/Takeaway");
    return { focus: c, target: true, nonTargetReason: "" };
  }
  // On Just Eat, everything is a food outlet — default to restaurant/takeaway unless clearly non-target.
  return { focus: r.cuisines[0] ?? "Restaurant/Takeaway", target: true, nonTargetReason: "" };
}

// ---------- halal signal (never guessed) ----------
const HALAL_CONFIRMED_RE = /\bhalal\b/i;
const HALAL_LIKELY_RE = /kebab|shawarma|shwarma|turkish|afghan|pakistani|bangladeshi|persian|iranian|lebanese|middle\s*eastern|arab|mediterranean|peri\s*peri|desi|biryani|karahi|tandoori|mandi/i;
function halalSignal(r: JustEatRestaurant): { signal: string; source: string } {
  const hay = `${r.businessName} ${r.cuisines.join(" ")}`;
  if (HALAL_CONFIRMED_RE.test(hay)) return { signal: "confirmed", source: /halal/i.test(r.cuisines.join(" ")) ? "platform_cuisine" : "business_name" };
  if (HALAL_LIKELY_RE.test(hay)) return { signal: "likely", source: HALAL_LIKELY_RE.test(r.cuisines.join(" ")) ? "platform_cuisine" : "business_name" };
  if (r.cuisines.length) return { signal: "not_detected", source: "none" };
  return { signal: "unknown", source: "none" };
}

interface Candidate {
  je: JustEatRestaurant;
  outcode: string;
  focus: string;
  halal: string; halalSource: string;
  // FSA validation
  fsaMatched: boolean; fsaRating: string; fsaRatingDate: string; fsaLocalAuthority: string; fsaConfidence: number; fsaWarnings: string; fsaPostcode: string;
  // TW location proof
  locationProofSource: string; locationProofPostcode: string; locationConfidence: string;
  // customer exclusion
  customerStatus: string; customerDecision: string;
  // google
  googleMatched: boolean; googlePlaceId: string; googleMapsUrl: string; googleName: string; googleAddress: string; googlePostcode: string;
  googleLat: number | null; googleLng: number | null; googlePhone: string; googleWebsite: string; googleBusinessStatus: string;
  googleTypes: string; googleRating: string; googleReviewCount: string; googleConfidence: number; googleWarnings: string;
  // companies house
  chStatus: string; chBand: string; chMatched: boolean; chHold: boolean;
  // completeness
  completenessScore: number; completenessBand: string;
  exportStatus: string; // ready_for_review | held | excluded
}

async function main() {
  loadEnv();
  const started = new Date().toISOString();
  console.log("=== TW PLATFORM-FIRST RUN ===");
  console.log("territory: postcode area TW · manual_outcodes · 20 outcodes");

  // ---- Phase 2: platform-first discovery (Just Eat primary) ----
  const { restaurants, perOutcode } = await pullJustEatForOutcodes(TW);
  const jeRaw = perOutcode.reduce((n, p) => n + p.count, 0);
  // Keep only restaurants LOCATED in a TW outcode (their own postcode) — the TW sales targets.
  const inTw = restaurants.filter((r) => TW.includes((r.outcode || outcodeOf(r.postcode)).toUpperCase()) && r.businessName);
  console.log(`Just Eat: ${jeRaw} raw · ${restaurants.length} unique · ${inTw.length} located in TW`);

  // Dedupe by je id then name+postcode.
  const seen = new Set<string>();
  const deduped: JustEatRestaurant[] = [];
  for (const r of inTw) {
    const k1 = r.justEatId;
    const k2 = `${normName(r.businessName)}|${(r.postcode || "").replace(/\s+/g, "").toUpperCase()}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    deduped.push(r);
  }
  const duplicatesRemoved = inTw.length - deduped.length;
  const deliversNotLocated = restaurants.length - inTw.length;

  // ---- Phase 3: category filter ----
  const excludedNonTargets: Record<string, unknown>[] = [];
  const candidates: Candidate[] = [];
  for (const r of deduped) {
    const cf = categoryFocus(r);
    if (!cf.target) { excludedNonTargets.push({ business_name: r.businessName, postcode: r.postcode, cuisines: r.cuisines.join(" | "), reason: cf.nonTargetReason || "non-target" }); continue; }
    const h = halalSignal(r);
    candidates.push({
      je: r, outcode: (r.outcode || outcodeOf(r.postcode)).toUpperCase(), focus: cf.focus, halal: h.signal, halalSource: h.source,
      fsaMatched: false, fsaRating: "", fsaRatingDate: "", fsaLocalAuthority: "", fsaConfidence: 0, fsaWarnings: "", fsaPostcode: "",
      locationProofSource: "", locationProofPostcode: "", locationConfidence: "",
      customerStatus: "", customerDecision: "",
      googleMatched: false, googlePlaceId: "", googleMapsUrl: "", googleName: "", googleAddress: "", googlePostcode: "",
      googleLat: null, googleLng: null, googlePhone: "", googleWebsite: "", googleBusinessStatus: "", googleTypes: "", googleRating: "", googleReviewCount: "", googleConfidence: 0, googleWarnings: "",
      chStatus: "", chBand: "unknown", chMatched: false, chHold: false,
      completenessScore: 0, completenessBand: "poor", exportStatus: "",
    });
  }
  console.log(`Category focus: ${candidates.length} target candidates · ${excludedNonTargets.length} non-target excluded`);

  // ---- Phase 5: FSA validation (match only; never creates leads) ----
  const fsaByOutcode = new Map<string, FsaEstablishment[]>();
  for (const oc of TW) {
    try {
      const est = await searchFsaByAddress(oc, { pageSize: 200 });
      for (const e of est) {
        const o = outcodeOf(e.postcode);
        if (!fsaByOutcode.has(o)) fsaByOutcode.set(o, []);
        fsaByOutcode.get(o)!.push(e);
      }
    } catch { /* FSA fetch non-fatal */ }
    await sleep(200);
  }
  const fsaValidationRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const pool = fsaByOutcode.get(c.outcode) ?? [];
    let best: { e: FsaEstablishment; score: number } | null = null;
    for (const e of pool) {
      const ns = nameScore(c.je.businessName, e.businessName);
      const ps = postcodeScore(c.je.postcode, e.postcode);
      const score = ps * 0.6 + ns * 0.4;
      if (score >= 0.5 && (!best || score > best.score)) best = { e, score };
    }
    if (best) {
      c.fsaMatched = true; c.fsaRating = best.e.ratingValue; c.fsaRatingDate = best.e.ratingDate ?? "";
      c.fsaLocalAuthority = best.e.localAuthority; c.fsaConfidence = Number(best.score.toFixed(2)); c.fsaPostcode = best.e.postcode;
      if (normName(c.je.businessName) !== normName(best.e.businessName) && best.score < 0.7) c.fsaWarnings = "FSA name differs from platform name";
    } else c.fsaWarnings = "no FSA match — platform lead kept, FSA validation missing";
    fsaValidationRows.push({ business_name: c.je.businessName, postcode: c.je.postcode, fsa_matched: c.fsaMatched ? "yes" : "no", fsa_rating: c.fsaRating, fsa_rating_date: c.fsaRatingDate, local_authority: c.fsaLocalAuthority, fsa_confidence: c.fsaConfidence, fsa_warnings: c.fsaWarnings });
  }
  const fsaMatchedCount = candidates.filter((c) => c.fsaMatched).length;
  console.log(`FSA validation: ${fsaMatchedCount}/${candidates.length} matched (${Math.round(fsaMatchedCount / Math.max(1, candidates.length) * 100)}%)`);

  // ---- Phase 6: customer exclusion (after platform candidates exist) ----
  const CUST = loadCustomerList();
  const CINDEX = buildCustomerIndex(CUST.customers);
  const custRows: Record<string, unknown>[] = [];
  let excludedCust = 0, possibleHold = 0;
  for (const c of candidates) {
    const { match, decision } = classifyCustomer({ businessName: c.je.businessName, postcode: c.je.postcode }, CINDEX);
    c.customerStatus = match.status; c.customerDecision = decision;
    if (decision === "exclude") excludedCust++;
    else if (decision === "hold") possibleHold++;
    custRows.push({ business_name: c.je.businessName, postcode: c.je.postcode, status_group: match.status, match_type: match.match_type, decision });
  }
  console.log(`Customer exclusion: list ${CUST.loaded ? "loaded(" + CUST.rowsLoaded + ")" : "NOT loaded"} · excluded ${excludedCust} · possible-hold ${possibleHold}`);

  // New-prospect, target candidates are the only ones eligible for paid enrichment / sales export.
  const eligible = candidates.filter((c) => c.customerStatus === "New Prospect Candidate");
  // Priority: higher Just Eat rating + review count first.
  const prioritised = [...eligible].sort((a, b) => (b.je.ratingCount ?? 0) - (a.je.ratingCount ?? 0) || (b.je.ratingAverage ?? 0) - (a.je.ratingAverage ?? 0));

  // ---- Phase 8: Companies House status/risk (enrichment only) ----
  const ch = new CompaniesHouseRunner();
  let chActive = 0, chDissolvedHold = 0, chCalls0 = ch.callsMade;
  if (isCompaniesHouseEnabled()) {
    for (const c of prioritised) {
      if (ch.capRemaining <= 0) break;
      const m = await ch.matchCompany({ businessName: c.je.businessName, postcode: c.je.postcode });
      const { envelope, decision } = gateCompaniesHouse(m, new Date().toISOString());
      c.chMatched = envelope.matched; c.chStatus = envelope.companyStatus ?? (envelope.matched ? "unknown" : "no_match");
      c.chBand = envelope.matched ? (envelope.companyStatus === "active" ? "active" : envelope.companyStatus ?? "unknown") : "no_match";
      c.chHold = decision === "hold";
      if (envelope.reasonCodes?.includes("CH_ACTIVE_COMPANY_MATCH")) chActive++;
      if (decision === "hold") chDissolvedHold++;
    }
  }
  console.log(`Companies House: ${isCompaniesHouseEnabled() ? "live" : "disabled"} · calls ${ch.callsMade - chCalls0} · active ${chActive} · dissolved/closed holds ${chDissolvedHold}`);

  // ---- Phase 7: Google Places enrichment (platform-derived new prospects only) ----
  const gp = new GooglePlacesRunner();
  const gEnabled = isGooglePlacesEnabled();
  let gPhones = 0, gWebsites = 0, gRatings = 0, gReviews = 0, gMatches = 0;
  if (gEnabled) {
    for (const c of prioritised) {
      if (c.chHold) continue; // don't enrich dissolved/closed holds
      if (gp.capRemaining <= 0) break;
      const g = await gp.enrich({ businessName: c.je.businessName, postcode: c.je.postcode, address: c.je.addressLine });
      if (g.status === "cap_reached") break;
      const gPc = (g.formattedAddress ?? "").toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0]?.replace(/\s+/g, "") ?? "";
      const conf = g.matched ? Math.min(0.97, 0.5 + 0.45 * postcodeScore(c.je.postcode, gPc)) : 0;
      if (g.matched && conf >= 0.45) {
        c.googleMatched = true; gMatches++;
        c.googlePlaceId = g.placeId ?? ""; c.googleMapsUrl = g.googleMapsUri ?? ""; c.googleAddress = g.formattedAddress ?? ""; c.googlePostcode = gPc;
        c.googleLat = g.latitude; c.googleLng = g.longitude; c.googlePhone = g.formattedPhone ?? ""; c.googleWebsite = g.website ?? "";
        c.googleBusinessStatus = g.businessStatus ?? ""; c.googleTypes = (g.types ?? []).join(" | "); c.googleRating = g.rating != null ? String(g.rating) : ""; c.googleReviewCount = g.reviewCount != null ? String(g.reviewCount) : "";
        c.googleConfidence = Number(conf.toFixed(2)); c.googleWarnings = g.warning ?? "";
        if (g.formattedPhone) gPhones++;
        if (g.website) gWebsites++;
        if (g.rating != null) gRatings++;
        if (g.reviewCount != null) gReviews++;
      }
    }
  }
  console.log(`Google Places: ${gEnabled ? "live" : "disabled"} · calls ${gp.callsMade} · matches ${gMatches} · phones ${gPhones} · websites ${gWebsites} · ratings ${gRatings}`);

  // ---- TW location proof (physically located in TW, not just delivering there) ----
  const locationRows: Record<string, unknown>[] = [];
  let locationHeld = 0;
  for (const c of candidates) {
    const platOut = (c.outcode || "").toUpperCase();
    const platTw = TW.includes(platOut);
    const gOut = outcodeOf(c.googlePostcode);
    const gHasPc = !!c.googlePostcode;
    const gTw = gHasPc && TW.includes(gOut);
    const fOut = outcodeOf(c.fsaPostcode);
    const fTw = c.fsaMatched && TW.includes(fOut);
    const sources: string[] = [];
    if (platTw) sources.push("platform_postcode");
    if (gTw) sources.push("google_postcode");
    if (fTw) sources.push("fsa_postcode");
    const googleConflict = gHasPc && !gTw; // Google places it OUTSIDE TW
    c.locationProofSource = sources.join(" + ") || "none";
    c.locationProofPostcode = platTw ? c.je.postcode : gTw ? c.googlePostcode : fTw ? c.fsaPostcode : "";
    c.locationConfidence = sources.length >= 2 ? "high" : sources.length === 1 ? (googleConflict ? "low" : "medium") : "unknown";
    // Hold anything we can't prove is in TW, or where Google contradicts TW.
    if (!platTw || c.locationConfidence === "unknown" || googleConflict) { c.exportStatus = "held_location"; locationHeld++; }
    locationRows.push({ business_name: c.je.businessName, platform_postcode: c.je.postcode, google_postcode: c.googlePostcode, fsa_postcode: c.fsaPostcode, location_proof_source: c.locationProofSource, location_proof_postcode: c.locationProofPostcode, location_confidence: c.locationConfidence, google_conflict: googleConflict ? "yes" : "no" });
  }
  console.log(`TW location proof: ${candidates.filter((c) => c.locationConfidence === "high").length} high · ${candidates.filter((c) => c.locationConfidence === "medium").length} medium · held for location ${locationHeld}`);

  // ---- Phase 9: completeness + export status ----
  for (const c of candidates) {
    const comp = scoreCompleteness({
      businessName: c.je.businessName, tradingAddress: c.je.addressLine, postcode: c.je.postcode,
      phone: c.googlePhone || null, website: c.googleWebsite || null, platformUrl: c.je.url,
      fsaRecord: c.fsaMatched, googlePlace: c.googleMatched, ratingOrReviewCount: !!(c.googleRating || c.je.ratingCount),
      customerExclusionChecked: !!c.customerStatus, companiesHouseChecked: c.chStatus !== "", sourceEvidenceUrl: c.je.url,
      coordinates: c.je.latitude != null && c.je.longitude != null,
    });
    c.completenessScore = comp.data_completeness_score; c.completenessBand = comp.completeness_band;
    // Export gate: only New Prospect, not held, not dissolved, TW location proven.
    if (c.exportStatus === "held_location") { /* keep — TW location not proven */ }
    else if (c.customerStatus !== "New Prospect Candidate") c.exportStatus = "excluded";
    else if (c.chHold || c.customerDecision === "hold") c.exportStatus = "held";
    else c.exportStatus = "ready_for_review";
  }

  // ---------- build final rows ----------
  function suggested(c: Candidate): string {
    if (c.exportStatus !== "ready_for_review") return c.exportStatus === "held" ? "Hold — review before contact" : "Do not contact as new lead";
    if (!c.googlePhone) return "Research phone before calling";
    if (c.halal === "confirmed") return "Priority — confirmed halal foodservice";
    return "Call — platform-active prospect";
  }
  function lineage(c: Candidate): string {
    return ["Just Eat", c.fsaMatched && "FSA-validated", c.googleMatched && "Google-enriched", c.chMatched && "CH-checked"].filter(Boolean).join(" + ");
  }
  const FINAL_HEADERS = [
    "business_name","trading_name","address","postcode","postcode_area","postcode_district","town_locality","phone","website",
    "platform_primary","platform_url","just_eat","deliveroo","uber_eats","fsa_matched","fsa_rating","fsa_rating_date",
    "google_rating","google_review_count","google_maps_url","halal_signal","halal_signal_source","category_focus","cuisine",
    "location_proof_source","location_proof_postcode","location_confidence",
    "customer_exclusion_status","companies_house_status_band","data_completeness_score","suggested_sales_action","source_lineage_summary",
  ];
  const finalRow = (c: Candidate) => ({
    business_name: c.je.businessName, trading_name: c.je.brandName && c.je.brandName !== c.je.businessName ? c.je.brandName : "",
    address: c.je.addressLine, postcode: c.je.postcode, postcode_area: "TW", postcode_district: c.outcode, town_locality: c.je.city,
    phone: c.googlePhone, website: c.googleWebsite, platform_primary: "Just Eat", platform_url: c.je.url,
    just_eat: "yes", deliveroo: "no", uber_eats: "no", fsa_matched: c.fsaMatched ? "yes" : "no", fsa_rating: c.fsaRating, fsa_rating_date: c.fsaRatingDate,
    google_rating: c.googleRating, google_review_count: c.googleReviewCount, google_maps_url: c.googleMapsUrl,
    halal_signal: c.halal, halal_signal_source: c.halalSource, category_focus: c.focus, cuisine: c.je.cuisines.join(" | "),
    location_proof_source: c.locationProofSource, location_proof_postcode: c.locationProofPostcode, location_confidence: c.locationConfidence,
    customer_exclusion_status: c.customerStatus, companies_house_status_band: c.chBand, data_completeness_score: c.completenessScore,
    suggested_sales_action: suggested(c), source_lineage_summary: lineage(c),
  });

  const sales = candidates.filter((c) => c.exportStatus === "ready_for_review");
  const readyToCall = sales.filter((c) => c.googlePhone);
  const researchPhone = sales.filter((c) => !c.googlePhone);
  const guarantee = CUST.loaded ? "GUARANTEED against imported customer list" : "NOT GUARANTEED AGAINST EXISTING CUSTOMERS";

  const files: string[] = [];
  files.push(await write("tw-platform-first-sales-list-ready-to-call.csv", `# ${guarantee} — READY TO CALL (has phone)\n` + toCsv(FINAL_HEADERS, readyToCall.map(finalRow))));
  files.push(await write("tw-platform-first-sales-list-research-phone.csv", `# ${guarantee} — RESEARCH PHONE FIRST\n` + toCsv(FINAL_HEADERS, researchPhone.map(finalRow))));
  files.push(await write("tw-platform-first-full-safe-list.csv", `# ${guarantee} — ALL CLEAN TW PLATFORM-FIRST LEADS\n` + toCsv(FINAL_HEADERS, sales.map(finalRow))));
  files.push(await write("tw-platform-first-source-lineage-report.csv", toCsv(
    ["business_name","postcode","source_platform_primary","just_eat_yes_no","deliveroo_yes_no","uber_eats_yes_no","fsa_matched_yes_no","google_enriched_yes_no","companies_house_checked_yes_no","customer_checked_yes_no","export_status","source_lineage_summary"],
    candidates.map((c) => ({ business_name: c.je.businessName, postcode: c.je.postcode, source_platform_primary: "Just Eat", just_eat_yes_no: "yes", deliveroo_yes_no: "no", uber_eats_yes_no: "no", fsa_matched_yes_no: c.fsaMatched ? "yes" : "no", google_enriched_yes_no: c.googleMatched ? "yes" : "no", companies_house_checked_yes_no: c.chStatus ? "yes" : "no", customer_checked_yes_no: c.customerStatus ? "yes" : "no", export_status: c.exportStatus, source_lineage_summary: lineage(c) })),
  )));
  files.push(await write("tw-platform-first-excluded-non-targets.csv", toCsv(["business_name","postcode","cuisines","reason"], excludedNonTargets)));
  files.push(await write("tw-platform-first-location-check-report.csv", toCsv(["business_name","platform_postcode","google_postcode","fsa_postcode","location_proof_source","location_proof_postcode","location_confidence","google_conflict"], locationRows)));
  files.push(await write("tw-fsa-validation-report.csv", toCsv(["business_name","postcode","fsa_matched","fsa_rating","fsa_rating_date","local_authority","fsa_confidence","fsa_warnings"], fsaValidationRows)));
  files.push(await write("tw-excluded-fsa-only-records.csv", toCsv(["note"], [{ note: "FSA-only businesses are never added as leads in platform-first mode — FSA is validation only. This file is intentionally empty of leads." }])));
  files.push(await write("tw-customer-exclusion-report.csv", toCsv(["business_name","postcode","status_group","match_type","decision"], custRows)));
  files.push(await write("tw-google-places-enrichment-report.csv", toCsv(
    ["business_name","postcode","google_place_id","google_maps_url","google_address","google_postcode","phone","website","business_status","types","rating","review_count","match_confidence","warnings"],
    prioritised.filter((c) => c.googleMatched).map((c) => ({ business_name: c.je.businessName, postcode: c.je.postcode, google_place_id: c.googlePlaceId, google_maps_url: c.googleMapsUrl, google_address: c.googleAddress, google_postcode: c.googlePostcode, phone: c.googlePhone, website: c.googleWebsite, business_status: c.googleBusinessStatus, types: c.googleTypes, rating: c.googleRating, review_count: c.googleReviewCount, match_confidence: c.googleConfidence, warnings: c.googleWarnings })),
  )));
  files.push(await write("tw-missing-phone-list.csv", toCsv(["business_name","postcode","google_checked","recommended_action"], sales.filter((c) => !c.googlePhone).map((c) => ({ business_name: c.je.businessName, postcode: c.je.postcode, google_checked: c.googleMatched ? "yes" : "no", recommended_action: "Research phone before calling" })))));
  files.push(await write("tw-companies-house-check-report.csv", toCsv(["business_name","postcode","companies_house_status_band","matched","hold"], prioritised.filter((c) => c.chStatus).map((c) => ({ business_name: c.je.businessName, postcode: c.je.postcode, companies_house_status_band: c.chBand, matched: c.chMatched ? "yes" : "no", hold: c.chHold ? "yes" : "no" })))));

  const halalConfirmed = sales.filter((c) => c.halal === "confirmed").length;
  const halalLikely = sales.filter((c) => c.halal === "likely").length;
  const avgCompleteness = sales.length ? Math.round(sales.reduce((n, c) => n + c.completenessScore, 0) / sales.length) : 0;
  const focusCount = (re: RegExp) => sales.filter((c) => re.test(`${c.focus} ${c.je.cuisines.join(" ")} ${c.je.businessName}`)).length;
  const restaurantCount = focusCount(/restaurant|indian|chinese|thai|turkish|lebanese|curry|grill|sushi/i);
  const cafeCount = focusCount(/cafe|café|coffee|brunch|breakfast|bakery|dessert/i);
  const takeawayCount = focusCount(/takeaway|fast\s*food|pizza|chicken|burger|kebab|fried|wrap|shawarma/i);
  const summary = {
    generated_at: started, finished_at: new Date().toISOString(),
    territory: { postcode_area: "TW", mode: "manual_outcodes", outcodes: TW },
    just_eat: { raw_records: jeRaw, unique: restaurants.length, located_in_tw: inTw.length, deduped: deduped.length, delivers_to_tw_but_not_located: deliversNotLocated, duplicates_removed: duplicatesRemoved },
    deliveroo: { real_records: 0, note: "evidence-only — anti-bot protected, no live business records" },
    uber_eats: { real_records: 0, note: "evidence-only — anti-bot protected, no live business records" },
    location_proof: { held_unproven_or_conflict: locationHeld, high: candidates.filter((c) => c.locationConfidence === "high").length, medium: candidates.filter((c) => c.locationConfidence === "medium").length },
    category: { target_candidates: candidates.length, non_target_excluded: excludedNonTargets.length, restaurant: restaurantCount, cafe: cafeCount, takeaway_fast_food: takeawayCount },
    fsa_validation: { matched: fsaMatchedCount, matched_pct: Math.round(fsaMatchedCount / Math.max(1, candidates.length) * 100) },
    customer: { list_loaded: CUST.loaded, rows: CUST.rowsLoaded, excluded: excludedCust, possible_hold: possibleHold, new_prospect: eligible.length },
    companies_house: { enabled: isCompaniesHouseEnabled(), calls: ch.callsMade - chCalls0, active: chActive, dissolved_closed_holds: chDissolvedHold },
    google_places: { enabled: gEnabled, calls: gp.callsMade, matches: gMatches, phones: gPhones, websites: gWebsites, ratings: gRatings, reviews: gReviews },
    final: { ready_to_call: readyToCall.length, research_phone: researchPhone.length, full_safe_list: sales.length, halal_confirmed: halalConfirmed, halal_likely: halalLikely, restaurant: restaurantCount, cafe: cafeCount, takeaway_fast_food: takeawayCount, avg_completeness: avgCompleteness },
    files,
  };
  files.push(await write("tw-platform-first-summary.json", JSON.stringify(summary, null, 2)));

  console.log("\n=== TW SUMMARY ===");
  console.log(`ready-to-call ${readyToCall.length} · research-phone ${researchPhone.length} · full-safe ${sales.length}`);
  console.log(`halal confirmed ${halalConfirmed} · likely ${halalLikely} · avg completeness ${avgCompleteness}`);
  console.log(`handover file: exports/tw-platform-first-sales-list-ready-to-call.csv`);
}

main().catch((e) => { console.error("TW run failed:", e); process.exit(1); });
