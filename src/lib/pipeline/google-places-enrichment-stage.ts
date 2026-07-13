// Google Places contact-enrichment stage — PAID, OFF by default, cap-controlled.
//
// Enriches leads with phone / website / address / geo via the Google Places
// runner. Prioritises exportable + new-prospect leads so scarce (paid) calls go
// to the leads that matter first, respects the per-run call cap, and writes two
// CSVs into exports/ (which is gitignored):
//   - google-places-enrichment-summary.csv  (one row per processed lead)
//   - missing-phone-list.csv                 (leads still lacking a phone after)
//
// SERVER-SIDE ONLY. Never throws — every failure degrades to a safe summary.
// If disabled, does nothing and returns { disabled: true }.

import fs from "node:fs";
import path from "node:path";
import {
  GooglePlacesRunner,
  type GooglePlacesResult,
} from "../sources/google-places";

/** Directory for generated exports (gitignored). */
export const EXPORTS_DIR = path.join(process.cwd(), "exports");

/**
 * Generic, self-contained lead input. Only businessName + postcode are required.
 * The optional flags let the stage prioritise the leads worth paying for, and
 * `existingPhone` lets it tell which leads still lack a phone afterwards.
 */
export interface GooglePlacesLeadInput {
  businessName: string;
  postcode: string;
  address?: string;
  /** True when the lead passed the export gate (worth a paid call first). */
  exportable?: boolean;
  /** True for genuinely new prospects (prioritised alongside exportable). */
  isNewProspect?: boolean;
  /** Any phone already known before enrichment (used to compute coverage). */
  existingPhone?: string | null;
  /** Extra fields are allowed and ignored — keeps the input generic. */
  [key: string]: unknown;
}

export interface RunGooglePlacesEnrichmentOptions {
  /** Inject a pre-built runner (e.g. for tests); otherwise one is created. */
  runner?: GooglePlacesRunner;
  /** Override the exports directory (e.g. for tests). */
  exportsDir?: string;
}

export interface GooglePlacesEnrichmentStageResult {
  enriched: number; // leads with a matched place
  phoneCount: number; // leads with a phone after enrichment (existing or new)
  websiteCount: number; // leads with a website after enrichment
  callsUsed: number; // billable Text Search calls made this run
  capRemaining: number; // remaining per-run call budget
  disabled: boolean; // true when Google Places was off (no work done)
}

/** Per-lead enrichment paired with its source lead — internal working shape. */
interface EnrichedRow {
  lead: GooglePlacesLeadInput;
  result: GooglePlacesResult;
  hadPhoneBefore: boolean;
  hasPhoneAfter: boolean;
}

// ---- tiny self-contained CSV helpers (no coupling to export-leads) ----
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: (Record<string, unknown>)[]): string {
  const head = headers.join(",");
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r[h])).join(","))
    .join("\n");
  return head + "\n" + body + (rows.length ? "\n" : "");
}

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Exportable / new-prospect leads sort first; order is otherwise stable. */
function prioritise(records: GooglePlacesLeadInput[]): GooglePlacesLeadInput[] {
  return records
    .map((lead, index) => ({ lead, index }))
    .sort((a, b) => {
      const pa = a.lead.exportable || a.lead.isNewProspect ? 0 : 1;
      const pb = b.lead.exportable || b.lead.isNewProspect ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.index - b.index; // stable within the same priority band
    })
    .map((x) => x.lead);
}

/**
 * Run Google Places contact enrichment over a set of leads.
 * Never throws. Returns coverage counts and remaining budget.
 */
