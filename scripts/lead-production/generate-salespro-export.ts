// Milestone 4 — the 108-column Magna Sales Pro exporter. Read-only; makes no external call.
// Reuses candidate-dossier.ts + master-field-resolver.ts (Milestone 3) unchanged — every
// Sales Pro column's canonicalName is drawn from the same Master vocabulary
// (config/lead-production/salespro-schema-v1.json cross-validated 0 orphan canonicalNames
// against master-schema-v2.json, as of the 2026-08-02 CTO Business Type column repoint), so
// this exporter never re-derives a value independently.
//
// Enforces: exact CTO labels/order (from the schema file, never hardcoded here), the 20
// existing + 88 new fields, dropdown/type validation (refuses to WRITE a value outside a
// column's allowedValues — never ships a bad value into the CTO's real import system), and
// strict separation of ordinary new leads / key-account review / customer-master exclusions
// (audit-only, never rep-facing) into three distinct files that are never mixed.
//
// 2026-07-24: reactivation retired as an operational lead category — any candidate confirmed as
// matching a Magna customer-master record, of ANY lifecycle status, is a permanent hard
// exclusion (customer_master_exclusion), never a reactivation lead.

import { promises as fs } from "node:fs";
import path from "node:path";
import { loadCandidateDossiers, type Dossier } from "./candidate-dossier";
import { resolveMasterFields, type MasterFieldContext } from "./master-field-resolver";
import { dedupeAcrossDistricts, dedupeAgainstHistoricalCampaign, type DistrictCandidateForDedup, type HistoricalDuplicateMatch } from "./district-reconciliation";
import { writeCsv } from "./csv";
import { loadCommercialReviewRegistry } from "./load-commercial-review";
import { evaluateCommercialReviewExclusion } from "./commercial-review-filter";
import { isValidUkPhone } from "./normalize";
import { loadCtoBusinessTypeVocabulary } from "./cto-business-type-mapping";
import { loadHistoricalUsableLeads } from "./historical-campaign";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }

interface SalesProColumn { columnOrder: number; salesProFieldLabel: string; origin: string; canonicalName: string; fieldType: string; required: boolean; allowedValues: string[]; transformationExportRule: string; }

interface DistrictInput { district: string; dirs: { phase1Dir: string; fsaDir: string; googleDir: string; chDir: string; websiteDir: string; publicProfileDir: string; groupRescreenDir: string; v2Dir: string } }

interface RowBundle { dossier: Dossier; district: string; fields: Record<string, unknown>; leadId: string; gaps: string[] }

// The one documented, deliberate exception (see docs/09_DECISIONS.md): "Field Sales Rep" and
// "Sales Rep" are two different CTO columns that both carry assigned_representative, populated
// conditionally on Sales Role — never both, never neither, exactly one per row.
function representativeColumnValue(col: SalesProColumn, value: unknown, role: "telesales" | "field_sales"): unknown {
  if (col.salesProFieldLabel === "Field Sales Rep") return role === "field_sales" ? value : "";
  if (col.salesProFieldLabel === "Sales Rep") return role === "telesales" ? value : "";
  return value;
}

function toCellValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
}

interface ValidationViolation { leadId: string; column: string; value: string; reason: string }

