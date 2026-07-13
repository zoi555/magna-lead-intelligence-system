// Pipeline stage definitions + handlers — NOW SPRINT #2 (19 stages).
// Each returns output records + rejected count + typed errors + notes + optional
// accounting (held/warning/source/api calls). Network stages: fetch_fsa,
// fetch_just_eat, companies_house_status_gate, companies_house_directors_enrichment.

import type {
  WorkingRecord,
  RunConfig,
  StageId,
  PipelineError,
  ErrorCode,
  ErrorSeverity,
  LeadCandidate,
  ScoreResult,
  FinalLeadRow,
  TelesalesSafeRow,
  GooglePlacesEnrichment,
  CompaniesHouseEnrichment,
} from "./types";
import { getFsaEstablishments, getFsaEstablishmentsMock } from "../sources/fsa";
import { pullJustEatForOutcodes, getJustEatConfig } from "../sources/just-eat";
import { loadJustEatPool, saveJustEatPool, fanInJustEat } from "./source-fan-in";
import { CompaniesHouseRunner, getCompaniesHouseConfig, explainCompaniesHouseStatus } from "../sources/companies-house";
import { gateCompaniesHouse, compareAddresses } from "./companies-house-status-gate";
import { enrichDirectors } from "./companies-house-directors-stage";
import { enrichFinancials } from "./companies-house-financials-stage";
import { buildLinkedInQueues } from "./linkedin-research-queue";
import { runPlatformDiscovery } from "./platform-discovery-stage";
import { GooglePlacesRunner, isGooglePlacesEnabled, getGooglePlacesConfig } from "../sources/google-places";
import { postcodeScore } from "./address-matching";
import { scoreCompleteness } from "./data-completeness";
import { computeFsaLegitimacy } from "./fsa-legitimacy";
import { computeCommercial, computeOpportunityForGrade } from "./commercial-calculation";
import { monthlyValueBand, opportunityValueBand } from "@/config/commercial-assumptions";
import { scoreCandidate } from "./scoring";
import { classifyCategory, isCandidateFit } from "./category-rules";
import { loadCustomerList } from "../sources/customer-list-import";
import { classifyCustomer, buildCustomerIndex } from "./customer-exclusion";
import { loadDeliveryEvidence, buildDeliveryPresence, STAGE_PLATFORMS } from "./delivery-platform-stage";
import { writeExports, writeTomorrowSalesExports, writeResearchExports, writeGoogleEnrichmentExports } from "./export-leads";

// Loaded once at module init (server-side; absent files are handled, no throw).
const CUSTOMER_LIST = loadCustomerList();
const CUSTOMER_INDEX = buildCustomerIndex(CUSTOMER_LIST.customers);
const DELIVERY_EVIDENCE = loadDeliveryEvidence();
// One Companies House runner per process — carries the shared per-run call cap.
const CH_RUNNER = new CompaniesHouseRunner();
export const CUSTOMER_LIST_META = { loaded: CUSTOMER_LIST.loaded, path: CUSTOMER_LIST.path, rows: CUSTOMER_LIST.rowsLoaded };
export const DELIVERY_EVIDENCE_META = { loaded: DELIVERY_EVIDENCE.loaded, path: DELIVERY_EVIDENCE.path, rows: DELIVERY_EVIDENCE.rows.length };

const DEFAULT_GP: GooglePlacesEnrichment = {
  source: "google_places", status: "not_configured", confidence: 0, checked_at: null,
  placeId: null, formattedPhone: null, website: null, businessStatus: null,
};

export interface StageContext {
  config: RunConfig;
  referenceDateMs: number;
  checkedAt: string;
}

export interface StageOutput {
  records: WorkingRecord[];
  rejected: number;
  errors: PipelineError[];
  notes: string;
  metrics?: Record<string, number>;
  held?: number;
  warnings?: number;
  source?: string;
  apiCalls?: number;
  apiCapRemaining?: number;
  outputFiles?: string[];
  exportRows?: { finalRows: FinalLeadRow[]; eligibleRows: FinalLeadRow[]; telesalesSafe: TelesalesSafeRow[] };
}

export type StageHandler = (input: WorkingRecord[], ctx: StageContext) => Promise<StageOutput> | StageOutput;

export interface StageDef {
  id: StageId;
  label: string;
  handler: StageHandler;
}

const ERROR_CAP = 100;

function err(
  error_code: ErrorCode,
  stage_id: StageId,
  severity: ErrorSeverity,
  message: string,
  retryable: boolean,
  suggested_fix: string,
  record_id?: string
): PipelineError {
  return { error_code, stage_id, severity, message, retryable, suggested_fix, record_id };
}

function pushCapped(arr: PipelineError[], e: PipelineError) {
  if (arr.length < ERROR_CAP) arr.push(e);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}$/;

function normalisePostcode(pc: string): string {
  const raw = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  if (raw.length < 5) return pc?.toUpperCase().trim() ?? "";
  return `${raw.slice(0, raw.length - 3)} ${raw.slice(-3)}`;
}

function outwardCode(pc: string): string {
  return (pc ?? "").toUpperCase().trim().split(/\s+/)[0] ?? "";
}

function toCandidate(r: WorkingRecord): LeadCandidate {
  return {
    candidateId: r.fsa.fhrsId,
    source: "FSA",
    businessName: r.fsa.businessName,
    businessType: r.fsa.businessType,
    postcode: r.fsa.postcode,
    addressLine: r.fsa.addressLine,
    fsaRating: r.fsa.ratingValue,
    fsaNewlyRegistered: r.fsa.newlyRegistered,
    localAuthority: r.fsa.localAuthority,
    latitude: r.fsa.latitude,
    longitude: r.fsa.longitude,
    territoryCode: r.territoryCode ?? outwardCode(r.fsa.postcode),
  };
}

function deriveTrigger(r: WorkingRecord, _score: ScoreResult): string {
  if (r.justEat?.isPlatformOnly) return "Active on Just Eat (platform-only)";
  if (r.fsa.newlyRegistered) return "New FSA registration";
  if (r.justEat?.matched) return "FSA + live Just Eat presence";
  if (Number.parseInt(r.fsa.ratingValue, 10) >= 5) return "Top hygiene rating";
  return "Territory match";
}

