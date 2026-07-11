// Pipeline stage definitions + handlers — Vertical Slice 001.
// 14 stages, each returns output records + rejected count + typed errors + notes.
// Pure-ish; only fetch_fsa touches the network and generate_final_exports writes files.

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
} from "./types";
import { getFsaEstablishments, getFsaEstablishmentsMock } from "../sources/fsa";
import { enrichCompaniesHouse } from "../sources/companies-house";
import { enrichGooglePlaces } from "../sources/google-places";
import { collectDeliveryPresence, summarisePresence } from "../sources/delivery-platforms";
import { matchExistingCustomer } from "../sources/existing-customers";
import { scoreCandidate, isFoodservice } from "./scoring";
import { writeExports } from "./export-leads";

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
  outputFiles?: string[];
  exportRows?: { finalRows: FinalLeadRow[]; eligibleRows: FinalLeadRow[]; telesalesSafe: TelesalesSafeRow[] };
}

export type StageHandler = (input: WorkingRecord[], ctx: StageContext) => Promise<StageOutput> | StageOutput;

export interface StageDef {
  id: StageId;
  label: string;
  handler: StageHandler;
}

const ERROR_CAP = 100; // avoid unbounded error arrays in the run JSON

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
  if (r.fsa.newlyRegistered) return "New FSA registration";
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
        records = est.map((f) => ({ fsa: f }));
        notes = `pulled ${records.length} FSA establishments (${ctx.config.mode})`;
        if (records.length === 0)
          errors.push(err("FSA_EMPTY_RESULT", "fetch_fsa", "warning", "FSA returned no establishments for the territory", false, "Widen the territory or verify FSA availability"));
      } catch (e) {
        errors.push(err("FSA_FETCH_FAILED", "fetch_fsa", "error", `Live FSA pull failed: ${msg(e)} — fell back to mock fixtures`, true, "Retry with `npm run leads:resume`, or check network/FSA status"));
        records = getFsaEstablishmentsMock(ctx.config.postcode_prefixes).map((f) => ({ fsa: f }));
        notes = `LIVE PULL FAILED — fell back to ${records.length} mock establishments`;
      }
      return { records, rejected: 0, errors, notes };
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
      let rejected = 0;
      for (const r of input) {
        if (isFoodservice(r.fsa.businessType)) kept.push(r);
        else {
          rejected++;
          pushCapped(errors, err("CATEGORY_EXCLUDED", "category_filter", "info", `${r.fsa.businessName}: type "${r.fsa.businessType}" not foodservice`, false, "Adjust category rules if needed", r.fsa.fhrsId));
        }
      }
      return { records: kept, rejected, errors, notes: `${kept.length} foodservice` };
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
    id: "exclude_existing_customers",
    label: "Exclude existing customers",
    handler: (input, ctx) => {
      const kept: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      for (const r of input) {
        const m = matchExistingCustomer(r.fsa.businessName, r.fsa.postcode, ctx.checkedAt);
        if (m.matched && m.customerStatus === "active") {
          rejected++;
          pushCapped(errors, err("EXISTING_CUSTOMER_MATCH", "exclude_existing_customers", "info", `${r.fsa.businessName} is an existing active customer`, false, "Suppress from new leads", r.fsa.fhrsId));
          continue;
        }
        kept.push(r);
      }
      return { records: kept, rejected, errors, notes: `${kept.length} after existing-customer exclusion` };
    },
  },
  {
    id: "companies_house_enrichment_placeholder",
    label: "Companies House (placeholder)",
    handler: (input, ctx) => ({
      records: input.map((r) => ({ ...r, companiesHouse: enrichCompaniesHouse(r.fsa.businessName, ctx.checkedAt) })),
      rejected: 0,
      errors: [err("ENRICHMENT_NOT_CONFIGURED", "companies_house_enrichment_placeholder", "info", "Companies House enrichment disabled (key-ready, no live call)", true, "Set CH_ENRICHMENT_ENABLED=1 + COMPANIES_HOUSE_API_KEY to enable")],
      notes: `attached CH placeholder to ${input.length}`,
    }),
  },
  {
    id: "google_places_enrichment_placeholder",
    label: "Google Places (placeholder)",
    handler: (input, ctx) => ({
      records: input.map((r) => ({ ...r, googlePlaces: enrichGooglePlaces(r.fsa.businessName, r.fsa.postcode, ctx.checkedAt) })),
      rejected: 0,
      errors: [err("ENRICHMENT_NOT_CONFIGURED", "google_places_enrichment_placeholder", "info", "Google Places is PAID — disabled by default (field-mask + cap required to enable)", true, "Set GOOGLE_PLACES_ENABLED=1 + GOOGLE_PLACES_API_KEY + a per-run cap to enable")],
      notes: `attached Google Places placeholder to ${input.length}`,
    }),
  },
  {
    id: "delivery_platform_presence",
    label: "Delivery platform presence",
    handler: (input, ctx) => {
      let present = 0, manual = 0, unknown = 0, absent = 0, checked = 0, evidenceMissing = 0;
      const records = input.map((r) => {
        const res = collectDeliveryPresence(r.fsa.businessName, r.fsa.postcode, ctx.checkedAt);
        const sum = summarisePresence(res);
        if (sum === "present") { present++; checked++; }
        else if (sum === "absent") { absent++; checked++; }
        else if (sum === "manual_review") manual++;
        else unknown++;
        if ((sum === "present" || sum === "absent") && !res.platforms.some((p) => p.evidence_url)) evidenceMissing++;
        return { ...r, delivery: res };
      });
      const errors: PipelineError[] = [
        err("PLATFORM_NOT_CONFIGURED", "delivery_platform_presence", "info", "No automated collector configured — presence defaults to manual_review (public/evidence-based only)", true, "Configure an approved public collector, or use manual/import"),
        err("PLATFORM_CHECK_MANUAL_REQUIRED", "delivery_platform_presence", "info", `${manual} businesses need a manual delivery-presence check`, false, "Assign manual checks or import public evidence URLs"),
        err("PLATFORM_TERMS_RISK", "delivery_platform_presence", "warning", "Uber Eats / Deliveroo / Just Eat automated access carries ToS + anti-bot risk — collect only public/manual/evidence-based data", false, "Use an approved provider or manual entry; never scrape, log in, or bypass anti-bot"),
      ];
      if (unknown > 0) errors.push(err("PLATFORM_PRESENCE_UNKNOWN", "delivery_platform_presence", "info", `${unknown} businesses have unknown platform presence`, false, "Collect or import presence"));
      if (evidenceMissing > 0) errors.push(err("PLATFORM_EVIDENCE_URL_MISSING", "delivery_platform_presence", "warning", `${evidenceMissing} present/absent records are missing an evidence URL`, false, "Attach a public evidence URL"));
      const metrics = {
        input_count: input.length,
        checked_count: checked,
        present_count: present,
        absent_count: absent,
        unknown_count: unknown,
        manual_review_count: manual,
        error_count: errors.length,
      };
      return {
        records,
        rejected: 0,
        errors,
        notes: `present ${present} · manual-review ${manual} · unknown ${unknown} · methods: manual / import / approved_public_collector`,
        metrics,
      };
    },
  },
  {
    id: "score_candidates",
    label: "Score candidates",
    handler: (input, ctx) => {
      const records: WorkingRecord[] = [];
      const errors: PipelineError[] = [];
      let rejected = 0;
      for (const r of input) {
        try {
          const candidate = toCandidate(r);
          const score = scoreCandidate({
            candidate,
            ratingDate: r.fsa.ratingDate,
            companiesHouse: r.companiesHouse!,
            googlePlaces: r.googlePlaces!,
            delivery: r.delivery!,
            inTerritory: true,
            coverageGapWeight: 0,
            referenceDateMs: ctx.referenceDateMs,
          });
          records.push({ ...r, candidate, score, trigger_reason: deriveTrigger(r, score) });
        } catch (e) {
          rejected++;
          pushCapped(errors, err("SCORING_FAILED", "score_candidates", "error", `Scoring failed for ${r.fsa.businessName}: ${msg(e)}`, true, "Inspect the record and retry", r.fsa.fhrsId));
        }
      }
      return { records, rejected, errors, notes: `scored ${records.length}` };
    },
  },
  {
    id: "export_review_gate",
    label: "Export review gate",
    handler: (input) => {
      const errors: PipelineError[] = [
        err("EXPORT_GATE_LOCKED", "export_review_gate", "warning", "CRM export locked until CRM field mapping is verified (ISS-0003) — the review CSV/JSON are still generated", false, "Complete ISS-0003 CRM field mapping to unlock CRM push"),
      ];
      let rejected = 0;
      let deliveryUnchecked = 0;
      const records = input.map((r) => {
        const s = r.score!;
        const eligible = s.disqualifiers.length === 0 && s.grade !== "D";
        if (!eligible) rejected++;
        // Delivery presence is NOT a blocker — unchecked leads still export with a warning.
        if (!r.delivery || summarisePresence(r.delivery) !== "present") deliveryUnchecked++;
        return { ...r, export_status: eligible ? "ready_for_review" : "held_review" };
      });
      if (deliveryUnchecked > 0)
        errors.push(err("DELIVERY_PLATFORM_NOT_CHECKED", "export_review_gate", "warning", `${deliveryUnchecked} leads export without a confirmed delivery-platform presence (allowed — not a blocker)`, false, "Optionally collect/import presence before outreach"));
      return { records, rejected, errors, notes: `${records.length - rejected} export-eligible, ${rejected} held` };
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
];
