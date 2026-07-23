// Filed-accounts extraction and financial calculations — reuses the existing, real,
// already-tested-in-production financial pipeline UNCHANGED:
//   src/lib/pipeline/accounts-document-parser.ts  parseAccountsDocument() — iXBRL/XBRL regex
//     extraction, never invents a value, PDF-only accounts correctly return nothing.
//   src/lib/pipeline/financial-analysis.ts        analyseFinancials() — ratios/bands/health
//     score, every ratio null unless every input it needs is present.
// This file's only job is to (a) fetch the filing history + document via the reused
// CompaniesHouseRunner methods, (b) run both existing functions unchanged, and (c) map their
// plain-number/string outputs into this stage's required FinancialResult shape — the SAME
// value, now carrying its own formula/source-fields/source-periods/confidence per the spec,
// which the existing functions don't attach themselves (they were built for the live pipeline's
// internal scoring, not for an auditable evidence register).
//
// Growth calculations (net-asset growth, turnover growth) are ALWAYS reported not_available:
// this stage's bounded request plan fetches only the LATEST filed accounts per company (see
// companies-house-run-manifest.json's request plan) — a second, prior-year filing would be a
// second document-API call per company, doubling that cost, and is out of scope tonight. This
// is the honest behaviour the "comparable periods only" test requires, not a shortcut around it.
//
// fixedAssets/totalAssets/totalLiabilities are ALSO always not_available: the existing parser's
// FIELD_PATTERNS (accounts-document-parser.ts) has no pattern for a genuine gross total-assets
// or total-liabilities concept — only "total_assets_less_current_liabilities" (a NET figure,
// not total assets) and current-assets/current-liabilities. Mapping the net figure onto a
// "total assets" field would misrepresent it — never done here.

import type { CompaniesHouseRunner } from "../../src/lib/sources/companies-house";
import { parseAccountsDocument } from "../../src/lib/pipeline/accounts-document-parser";
import { analyseFinancials } from "../../src/lib/pipeline/financial-analysis";
import type {
  FiledAccountsData, FinancialCalculations, FinancialResult, FinancialRiskFlag,
  FiledAccountsField, FinancialCalculationField,
} from "./types";
import { FILED_ACCOUNTS_FIELDS, FINANCIAL_CALCULATION_FIELDS } from "./types";

function unavailable(formula: string, reason: string): FinancialResult {
  return { result: null, currency: null, formula, sourceFields: [], sourcePeriods: [], sourceConcept: null, sourceDocument: null, valueSource: "not_available", confidence: "not_available", unavailableReason: reason };
}
function directlyReported(amount: number, currency: string | null, period: string | null, concept: string, sourceDocument: string | null, confidence: FinancialResult["confidence"]): FinancialResult {
  return { result: amount, currency, formula: `directly reported: ${concept}`, sourceFields: [concept], sourcePeriods: period ? [period] : [], sourceConcept: concept, sourceDocument, valueSource: "directly_reported", confidence, unavailableReason: null };
}
function calculated(result: number | string, formula: string, sourceFields: string[], sourcePeriods: string[], confidence: FinancialResult["confidence"]): FinancialResult {
  return { result, currency: null, formula, sourceFields, sourcePeriods, sourceConcept: null, sourceDocument: null, valueSource: "calculated", confidence, unavailableReason: null };
}