export const STAGE_DEFS: StageDef[] = [
  {
    id: "configure_run",
    label: "Configure run",
    handler: (input, ctx) => ({
      records: input,
      rejected: 0,
      errors: [],
      notes: `territory=[${ctx.config.postcode_prefixes.join(", ")}] mode=${ctx.config.mode} fsaPageSize=${ctx.config.fsa_page_size}`,
      source: "config",
    }),
  },
  {
    id: "fetch_fsa",
    label: "Fetch FSA (FHRS)",
    handler: async (_input, ctx) => {
      const errors: PipelineError[] = [];
      let records: WorkingRecord[] = [];
      let notes = "";
      try {
        const est = await getFsaEstablishments(ctx.config.postcode_prefixes, ctx.config.mode, {
          pageSize: ctx.config.fsa_page_size,
          referenceDateMs: ctx.referenceDateMs,
        });
        records = est.map((f) => ({ fsa: f, sourceNames: ["FSA"] }));
        notes = `pulled ${records.length} FSA establishments (${ctx.config.mode})`;
        if (records.length === 0)
          errors.push(err("FSA_EMPTY_RESULT", "fetch_fsa", "warning", "FSA returned no establishments for the territory", false, "Widen the territory or verify FSA availability"));
      } catch (e) {
        errors.push(err("FSA_FETCH_FAILED", "fetch_fsa", "error", `Live FSA pull failed: ${msg(e)} — fell back to mock fixtures`, true, "Retry with `npm run leads:resume`, or check network/FSA status"));
        records = getFsaEstablishmentsMock(ctx.config.postcode_prefixes).map((f) => ({ fsa: f, sourceNames: ["FSA"] }));
        notes = `LIVE PULL FAILED — fell back to ${records.length} mock establishments`;
      }
      return { records, rejected: 0, errors, notes, source: "FSA (api.ratings.food.gov.uk)" };
    },
  },
  {
    id: "fetch_just_eat",
    label: "Fetch Just Eat (platform)",
    handler: async (input, ctx) => {
      const cfg = getJustEatConfig();
      const errors: PipelineError[] = [];
      if (!cfg.enabled) {
        // Disabled — clear any stale pool so fan-in adds nothing, and pass FSA through.
        saveJustEatPool([]);
        errors.push(err("PLATFORM_NOT_CONFIGURED", "fetch_just_eat", "info", "Just Eat disabled (JUST_EAT_ENABLED not 'true') — pipeline continues on FSA only.", false, "Set JUST_EAT_ENABLED=true in .env.local to enable the live pull"));
        return { records: input, rejected: 0, errors, notes: "Just Eat disabled — no platform pull", source: "Just Eat (disabled)", apiCalls: 0, apiCapRemaining: cfg.maxCallsPerRun, metrics: { enabled: 0, calls_made: 0, just_eat_records: 0, in_area: 0, outside_but_serves: 0, failures: 0 } };
      }
      try {
        const { restaurants, perOutcode, callsMade, capped } = await pullJustEatForOutcodes(ctx.config.postcode_prefixes);
        saveJustEatPool(restaurants);
        const failures = perOutcode.filter((p) => !p.ok);
        for (const f of failures) errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "fetch_just_eat", "warning", `Just Eat outcode ${f.outcode} failed (${f.httpStatus ?? f.error}) — continuing.`, true, "Retry later; FSA still covers this area"));
        if (capped) errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "fetch_just_eat", "info", "Just Eat call cap reached before all outcodes fetched.", false, "Raise JUST_EAT_MAX_CALLS_PER_RUN if needed"));
        const byClass = restaurants.reduce<Record<string, number>>((a, r) => { a[r.territoryClass] = (a[r.territoryClass] ?? 0) + 1; return a; }, {});
        return {
          records: input,
          rejected: 0,
          errors,
          notes: `Just Eat: ${restaurants.length} unique · calls ${callsMade}${capped ? " (capped)" : ""} · in-area ${byClass.located_in_target_territory ?? 0}`,
          source: "Just Eat (uk.api.just-eat.io)",
          apiCalls: callsMade,
          apiCapRemaining: Math.max(0, cfg.maxCallsPerRun - callsMade),
          warnings: failures.length,
          metrics: { enabled: 1, calls_made: callsMade, just_eat_records: restaurants.length, in_area: byClass.located_in_target_territory ?? 0, outside_but_serves: byClass.outside_target_but_serves ?? 0, failures: failures.length },
        };
      } catch (e) {
        saveJustEatPool([]);
        errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "fetch_just_eat", "warning", `Just Eat live source blocked/unavailable: ${msg(e)} — continuing on FSA.`, true, "Retry later"));
        return { records: input, rejected: 0, errors, notes: "Just Eat pull failed — continuing on FSA", source: "Just Eat (error)", apiCalls: 0 };
      }
    },
  },
  {
    id: "platform_discovery",
    label: "Platform public evidence",
    handler: async (input, ctx) => {
      // Collect public business-level platform evidence (Just Eat live; Deliveroo /
      // Uber Eats = compliant search-URL evidence or imported CSV — no scraping).
      const errors: PipelineError[] = [];
      try {
        const res = await runPlatformDiscovery(ctx.config.run_id, ctx.config.postcode_prefixes);
        if (res.failures.length) errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "platform_discovery", "info", `${res.failures.length} platform-area evidence gaps (Deliveroo/Uber are evidence-only — no scraping).`, false, "Import platform evidence CSV to fill Deliveroo/Uber"));
        return {
          records: input, rejected: 0, errors,
          notes: `platform evidence: ${res.records.length} records · ${res.failures.length} gaps`,
          source: "Just Eat (live) + Deliveroo/Uber (evidence)",
          outputFiles: [res.outputs.evidenceCsv, res.outputs.summaryJson, res.outputs.failuresCsv].map((p) => p.replace(process.cwd() + "/", "")),
          metrics: { input_count: input.length, platform_records: res.records.length, failures: res.failures.length, just_eat: res.summary.just_eat_records },
        };
      } catch (e) {
        errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "platform_discovery", "warning", `Platform discovery non-fatal error: ${msg(e)} — continuing.`, true, "Check platform collector"));
        return { records: input, rejected: 0, errors, notes: "platform discovery skipped (non-fatal)", source: "platform collector" };
      }
    },
  },
  {
    id: "source_fan_in",
    label: "Source fan-in (FSA + Just Eat)",
    handler: (input, ctx) => {
      const pool = loadJustEatPool();
      const { records, stats } = fanInJustEat(input, pool, ctx.config.postcode_prefixes);
      const errors: PipelineError[] = [];
      if (stats.conflicts > 0) errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "source_fan_in", "info", `${stats.conflicts} weak FSA↔Just Eat name-only matches flagged for review.`, false, "Review fuzzy matches"));
      return {
        records,
        rejected: 0,
        errors,
        notes: `FSA ${stats.fsa_count} · JE pool ${stats.just_eat_pool} · matched ${stats.fsa_matched_to_je} · platform-only added ${stats.platform_only_added}`,
        source: "FSA + Just Eat",
        metrics: { fsa_count: stats.fsa_count, just_eat_pool: stats.just_eat_pool, matched: stats.fsa_matched_to_je, platform_only_added: stats.platform_only_added, conflicts: stats.conflicts, fsa_only: stats.fsa_only },
      };
    },
  },
  {
    id: "normalise_records",
    label: "Normalise records",
    handler: (input) => {
      const records = input.map((r) => ({
        ...r,
        fsa: {
          ...r.fsa,
          businessName: r.fsa.businessName.trim().replace(/\s+/g, " "),
          postcode: normalisePostcode(r.fsa.postcode),
        },
      }));
      return { records, rejected: 0, errors: [], notes: `normalised ${records.length} records` };
    },
  },
  {
    id: "validate_postcodes",
    label: "Validate postcodes",
    handler: (input) => {
      const kept: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      for (const r of input) {
        if (POSTCODE_RE.test(r.fsa.postcode)) kept.push(r);
        else {
          rejected++;
          pushCapped(errors, err("POSTCODE_INVALID", "validate_postcodes", "warning", `Invalid postcode "${r.fsa.postcode}" (${r.fsa.businessName})`, false, "Fix or geocode the address", r.fsa.fhrsId));
        }
      }
      return { records: kept, rejected, errors, notes: `${kept.length} valid, ${rejected} invalid` };
    },
  },
  {
    id: "territory_filter",
    label: "Territory filter",
    handler: (input, ctx) => {
      const prefixes = new Set(ctx.config.postcode_prefixes.map((p) => p.toUpperCase().replace(/\s+/g, "")));
      const kept: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      for (const r of input) {
        const outward = outwardCode(r.fsa.postcode);
        if (prefixes.has(outward)) kept.push({ ...r, territoryCode: outward });
        else {
          rejected++;
          pushCapped(errors, err("OUTSIDE_TERRITORY", "territory_filter", "info", `${r.fsa.postcode} (${r.fsa.businessName}) outside pilot territory`, false, "Expand territory config if intended", r.fsa.fhrsId));
        }
      }
      return { records: kept, rejected, errors, notes: `${kept.length} in pilot territory` };
    },
  },
  {
    id: "category_filter",
    label: "Category filter",
    handler: (input) => {
      const kept: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      const tiers: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, MANUAL_REVIEW: 0, EXCLUDED: 0 };
      let rejected = 0;
      for (const r of input) {
        const cat = classifyCategory(r.fsa.businessType, r.fsa.businessName);
        tiers[cat.fit] = (tiers[cat.fit] ?? 0) + 1;
        if (!isCandidateFit(cat.fit)) {
          rejected++;
          pushCapped(errors, err("CATEGORY_EXCLUDED", "category_filter", "info", `${r.fsa.businessName}: excluded (${cat.note})`, false, "Refine category-rules.ts if wrong", r.fsa.fhrsId));
          continue;
        }
        kept.push({ ...r, category: { fit: cat.fit, reason: cat.reason, note: cat.note } });
      }
      const metrics = { input_count: input.length, high: tiers.HIGH, medium: tiers.MEDIUM, low: tiers.LOW, manual_review: tiers.MANUAL_REVIEW, excluded: tiers.EXCLUDED };
      return { records: kept, rejected, errors, notes: `HIGH ${tiers.HIGH} · MED ${tiers.MEDIUM} · LOW ${tiers.LOW} · MANUAL ${tiers.MANUAL_REVIEW} · excluded ${tiers.EXCLUDED}`, metrics };
    },
  },
  {
    id: "dedupe_candidates",
    label: "Dedupe candidates",
    handler: (input) => {
      const seenId = new Set<string>();
      const seenNP = new Set<string>();
      const seenAddr = new Set<string>();
      const kept: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      for (const r of input) {
        const id = r.fsa.fhrsId;
        const pc = r.fsa.postcode.replace(/\s+/g, "");
        const np = `${r.fsa.businessName.toLowerCase().replace(/[^a-z0-9]/g, "")}|${pc}`;
        const addr = `${r.fsa.addressLine.toLowerCase().replace(/[^a-z0-9]/g, "")}|${pc}`;
        if ((id && seenId.has(id)) || seenNP.has(np) || (r.fsa.addressLine && seenAddr.has(addr))) {
          rejected++;
          pushCapped(errors, err("DUPLICATE_RECORD", "dedupe_candidates", "info", `Duplicate: ${r.fsa.businessName} (${r.fsa.postcode})`, false, "Keep first occurrence", id));
          continue;
        }
        if (id) seenId.add(id);
        seenNP.add(np);
        if (r.fsa.addressLine) seenAddr.add(addr);
        kept.push(r);
      }
      return { records: kept, rejected, errors, notes: `${kept.length} unique` };
    },
  },
  {
    id: "customer_exclusion",
    label: "Customer exclusion",
    handler: (input) => {
      const errors: PipelineError[] = [];
      let excluded = 0, held = 0;
      const byStatus: Record<string, number> = {};
      const records = input.map((r) => {
        const { match, decision } = classifyCustomer({ businessName: r.fsa.businessName, postcode: r.fsa.postcode, fsaCode: r.fsa.fhrsId }, CUSTOMER_INDEX);
        byStatus[match.status] = (byStatus[match.status] ?? 0) + 1;
        if (decision === "exclude") excluded++;
        else if (decision === "hold") held++;
        return { ...r, customerMatch: match };
      });
      if (!CUSTOMER_LIST.loaded) errors.push(err("EXISTING_CUSTOMER_MATCH", "customer_exclusion", "warning", "No customer list loaded — exclusion NOT guaranteed. Provide imports/customer-list.csv.", false, "Import the real customer list", undefined));
      const metrics = {
        input_count: input.length,
        customer_list_loaded: CUSTOMER_LIST.loaded ? 1 : 0,
        customer_rows: CUSTOMER_LIST.rowsLoaded,
        excluded,
        possible_hold: held,
        new_prospect: byStatus["New Prospect Candidate"] ?? 0,
      };
      return { records, rejected: 0, held: excluded + held, errors, notes: `list ${CUSTOMER_LIST.loaded ? "loaded(" + CUSTOMER_LIST.rowsLoaded + ")" : "NOT loaded"} · exclude ${excluded} · possible-hold ${held} · prospect ${metrics.new_prospect}`, metrics, source: CUSTOMER_LIST.loaded ? CUSTOMER_LIST.path ?? "customer-list" : "none" };
    },
  },
  {
    id: "companies_house_status_gate",
    label: "Companies House status gate",
    handler: async (input, ctx) => {
      const ex = explainCompaniesHouseStatus();
      const cfg = getCompaniesHouseConfig();
      const errors: PipelineError[] = [];
      let matchedActive = 0, dissolvedHold = 0, lowConf = 0, noMatch = 0, held = 0, warnings = 0, capReached = 0;
      const EXISTING = ["Active Account", "Dormant Account", "Former / Closed Account", "Unknown Existing Account"];
      const skipEnvelope = () => ({ source: "companies_house" as const, status: "not_configured" as const, confidence: 0, checked_at: ctx.checkedAt, matched: false, companyNumber: null, companyStatus: null, incorporationDate: null, checked: false, reasonCodes: ["CH_SKIPPED_EXISTING_CUSTOMER"], notes: "skipped — existing customer" });
      const capEnvelope = () => ({ source: "companies_house" as const, status: "not_configured" as const, confidence: 0, checked_at: ctx.checkedAt, matched: false, companyNumber: null, companyStatus: null, incorporationDate: null, checked: false, reasonCodes: ["CH_CALL_CAP_REACHED"], notes: "not checked — status-gate budget reached" });

      // Reserve part of the cap so directors + financials (later stages) get budget too.
      const statusBudget = CH_RUNNER.enabled ? Math.max(1, Math.floor(cfg.maxCallsPerRun * 0.6)) : 0;
      const catRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, MANUAL_REVIEW: 3, EXCLUDED: 4 };
      // Priority: New Prospect Candidates first (highest export value), then holds; better category first.
      const order = input.map((r, i) => i).sort((a, b) => {
        const ra = input[a], rb = input[b];
        const pa = ra.customerMatch?.status === "New Prospect Candidate" ? 0 : 1;
        const pb = rb.customerMatch?.status === "New Prospect Candidate" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (catRank[ra.category?.fit ?? "MEDIUM"] ?? 1) - (catRank[rb.category?.fit ?? "MEDIUM"] ?? 1);
      });

      const envById = new Map<number, CompaniesHouseEnrichment>();
      for (const i of order) {
        const r = input[i];
        if (r.customerMatch && EXISTING.includes(r.customerMatch.status)) { envById.set(i, skipEnvelope()); continue; }
        // Stop matching once the reserved status budget is spent — leave calls for directors/financials.
        if (!CH_RUNNER.enabled || CH_RUNNER.callsMade >= statusBudget || CH_RUNNER.capRemaining <= 0) { envById.set(i, capEnvelope()); if (CH_RUNNER.enabled) capReached++; continue; }
        const match = await CH_RUNNER.matchCompany({ businessName: r.fsa.businessName, postcode: r.fsa.postcode });
        const { envelope, decision } = gateCompaniesHouse(match, ctx.checkedAt);
        if (match.matched) {
          const am = compareAddresses(r.fsa.postcode, r.fsa.addressLine, envelope.registeredOfficeAddress ?? null);
          envelope.registeredOfficePostcode = am.registeredOfficePostcode;
          envelope.addressMatchStatus = am.status;
          envelope.addressMatchConfidence = am.confidence;
          if (am.status === "exact_match" || am.status === "postcode_match") envelope.matchConfidence = Math.min(0.99, (envelope.matchConfidence ?? 0) + 0.05);
          else if (am.differs) (envelope.warnings ??= []).push("CH_REGISTERED_OFFICE_DIFFERS_FROM_FSA_TRADING_ADDRESS");
        }
        if (envelope.reasonCodes?.includes("CH_ACTIVE_COMPANY_MATCH")) matchedActive++;
        if (envelope.reasonCodes?.includes("CH_DISSOLVED_COMPANY_HOLD")) dissolvedHold++;
        if (envelope.reasonCodes?.includes("CH_LOW_CONFIDENCE_MATCH")) lowConf++;
        if (envelope.reasonCodes?.includes("CH_NO_MATCH")) noMatch++;
        if (decision === "hold") held++;
        if ((envelope.warnings?.length ?? 0) > 0) warnings++;
        envById.set(i, envelope);
      }
      // Emit in original order.
      const records: WorkingRecord[] = input.map((r, i) => ({ ...r, companiesHouse: envById.get(i)! }));
      if (!CH_RUNNER.enabled) errors.push(err("ENRICHMENT_NOT_CONFIGURED", "companies_house_status_gate", "info", ex.message + " — every lead continues (nothing excluded).", true, "Set COMPANIES_HOUSE_API_KEY + COMPANIES_HOUSE_ENABLED=true + a call cap"));
      if (capReached > 0) errors.push(err("ENRICHMENT_NOT_CONFIGURED", "companies_house_status_gate", "info", `${capReached} leads not status-checked — reserved status budget (~60% of ${cfg.maxCallsPerRun}) spent; remaining calls reserved for directors/financials.`, false, "Raise COMPANIES_HOUSE_MAX_CALLS_PER_RUN to check more"));
      const metrics = { input_count: input.length, enabled: CH_RUNNER.enabled ? 1 : 0, active_match: matchedActive, dissolved_hold: dissolvedHold, low_confidence: lowConf, no_match: noMatch, held, cap_reached: capReached };
      return { records, rejected: 0, held, warnings, errors, notes: `${CH_RUNNER.enabled ? "live" : "disabled"} · active ${matchedActive} · dissolved-hold ${dissolvedHold} · no-match ${noMatch}`, source: CH_RUNNER.enabled ? "Companies House (live)" : "Companies House (disabled)", apiCalls: CH_RUNNER.callsMade, apiCapRemaining: CH_RUNNER.capRemaining, metrics };
    },
  },
  {
    id: "companies_house_directors_enrichment",
    label: "Companies House directors",
    handler: async (input, ctx) => {
      const errors: PipelineError[] = [];
      let withDirectors = 0, officersTotal = 0;
      const records: WorkingRecord[] = [];
      for (const r of input) {
        const directors = await enrichDirectors(r.companiesHouse, CH_RUNNER, ctx.checkedAt);
        if (directors.officers.length) { withDirectors++; officersTotal += directors.officers.length; }
        records.push({ ...r, directors });
      }
      if (!CH_RUNNER.enabled) errors.push(err("ENRICHMENT_NOT_CONFIGURED", "companies_house_directors_enrichment", "info", "Companies House disabled — no directors fetched (internal research only when enabled).", true, "Enable Companies House to fetch officers"));
      const metrics = { input_count: input.length, leads_with_directors: withDirectors, officers_total: officersTotal };
      return { records, rejected: 0, errors, notes: `${withDirectors} leads with directors · ${officersTotal} officers (internal only)`, source: CH_RUNNER.enabled ? "Companies House officers" : "disabled", apiCalls: CH_RUNNER.callsMade, apiCapRemaining: CH_RUNNER.capRemaining, metrics };
    },
  },
  {
    id: "companies_house_financials_stage",
    label: "Companies House financials",
    handler: async (input, ctx) => {
      const errors: PipelineError[] = [];
      let structured = 0, pdfOnly = 0, unavailable = 0, ratiosCalc = 0;
      const bandDist: Record<string, number> = { strong: 0, acceptable: 0, weak: 0, high_risk: 0, unknown: 0 };
      const records: WorkingRecord[] = [];
      for (const r of input) {
        const financials = await enrichFinancials(r.companiesHouse, CH_RUNNER, ctx.referenceDateMs);
        if (financials.available) structured++;
        else if (financials.status === "pdf_only_manual_review") pdfOnly++;
        else unavailable++;
        if (financials.analysis && Object.values(financials.analysis.ratios).some((v) => v != null)) ratiosCalc++;
        bandDist[financials.analysis?.healthBand ?? "unknown"] = (bandDist[financials.analysis?.healthBand ?? "unknown"] ?? 0) + 1;
        records.push({ ...r, financials });
      }
      if (!CH_RUNNER.enabled) errors.push(err("ENRICHMENT_NOT_CONFIGURED", "companies_house_financials_stage", "info", "Companies House disabled — no financials discovered (internal risk inputs only when enabled).", true, "Enable Companies House"));
      errors.push(err("ENRICHMENT_NOT_CONFIGURED", "companies_house_financials_stage", "info", "Financial values are raw Companies House data used only for risk/confidence — never treated as spend, never in telesales export.", false, "See docs/46"));
      const metrics = { input_count: input.length, structured_financials: structured, pdf_only: pdfOnly, unavailable, ratios_calculated: ratiosCalc, health_strong: bandDist.strong, health_acceptable: bandDist.acceptable, health_weak: bandDist.weak, health_high_risk: bandDist.high_risk, health_unknown: bandDist.unknown };
      return { records, rejected: 0, errors, notes: `structured ${structured} · pdf-only ${pdfOnly} · unavailable ${unavailable} · ratios ${ratiosCalc}`, source: CH_RUNNER.enabled ? "Companies House accounts + documents" : "disabled", apiCalls: CH_RUNNER.callsMade, apiCapRemaining: CH_RUNNER.capRemaining, metrics };
    },
  },
  {
    id: "google_places_enrichment",
    label: "Google Places enrichment",
    handler: async (input, ctx) => {
      // Fills phone/website/rating/review_count when enabled (paid, capped). Prioritises
      // real prospects; skips excluded customers, holds and dissolved companies to save budget.
      const runner = new GooglePlacesRunner();
      const enabled = isGooglePlacesEnabled();
      const cfg = getGooglePlacesConfig();
      const EXISTING = ["Active Account", "Dormant Account", "Former / Closed Account", "Unknown Existing Account", "Possible Existing Account"];
      const worthEnriching = (r: WorkingRecord): boolean => {
        const cs = r.customerMatch?.status;
        if (cs && EXISTING.includes(cs)) return false; // don't spend paid calls on excluded/held customers
        if (r.companiesHouse?.holdReason) return false; // dissolved/insolvent hold
        return true;
      };
      // Priority: new prospect → HIGH category → FSA+Just Eat matched → the rest.
      const catRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, MANUAL_REVIEW: 3, EXCLUDED: 4 };
      const order = input.map((_, i) => i).filter((i) => worthEnriching(input[i])).sort((a, b) => {
        const ra = input[a], rb = input[b];
        const pa = ra.customerMatch?.status === "New Prospect Candidate" ? 0 : 1;
        const pb = rb.customerMatch?.status === "New Prospect Candidate" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const cr = (catRank[ra.category?.fit ?? "MEDIUM"] ?? 1) - (catRank[rb.category?.fit ?? "MEDIUM"] ?? 1);
        if (cr !== 0) return cr;
        return (rb.justEat?.matched ? 1 : 0) - (ra.justEat?.matched ? 1 : 0);
      });

      const snapshots = new Map<number, WorkingRecord["googleContact"]>();
      let enriched = 0, phones = 0, websites = 0, ratings = 0, noMatch = 0, lowConf = 0;
      if (enabled) {
        for (const i of order) {
          if (runner.capRemaining <= 0) break;
          const r = input[i];
          const g = await runner.enrich({ businessName: r.fsa.businessName, postcode: r.fsa.postcode, address: r.fsa.addressLine });
          if (g.status === "cap_reached") break;
          const gPc = (g.formattedAddress ?? "").toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0]?.replace(/\s+/g, "") ?? "";
          // Google search is by "name postcode", so a hit is already name-aligned;
          // postcode agreement is the strong confirmation signal (address-first).
          const conf = g.matched ? Math.min(0.97, 0.5 + 0.45 * postcodeScore(r.fsa.postcode, gPc)) : 0;
          if (g.matched && conf < 0.45) lowConf++;
          if (!g.matched) noMatch++;
          const snap: WorkingRecord["googleContact"] = {
            status: g.status, matched: g.matched, placeId: g.placeId, mapsUrl: g.googleMapsUri,
            businessName: null, formattedAddress: g.formattedAddress, postcode: gPc || null,
            latitude: g.latitude, longitude: g.longitude, phone: g.formattedPhone, internationalPhone: null,
            website: g.website, businessStatus: g.businessStatus, types: g.types ?? [], rating: g.rating, reviewCount: g.reviewCount,
            matchConfidence: Number(conf.toFixed(2)), matchReason: g.matched ? `postcode+name conf ${(conf * 100) | 0}%` : "no Google match", warnings: g.warning ? [g.warning] : [],
          };
          snapshots.set(i, snap);
          if (g.matched && conf >= 0.45) {
            enriched++;
            if (g.formattedPhone) phones++;
            if (g.website) websites++;
            if (g.rating != null) ratings++;
          }
        }
      }

      const records = input.map((r, i) => {
        const snap = snapshots.get(i);
        if (!snap || !snap.matched || snap.matchConfidence < 0.45) return { ...r, googleContact: snap };
        // Map contact back so scoring/completeness/exports pick it up.
        const gp = { ...(r.googlePlaces ?? { source: "google_places" as const, status: "not_configured" as const, confidence: 0, checked_at: ctx.checkedAt, placeId: null, formattedPhone: null, website: null, businessStatus: null }) };
        gp.status = "found";
        gp.placeId = snap.placeId;
        gp.formattedPhone = snap.phone ?? gp.formattedPhone;
        gp.website = snap.website ?? gp.website;
        gp.businessStatus = snap.businessStatus;
        gp.confidence = snap.matchConfidence;
        gp.checked_at = ctx.checkedAt;
        return { ...r, googleContact: snap, googlePlaces: gp };
      });

      let files: string[] = [];
      try { files = writeGoogleEnrichmentExports(ctx.config.run_id, records); } catch { /* non-fatal */ }

      const errors: PipelineError[] = [
        !enabled
          ? err("ENRICHMENT_NOT_CONFIGURED", "google_places_enrichment", "warning", "Google Places DISABLED — contact enrichment INCOMPLETE. Set GOOGLE_PLACES_API_KEY + GOOGLE_PLACES_ENABLED=true + a call cap.", false, "Enable Google Places")
          : err("ENRICHMENT_NOT_CONFIGURED", "google_places_enrichment", "info", `Google Places: enriched ${enriched} · phones ${phones} · websites ${websites} · ${runner.callsMade} calls.`, false, "—"),
      ];
      return {
        records, rejected: 0, errors,
        notes: enabled ? `enriched ${enriched} · phones ${phones} · websites ${websites} · no-match ${noMatch}` : "disabled — contact enrichment incomplete",
        source: enabled ? "Google Places (live)" : "Google Places (disabled)",
        apiCalls: runner.callsMade, apiCapRemaining: runner.capRemaining,
        outputFiles: files,
        metrics: { input_count: input.length, enabled: enabled ? 1 : 0, prioritised: order.length, enriched, phones, websites, ratings, no_match: noMatch, low_confidence: lowConf, calls: runner.callsMade, cap: cfg.maxCallsPerRun },
      };
    },
  },
  {
    id: "linkedin_research_queue_generation",
    label: "LinkedIn research queue",
    handler: (input, ctx) => {
      // Public search URLs only — NO scraping, login, cookies, or automation.
      const { directorRows, businessRows } = buildLinkedInQueues(input);
      let files: string[] = [];
      try {
        files = writeResearchExports(ctx.config.run_id, input, directorRows, businessRows);
      } catch (e) {
        return { records: input, rejected: 0, errors: [err("EXPORT_WRITE_FAILED", "linkedin_research_queue_generation", "warning", `Research queue write failed: ${msg(e)}`, true, "Check exports/ permissions")], notes: "research queue write failed" };
      }
      const records = input.map((r) => ({
        ...r,
        linkedin: {
          directorResearchStatus: (r.directors?.officers.length ?? 0) > 0 ? "pending_manual_review" : "none",
          businessResearchStatus: "pending_manual_review",
          businessSearchQuery: `"${r.fsa.businessName}" "${r.fsa.postcode}" LinkedIn`,
          businessSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${r.fsa.businessName}" "${r.fsa.postcode}" site:linkedin.com`)}`,
          businessGoogleUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${r.fsa.businessName}" "${r.fsa.postcode}" LinkedIn`)}`,
          directorRows: r.directors?.officers.filter((o) => o.active).length ?? 0,
        },
      }));
      const metrics = { input_count: input.length, director_rows: directorRows.length, business_rows: businessRows.length };
      return { records, rejected: 0, errors: [], notes: `director rows ${directorRows.length} · business rows ${businessRows.length} (manual research, not scraped)`, source: "public search URLs", outputFiles: files, metrics };
    },
  },
  {
    id: "delivery_platform_presence_summary",
    label: "Delivery platform presence",
    handler: (input) => {
      let present = 0, manual = 0, notChecked = 0, absent = 0, checked = 0;
      const evidence = DELIVERY_EVIDENCE.rows;
      const records = input.map((r) => {
        const pres = buildDeliveryPresence({ businessName: r.fsa.businessName, postcode: r.fsa.postcode }, evidence);
        // Overlay REAL Just Eat presence from the fan-in over the generated search URL.
        if (r.justEat?.matched && r.justEat.url) {
          pres.perPlatform.just_eat = { status: "present", evidence_url: r.justEat.url, confidence: r.justEat.matchConfidence };
          if (!pres.summary.includes("Just Eat")) pres.summary = `Just Eat present. ${pres.summary}`;
        } else if (r.justEat && !r.justEat.matched && !r.justEat.isPlatformOnly) {
          // Checked Just Eat, no listing found → absent (real signal).
          pres.perPlatform.just_eat = { status: "absent", evidence_url: pres.perPlatform.just_eat?.evidence_url ?? "", confidence: 0.5 };
        }
        const statuses = STAGE_PLATFORMS.map((p) => pres.perPlatform[p].status);
        if (statuses.includes("present")) { present++; checked++; }
        else if (statuses.every((s) => s === "absent")) { absent++; checked++; }
        else if (statuses.includes("manual_review_required")) manual++;
        else notChecked++;
        return { ...r, platform: pres };
      });
      const errors: PipelineError[] = [
        err("PLATFORM_TERMS_RISK", "delivery_platform_presence_summary", "info", "Just Eat presence is from the approved public discovery endpoint; Uber Eats / Deliveroo remain manual/import evidence — no scraping, login, captcha bypass, proxies, or bulk copying.", false, "Use approved public methods or import evidence"),
      ];
      if (manual > 0) errors.push(err("PLATFORM_CHECK_MANUAL_REQUIRED", "delivery_platform_presence_summary", "info", `${manual} businesses need a manual delivery-presence check`, false, "Assign manual checks"));
      const metrics = { input_count: input.length, checked_count: checked, present_count: present, absent_count: absent, not_checked_count: notChecked, manual_review_count: manual };
      return { records, rejected: 0, warnings: manual, errors, notes: `present ${present} · absent ${absent} · manual ${manual} · not-checked ${notChecked}`, source: "Just Eat (live) + delivery evidence", metrics };
    },
  },
  {
    id: "data_completeness",
    label: "Data completeness scoring",
    handler: (input) => {
      const bands: Record<string, number> = { ready: 0, usable: 0, weak: 0, poor: 0 };
      let total = 0;
      const records = input.map((r) => {
        const present = (r.platform?.perPlatform ?? {});
        const platformUrl = r.justEat?.url ?? Object.values(present).find((c) => c.evidence_url)?.evidence_url ?? null;
        const c = scoreCompleteness({
          businessName: r.fsa.businessName,
          tradingAddress: r.fsa.addressLine,
          postcode: r.fsa.postcode,
          phone: r.googlePlaces?.formattedPhone ?? null,
          website: r.googlePlaces?.website ?? null,
          platformUrl,
          fsaRecord: !r.justEat?.isPlatformOnly, // platform-only records have no FSA registration
          googlePlace: r.googlePlaces?.status === "found",
          ratingOrReviewCount: (r.justEat?.ratingCount ?? 0) > 0 || r.justEat?.ratingAverage != null,
          customerExclusionChecked: !!r.customerMatch,
          companiesHouseChecked: !!r.companiesHouse?.checked,
          sourceEvidenceUrl: platformUrl,
          coordinates: r.fsa.latitude != null && r.fsa.longitude != null,
        });
        bands[c.completeness_band] = (bands[c.completeness_band] ?? 0) + 1;
        total += c.data_completeness_score;
        return { ...r, completeness: { score: c.data_completeness_score, band: c.completeness_band, missing: c.missing_fields, enrichmentNeeded: c.enrichment_needed } };
      });
      const avg = input.length ? Math.round(total / input.length) : 0;
      const errors: PipelineError[] = [];
      if (bands.ready / Math.max(1, input.length) < 0.8) errors.push(err("ENRICHMENT_NOT_CONFIGURED", "data_completeness", "info", `Average completeness ${avg}/100 · only ${bands.ready} leads ≥80%. Below the 80% sales-ready target — enable Google Places (phone/website) to close the gap.`, false, "Enable Google Places contact enrichment"));
      return { records, rejected: 0, errors, notes: `avg ${avg} · ready ${bands.ready} · usable ${bands.usable} · weak ${bands.weak} · poor ${bands.poor}`, source: "computed", metrics: { input_count: input.length, average_score: avg, ready: bands.ready, usable: bands.usable, weak: bands.weak, poor: bands.poor } };
    },
  },
  {
    id: "commercial_calculation",
    label: "Commercial calculation",
    handler: (input, ctx) => {
      // FSA legitimacy is finalised here (needs Just Eat + Companies House for the conflict check).
      const bands: Record<string, number> = {};
      const records = input.map((r) => {
        const fsaLegitimacy = computeFsaLegitimacy(r, ctx.referenceDateMs);
        const withLeg = { ...r, fsaLegitimacy };
        const commercial = computeCommercial(withLeg);
        bands[commercial.monthlyValueBand] = (bands[commercial.monthlyValueBand] ?? 0) + 1;
        return { ...withLeg, commercial };
      });
      const errors: PipelineError[] = [
        err("ENRICHMENT_NOT_CONFIGURED", "commercial_calculation", "info", "Commercial values are ESTIMATED / ASSUMPTION-BASED (placeholders) — internal prioritisation only, not quotes.", false, "Replace src/config/commercial-assumptions.ts with finance-approved figures"),
      ];
      const metrics = { input_count: input.length, band_very_high: bands.VERY_HIGH ?? 0, band_high: bands.HIGH ?? 0, band_medium: bands.MEDIUM ?? 0, band_low: bands.LOW ?? 0 };
      return { records, rejected: 0, errors, notes: `estimated value bands — VeryHigh ${metrics.band_very_high} · High ${metrics.band_high} · Med ${metrics.band_medium} · Low ${metrics.band_low}`, source: "assumptions", metrics };
    },
  },
  {
    id: "score_candidates",
    label: "Score candidates",
    handler: (input, ctx) => {
      const records: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      const nameFreq = new Map<string, number>();
      for (const r of input) {
        const k = r.fsa.businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
        nameFreq.set(k, (nameFreq.get(k) ?? 0) + 1);
      }
      let manualCount = 0;
      for (const r of input) {
        try {
          const candidate = toCandidate(r);
          const dupKey = r.fsa.businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
          const duplicateRisk = (nameFreq.get(dupKey) ?? 1) > 1;
          const deliveryPresent = !!r.justEat?.matched || STAGE_PLATFORMS.some((p) => r.platform?.perPlatform[p]?.status === "present");
          const platformOnly = !!r.justEat?.isPlatformOnly;
          const companiesHouseHold = !!r.companiesHouse?.holdReason;
          const score = scoreCandidate({
            candidate,
            ratingDate: r.fsa.ratingDate,
            category: r.category,
            companiesHouse: r.companiesHouse!,
            googlePlaces: r.googlePlaces ?? DEFAULT_GP,
            deliveryPresent,
            customerMatch: r.customerMatch,
            duplicateRisk,
            inTerritory: true,
            referenceDateMs: ctx.referenceDateMs,
            fsaLegitimacy: r.fsaLegitimacy,
            justEat: r.justEat,
            platformOnly,
            platformChecked: r.platform != null,
            companiesHouseHold,
            customerListLoaded: CUSTOMER_LIST.loaded,
            financialRiskScore: r.financials?.scoreComponent,
            financialAvailable: r.financials?.available,
            sourceNames: r.sourceNames,
          });
          if (score.manual_review_flags.length) manualCount++;
          // Refresh commercial opportunity now that the real grade is known.
          const commercial = r.commercial ? computeOpportunityForGrade(r.commercial, score.grade) : r.commercial;
          records.push({ ...r, candidate, duplicateRisk, score, commercial, trigger_reason: deriveTrigger(r, score) });
        } catch (e) {
          rejected++;
          pushCapped(errors, err("SCORING_FAILED", "score_candidates", "error", `Scoring failed for ${r.fsa.businessName}: ${msg(e)}`, true, "Inspect the record and retry", r.fsa.fhrsId));
        }
      }
      const metrics = { input_count: input.length, scored: records.length, manual_review: manualCount };
      return { records, rejected, errors, notes: `scored ${records.length} · manual-review ${manualCount}`, metrics };
    },
  },
  {
    id: "export_review_gate",
    label: "Export review gate",
    handler: (input) => {
      const errors: PipelineError[] = [
        err("EXPORT_GATE_LOCKED", "export_review_gate", "warning", "CRM export locked until CRM field mapping is verified (ISS-0003) — the review CSV/JSON are still generated", false, "Complete ISS-0003 CRM field mapping to unlock CRM push"),
      ];
      const EXCLUDED_ACCOUNTS = ["Active Account", "Dormant Account", "Former / Closed Account", "Unknown Existing Account"];
      let eligibleCount = 0, manualHeld = 0, held = 0, excludedCustomers = 0;
      const records = input.map((r) => {
        const s = r.score!;
        const cstatus = r.customerMatch?.status ?? "New Prospect Candidate";
        const manualNeeded = s.manual_review_flags.length > 0 || cstatus === "Possible Existing Account";
        let status: string;
        if (EXCLUDED_ACCOUNTS.includes(cstatus)) { status = "excluded_customer"; excludedCustomers++; }
        else if (s.disqualifiers.length > 0 || s.grade === "D") { status = "held_review"; held++; }
        else if (manualNeeded) { status = "manual_review"; manualHeld++; }
        else { status = "ready_for_review"; eligibleCount++; }
        return { ...r, export_status: status };
      });
      const metrics = { input_count: input.length, export_eligible: eligibleCount, manual_review: manualHeld, held, excluded_customer: excludedCustomers };
      return { records, rejected: input.length - eligibleCount, held: held + manualHeld + excludedCustomers, errors, notes: `${eligibleCount} sales-eligible · ${manualHeld} manual · ${held} held · ${excludedCustomers} existing-customer`, metrics };
    },
  },
  {
    id: "generate_final_exports",
    label: "Generate final exports",
    handler: (input, ctx) => {
      try {
        const eligible = input.filter((r) => r.export_status === "ready_for_review");
        const w = writeExports(ctx.config.run_id, input, eligible);
        return {
          records: input,
          rejected: 0,
          errors: [],
          notes: `wrote ${w.files.join(", ")}`,
          outputFiles: w.files,
          exportRows: { finalRows: w.finalRows, eligibleRows: w.eligibleRows, telesalesSafe: w.telesalesSafe },
        };
      } catch (e) {
        return {
          records: input,
          rejected: 0,
          errors: [err("EXPORT_WRITE_FAILED", "generate_final_exports", "fatal", `Export write failed: ${msg(e)}`, true, "Check exports/ directory permissions")],
          notes: "export write failed",
        };
      }
    },
  },
  {
    id: "generate_tomorrow_sales_exports",
    label: "Generate tomorrow sales exports",
    handler: (input, ctx) => {
      try {
        const w = writeTomorrowSalesExports(ctx.config.run_id, input, CUSTOMER_LIST.loaded);
        return {
          records: input,
          rejected: 0,
          errors: CUSTOMER_LIST.loaded ? [] : [err("EXISTING_CUSTOMER_MATCH", "generate_tomorrow_sales_exports", "warning", "Sales list NOT GUARANTEED AGAINST EXISTING CUSTOMERS — no customer list loaded.", false, "Import the real customer list and re-run")],
          notes: `wrote ${w.files.length} sales/audit files · ${w.salesCount} sales-eligible · ${w.holdCount} hold · ${w.excludedCount} excluded`,
          outputFiles: w.files,
          metrics: { input_count: input.length, sales_eligible: w.salesCount, manual_hold: w.holdCount, excluded_customer: w.excludedCount, customer_list_loaded: CUSTOMER_LIST.loaded ? 1 : 0 },
        };
      } catch (e) {
        return { records: input, rejected: 0, errors: [err("EXPORT_WRITE_FAILED", "generate_tomorrow_sales_exports", "fatal", `Sales export write failed: ${msg(e)}`, true, "Check exports/ directory permissions")], notes: "sales export write failed" };
      }
    },
  },
];
