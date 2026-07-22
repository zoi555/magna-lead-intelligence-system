// Loads the configurable large-group registry (CSV or JSON). Brands are NEVER hardcoded in
// application source — this file is the only place group/brand identity lives, supplied by
// the caller and versioned by its own content hash (see audit-output.ts).
//
// Primary match identifiers (per entry): brand_name, aliases, parent_company, company_numbers,
// domains. postcode_prefixes is SUPPORTING EVIDENCE ONLY — a postcode alone can never prove
// group ownership, so it is never used as an independent match trigger (see
// screen-large-groups.ts).
//
// JSON: an array of objects with keys groupName, brandName, aliases[], parentCompany,
//   companyNumbers[], domains[], classification, defaultOutcome, localPurchasingPossible,
//   evidenceSource, effectiveDate, postcodePrefixes[].
// CSV columns: group_name, brand_name, aliases, parent_company, company_numbers, domains,
//   classification, default_outcome, local_purchasing_possible, evidence_source,
//   effective_date, postcode_prefixes — list-type columns are semicolon-separated within one cell.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "./csv";
import { normaliseName, normaliseDomain, normaliseCompanyNumber } from "./normalize";
import { GROUP_CLASSIFICATIONS, GROUP_DEFAULT_OUTCOMES, type GroupClassification, type GroupDefaultOutcome, type GroupRegistryEntry } from "./types";

function splitList(v: string | undefined | null): string[] {
  return (v ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}
function parseBool(v: unknown): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).toLowerCase().trim();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

interface RawEntry {
  rowIndex: number;
  groupName: string; brandName: string; aliases: string[]; parentCompany: string;
  companyNumbers: string[]; domains: string[]; classification: string; defaultOutcome: string;
  localPurchasingPossible: unknown; evidenceSource: string; effectiveDate: string; postcodePrefixes: string[];
}

export interface LoadedGroupRegistry {
  entries: GroupRegistryEntry[];
  sourcePath: string;
}

export async function loadGroupRegistry(filePath: string): Promise<LoadedGroupRegistry> {
  const ext = path.extname(filePath).toLowerCase();
  const raw = await fs.readFile(filePath, "utf8");

  let rawRows: RawEntry[];

  if (ext === ".json") {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`Group registry (${filePath}): expected a JSON array of entries.`);
    rawRows = parsed.map((e, i) => ({
      rowIndex: i + 1,
      groupName: String(e.groupName ?? "").trim(), brandName: String(e.brandName ?? "").trim(),
      aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : splitList(e.aliases),
      parentCompany: String(e.parentCompany ?? "").trim(),
      companyNumbers: Array.isArray(e.companyNumbers) ? e.companyNumbers.map(String) : splitList(e.companyNumbers),
      domains: Array.isArray(e.domains) ? e.domains.map(String) : splitList(e.domains),
      classification: String(e.classification ?? "").trim(),
      defaultOutcome: String(e.defaultOutcome ?? "").trim(),
      localPurchasingPossible: e.localPurchasingPossible,
      evidenceSource: String(e.evidenceSource ?? "").trim(),
      effectiveDate: String(e.effectiveDate ?? "").trim(),
      postcodePrefixes: Array.isArray(e.postcodePrefixes) ? e.postcodePrefixes.map(String) : splitList(e.postcodePrefixes),
    }));
  } else if (ext === ".csv") {
    const { rows } = parseCsvObjects(raw);
    rawRows = rows.map((r, i) => ({
      rowIndex: i + 2,
      groupName: (r.group_name ?? "").trim(), brandName: (r.brand_name ?? "").trim(),
      aliases: splitList(r.aliases), parentCompany: (r.parent_company ?? "").trim(),
      companyNumbers: splitList(r.company_numbers), domains: splitList(r.domains),
      classification: (r.classification ?? "").trim(), defaultOutcome: (r.default_outcome ?? "").trim(),
      localPurchasingPossible: r.local_purchasing_possible, evidenceSource: (r.evidence_source ?? "").trim(),
      effectiveDate: (r.effective_date ?? "").trim(), postcodePrefixes: splitList(r.postcode_prefixes),
    }));
  } else {
    throw new Error(`Group registry (${filePath}): unsupported file type "${ext}" — expected .csv or .json.`);
  }

  const entries: GroupRegistryEntry[] = rawRows.map((r) => {
    if (!GROUP_CLASSIFICATIONS.includes(r.classification as GroupClassification)) {
      throw new Error(`Group registry (${filePath}) row ${r.rowIndex}: invalid classification "${r.classification}" — expected one of ${GROUP_CLASSIFICATIONS.join(", ")}.`);
    }
    // default_outcome is the OPERATIONAL decision (classification is descriptive context only)
    // — required and validated, never left to infer from classification.
    const defaultOutcomeNorm = r.defaultOutcome.toLowerCase().trim().replace(/\s+/g, "_");
    if (!GROUP_DEFAULT_OUTCOMES.includes(defaultOutcomeNorm as GroupDefaultOutcome)) {
      throw new Error(`Group registry (${filePath}) row ${r.rowIndex}: invalid or missing default_outcome "${r.defaultOutcome}" — expected one of ${GROUP_DEFAULT_OUTCOMES.join(", ")}. classification alone is never sufficient; default_outcome must be set explicitly.`);
    }
    if (!r.groupName) throw new Error(`Group registry (${filePath}) row ${r.rowIndex}: group_name is required.`);
    const hasPrimaryIdentifier = r.brandName || r.aliases.length || r.parentCompany || r.companyNumbers.length || r.domains.length;
    if (!hasPrimaryIdentifier) {
      throw new Error(`Group registry (${filePath}) row ${r.rowIndex}: at least one primary identifier (brand_name, aliases, parent_company, company_numbers, domains) is required — postcode_prefixes alone is not a valid group identifier.`);
    }
    return {
      rowIndex: r.rowIndex, groupName: r.groupName, brandName: r.brandName || null,
      aliases: r.aliases.map((a) => normaliseName(a)).filter(Boolean),
      parentCompany: r.parentCompany || null,
      companyNumbers: r.companyNumbers.map((c) => normaliseCompanyNumber(c)).filter((c): c is string => !!c),
      domains: r.domains.map((d) => normaliseDomain(d)).filter((d): d is string => !!d),
      classification: r.classification as GroupClassification,
      defaultOutcome: defaultOutcomeNorm as GroupDefaultOutcome,
      localPurchasingPossible: parseBool(r.localPurchasingPossible),
      evidenceSource: r.evidenceSource || null,
      effectiveDate: r.effectiveDate || null,
      postcodePrefixes: r.postcodePrefixes.map((p) => p.toUpperCase().replace(/\s+/g, "")),
    };
  });

  return { entries, sourcePath: filePath };
}
