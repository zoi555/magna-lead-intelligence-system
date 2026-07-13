// Companies House financials stage — NOW SPRINT #2 (CH-FIN-1..3 + ratios addendum).
// For HIGH-confidence company matches, discover accounts filings, best-effort parse
// XBRL/iXBRL, calculate ratios + a financial health score, and derive a financial
// risk score. Cap-aware and safe: degrades to "unavailable" without failing.
// Nothing is discarded — the full FinancialInfo is persisted on the record.

import type { CompaniesHouseEnrichment, FinancialInfo } from "./types";
import type { CompaniesHouseRunner } from "../sources/companies-house";
import { parseAccountsDocument } from "./accounts-document-parser";
import { analyseFinancials } from "./financial-analysis";
import { computeFinancialRisk } from "./financial-risk-scoring";

const HIGH = 0.75;

function unavailable(status: string, codes: string[], warnings: string[], ch?: CompaniesHouseEnrichment): FinancialInfo {
  const risk = computeFinancialRisk({
    available: false, isPdfOnly: status === "pdf_only_manual_review",
    healthBand: "unknown", extractionConfidence: 0, accountsOverdue: null,
    hasInsolvencyLink: ch?.hasInsolvencyLink ?? false, negativeNetAssets: false, companyStatus: ch?.companyStatus ?? null,
  });
  return {
    available: false, status,
    accountsLastMadeUpTo: ch?.accountsLastMadeUpTo ?? null,
    accountsNextDue: ch?.accountsNextDue ?? null,
    accountsType: ch?.accountsType ?? null,
    accountsCategory: null, accountsOverdue: null,
    latestAccountsFilingDate: null, latestAccountsTransactionId: null,
    documentMetadataLink: null, documentAvailable: false, documentFormat: null,
    companyAgeYears: null,
    hasInsolvencyLink: ch?.hasInsolvencyLink ?? false, hasChargesLink: ch?.hasChargesLink ?? false, hasFilingHistoryLink: ch?.hasFilingHistoryLink ?? false,
    extracted: {}, extractionConfidence: 0, extractionSource: "unavailable",
    analysis: null,
    riskBand: risk.riskBand, scoreComponent: risk.scoreComponent,
    reasonCodes: [...new Set([...codes, ...risk.reasonCodes])], warnings: [...new Set([...warnings, ...risk.warnings])],
  };
}

/** Is a stored CH match worthy of a (call-heavy) financials fetch? */
export function isFinancialsWorthy(ch: CompaniesHouseEnrichment | undefined): boolean {
  return !!ch?.matched && !!ch.companyNumber && (ch.matchConfidence ?? 0) >= HIGH && ch.companyStatus !== "dissolved";
}