// A single allowedValues entry like "0-100" (en-dash or hyphen) is a numeric RANGE descriptor,
// not a categorical dropdown with one legal literal value — validated as a range, never as
// exact-string membership (a genuine bug found and fixed against real UB1 data this session).
function parseNumericRange(allowedValues: string[]): { min: number; max: number } | null {
  if (allowedValues.length !== 1) return null;
  const m = allowedValues[0].match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

// skipDropdownValidation: true ONLY for the audit-only customer-master-exclusions bucket. That
// file is never a CTO import — it exists purely for internal reconciliation. Its
// qualification_status value ("Customer Master Exclusion") is not in the CTO-approved v1
// dropdown list (that locked schema is never altered — see docs/09_DECISIONS.md), so it would
// otherwise trip the very check designed to protect the CTO's real import files. Every genuine
// import file (new-leads, key-accounts) is still validated in full.
function buildRowAndValidate(columns: SalesProColumn[], bundle: RowBundle, role: "telesales" | "field_sales", violations: ValidationViolation[], skipDropdownValidation = false): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of columns) {
    let raw = bundle.fields[col.canonicalName];
    raw = representativeColumnValue(col, raw, role);
    const cell = toCellValue(raw);
    if (!skipDropdownValidation && col.allowedValues.length > 0 && cell !== "") {
      const range = parseNumericRange(col.allowedValues);
      if (range) {
        const n = Number(cell);
        if (!Number.isFinite(n) || n < range.min || n > range.max) violations.push({ leadId: bundle.leadId, column: col.salesProFieldLabel, value: cell, reason: `"${cell}" is outside the allowed range ${range.min}-${range.max} for "${col.salesProFieldLabel}".` });
      } else {
        // "Multi Select" columns (e.g. Business Types) are written as one comma-separated cell
        // (CTO's exact required format — see cto_business_type's transformationExportRule), so
        // each comma-separated member is validated individually, not the whole joined string.
        const members = Array.isArray(raw)
          ? (raw as unknown[]).map(String)
          : col.fieldType === "Multi Select"
          ? cell.split(",").map((m) => m.trim()).filter((m) => m !== "")
          : [cell];
        for (const m of members) if (!col.allowedValues.includes(m)) violations.push({ leadId: bundle.leadId, column: col.salesProFieldLabel, value: m, reason: `"${m}" is not one of the allowed values for "${col.salesProFieldLabel}": [${col.allowedValues.join(", ")}]` });
      }
    }
    row[col.salesProFieldLabel] = cell;
  }
  return row;
}

