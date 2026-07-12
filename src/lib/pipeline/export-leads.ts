// Export writer — Vertical Slice 001. Builds final rows + writes CSV/JSON and a
// separate telesales-SAFE CSV. No internal score / financials / match internals in
// the safe output. Local files only.

import fs from "node:fs";
import path from "node:path";
import type {
  WorkingRecord,
  FinalLeadRow,
  TelesalesSafeRow,
  PresenceStatus,
} from "./types";
import { summarisePresence, maxRisk, primaryMethod, firstEvidenceUrl } from "../sources/delivery-platforms";

export const EXPORTS_DIR = path.join(process.cwd(), "exports");

const SAFE_REPS = ["Jaspreet S", "Raj K", "Aisha M"];
const WORKED: TelesalesSafeRow["worked_status"][] = ["Open", "In progress", "Contacted"];

const FINAL_HEADERS: (keyof FinalLeadRow)[] = [
  "run_id", "lead_id", "business_name", "address", "postcode", "local_authority",
  "business_type", "fsa_rating", "rating_date", "fsa_business_id", "latitude", "longitude",
  "territory_code", "trigger_reason", "score", "grade", "category_fit", "manual_review_flags",
  "score_reasons", "warnings",
  "companies_house_status", "google_places_status", "platform_presence_status",
  "delivery_source_method", "delivery_risk_flag", "delivery_evidence_url", "export_status",
];

const SAFE_HEADERS: (keyof TelesalesSafeRow)[] = [
  "business_name", "postcode", "phone", "category", "trigger_reason", "assigned_rep", "worked_status",
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv<T>(headers: (keyof T)[], rows: T[]): string {
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => csvEscape((r as any)[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

function presenceStatusOf(rec: WorkingRecord): PresenceStatus {
  if (!rec.delivery) return "unknown";
  return summarisePresence(rec.delivery);
}

function leadIdFor(runId: string, rec: WorkingRecord, i: number): string {
  const digits = (rec.fsa.fhrsId.match(/\d/g) ?? []).join("").slice(-6) || String(i + 1).padStart(6, "0");
  return `${runId}-LD${digits}`;
}

/** Build a final row for every scored record (full internal view). */
export function buildFinalRows(records: WorkingRecord[], runId: string): FinalLeadRow[] {
  return records
    .filter((r) => r.score)
    .map((r, i) => {
      const s = r.score!;
      return {
        run_id: runId,
        lead_id: r.lead_id ?? leadIdFor(runId, r, i),
        business_name: r.fsa.businessName,
        address: r.fsa.addressLine,
        postcode: r.fsa.postcode,
        local_authority: r.fsa.localAuthority,
        business_type: r.fsa.businessType,
        fsa_rating: r.fsa.ratingValue,
        rating_date: r.fsa.ratingDate ?? "",
        fsa_business_id: r.fsa.fhrsId,
        latitude: r.fsa.latitude != null ? String(r.fsa.latitude) : "",
        longitude: r.fsa.longitude != null ? String(r.fsa.longitude) : "",
        territory_code: r.territoryCode ?? "",
        trigger_reason: r.trigger_reason ?? "",
        score: s.score,
        grade: s.grade,
        category_fit: r.category?.fit ?? "",
        manual_review_flags: s.manual_review_flags.join("; "),
        score_reasons: s.score_reasons.join("; "),
        warnings: s.warnings.join("; "),
        companies_house_status: r.companiesHouse?.status ?? "not_configured",
        google_places_status: r.googlePlaces?.status ?? "not_configured",
        platform_presence_status: presenceStatusOf(r),
        delivery_source_method: r.delivery ? primaryMethod(r.delivery) : "manual",
        delivery_risk_flag: r.delivery ? maxRisk(r.delivery) : "low",
        delivery_evidence_url: r.delivery ? firstEvidenceUrl(r.delivery) : "",
        export_status: r.export_status ?? "held",
      };
    });
}

/** SAFE telesales rows — safe fields ONLY. Never carries score/internals/financials. */
export function buildTelesalesSafe(eligible: WorkingRecord[]): TelesalesSafeRow[] {
  return eligible.map((r, i) => ({
    business_name: r.fsa.businessName,
    postcode: r.fsa.postcode,
    phone: r.googlePlaces?.formattedPhone ? maskPhone(r.googlePlaces.formattedPhone) : "",
    category: r.fsa.businessType,
    trigger_reason: r.trigger_reason ?? "Territory match",
    assigned_rep: SAFE_REPS[i % SAFE_REPS.length],
    worked_status: WORKED[i % WORKED.length],
  }));
}

function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits ? `07xxx xxx ${digits.slice(-3)}` : "";
}

export interface WriteResult {
  files: string[]; // repo-relative
  finalRows: FinalLeadRow[];
  eligibleRows: FinalLeadRow[];
  telesalesSafe: TelesalesSafeRow[];
}

/**
 * Write CSV (export-eligible), JSON (full bundle), and telesales-safe CSV.
 * Returns repo-relative paths and the built rows.
 */
export function writeExports(
  runId: string,
  allRecords: WorkingRecord[],
  eligibleRecords: WorkingRecord[]
): WriteResult {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const finalRows = buildFinalRows(allRecords, runId);
  const eligibleIds = new Set(eligibleRecords.map((r) => r.fsa.fhrsId));
  const eligibleRows = finalRows.filter((r) => eligibleIds.has(r.fsa_business_id));
  const telesalesSafe = buildTelesalesSafe(eligibleRecords);

  const csvPath = path.join(EXPORTS_DIR, "first-fsa-leads.csv");
  const jsonPath = path.join(EXPORTS_DIR, "first-fsa-leads.json");
  const safePath = path.join(EXPORTS_DIR, "first-fsa-telesales-safe.csv");

  fs.writeFileSync(csvPath, toCsv(FINAL_HEADERS, eligibleRows));
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ run_id: runId, leads: finalRows, exportEligible: eligibleRows, telesalesSafe }, null, 2)
  );
  fs.writeFileSync(safePath, toCsv(SAFE_HEADERS, telesalesSafe));

  const rel = (p: string) => path.relative(process.cwd(), p);
  return { files: [rel(csvPath), rel(jsonPath), rel(safePath)], finalRows, eligibleRows, telesalesSafe };
}
