// Field-level provenance generator — for every usable (rep-facing or key-account) candidate in
// a territory, records which stage/provider supplied each important final field value, the
// alternate/fallback value that was NOT selected (when the pipeline has more than one candidate
// source for that field), and whether the final value replaced or was retained over that
// alternate. Read-only; makes no external call; never modifies any checkpoint it reads.
//
// IMPORTANT — this mirrors candidate-dossier.ts's buildDossier() field-resolution expressions
// VERBATIM (see the FIELD_RESOLVERS comments below, each citing the exact candidate-dossier.ts
// line it reproduces) rather than importing it, because buildDossier() is a private closure that
// does not expose which branch of each `??` chain fired or what the losing candidate value was —
// only the final resolved value. Only telephone has a genuine stored "previous value" (a real
// correction note) in the pipeline itself; every other field's provenance here is reconstructed
// by re-evaluating the same priority-chain logic against the same raw per-stage checkpoints, not
// invented. If candidate-dossier.ts's resolution logic ever changes, this file's mirrored
// expressions must be updated in lockstep (a comment cites every line reproduced).
//
// Usage:
//   npx tsx scripts/lead-production/generate-field-provenance.ts \
//     --territory-manifest=<path> --out=<dir> --file-prefix=<Name_TERRITORY>

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsvObjects, writeCsv } from "./csv";
import { isValidUkPhone } from "./normalize";
import { loadCandidateDossiers, type Dossier } from "./candidate-dossier";
import { evaluateBusinessCategoryEligibility } from "./business-category-eligibility";
import { mapCtoBusinessType, loadCtoBusinessTypeVocabulary, type CtoBusinessTypeVocabulary } from "./cto-business-type-mapping";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
}

async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readCsvRows(p: string): Promise<Record<string, string>[]> { return (await parseCsvObjects(await fs.readFile(p, "utf8"))).rows; }
async function findFileEndingWith(dir: string, suffix: string): Promise<string> {
  const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
  if (!match) throw new Error(`No file ending in "${suffix}" found in ${dir}.`);
  return path.join(dir, match);
}

const isValidPhone = isValidUkPhone; // local alias — logic now lives in normalize.ts's single shared validator

interface ProvenanceRow {
  leadId: string; field: string; finalValue: string; sourceStage: string; provider: string;
  sourceReference: string; retrievalDate: string; confidence: string; previousValueOrSource: string;
  replacedOrSupplemented: string; transformation: string; selectionReason: string;
}

async function loadDistrictRaw(orchestratorDir: string) {
  const manifest = await readJson(path.join(orchestratorDir, ".orchestrator-run-manifest.json"));
  const dirs = {
    phase1Dir: manifest.stages.phase1.dir,
    fsaDir: manifest.stages.fsa.dir,
    googleDir: manifest.stages.google.dir,
    chDir: manifest.stages.companies_house.dir,
    websiteDir: manifest.stages.website.dir,
    publicProfileDir: manifest.stages.public_profile.dir,
    groupRescreenDir: manifest.stages.group_rescreen.dir,
    v2Dir: manifest.stages.final_scoring.dir,
  };

  const phase1Results = (await readJson(path.join(dirs.phase1Dir, "customer-match-results.json"))) as any[];
  const phase1ById = new Map(phase1Results.map((r) => [r.candidateId, r]));
  const fsaResults = (await readJson(path.join(dirs.fsaDir, "fsa-results.json"))) as any[];
  const fsaById = new Map(fsaResults.map((r) => [r.candidateId, r]));
  const googleResults = (await readJson(path.join(dirs.googleDir, "google-results.json"))) as any[];
  const googleById = new Map(googleResults.map((r) => [r.candidateId, r]));
  const fsaResAfterGoogleById = new Map((await readCsvRows(path.join(dirs.googleDir, "fsa-resolution-after-google.csv"))).map((r) => [r.candidate_id, r]));
  const chResults = (await readJson(path.join(dirs.chDir, "companies-house-results.json"))) as any[];
  const chById = new Map(chResults.map((r) => [r.candidateId, r]));
  const profileById = new Map((await readCsvRows(path.join(dirs.chDir, "company-profiles.csv"))).map((r) => [r.candidate_id, r]));
  const officersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "directors-and-officers.csv"))) { const l = officersByCandidate.get(r.candidate_id) ?? []; l.push(r); officersByCandidate.set(r.candidate_id, l); }
  const pscsByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "persons-with-significant-control.csv"))) { const l = pscsByCandidate.get(r.candidate_id) ?? []; l.push(r); pscsByCandidate.set(r.candidate_id, l); }
  const decisionMakersByCandidate = new Map<string, Record<string, string>[]>();
  for (const r of await readCsvRows(path.join(dirs.chDir, "decision-maker-candidates.csv"))) { const l = decisionMakersByCandidate.get(r.candidate_id) ?? []; l.push(r); decisionMakersByCandidate.set(r.candidate_id, l); }
  const websiteData = (await readJson(path.join(dirs.websiteDir, "website-extracted-data.json"))) as any[];
  const websiteById = new Map(websiteData.map((r) => [r.candidateId, r]));
  const groupRescreenResults = (await readJson(path.join(dirs.groupRescreenDir, "final-group-rescreen-results.json"))) as any[];
  const groupRescreenById = new Map(groupRescreenResults.map((r) => [r.candidateId, r]));
  const v2MasterFile = await findFileEndingWith(dirs.v2Dir, "-v2-authoritative-master.json");
  const v2Rows = (await readJson(v2MasterFile)) as any[];
  const v2ById = new Map(v2Rows.map((r) => [r.candidateId, r]));

  // Full dossier objects — used only for the 3 new AspectLead-computed decision fields (Business
  // Category Eligibility, CTO Business Type, Trading Status) added 2026-08-02, which are engine
  // outputs (not a raw-source ??-priority chain) — invoked directly via the real, authoritative
  // engine functions rather than mirrored/reconstructed, unlike every other field in this file.
  const { dossiers } = await loadCandidateDossiers(dirs);
  const dossierById = new Map(dossiers.map((d) => [d.candidateId, d]));

  return { phase1ById, fsaById, googleById, fsaResAfterGoogleById, chById, profileById, officersByCandidate, pscsByCandidate, decisionMakersByCandidate, websiteById, groupRescreenById, v2ById, dossierById };
}