function extractionConfidenceBand(c: number): FinancialResult["confidence"] {
  if (c <= 0) return "not_available";
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

export interface FinancialFetchResult {
  filedAccounts: FiledAccountsData;
  calculations: FinancialCalculations;
}

export async function fetchAndComputeFinancials(
  runner: CompaniesHouseRunner,
  candidateId: string,
  companyNumber: string,
  incorporationDate: string | null,
  referenceIso: string,
): Promise<FinancialFetchResult> {
  const referenceMs = Date.parse(referenceIso) || Date.now();
  const filingHistory = await runner.fetchAccountsFilingHistory(companyNumber);

  const emptyValues = () => Object.fromEntries(FILED_ACCOUNTS_FIELDS.map((f) => [f, unavailable("directly reported from filed accounts", "No accounts filing history was retrievable for this company.")])) as Record<FiledAccountsField, FinancialResult>;

  if (!filingHistory.ok) {
    return {
      filedAccounts: { candidateId, companyNumber, accountsType: null, reportingPeriodStart: null, reportingPeriodEnd: null, values: emptyValues(), sourceDocumentReference: null, retrievalTimestamp: referenceIso },
      calculations: emptyCalculations(candidateId, companyNumber, incorporationDate, referenceMs, "No accounts filing history was retrievable for this company."),
    };
  }

  let extracted: Record<string, number | string | null> = {};
  let extractionConfidence = 0;
  let isPdfOnly = false;
  if (filingHistory.documentMetadataLink) {
    const doc = await runner.fetchAccountsDocument(filingHistory.documentMetadataLink);
    isPdfOnly = doc.isPdfOnly;
    if (doc.content) {
      const parsed = parseAccountsDocument(doc.content, doc.format);
      extracted = parsed.fields;
      extractionConfidence = parsed.extractionConfidence;
    }
  }

  const currency = (extracted.currency as string) ?? "GBP";
  const periodEnd = (extracted.period_end as string) ?? filingHistory.madeUpTo ?? null;
  const periodStart = (extracted.period_start as string) ?? null;
  const sourceDocument = filingHistory.transactionId;
  const conf = extractionConfidenceBand(extractionConfidence);

  const numField = (key: string, concept: string, unavailableReason: string): FinancialResult => {
    const v = extracted[key];
    if (typeof v !== "number") return unavailable(`directly reported: ${concept}`, unavailableReason);
    return directlyReported(v, currency, periodEnd, concept, sourceDocument, conf);
  };

  const turnover = numField("turnover", "turnover", "Not tagged in the filed accounts document (or the accounts are PDF-only/abbreviated with no structured turnover fact).");
  const grossProfit = numField("gross_profit", "gross_profit", "Not tagged in the filed accounts document.");
  const operatingProfit = numField("operating_profit", "operating_profit", "Not tagged in the filed accounts document.");
  let profitOrLoss = numField("profit_loss_after_tax", "profit_loss_after_tax", "Not tagged in the filed accounts document.");
  if (profitOrLoss.result === null) profitOrLoss = numField("profit_loss_before_tax", "profit_loss_before_tax", "Neither profit_loss_after_tax nor profit_loss_before_tax was tagged in the filed accounts document.");
  const cash = numField("cash_bank_in_hand", "cash_bank_in_hand", "Not tagged in the filed accounts document.");
  const currentAssets = numField("current_assets", "current_assets", "Not tagged in the filed accounts document.");
  const currentLiabilities = numField("current_liabilities", "current_liabilities", "Not tagged in the filed accounts document.");
  const netCurrentAssetsLiabilities = numField("net_current_assets_liabilities", "net_current_assets_liabilities", "Not tagged in the filed accounts document.");
  const netAssets = numField("net_assets_liabilities", "net_assets_liabilities", "Not tagged in the filed accounts document.");
  const shareholdersFunds = netAssets.result !== null
    ? { ...netAssets, formula: "directly reported: net_assets_liabilities (the filed-accounts concept covers both net assets and shareholders' funds — the parser does not distinguish them as separate tagged facts)" }
    : unavailable("directly reported: shareholders' funds", "Not tagged in the filed accounts document (same concept as net_assets_liabilities, also unavailable).");
  const employeeCount = numField("employees_average_number", "employees_average_number", "Not tagged in the filed accounts document (common for micro-entity/abbreviated accounts).");
  const creditorsWithin = extracted.creditors_due_within_one_year;
  const creditorsAfter = extracted.creditors_due_after_one_year;
  const creditors = typeof creditorsWithin === "number" || typeof creditorsAfter === "number"
    ? directlyReported((Number(creditorsWithin) || 0) + (Number(creditorsAfter) || 0), currency, periodEnd, "creditors_due_within_one_year + creditors_due_after_one_year", sourceDocument, conf)
    : unavailable("directly reported: creditors", "Not tagged in the filed accounts document.");

  const fixedAssets = unavailable("directly reported: fixed_assets", "The existing accounts-document parser has no extraction pattern for a genuine fixed-assets concept.");
  const totalAssets = unavailable("directly reported: total_assets", "The existing accounts-document parser only extracts 'total assets less current liabilities' (a net figure), never a genuine gross total-assets concept — reporting that as total_assets would misrepresent it.");
  const totalLiabilities = unavailable("directly reported: total_liabilities", "The existing accounts-document parser has no extraction pattern for a genuine total-liabilities concept.");

  const values: Record<FiledAccountsField, FinancialResult> = {
    turnover, grossProfit, operatingProfit, profitOrLoss, cashAndCashEquivalents: cash,
    currentAssets, currentLiabilities, netCurrentAssetsLiabilities, fixedAssets, totalAssets,
    totalLiabilities, creditors, netAssets, shareholdersFunds, employeeCount,
  };

  const filedAccounts: FiledAccountsData = {
    candidateId, companyNumber, accountsType: filingHistory.type, reportingPeriodStart: periodStart, reportingPeriodEnd: periodEnd,
    values, sourceDocumentReference: sourceDocument, retrievalTimestamp: referenceIso,
  };

  // --- Calculations: reuse analyseFinancials() unchanged, then wrap each output into a
  // FinancialResult with an explicit formula/source/confidence this stage's evidence register requires.
  const analysis = analyseFinancials({
    extracted, accountsMadeUpTo: filingHistory.madeUpTo, accountsFilingDate: filingHistory.latestFilingDate,
    incorporationDate, extractionConfidence, isPdfOnly, referenceDateMs: referenceMs,
  });

  const r = analysis.ratios;
  const periods = periodEnd ? [periodEnd] : [];
  const bandConf: FinancialResult["confidence"] = analysis.healthConfidence > 0 ? (analysis.healthConfidence >= 0.6 ? "high" : analysis.healthConfidence >= 0.3 ? "medium" : "low") : "not_available";

  const companyAgeYears = r.company_age_years != null
    ? calculated(r.company_age_years, "years between incorporation_date and the retrieval reference date", ["incorporationDate"], [], "high")
    : unavailable("years between incorporation_date and the retrieval reference date", "incorporationDate not available.");

  const daysSinceLastAccounts = filingHistory.madeUpTo
    ? calculated(Math.round((referenceMs - (Date.parse(filingHistory.madeUpTo) || referenceMs)) / 86_400_000), "reference date - accounts_made_up_to", ["accountsMadeUpTo"], periods, "high")
    : unavailable("reference date - accounts_made_up_to", "No filed accounts made-up-to date available.");

  const accountsFilingRecency = analysis.bands.accounts_freshness_band && analysis.bands.accounts_freshness_band !== "unavailable"
    ? calculated(analysis.bands.accounts_freshness_band, "accounts_age_months banded: <=18 recent, <=30 old, else stale", ["accountsMadeUpTo"], periods, "high")
    : unavailable("accounts_age_months banded: <=18 recent, <=30 old, else stale", "accounts_age_months could not be computed (no made-up-to date).");

  const currentRatio = r.current_ratio != null
    ? calculated(r.current_ratio, "current_assets / current_liabilities", ["currentAssets", "currentLiabilities"], periods, conf)
    : unavailable("current_assets / current_liabilities", currentAssets.result === null || currentLiabilities.result === null ? "current_assets and/or current_liabilities not available from filed accounts." : "current_liabilities was zero — ratio undefined.");

  const workingCapital = r.working_capital != null
    ? calculated(r.working_capital, "current_assets - current_liabilities", ["currentAssets", "currentLiabilities"], periods, conf)
    : unavailable("current_assets - current_liabilities", "current_assets and/or current_liabilities not available from filed accounts.");

  const liabilitiesToAssetsRatio = unavailable("current_liabilities / total_assets", "total_assets is not extracted by the existing accounts-document parser (see filedAccounts.values.totalAssets) — never estimated.");

  const netAssetValue = netAssets.result != null
    ? calculated(netAssets.result, "directly reported: net_assets_liabilities", ["netAssets"], periods, conf)
    : unavailable("directly reported: net_assets_liabilities", "net_assets_liabilities not available from filed accounts.");

  const netAssetGrowth = unavailable("(net_assets_current_period - net_assets_prior_period) / net_assets_prior_period", "Only the latest filed accounts period was retrieved this run — growth requires two comparable periods, which is out of this stage's bounded request plan.");
  const turnoverGrowth = unavailable("(turnover_current_period - turnover_prior_period) / turnover_prior_period", "Only the latest filed accounts period was retrieved this run — growth requires two comparable periods, which is out of this stage's bounded request plan.");

  const marginValue = r.net_profit_margin_percent ?? r.operating_margin_percent ?? r.gross_margin_percent ?? null;
  const marginSourceFields = r.net_profit_margin_percent != null ? ["profitOrLoss", "turnover"] : r.operating_margin_percent != null ? ["operatingProfit", "turnover"] : r.gross_margin_percent != null ? ["grossProfit", "turnover"] : [];
  const profitMargin = marginValue != null
    ? calculated(marginValue, "profit / turnover (net profit preferred, else operating, else gross)", marginSourceFields, periods, conf)
    : unavailable("profit / turnover (net profit preferred, else operating, else gross)", "Neither turnover nor any profit figure is available from filed accounts.");

  const revenuePerEmployee = r.revenue_per_employee != null
    ? calculated(r.revenue_per_employee, "turnover / employees_average_number", ["turnover", "employeeCount"], periods, conf)
    : unavailable("turnover / employees_average_number", "turnover and/or employees_average_number not available from filed accounts.");

  const financialStrengthBand = analysis.healthScore != null
    ? calculated(analysis.healthBand, "weighted health score across liquidity/balance-sheet/profitability/filing-freshness/maturity components with data", ["healthScore"], periods, bandConf)
    : unavailable("weighted health score across liquidity/balance-sheet/profitability/filing-freshness/maturity components with data", "Insufficient financial data (total signal weight below the scoring threshold).");

  const companySizeBand = employeeCount.result != null
    ? calculated(sizeBandFromEmployees(employeeCount.result as number), "employee count banded per UK Companies Act micro/small/medium/large thresholds", ["employeeCount"], periods, "medium")
    : turnover.result != null
      ? calculated(sizeBandFromTurnover(turnover.result as number), "turnover banded per UK Companies Act micro/small/medium/large thresholds (employee count unavailable)", ["turnover"], periods, "low")
      : unavailable("employee count or turnover banded per UK Companies Act thresholds", "Neither employee count nor turnover is available from filed accounts.");

  // Explicit spec constraint: purchasing capacity must never be inferred from Google ratings or
  // company age alone — this combines ONLY genuine Companies House financial-strength/size
  // evidence, and is not_available when neither exists.
  const likelyPurchasingCapacityBand = (financialStrengthBand.result || companySizeBand.result)
    ? calculated(
        purchasingCapacityFromBands(financialStrengthBand.result as string | null, companySizeBand.result as string | null),
        "combination of financial-strength band and company-size band ONLY (never Google ratings or company age alone)",
        [financialStrengthBand.result ? "financialStrengthBand" : null, companySizeBand.result ? "companySizeBand" : null].filter((x): x is string => !!x),
        periods, financialStrengthBand.result && companySizeBand.result ? "medium" : "low",
      )
    : unavailable("combination of financial-strength band and company-size band ONLY", "Neither a financial-strength band nor a company-size band could be derived from filed accounts.");

  const filedFieldCount = FILED_ACCOUNTS_FIELDS.length;
  const filedAvailableCount = Object.values(values).filter((v) => v.valueSource === "directly_reported").length;
  const financialDataCompleteness = calculated(Number((filedAvailableCount / filedFieldCount).toFixed(2)), "count of directly-reported filed-accounts fields / total filed-accounts fields tracked", ["values"], periods, "high");

  const financialRiskFlags: FinancialRiskFlag[] = analysis.warnings.map((w) => ({ flag: w, sourceFields: ["analysis.warnings"], sourcePeriods: periods }));

  const calculations: Record<FinancialCalculationField, FinancialResult> = {
    companyAgeYears, daysSinceLastAccounts, accountsFilingRecency, currentRatio, workingCapital,
    liabilitiesToAssetsRatio, netAssetValue, netAssetGrowth, turnoverGrowth, profitMargin,
    revenuePerEmployee, financialStrengthBand, companySizeBand, likelyPurchasingCapacityBand,
  };

  return {
    filedAccounts,
    calculations: {
      candidateId, companyNumber, calculations,
      financialRiskFlags,
      financialDataCompleteness,
      financialDataConfidence: extractionConfidenceBand(extractionConfidence),
    },
  };
}

function emptyCalculations(candidateId: string, companyNumber: string, incorporationDate: string | null, referenceMs: number, reason: string): FinancialCalculations {
  const ageYears = incorporationDate ? Number((((referenceMs - (Date.parse(incorporationDate) || referenceMs)) / (86_400_000 * 365.25))).toFixed(1)) : null;
  const companyAgeYears = ageYears != null ? calculated(ageYears, "years between incorporation_date and the retrieval reference date", ["incorporationDate"], [], "high") : unavailable("years between incorporation_date and the retrieval reference date", "incorporationDate not available.");
  const rest: Exclude<FinancialCalculationField, "companyAgeYears">[] = FINANCIAL_CALCULATION_FIELDS.filter((f): f is Exclude<FinancialCalculationField, "companyAgeYears"> => f !== "companyAgeYears");
  const calculations = { companyAgeYears, ...Object.fromEntries(rest.map((f) => [f, unavailable(f, reason)])) } as Record<FinancialCalculationField, FinancialResult>;
  return { candidateId, companyNumber, calculations, financialRiskFlags: [], financialDataCompleteness: unavailable("filed-accounts field availability fraction", reason), financialDataConfidence: "not_available" };
}

function sizeBandFromEmployees(n: number): string {
  if (n < 10) return "micro";
  if (n < 50) return "small";
  if (n < 250) return "medium";
  return "large";
}
function sizeBandFromTurnover(turnover: number): string {
  if (turnover < 632_000) return "micro";
  if (turnover < 10_200_000) return "small";
  if (turnover < 36_000_000) return "medium";
  return "large";
}
function purchasingCapacityFromBands(strength: string | null, size: string | null): string {
  const strengthScore: Record<string, number> = { strong: 3, acceptable: 2, weak: 1, high_risk: 0, unknown: 1 };
  const sizeScore: Record<string, number> = { large: 3, medium: 2, small: 1, micro: 0 };
  const s = strength ? (strengthScore[strength] ?? 1) : 1;
  const z = size ? (sizeScore[size] ?? 1) : 1;
  const combined = s + z;
  if (combined >= 5) return "high";
  if (combined >= 3) return "moderate";
  if (combined >= 1) return "low";
  return "minimal";
}
