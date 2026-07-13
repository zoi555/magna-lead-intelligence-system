// Financial risk scoring — NOW SPRINT #2 (CH-FIN-2 / addendum).
// Maps the financial health band + hard status signals to a 0–10 financial_risk_score
// and a risk band. Never rejects a lead solely for unavailable financials.

export interface FinancialRiskInput {
  available: boolean;
  isPdfOnly: boolean;
  healthBand: string; // strong | acceptable | weak | high_risk | unknown
  extractionConfidence: number;
  accountsOverdue: boolean | null;
  hasInsolvencyLink: boolean;
  negativeNetAssets: boolean;
  companyStatus: string | null; // active | dissolved | liquidation | unknown
}

export interface FinancialRiskResult {
  riskBand: "low" | "medium" | "high" | "unknown";
  scoreComponent: number; // 0..10
  reasonCodes: string[];
  warnings: string[];
  holdSevere: boolean; // severe financial distress → recommend hold
}

export function computeFinancialRisk(inp: FinancialRiskInput): FinancialRiskResult {
  const reasonCodes: string[] = [];
  const warnings: string[] = [];

  // Hard financial-distress signals.
  const severe = inp.companyStatus === "liquidation" || inp.hasInsolvencyLink;
  if (inp.hasInsolvencyLink) { reasonCodes.push("CH_INSOLVENCY_RISK"); warnings.push("CH_INSOLVENCY_RISK"); }

  if (!inp.available) {
    reasonCodes.push("CH_FINANCIALS_UNAVAILABLE");
    if (inp.isPdfOnly) { reasonCodes.push("CH_PDF_ONLY_MANUAL_REVIEW"); warnings.push("PDF_ONLY_NO_STRUCTURED_VALUES"); }
    // Unknown → mid-low score, never a rejection.
    return { riskBand: "unknown", scoreComponent: 5, reasonCodes, warnings: [...warnings, "FINANCIAL_VALUES_INSUFFICIENT"], holdSevere: false };
  }

  reasonCodes.push("CH_FINANCIALS_AVAILABLE");
  if (inp.extractionConfidence < 0.4) { reasonCodes.push("CH_FINANCIAL_EXTRACTION_LOW_CONFIDENCE"); warnings.push("LOW_EXTRACTION_CONFIDENCE"); }
  if (inp.accountsOverdue) { reasonCodes.push("CH_ACCOUNTS_OVERDUE"); warnings.push("ACCOUNTS_OVERDUE"); }
  if (inp.negativeNetAssets) { reasonCodes.push("CH_NET_ASSETS_NEGATIVE"); warnings.push("NEGATIVE_NET_ASSETS"); }

  let riskBand: FinancialRiskResult["riskBand"];
  let scoreComponent: number;
  switch (inp.healthBand) {
    case "strong": riskBand = "low"; scoreComponent = 10; break;
    case "acceptable": riskBand = "low"; scoreComponent = 8; break;
    case "weak": riskBand = "medium"; scoreComponent = 5; break;
    case "high_risk": riskBand = "high"; scoreComponent = 2; break;
    default: riskBand = "unknown"; scoreComponent = 5; break;
  }
  // Escalate on hard signals.
  if (inp.accountsOverdue || inp.negativeNetAssets) { scoreComponent = Math.min(scoreComponent, 3); riskBand = "high"; }
  if (severe) { scoreComponent = 0; riskBand = "high"; }

  return { riskBand, scoreComponent, reasonCodes, warnings, holdSevere: severe };
}