function buildRowsForCandidate(leadId: string, candidateId: string, raw: Awaited<ReturnType<typeof loadDistrictRaw>>, vocabulary: CtoBusinessTypeVocabulary): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [];
  const m = raw.v2ById.get(candidateId);
  if (!m) return rows;
  const p1 = raw.phase1ById.get(candidateId);
  const fsa = raw.fsaById.get(candidateId);
  const google = raw.googleById.get(candidateId);
  const ch = raw.chById.get(candidateId);
  const website = raw.websiteById.get(candidateId) ?? null;
  const groupRescreen = raw.groupRescreenById.get(candidateId);
  const profile = raw.profileById.get(candidateId);
  const officers = raw.officersByCandidate.get(candidateId) ?? [];
  const pscs = raw.pscsByCandidate.get(candidateId) ?? [];
  const decisionMakers = (raw.decisionMakersByCandidate.get(candidateId) ?? []).slice().sort((a, b) => Number(a.rank) - Number(b.rank));
  const topDecisionMaker = decisionMakers[0] ?? null;
  const fsaResAfterGoogle = raw.fsaResAfterGoogleById.get(candidateId);

  // Mirrors candidate-dossier.ts:129-136
  const googleOutcome = m.googleOutcomeAfter ?? google?.outcome ?? null;
  const chDecisive = ch && ["exact_company_match", "strong_probable_company_match"].includes(ch.outcome);
  const bestGoogle = google?.plausibleResults?.[0] ?? null;
  const fsaResolvedFhrsId = fsaResAfterGoogle && ["fsa_resolved_exact", "fsa_resolved_probable"].includes(fsaResAfterGoogle.resolution) ? fsaResAfterGoogle.top_fsa_fhrs_id : null;
  const fsaAmbiguous = fsa?.outcome === "multiple_fsa_matches" && !fsaResolvedFhrsId;
  const bestFsa = fsaAmbiguous ? null : (fsaResolvedFhrsId ? fsa?.plausibleEstablishments?.find((e: any) => e.fhrsId === fsaResolvedFhrsId) : null) ?? fsa?.plausibleEstablishments?.[0] ?? null;

  const fsaDate = fsa?.retrievalTimestamp ?? "";
  const googleDate = google?.retrievalTimestamp ?? "";
  const chDate = ch?.retrievalTimestamp ?? "";
  const websiteDate = website?.retrievalTimestamp ?? "";
  const fsaRef = fsa?.sourceResponseReference ?? "";
  const googleRef = google?.sourceResponseReference ?? "";
  const chRef = Array.isArray(ch?.searchQueriesUsed) ? ch.searchQueriesUsed.join(" | ") : "";

  const googleConfidence = googleOutcome === "exact_google_match" ? "high (exact match)" : googleOutcome?.includes("strong_probable") ? "medium (strong probable match)" : googleOutcome ? "low (" + googleOutcome + ")" : "n/a";
  const chConfidence = ch?.outcome === "exact_company_match" ? "high (exact match)" : chDecisive ? "medium (strong probable match)" : "n/a";
  const fsaConfidence = fsaResolvedFhrsId ? "high (resolved via Google cross-check)" : bestFsa ? "medium (first plausible establishment, unresolved)" : "n/a";

  function push(row: Omit<ProvenanceRow, "leadId">) { rows.push({ leadId, ...row }); }

  // trading_name — mirrors candidate-dossier.ts:147
  {
    const finalVal = m.tradingName ?? p1?.normalisedName?.candidateOriginal ?? "";
    const usedFinal = m.tradingName != null;
    push({
      field: "Trading Name", finalValue: String(finalVal),
      sourceStage: usedFinal ? "Final-scoring (propagated candidate identity)" : "Phase 1",
      provider: "Just Eat (consolidated discovery identity)",
      sourceReference: "Just Eat consolidated candidate record", retrievalDate: "", confidence: "n/a (identity field, not independently re-verified at this stage)",
      previousValueOrSource: usedFinal ? "n/a (no fallback needed)" : "n/a (no earlier value)",
      replacedOrSupplemented: "Retained (never overwritten after Phase 1 discovery)",
      transformation: "None — used verbatim from the Just Eat consolidated candidate name",
      selectionReason: "Trading name is fixed at discovery and never re-resolved by a later enrichment stage.",
    });
  }

  // operating_address — mirrors candidate-dossier.ts:149
  {
    const finalVal = bestGoogle?.formattedAddress ?? bestFsa?.fsaAddress ?? null;
    const usedGoogle = !!bestGoogle?.formattedAddress;
    push({
      field: "Full Operating Address", finalValue: String(finalVal ?? ""),
      sourceStage: usedGoogle ? "Google" : bestFsa?.fsaAddress ? "FSA" : "Unresolved",
      provider: usedGoogle ? "Google Places" : bestFsa?.fsaAddress ? "Food Standards Agency" : "n/a",
      sourceReference: usedGoogle ? googleRef : fsaRef, retrievalDate: usedGoogle ? googleDate : fsaDate,
      confidence: usedGoogle ? googleConfidence : fsaConfidence,
      previousValueOrSource: usedGoogle && bestFsa?.fsaAddress && bestFsa.fsaAddress !== finalVal ? `FSA alternate (not selected): ${bestFsa.fsaAddress}` : "n/a (no differing alternate)",
      replacedOrSupplemented: usedGoogle ? "Retained (Google preferred by priority order)" : "Supplemented (FSA used because Google had no address)",
      transformation: "None — used verbatim",
      selectionReason: "Google Places formatted address takes priority over FSA's registered address when both are present.",
    });
  }

  // postcode — mirrors candidate-dossier.ts:151
  {
    const finalVal = m.postcode ?? p1?.normalisedPostcode?.candidateOriginal ?? null;
    push({
      field: "Postcode", finalValue: String(finalVal ?? ""),
      sourceStage: m.postcode != null ? "Final-scoring (propagated)" : "Phase 1",
      provider: "Just Eat (consolidated discovery identity) / geography validation",
      sourceReference: "Just Eat consolidated candidate record", retrievalDate: "", confidence: "n/a (identity field)",
      previousValueOrSource: "n/a (no fallback needed)",
      replacedOrSupplemented: "Retained",
      transformation: "Normalised at Phase 1 geography validation, not re-derived later.",
      selectionReason: "Postcode is fixed at discovery/geography-validation and never re-resolved by a later enrichment stage.",
    });
  }

  // latitude / longitude — mirrors candidate-dossier.ts:152-153
  for (const [field, key] of [["Latitude", "latitude"], ["Longitude", "longitude"]] as const) {
    const finalVal = bestGoogle?.[key] ?? null;
    push({
      field, finalValue: String(finalVal ?? ""), sourceStage: finalVal != null ? "Google" : "Unresolved",
      provider: finalVal != null ? "Google Places" : "n/a", sourceReference: googleRef, retrievalDate: googleDate,
      confidence: finalVal != null ? googleConfidence : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)",
      replacedOrSupplemented: "n/a (single source)", transformation: "None — used verbatim",
      selectionReason: "Coordinates are taken only from the top-ranked Google Places result; no other stage supplies coordinates.",
    });
  }

  // telephone — mirrors candidate-dossier.ts:97-106 (the one field with a real stored correction note)
  {
    const googlePhone = google?.plausibleResults?.[0]?.phone ?? null;
    const websitePhone = website?.phone?.value ?? null;
    let finalVal: string | null, source: string, provider: string, ref: string, date: string, prevValSrc: string, replaced: string, transform: string, reason: string, confidence: string;
    if (isValidPhone(websitePhone)) {
      finalVal = websitePhone; source = "Website"; provider = "Official business website (crawled)"; ref = website?.phone?.sourceUrl ?? ""; date = websiteDate;
      confidence = website?.phone?.confidence ?? "n/a";
      prevValSrc = googlePhone && googlePhone !== websitePhone ? `Google alternate (not selected): ${googlePhone}` : "n/a (no differing alternate)";
      replaced = "Retained (website preferred by priority order)"; transform = "Validated against UK phone format before acceptance."; reason = "Website-extracted phone is preferred over Google Places when it passes UK phone format validation.";
    } else if (websitePhone && isValidPhone(googlePhone)) {
      finalVal = googlePhone; source = "Google"; provider = "Google Places"; ref = googleRef; date = googleDate; confidence = googleConfidence;
      prevValSrc = `Website value rejected (failed validation): ${websitePhone}`;
      replaced = "Replaced (website value failed UK phone format validation)"; transform = "Website value discarded after failing isValidPhone(); Google Places value substituted.";
      reason = "Website-extracted phone existed but did not match UK phone format — Google Places used as the validated fallback.";
    } else if (isValidPhone(googlePhone)) {
      finalVal = googlePhone; source = "Google"; provider = "Google Places"; ref = googleRef; date = googleDate; confidence = googleConfidence;
      prevValSrc = "n/a (website had no phone value)"; replaced = "Supplemented (website had no phone)"; transform = "Validated against UK phone format before acceptance.";
      reason = "No website phone was extracted; Google Places was the only source with a valid phone.";
    } else {
      finalVal = null; source = "Unresolved"; provider = "n/a"; ref = ""; date = ""; confidence = "n/a"; prevValSrc = "n/a"; replaced = "n/a"; transform = "n/a"; reason = "Neither website nor Google Places produced a phone value passing UK phone format validation.";
    }
    push({ field: "Main Phone", finalValue: String(finalVal ?? ""), sourceStage: source, provider, sourceReference: ref, retrievalDate: date, confidence, previousValueOrSource: prevValSrc, replacedOrSupplemented: replaced, transformation: transform, selectionReason: reason });
  }

  // website — mirrors candidate-dossier.ts:155
  {
    const officialDomain = website?.officialDomain ?? null;
    const googleWebsite = bestGoogle?.website ?? null;
    const finalVal = officialDomain ?? googleWebsite ?? null;
    const usedWebsite = !!officialDomain;
    push({
      field: "Website", finalValue: String(finalVal ?? ""),
      sourceStage: usedWebsite ? "Website" : googleWebsite ? "Google" : "Unresolved",
      provider: usedWebsite ? "Website crawl (domain confirmation)" : googleWebsite ? "Google Places" : "n/a",
      sourceReference: usedWebsite ? "Website crawl official-domain resolution" : googleRef,
      retrievalDate: usedWebsite ? websiteDate : googleDate,
      confidence: usedWebsite ? "high (confirmed via crawl)" : googleWebsite ? googleConfidence : "n/a",
      previousValueOrSource: usedWebsite && googleWebsite && googleWebsite !== finalVal ? `Google alternate (not selected): ${googleWebsite}` : "n/a (no differing alternate)",
      replacedOrSupplemented: usedWebsite ? "Retained (website stage preferred by priority order)" : "Supplemented (Google used because website stage had no confirmed domain)",
      transformation: "None — used verbatim", selectionReason: "Website stage's own confirmed official domain takes priority over Google Places' website field.",
    });
  }

  // verified_email — mirrors candidate-dossier.ts:156
  {
    const finalVal = website?.email?.value ?? null;
    push({
      field: "Verified Email", finalValue: String(finalVal ?? ""), sourceStage: finalVal != null ? "Website" : "Unresolved",
      provider: finalVal != null ? "Official business website (crawled)" : "n/a", sourceReference: website?.email?.sourceUrl ?? "", retrievalDate: websiteDate,
      confidence: website?.email?.confidence ?? "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)",
      replacedOrSupplemented: "n/a (single source)", transformation: "None — used verbatim",
      selectionReason: "Email is sourced only from the official-website crawl; no other stage supplies email.",
    });
  }

  // opening_hours — not persisted in the dossier's own fields object; read directly from the raw website checkpoint for this report
  {
    const oh = website?.openingHours?.value ?? null;
    push({
      field: "Opening Hours", finalValue: oh ? JSON.stringify(oh) : "", sourceStage: oh != null ? "Website" : "Unresolved",
      provider: oh != null ? "Official business website (crawled)" : "n/a", sourceReference: website?.openingHours?.sourceUrl ?? "", retrievalDate: websiteDate,
      confidence: website?.openingHours?.confidence ?? "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)",
      replacedOrSupplemented: "n/a (single source)", transformation: "None — used verbatim",
      selectionReason: "Opening hours are sourced only from the official-website crawl; not stored in the shared candidate dossier used by the Master exporter, so this value is read directly from the website stage's own raw checkpoint for this report.",
    });
  }

  // business_type — mirrors candidate-dossier.ts:157
  {
    const finalVal = bestFsa?.businessType ?? bestGoogle?.primaryCategory ?? null;
    const usedFsa = !!bestFsa?.businessType;
    push({
      field: "Business Type", finalValue: String(finalVal ?? ""), sourceStage: usedFsa ? "FSA" : bestGoogle?.primaryCategory ? "Google" : "Unresolved",
      provider: usedFsa ? "Food Standards Agency" : bestGoogle?.primaryCategory ? "Google Places" : "n/a",
      sourceReference: usedFsa ? fsaRef : googleRef, retrievalDate: usedFsa ? fsaDate : googleDate, confidence: usedFsa ? fsaConfidence : googleConfidence,
      previousValueOrSource: usedFsa && bestGoogle?.primaryCategory && bestGoogle.primaryCategory !== finalVal ? `Google alternate (not selected): ${bestGoogle.primaryCategory}` : "n/a (no differing alternate)",
      replacedOrSupplemented: usedFsa ? "Retained (FSA preferred by priority order)" : "Supplemented (Google used because FSA had no business type)",
      transformation: "None — used verbatim", selectionReason: "FSA's registered business type takes priority over Google's category tag.",
    });
  }

  // FSA-only fields — mirror candidate-dossier.ts:159-160
  for (const [field, key] of [["FSA Establishment ID", "fhrsId"], ["FSA Business Name", "officialBusinessName"], ["Hygiene Rating", "hygieneRating"], ["Hygiene Rating Status", "ratingStatus"], ["Hygiene Rating Date", "ratingDate"]] as const) {
    const finalVal = (bestFsa as any)?.[key] ?? null;
    push({
      field, finalValue: String(finalVal ?? ""), sourceStage: finalVal != null ? "FSA" : "Unresolved", provider: finalVal != null ? "Food Standards Agency" : "n/a",
      sourceReference: fsaRef, retrievalDate: fsaDate, confidence: finalVal != null ? fsaConfidence : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "None — used verbatim from FSA's resolved establishment record", selectionReason: "Sourced only from FSA; no other stage supplies hygiene/registration data.",
    });
  }

  // Google-only fields — mirror candidate-dossier.ts:161-162
  for (const [field, key] of [["Google Place ID", "placeId"], ["Google Business Status", "businessStatus"], ["Google Rating", "rating"], ["Google Review Count", "reviewCount"]] as const) {
    const finalVal = (bestGoogle as any)?.[key] ?? null;
    push({
      field, finalValue: String(finalVal ?? ""), sourceStage: finalVal != null ? "Google" : "Unresolved", provider: finalVal != null ? "Google Places" : "n/a",
      sourceReference: googleRef, retrievalDate: googleDate, confidence: finalVal != null ? googleConfidence : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "None — used verbatim from Google Places' top-ranked result", selectionReason: "Sourced only from Google Places; no other stage supplies rating/review data.",
    });
  }

  // legal_company_name — mirrors candidate-dossier.ts:148
  {
    const finalVal = profile?.company_name ?? (chDecisive ? ch?.plausibleCompanies?.[0]?.companyName ?? null : null);
    push({
      field: "Legal Company Name", finalValue: String(finalVal ?? ""), sourceStage: finalVal != null ? "Companies House" : "Unresolved",
      provider: finalVal != null ? "Companies House" : "n/a", sourceReference: chRef, retrievalDate: chDate, confidence: finalVal != null ? chConfidence : "n/a",
      previousValueOrSource: profile?.company_name ? "n/a (profile-confirmed tier used directly)" : "n/a (no decisive match)",
      replacedOrSupplemented: "n/a (single provider, two internal confirmation tiers)",
      transformation: "None — used verbatim", selectionReason: "Confirmed company-profile record preferred over the plausible-match list when a decisive Companies House match exists.",
    });
  }

  // companies_house_number / status — mirrors candidate-dossier.ts:163-164
  {
    const numVal = profile?.company_number ?? (chDecisive ? ch?.plausibleCompanies?.[0]?.companyNumber ?? null : null);
    push({
      field: "Companies House Number", finalValue: String(numVal ?? ""), sourceStage: numVal != null ? "Companies House" : "Unresolved",
      provider: numVal != null ? "Companies House" : "n/a", sourceReference: chRef, retrievalDate: chDate, confidence: numVal != null ? chConfidence : "n/a",
      previousValueOrSource: "n/a (single provider, two internal confirmation tiers)", replacedOrSupplemented: "n/a",
      transformation: "None — used verbatim", selectionReason: "Confirmed company-profile record preferred over the plausible-match list when a decisive match exists.",
    });
    const statusVal = chDecisive ? (profile?.company_status ?? ch?.companiesHouseStatus ?? null) : null;
    push({
      field: "Company Status", finalValue: String(statusVal ?? ""), sourceStage: statusVal != null ? "Companies House" : "Unresolved",
      provider: statusVal != null ? "Companies House" : "n/a", sourceReference: chRef, retrievalDate: chDate, confidence: statusVal != null ? chConfidence : "n/a",
      previousValueOrSource: "n/a (only populated when the Companies House match is decisive)", replacedOrSupplemented: "n/a",
      transformation: "None — used verbatim", selectionReason: "Only populated when the Companies House match is decisive (exact or strong-probable); left unset otherwise rather than guessed.",
    });
  }

  // directors / pscs / decision-maker — mirror candidate-dossier.ts:170-172
  {
    const directors = officers.filter((o) => o.officer_role === "director" && o.status === "current").map((o) => o.full_name);
    push({
      field: "Directors", finalValue: directors.join("; "), sourceStage: directors.length ? "Companies House" : "Unresolved",
      provider: "Companies House (directors-and-officers register)", sourceReference: chRef, retrievalDate: chDate, confidence: directors.length ? "high (official register)" : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "Filtered to officer_role=director AND status=current from the full officer register.", selectionReason: "Sourced only from Companies House's own officer register.",
    });
    const pscNames = pscs.filter((p) => p.status === "current").map((p) => p.psc_name);
    push({
      field: "PSCs", finalValue: pscNames.join("; "), sourceStage: pscNames.length ? "Companies House" : "Unresolved",
      provider: "Companies House (persons-with-significant-control register)", sourceReference: chRef, retrievalDate: chDate, confidence: pscNames.length ? "high (official register)" : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "Filtered to status=current from the full PSC register.", selectionReason: "Sourced only from Companies House's own PSC register.",
    });
    push({
      field: "Ranked Decision-Maker", finalValue: topDecisionMaker ? `${topDecisionMaker.full_name} (${topDecisionMaker.likely_role})` : "",
      sourceStage: topDecisionMaker ? "Companies House" : "Unresolved", provider: topDecisionMaker ? "Companies House (decision-maker-candidates ranking)" : "n/a",
      sourceReference: chRef, retrievalDate: chDate, confidence: topDecisionMaker ? "medium (ranked candidate, not independently verified)" : "n/a",
      previousValueOrSource: decisionMakers.length > 1 ? `Next-ranked alternate (not selected): ${decisionMakers[1].full_name} (${decisionMakers[1].likely_role})` : "n/a (no other ranked candidate)",
      replacedOrSupplemented: "n/a (rank-1 always selected when present)",
      transformation: "Ranked list sorted by rank ascending; rank 1 selected.", selectionReason: "Companies House stage's own decision-maker-candidates.csv ranking (built from officer/PSC/public-profile evidence gathered up to that stage) — rank 1 taken as the primary contact.",
    });
  }

  // group_franchise_classification — mirrors candidate-dossier.ts:177
  {
    const finalVal = groupRescreen?.classification ?? "ownership_unresolved";
    push({
      field: "Group / Franchise Classification", finalValue: String(finalVal), sourceStage: "Group Rescreen", provider: "AspectLead group/franchise registry cross-check",
      sourceReference: "final-group-rescreen-results.json", retrievalDate: "", confidence: finalVal === "ownership_unresolved" ? "n/a (unresolved)" : "medium (registry cross-check)",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "None — used verbatim", selectionReason: "Computed by the group-rescreen stage against the approved group/franchise registry; not sourced from an external provider.",
    });
  }

  // product fit (cuisine tags / service model) — website stage only
  {
    const cuisineTags = website?.cuisineTags ?? [];
    const serviceModel = website?.serviceModel ?? null;
    push({
      field: "Product Fit (Cuisine Tags / Service Model)", finalValue: `cuisine=${JSON.stringify(cuisineTags)}; serviceModel=${JSON.stringify(serviceModel)}`,
      sourceStage: (cuisineTags.length || serviceModel) ? "Website" : "Unresolved", provider: "Official business website (menu/page crawl analysis)",
      sourceReference: "website-extracted-data.json (cuisineTags/serviceModel)", retrievalDate: websiteDate, confidence: (cuisineTags.length || serviceModel) ? "medium (derived from crawled page/menu text)" : "n/a",
      previousValueOrSource: "n/a (single-source field — no fallback in the pipeline)", replacedOrSupplemented: "n/a (single source)",
      transformation: "Derived by the website stage's own menu/page text analysis, not a verbatim extracted value.", selectionReason: "Product-fit signals are sourced only from the website/menu crawl; no other stage analyses product fit.",
    });
  }

  // qualification / scoring — AspectLead's own rules, not an external provider
  for (const [field, val] of [["Qualification Status", m.qualificationStatus], ["Channel Eligibility", m.channelEligibility], ["Final Lead Level", m.finalOutcome?.level ?? ""], ["Commercial Priority Score", m.commercialPriorityScore], ["Telesales Score", m.finalOutcome?.channelSuitability?.telesalesScore], ["Field Sales Score", m.finalOutcome?.channelSuitability?.fieldSalesScore]] as const) {
    push({
      field, finalValue: String(val ?? ""), sourceStage: "Final-Scoring", provider: "AspectLead qualification/scoring rules v2 (not an external data provider)",
      sourceReference: "run-final-scoring-stage-v2.ts (rulesetVersion v2)", retrievalDate: "", confidence: "n/a (rule-computed, not a match-confidence field)",
      previousValueOrSource: "n/a (computed once per candidate from all upstream evidence; not a source-priority field)",
      replacedOrSupplemented: "n/a", transformation: "Computed by AspectLead's own hard-gate/scoring rules from all upstream stage evidence combined.",
      selectionReason: "Not sourced from any external provider — this is AspectLead's own rule output, included here for completeness per the requested field coverage.",
    });
  }

  // Business Category Eligibility / CTO Business Type / Trading Status — the 3 new (2026-08-02)
  // AspectLead-computed decision fields, run through the real authoritative engine functions
  // against this candidate's full dossier (never reconstructed/mirrored, unlike the source-priority
  // fields above — these are rule outputs, the same category as the qualification/scoring block).
  {
    const dossier = raw.dossierById.get(candidateId) as Dossier | undefined;
    if (dossier) {
      const businessCategory = evaluateBusinessCategoryEligibility(dossier);
      push({
        field: "Business Category Eligibility", finalValue: businessCategory.outcome, sourceStage: "Final-Scoring (business-category-eligibility.ts)",
        provider: "AspectLead business-category eligibility rules (not an external data provider)",
        sourceReference: "business-category-eligibility.ts (locked policy 2026-08-02)", retrievalDate: "", confidence: businessCategory.confidence,
        previousValueOrSource: "n/a (computed once per candidate from all upstream evidence; not a source-priority field)",
        replacedOrSupplemented: "n/a", transformation: businessCategory.evidenceSummary,
        selectionReason: "Not sourced from any external provider — combined FSA/Google/website category evidence evaluated against the locked café/bubble-tea principal-operation rules.",
      });

      const isQualifiedForCto = dossier.qualificationStatus === "qualified" || dossier.qualificationStatus === "qualified_with_channel_limit";
      if (isQualifiedForCto && businessCategory.outcome === "eligible_foodservice") {
        const ctoMapping = mapCtoBusinessType(dossier, vocabulary);
        push({
          field: "CTO Business Type", finalValue: ctoMapping.selectedBusinessTypes.join(", "), sourceStage: "Final-Scoring (cto-business-type-mapping.ts)",
          provider: "AspectLead CTO Business Type mapping rules (not an external data provider)",
          sourceReference: `cto-business-type-mapping.ts against ${ctoMapping.vocabularyVersion}`, retrievalDate: "", confidence: ctoMapping.mappingConfidence,
          previousValueOrSource: "n/a (computed once per candidate from all upstream evidence; not a source-priority field)",
          replacedOrSupplemented: "n/a", transformation: `Mapping method: ${ctoMapping.mappingMethod}. Evidence: ${ctoMapping.sourceEvidence}`,
          selectionReason: ctoMapping.mappingReason,
        });
      } else {
        push({
          field: "CTO Business Type", finalValue: "", sourceStage: "Final-Scoring (cto-business-type-mapping.ts)",
          provider: "AspectLead CTO Business Type mapping rules (not an external data provider)",
          sourceReference: "cto-business-type-mapping.ts", retrievalDate: "", confidence: "n/a",
          previousValueOrSource: "n/a", replacedOrSupplemented: "n/a",
          transformation: "Not computed — CTO Business Type mapping only ever runs for an already-eligible, qualified candidate.",
          selectionReason: `Skipped: qualificationStatus="${dossier.qualificationStatus}", businessCategoryEligibility="${businessCategory.outcome}".`,
        });
      }

      const f = dossier.fields;
      const rawGoogleStatus = (f.google_business_status as string | null) ?? null;
      const rawChStatus = (f.companies_house_status as string | null) ?? null;
      const rawWebsiteClosure = (f.website_closure_evidence as string | null) ?? null;
      push({
        field: "Trading Status (Consolidated)", finalValue: `google=${rawGoogleStatus ?? "n/a"}; companiesHouse=${rawChStatus ?? "n/a"}; website=${rawWebsiteClosure ?? "n/a"}`,
        sourceStage: "Final-Scoring (master-field-resolver.ts trading-status consolidation)",
        provider: "AspectLead trading-status consolidation rules (not an external data provider)",
        sourceReference: "master-field-resolver.ts (locked policy 2026-08-02)", retrievalDate: "",
        confidence: "n/a (see Master export's own trading_status_confidence field for the consolidated result)",
        previousValueOrSource: "n/a (raw per-source values shown in finalValue; consolidation logic is deterministic, not a source-priority pick)",
        replacedOrSupplemented: "n/a", transformation: "Google permanently/temporarily-closed and Companies House dissolved/liquidation status take priority; website closure text is held as conflicting evidence when no CH/Google closure signal exists.",
        selectionReason: "Combines all 3 independent closure/status signals rather than trusting any single source alone.",
      });
    }
  }

  return rows;
}