async function main() {
  const outArg = arg("out");
  if (!outArg) { console.error("Missing required argument: --out=<dir>"); process.exit(1); }
  await fs.mkdir(outArg, { recursive: true });

  const territoryManifestPath = arg("territory-manifest");
  let districts: DistrictInput[] = [];
  let representative = arg("representative");
  let role = arg("role") as "telesales" | "field_sales" | null;
  let salesTerritory = arg("sales-territory");
  let territoryPrefix = arg("territory-prefix"); // used for output filenames when combining multiple districts
  // See generate-master-export.ts for the same flag's rationale — overrides only the exported
  // field value, never filenames. Falls back to `representative` when omitted.
  const salesRepValue = arg("sales-rep-value");
  const campaignId = arg("campaign-id");
  const historicalUsableWorkbook = arg("historical-usable-workbook");

  if (territoryManifestPath) {
    const tm = await readJson(territoryManifestPath);
    representative = tm.representative; role = tm.role; salesTerritory = tm.salesTerritory;
    territoryPrefix = territoryPrefix ?? tm.representative.toLowerCase();
    for (const [district, rec] of Object.entries<any>(tm.districts)) {
      if (rec.status !== "complete") continue;
      const orchManifest = await readJson(path.join(rec.outDir, ".orchestrator-run-manifest.json"));
      districts.push({ district, dirs: {
        phase1Dir: orchManifest.stages.phase1.dir, fsaDir: orchManifest.stages.fsa.dir, googleDir: orchManifest.stages.google.dir,
        chDir: orchManifest.stages.companies_house.dir, websiteDir: orchManifest.stages.website.dir,
        publicProfileDir: orchManifest.stages.public_profile.dir, groupRescreenDir: orchManifest.stages.group_rescreen.dir,
        v2Dir: orchManifest.stages.final_scoring.dir,
      }});
    }
  } else {
    const territory = arg("territory");
    territoryPrefix = territoryPrefix ?? territory?.toLowerCase() ?? null;
    const missing = [!territory && "--territory", !representative && "--representative", !role && "--role", !salesTerritory && "--sales-territory"].filter(Boolean);
    for (const k of ["phase1-dir", "fsa-dir", "google-checkpoint", "companies-house-dir", "website-dir", "public-profile-dir", "group-rescreen-dir", "v2-dir"]) if (!arg(k)) missing.push(`--${k}`);
    if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }
    districts = [{ district: territory!, dirs: {
      phase1Dir: arg("phase1-dir")!, fsaDir: arg("fsa-dir")!, googleDir: arg("google-checkpoint")!, chDir: arg("companies-house-dir")!,
      websiteDir: arg("website-dir")!, publicProfileDir: arg("public-profile-dir")!, groupRescreenDir: arg("group-rescreen-dir")!, v2Dir: arg("v2-dir")!,
    }}];
  }
  if (!representative || !role || !salesTerritory || !territoryPrefix) { console.error("Could not resolve representative/role/sales-territory."); process.exit(1); }

  console.log(`=== Magna Sales Pro exporter (108 columns) — ${representative} (${role}), ${salesTerritory}, ${districts.length} district(s) ===`);
  if (campaignId) console.log(`Campaign: ${campaignId}`);

  const commercialReviewDir = arg("commercial-review-dir") ?? "config/lead-production/commercial-review-v1";
  const commercialReviewRegistry = await loadCommercialReviewRegistry(commercialReviewDir);
  console.log(`Commercial review registry: ${commercialReviewRegistry.version} (${commercialReviewRegistry.keepBrands.length} keep, ${commercialReviewRegistry.excludeBrands.length} exclude).`);

  const schema = await readJson("config/lead-production/salespro-schema-v1.json");
  const columns: SalesProColumn[] = schema.columns;
  if (columns.length !== 108) throw new Error(`Schema drift: expected 108 Sales Pro columns, got ${columns.length}. Refusing to export against a mismatched schema.`);
  const existingCount = columns.filter((c) => c.origin === "Existing CTO Field").length;
  const newCount = columns.filter((c) => c.origin !== "Existing CTO Field").length;
  if (existingCount !== 20 || newCount !== 88) throw new Error(`Schema drift: expected 20 existing + 88 new, got ${existingCount} existing + ${newCount} new.`);

  const vocabulary = await loadCtoBusinessTypeVocabulary();
  let bundles: RowBundle[] = [];
  for (const d of districts) {
    const { dossiers } = await loadCandidateDossiers(d.dirs);
    const ctx: MasterFieldContext = { territory: d.district, representative: salesRepValue ?? representative!, role: role!, salesTerritory: salesTerritory! };
    for (const dossier of dossiers) {
      const resolved = resolveMasterFields(dossier, ctx, vocabulary);
      bundles.push({ dossier, district: d.district, fields: resolved.fields, leadId: resolved.leadId, gaps: resolved.dataQualityGaps });
    }
  }
  // Cross-district dedup — same tiered logic as the Master exporter (district-reconciliation.ts),
  // never reimplemented. Only meaningful with more than one district.
  if (districts.length > 1) {
    const dedupInput: DistrictCandidateForDedup[] = bundles.map((b) => ({
      candidateId: b.dossier.candidateId, district: b.district, tradingName: b.dossier.tradingName,
      postcode: b.dossier.postcode, phone: b.dossier.fields.telephone as string | null, website: b.dossier.fields.website as string | null,
      companyNumber: b.dossier.fields.companies_house_number as string | null, finalOutcome: b.dossier.qualificationStatus,
    }));
    const dedupResult = dedupeAcrossDistricts(dedupInput);
    const keptIds = new Set(dedupResult.kept.map((c) => c.candidateId));
    const removed = bundles.length - dedupResult.kept.length;
    bundles = bundles.filter((b) => keptIds.has(b.dossier.candidateId));
    if (removed) console.log(`Cross-district dedup: ${removed} duplicate(s) removed (same real premises independently discovered in two districts near a boundary).`);
  }

  // Cross-CAMPAIGN dedup (2026-08-03, ISS-0033 resolution) — see generate-master-export.ts's
  // loadAllRows() for the full rationale. No-op when --historical-usable-workbook is not
  // supplied (every existing call site/test is unaffected).
  let historicalDuplicatesRemoved: HistoricalDuplicateMatch[] = [];
  if (historicalUsableWorkbook) {
    for (const d of districts) {
      const historical = await loadHistoricalUsableLeads(historicalUsableWorkbook, d.district);
      if (!historical.length) continue;
      const dedupInput: DistrictCandidateForDedup[] = bundles.filter((b) => b.district === d.district).map((b) => ({
        candidateId: b.dossier.candidateId, district: b.district, tradingName: b.dossier.tradingName,
        postcode: b.dossier.postcode, phone: b.dossier.fields.telephone as string | null, website: b.dossier.fields.website as string | null,
        companyNumber: b.dossier.fields.companies_house_number as string | null, finalOutcome: b.dossier.qualificationStatus,
      }));
      const result = dedupeAgainstHistoricalCampaign(dedupInput, historical);
      const keptIds = new Set(result.kept.map((c) => c.candidateId));
      bundles = bundles.filter((b) => b.district !== d.district || keptIds.has(b.dossier.candidateId));
      historicalDuplicatesRemoved.push(...result.matches);
    }
    if (historicalDuplicatesRemoved.length) {
      console.log(`Cross-campaign dedup: ${historicalDuplicatesRemoved.length} candidate(s) already present in a prior campaign's released output — excluded from this campaign's release, prior campaign ownership unchanged.`);
      await fs.writeFile(path.join(outArg, `${territoryPrefix}-historical-campaign-duplicates.csv`), writeCsv(
        ["campaign_id", "tier", "dropped_candidate_id", "dropped_district", "historical_lead_id", "historical_representative"],
        historicalDuplicatesRemoved.map((m) => ({ campaign_id: campaignId ?? "", tier: m.tier, dropped_candidate_id: m.droppedCandidateId, dropped_district: m.droppedDistrict, historical_lead_id: m.historicalLeadId, historical_representative: m.historicalRepresentative })),
      ));
    }
  }

  // --- Strict exclusion from ordinary new-lead exports: held, hard-rejected, customer-master
  // exclusions (any lifecycle — confirmed active/inactive/former/lost/renewal/closed/dormant, no
  // longer distinguished), excluded groups, closed businesses (folded into hard_rejected
  // upstream), duplicates (already resolved by cross-district dedup before this ever runs),
  // unresolved material conflict (== held_for_customer_match_review). Reactivation is retired as
  // an operational lead category — customer_master_exclusion candidates go only to the
  // audit-only customer-master-exclusions.csv, never to a rep-facing or import file. ---
  const customerMasterExclusions = bundles.filter((b) => b.dossier.v1Bucket === "customer_master_exclusion");
  const excludedGroups = bundles.filter((b) => b.dossier.v1Bucket === "excluded_large_group");
  const excludedSet = new Set([...customerMasterExclusions, ...excludedGroups]);
  const afterExistingRules = bundles.filter((b) => !excludedSet.has(b));

  // commercial-review-v1: approved whole-brand exclusions + permanent pharmacy/chemist
  // exclusion, applied at export time against already-enriched evidence (no new discovery/
  // enrichment call). Applied BEFORE the key-account split, so a key account matching an
  // approved exclusion rule is also removed — "preserve key accounts as management-only unless
  // separately excluded by an approved rule" (explicit requirement).
  const commercialReviewAudit: { lead_id: string; representative: string; business_name: string; matched_rule: string; match_basis: string; previous_status: string; final_exclusion_status: string }[] = [];
  const brandExcluded: typeof afterExistingRules = [];
  const pharmacyChemistExcluded: typeof afterExistingRules = [];
  for (const b of afterExistingRules) {
    const result = evaluateCommercialReviewExclusion(b.dossier, commercialReviewRegistry);
    if (!result.excluded) continue;
    if (result.matchedRule === "brand_exclusion") brandExcluded.push(b); else pharmacyChemistExcluded.push(b);
    commercialReviewAudit.push({
      lead_id: b.leadId, representative: salesRepValue ?? representative!, business_name: b.dossier.tradingName,
      matched_rule: result.matchedRule!, match_basis: result.matchBasis ?? "",
      previous_status: b.dossier.qualificationStatus, final_exclusion_status: result.matchedRule === "brand_exclusion" ? "excluded_brand_commercial_review" : "excluded_pharmacy_chemist",
    });
  }
  const commercialReviewExcludedSet = new Set([...brandExcluded, ...pharmacyChemistExcluded]);
  const afterCommercialReview = afterExistingRules.filter((b) => !commercialReviewExcludedSet.has(b));

  // 2026-08-03: real gap found and fixed during campaign-002 live pilot verification — see
  // generate-master-export.ts's classify() for the full rationale. Only the unambiguous
  // "excluded_non_food" outcome is gated here.
  const businessCategoryExcluded = afterCommercialReview.filter((b) => b.fields.business_category_eligibility === "excluded_non_food");
  const businessCategoryExcludedSet = new Set(businessCategoryExcluded);
  const afterBusinessCategoryExclusion = afterCommercialReview.filter((b) => !businessCategoryExcludedSet.has(b));
  // 2026-08-04: owner-review correction — "review_required_business_category" and
  // "insufficient_category_evidence" now also HOLD (never auto-released as usable), per the
  // locked 4-way policy: eligible->release, unsuitable->exclude, conflicting->review,
  // insufficient->hold. See generate-master-export.ts's classify() for the full rationale.
  const businessCategoryReviewRequired = afterBusinessCategoryExclusion.filter((b) => b.fields.business_category_eligibility === "review_required_business_category" || b.fields.business_category_eligibility === "insufficient_category_evidence");
  const businessCategoryReviewRequiredSet = new Set(businessCategoryReviewRequired);
  const remaining = afterBusinessCategoryExclusion.filter((b) => !businessCategoryReviewRequiredSet.has(b));

  const usable = remaining.filter((b) => b.dossier.qualificationStatus === "qualified" || b.dossier.qualificationStatus === "qualified_with_channel_limit");
  const keyAccounts = usable.filter((b) => b.fields.key_account_indicator === "Yes");
  const ordinaryNewLeads = usable.filter((b) => !keyAccounts.includes(b));

  console.log(`Ordinary new leads: ${ordinaryNewLeads.length}. Key accounts: ${keyAccounts.length}.`);
  console.log(`Excluded from ordinary export: ${customerMasterExclusions.length} customer-master exclusions (audit-only), ${excludedGroups.length} excluded groups, ${brandExcluded.length} commercial-review brand exclusions, ${pharmacyChemistExcluded.length} pharmacy/chemist exclusions, ${businessCategoryExcluded.length} café/bubble-tea business-category exclusions, ${businessCategoryReviewRequired.length} business-category review-required/insufficient-evidence (held), ${remaining.length - usable.length} held/hard-rejected.`);
  if (businessCategoryReviewRequired.length) {
    await fs.writeFile(path.join(outArg, `${territoryPrefix}-business-category-review-required.csv`), writeCsv(
      ["lead_id", "representative", "business_name", "business_category_eligibility", "business_category_evidence_summary"],
      businessCategoryReviewRequired.map((b) => ({ lead_id: b.leadId, representative: salesRepValue ?? representative!, business_name: b.dossier.tradingName, business_category_eligibility: b.fields.business_category_eligibility, business_category_evidence_summary: b.fields.business_category_evidence_summary })),
    ));
  }
  if (businessCategoryExcluded.length) {
    await fs.writeFile(path.join(outArg, `${territoryPrefix}-business-category-exclusion-audit.csv`), writeCsv(
      ["lead_id", "representative", "business_name", "business_category_eligibility", "business_category_evidence_summary"],
      businessCategoryExcluded.map((b) => ({ lead_id: b.leadId, representative: salesRepValue ?? representative!, business_name: b.dossier.tradingName, business_category_eligibility: b.fields.business_category_eligibility, business_category_evidence_summary: b.fields.business_category_evidence_summary })),
    ));
  }

  if (commercialReviewAudit.length) {
    await fs.writeFile(path.join(outArg, `${territoryPrefix}-commercial-review-exclusion-audit.csv`), writeCsv(
      ["lead_id", "representative", "business_name", "matched_rule", "match_basis", "previous_status", "final_exclusion_status"],
      commercialReviewAudit,
    ));
  }

  const columnLabels = columns.map((c) => c.salesProFieldLabel);
  const violations: ValidationViolation[] = [];
  const buildRows = (list: RowBundle[]) => list.map((b) => buildRowAndValidate(columns, b, role!, violations));

  const newLeadRows = buildRows(ordinaryNewLeads);
  const customerMasterExclusionRows = customerMasterExclusions.map((b) => buildRowAndValidate(columns, b, role!, violations, true));
  const keyAccountRows = buildRows(keyAccounts);

  if (violations.length) {
    await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-dropdown-violations.csv`), writeCsv(["lead_id", "column", "value", "reason"], violations.map((v) => ({ lead_id: v.leadId, column: v.column, value: v.value, reason: v.reason }))));
    throw new Error(`Refusing to write Sales Pro export: ${violations.length} dropdown/type violation(s) found (see ${territoryPrefix}-salespro-dropdown-violations.csv). No value outside a column's allowed set is ever written to a CTO import file.`);
  }

  // Safety check: zero overlap between the ordinary new-lead file and the audit-only exclusions
  // file — a customer-master match must never reach a rep-facing/import file.
  const newLeadIds = new Set(ordinaryNewLeads.map((b) => b.dossier.candidateId));
  const keyAccountIds = new Set(keyAccounts.map((b) => b.dossier.candidateId));
  const leaked = [...customerMasterExclusions, ...brandExcluded, ...pharmacyChemistExcluded].filter((b) => newLeadIds.has(b.dossier.candidateId) || keyAccountIds.has(b.dossier.candidateId));
  if (leaked.length) throw new Error(`SAFETY FAILURE: ${leaked.length} excluded candidate(s) also appear in the ordinary new-leads or key-accounts file: ${leaked.map((b) => b.dossier.candidateId).join(", ")}.`);

  // Safety check (locked policy 2026-08-02): zero blank or invalid phones in released output.
  // This is a backstop, not the primary gate — a phone_resolution_exception candidate should
  // never reach `usable` at all (qualification-v2.ts already filters it out upstream); this
  // re-verifies that guarantee defensively at the very last export step, exactly like the
  // existing exclusion leak-check above.
  const phoneViolations = [...newLeadRows, ...keyAccountRows].filter((row) => !isValidUkPhone(row["Phone"] as string | null));
  if (phoneViolations.length) {
    throw new Error(`SAFETY FAILURE: ${phoneViolations.length} released row(s) have a blank or invalid phone — every released ordinary lead and key account requires a valid UK phone. Lead ID(s): ${phoneViolations.map((r) => r["Permanent Lead ID"]).join(", ")}.`);
  }

  await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-new-leads.csv`), writeCsv(columnLabels, newLeadRows));
  // Audit-only — not one of the rep-facing/import categories. Representatives must not see or
  // receive these businesses; this file exists for reconciliation/audit purposes only.
  await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-customer-master-exclusions.csv`), writeCsv(columnLabels, customerMasterExclusionRows));
  await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-key-accounts.csv`), writeCsv(columnLabels, keyAccountRows));

  const testSampleSize = Number(arg("test-sample") ?? "0");
  if (testSampleSize > 0) {
    const sample = [...ordinaryNewLeads].sort((a, b) => a.leadId.localeCompare(b.leadId)).slice(0, testSampleSize);
    await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-${testSampleSize}-record-test.csv`), writeCsv(columnLabels, buildRows(sample)));
    console.log(`Controlled-test file: ${testSampleSize} record(s) written.`);
  }

  const requiredGapRows = bundles.filter((b) => b.gaps.length > 0);
  await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-required-field-gaps.csv`), writeCsv(
    ["lead_id", "candidate_id", "trading_name", "missing_required_master_fields"],
    requiredGapRows.map((b) => ({ lead_id: b.leadId, candidate_id: b.dossier.candidateId, trading_name: b.dossier.tradingName, missing_required_master_fields: b.gaps.join("; ") })),
  ));

  const reconciliation = {
    generatedAt: new Date().toISOString(), representative, role, salesTerritory, districts: districts.map((d) => d.district),
    totalCandidates: bundles.length, ordinaryNewLeads: ordinaryNewLeads.length, keyAccounts: keyAccounts.length,
    customerMasterExclusions: customerMasterExclusions.length, excludedGroups: excludedGroups.length, excludedHeldOrHardRejected: remaining.length - usable.length,
    commercialReviewBrandExclusions: brandExcluded.length, pharmacyChemistExclusions: pharmacyChemistExcluded.length, commercialReviewVersion: commercialReviewRegistry.version,
    columnCount: columns.length, existingCtoFieldCount: existingCount, newFieldCount: newCount, dropdownViolations: 0,
    everyLeadIdAlsoInMaster: true, // by construction — same resolveMasterFields() call, same leadId formula
    reactivationRetired: true, // 2026-07-24 — reactivation is no longer an operational lead category
  };
  await fs.writeFile(path.join(outArg, `${territoryPrefix}-salespro-export-reconciliation.json`), JSON.stringify(reconciliation, null, 2));

  console.log(`\nOutputs written to: ${outArg}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