export async function runGooglePlacesEnrichment(
  records: GooglePlacesLeadInput[],
  opts: RunGooglePlacesEnrichmentOptions = {}
): Promise<GooglePlacesEnrichmentStageResult> {
  const runner = opts.runner ?? new GooglePlacesRunner();

  // Disabled → do nothing but report cleanly. The final report must state that
  // contact enrichment is incomplete (see docs/28_GOOGLE_PLACES_READINESS.md).
  if (!runner.enabled) {
    return {
      enriched: 0,
      phoneCount: 0,
      websiteCount: 0,
      callsUsed: 0,
      capRemaining: runner.capRemaining,
      disabled: true,
    };
  }

  const exportsDir = opts.exportsDir ?? EXPORTS_DIR;
  const ordered = prioritise(records ?? []);
  const rows: EnrichedRow[] = [];

  try {
    for (const lead of ordered) {
      const hadPhoneBefore = hasText(lead.existingPhone);
      // enrich() is cap-aware: once the budget is spent it returns cap_reached
      // without making a call, so we can safely iterate the whole list.
      const result = await runner.enrich({
        businessName: lead.businessName,
        postcode: lead.postcode,
        address: typeof lead.address === "string" ? lead.address : undefined,
      });
      const hasPhoneAfter = hadPhoneBefore || hasText(result.formattedPhone);
      rows.push({ lead, result, hadPhoneBefore, hasPhoneAfter });
    }
  } catch {
    // Defensive: enrich() should never throw, but never let the stage bubble.
  }

  const enriched = rows.filter((r) => r.result.matched).length;
  const phoneCount = rows.filter((r) => r.hasPhoneAfter).length;
  const websiteCount = rows.filter((r) => hasText(r.result.website)).length;

  writeReports(exportsDir, rows);

  return {
    enriched,
    phoneCount,
    websiteCount,
    callsUsed: runner.callsMade,
    capRemaining: runner.capRemaining,
    disabled: false,
  };
}

/** Write the two CSV reports. Swallows any I/O error (never throws). */
function writeReports(exportsDir: string, rows: EnrichedRow[]): void {
  try {
    fs.mkdirSync(exportsDir, { recursive: true });

    const summaryHeaders = [
      "business_name",
      "postcode",
      "status",
      "matched",
      "place_id",
      "formatted_phone",
      "website",
      "formatted_address",
      "latitude",
      "longitude",
      "business_status",
      "types",
      "rating",
      "review_count",
      "google_maps_uri",
      "fields_collected",
      "had_phone_before",
      "has_phone_after",
      "warning",
    ];
    const summaryRows = rows.map(({ lead, result, hadPhoneBefore, hasPhoneAfter }) => ({
      business_name: lead.businessName,
      postcode: lead.postcode,
      status: result.status,
      matched: result.matched,
      place_id: result.placeId ?? "",
      formatted_phone: result.formattedPhone ?? "",
      website: result.website ?? "",
      formatted_address: result.formattedAddress ?? "",
      latitude: result.latitude ?? "",
      longitude: result.longitude ?? "",
      business_status: result.businessStatus ?? "",
      types: result.types.join("|"),
      rating: result.rating ?? "",
      review_count: result.reviewCount ?? "",
      google_maps_uri: result.googleMapsUri ?? "",
      fields_collected: result.fieldsCollected.join("|"),
      had_phone_before: hadPhoneBefore,
      has_phone_after: hasPhoneAfter,
      warning: result.warning ?? "",
    }));
    fs.writeFileSync(
      path.join(exportsDir, "google-places-enrichment-summary.csv"),
      toCsv(summaryHeaders, summaryRows)
    );

    // Leads still lacking a phone after enrichment — telesales follow-up list.
    const missingHeaders = [
      "business_name",
      "postcode",
      "address",
      "google_places_status",
      "website",
      "google_maps_uri",
      "warning",
      "suggested_action",
    ];
    const missingRows = rows
      .filter((r) => !r.hasPhoneAfter)
      .map(({ lead, result }) => ({
        business_name: lead.businessName,
        postcode: lead.postcode,
        address: typeof lead.address === "string" ? lead.address : "",
        google_places_status: result.status,
        website: result.website ?? "",
        google_maps_uri: result.googleMapsUri ?? "",
        warning: result.warning ?? "",
        suggested_action:
          result.status === "cap_reached"
            ? "Call cap reached — re-run enrichment with more budget"
            : result.status === "not_found"
              ? "No Google match — verify name/postcode or research manually"
              : "Manual phone research required",
      }));
    fs.writeFileSync(
      path.join(exportsDir, "missing-phone-list.csv"),
      toCsv(missingHeaders, missingRows)
    );
  } catch {
    // Report writing must never break the pipeline.
  }
}