async function main() {
  const territoryManifestPath = arg("territory-manifest");
  const out = arg("out");
  const filePrefix = arg("file-prefix") ?? "provenance";
  if (!territoryManifestPath || !out) {
    console.error("Usage: --territory-manifest=<path> --out=<dir> --file-prefix=<Name_TERRITORY>");
    process.exit(1);
  }
  const territoryManifest = await readJson(territoryManifestPath);
  const districts = Object.values(territoryManifest.districts) as { district: string; outDir: string }[];

  // Scope: usable leads only (premium + releasable + key accounts), read from each district's
  // own Master export (Evidence Register + Operationally Usable Leads sheets already list exactly
  // which candidates were accepted and their Permanent Lead ID <-> raw candidateId mapping).
  const territoryMasterPath = arg("master-workbook");
  if (!territoryMasterPath) { console.error("--master-workbook=<combined Master xlsx path> is required"); process.exit(1); }
  const wb = XLSX.readFile(territoryMasterPath);
  const evidenceRows = XLSX.utils.sheet_to_json(wb.Sheets["Evidence Register"], { defval: null }) as any[];
  const usableRows = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"], { defval: null }) as any[];
  const usableLeadIds = new Set(usableRows.map((r: any) => r["Permanent Lead ID"]));
  const scope = evidenceRows.filter((r: any) => usableLeadIds.has(r["Lead ID"])).map((r: any) => ({ leadId: r["Lead ID"], candidateId: r["Candidate ID"], district: r["District"] }));
  console.log(`Provenance scope: ${scope.length} usable leads across ${districts.length} districts`);

  const vocabulary = await loadCtoBusinessTypeVocabulary();
  const allRows: ProvenanceRow[] = [];
  for (const d of districts) {
    const districtScope = scope.filter((s) => s.district === d.district);
    if (!districtScope.length) continue;
    const raw = await loadDistrictRaw(d.outDir);
    let districtRowCount = 0;
    for (const s of districtScope) {
      const rows = buildRowsForCandidate(s.leadId, s.candidateId, raw, vocabulary);
      allRows.push(...rows);
      districtRowCount += rows.length;
    }
    console.log(`${d.district}: ${districtScope.length} leads, ${districtRowCount} provenance rows`);
  }

  const columns = ["leadId", "field", "finalValue", "sourceStage", "provider", "sourceReference", "retrievalDate", "confidence", "previousValueOrSource", "replacedOrSupplemented", "transformation", "selectionReason"];
  const headerLabels: Record<string, string> = {
    leadId: "Lead ID", field: "Final Field", finalValue: "Final Value", sourceStage: "Source Stage", provider: "Provider",
    sourceReference: "Source Reference", retrievalDate: "Retrieval Date", confidence: "Confidence",
    previousValueOrSource: "Previous Value / Source", replacedOrSupplemented: "Replaced or Supplemented",
    transformation: "Transformation Applied", selectionReason: "Selection Reason",
  };
  const csvRows = allRows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[headerLabels[c]] = (r as any)[c];
    return o;
  });
  const csvContent = writeCsv(columns.map((c) => headerLabels[c]), csvRows);
  const outPath = path.join(out, `${filePrefix}_Field_Provenance.csv`);
  await fs.writeFile(outPath, csvContent);
  console.log(`\nWrote ${outPath}: ${allRows.length} provenance rows across ${scope.length} leads`);
}
main().catch((e) => { console.error(e); process.exit(1); });