export async function enrichFinancials(
  ch: CompaniesHouseEnrichment | undefined,
  runner: CompaniesHouseRunner,
  referenceDateMs: number
): Promise<FinancialInfo> {
  if (!runner.enabled) return unavailable("disabled", ["CH_API_DISABLED", "CH_FINANCIALS_UNAVAILABLE"], [], ch);
  if (!isFinancialsWorthy(ch)) return unavailable("unavailable", ["CH_FINANCIALS_UNAVAILABLE"], [], ch);
  if (runner.capRemaining <= 0) return unavailable("cap_reached", ["CH_CALL_CAP_REACHED", "CH_FINANCIALS_UNAVAILABLE"], [], ch);

  const companyNumber = ch!.companyNumber as string;
  const filing = await runner.fetchAccountsFilingHistory(companyNumber);
  if (!filing.ok) return unavailable("unavailable", ["CH_FINANCIALS_UNAVAILABLE"], [], ch);

  // Attempt the document only if a metadata link exists and cap remains.
  let format: string | null = null;
  let isPdfOnly = false;
  let extracted: Record<string, number | string | null> = {};
  let extractionConfidence = 0;
  let extractionSource = "filing_metadata";
  const codes: string[] = [];
  const warnings: string[] = [];

  if (filing.documentMetadataLink && runner.capRemaining > 0) {
    const doc = await runner.fetchAccountsDocument(filing.documentMetadataLink);
    format = doc.format;
    isPdfOnly = doc.isPdfOnly;
    if (doc.isPdfOnly) { codes.push("CH_PDF_ONLY_MANUAL_REVIEW"); warnings.push("PDF_ONLY_NO_STRUCTURED_VALUES"); }
    if (doc.content) {
      const parsed = parseAccountsDocument(doc.content, doc.format);
      extracted = parsed.fields;
      extractionConfidence = parsed.extractionConfidence;
      extractionSource = parsed.extractionSource;
      if (parsed.parsedCount > 0) codes.push("CH_XBRL_PARSED");
      if (parsed.extractionConfidence > 0 && parsed.extractionConfidence < 0.4) { codes.push("CH_FINANCIAL_EXTRACTION_LOW_CONFIDENCE"); warnings.push("XBRL_EXTRACTION_PARTIAL"); }
    }
  }

  const hasStructured = Object.values(extracted).some((v) => typeof v === "number");
  const accountsOverdue = ch?.accountsNextDue ? Date.parse(ch.accountsNextDue) < referenceDateMs : null;

  if (isPdfOnly && !hasStructured) {
    const info = unavailable("pdf_only_manual_review", ["CH_PDF_ONLY_MANUAL_REVIEW", "CH_FINANCIALS_UNAVAILABLE"], warnings, ch);
    info.documentMetadataLink = filing.documentMetadataLink;
    info.documentAvailable = true;
    info.documentFormat = "pdf";
    info.latestAccountsFilingDate = filing.latestFilingDate;
    info.latestAccountsTransactionId = filing.transactionId;
    info.accountsCategory = filing.category;
    return info;
  }

  const analysis = analyseFinancials({
    extracted,
    accountsMadeUpTo: filing.madeUpTo ?? ch?.accountsLastMadeUpTo ?? null,
    accountsFilingDate: filing.latestFilingDate,
    incorporationDate: ch?.incorporationDate ?? null,
    extractionConfidence,
    isPdfOnly,
    referenceDateMs,
  });
  const negativeNetAssets = analysis.bands.net_assets_band === "negative";
  const risk = computeFinancialRisk({
    available: hasStructured,
    isPdfOnly,
    healthBand: analysis.healthBand,
    extractionConfidence,
    accountsOverdue,
    hasInsolvencyLink: ch?.hasInsolvencyLink ?? false,
    negativeNetAssets,
    companyStatus: ch?.companyStatus ?? null,
  });

  return {
    available: hasStructured,
    status: hasStructured ? "available" : "unavailable",
    accountsLastMadeUpTo: filing.madeUpTo ?? ch?.accountsLastMadeUpTo ?? null,
    accountsNextDue: ch?.accountsNextDue ?? null,
    accountsType: filing.type ?? ch?.accountsType ?? null,
    accountsCategory: filing.category,
    accountsOverdue,
    latestAccountsFilingDate: filing.latestFilingDate,
    latestAccountsTransactionId: filing.transactionId,
    documentMetadataLink: filing.documentMetadataLink,
    documentAvailable: !!filing.documentMetadataLink,
    documentFormat: format,
    companyAgeYears: analysis.ratios.company_age_years as number | null,
    hasInsolvencyLink: ch?.hasInsolvencyLink ?? false,
    hasChargesLink: ch?.hasChargesLink ?? false,
    hasFilingHistoryLink: ch?.hasFilingHistoryLink ?? false,
    extracted,
    extractionConfidence,
    extractionSource: hasStructured ? extractionSource : "filing_metadata",
    analysis,
    riskBand: risk.riskBand,
    scoreComponent: risk.scoreComponent,
    reasonCodes: [...new Set([...codes, ...risk.reasonCodes, ...analysis.reasons])],
    warnings: [...new Set([...warnings, ...risk.warnings, ...analysis.warnings])],
  };
}
