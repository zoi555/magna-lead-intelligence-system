// MOCK DATA ONLY — illustrative. No real customer data, no integrations, nothing operational.

export const latestRun = {
  id: "RUN-0042",
  territory: "West London — July batch",
  status: "Running",
  date: "2026-07-11",
  discovered: 146,
  afterDedup: 121,
  cost: "£3.10",
  stage: "Scoring (7 of 10)",
};

export const coverageProgress = {
  targetedDistricts: 12,
  totalInBoundary: 29,
  percent: 41,
  inBoundaryGaps: 17,
  expansionHeld: 3,
};

export const kpis = {
  newLeads: 146,
  readyForReview: 121,
  exportReady: 84,
  telesalesOpen: 37,
  ignoredAuto: 418,
  deliveryGaps: 17,
};

export const setupBlockers = [
  { id: "ISS-0001", label: "Existing-customer postcode file", owner: "Zoeb", status: "Blocked" },
  { id: "ISS-0002", label: "Delivery boundary list", owner: "Zoeb", status: "Blocked" },
  { id: "ISS-0003", label: "CTO schema validation (Sales Pro fields)", owner: "CTO", status: "Warning" },
  { id: "API-01", label: "Companies House API key", owner: "Admin", status: "Warning" },
  { id: "API-02", label: "Apify actor (Uber/Deliveroo)", owner: "Admin", status: "Warning" },
];

export const integrations = [
  { service: "Supabase (UAT)", status: "Draft", configured: false },
  { service: "NetSuite (read-only)", status: "Blocked", configured: false },
  { service: "Companies House API", status: "Warning", configured: false },
  { service: "Google Places (fallback)", status: "Warning", configured: false },
  { service: "Apify (Uber/Deliveroo)", status: "Warning", configured: false },
  { service: "Sales Pro CRM (tenant CRM)", status: "Blocked", configured: false },
];

export const pipelineRuns = [
  { id: "RUN-0042", territory: "West London — July batch", date: "2026-07-11", discovered: 146, dedup: 121, cost: "£3.10", status: "Running" },
  { id: "RUN-0041", territory: "Mixed: UB1, UB2, TW3 1", date: "2026-07-08", discovered: 146, dedup: 121, cost: "£3.10", status: "Warning" },
  { id: "RUN-0040", territory: "Delivery boundary upload", date: "2026-07-07", discovered: 0, dedup: 0, cost: "£0.00", status: "Blocked" },
  { id: "RUN-0039", territory: "UB1 2 (manual test)", date: "2026-07-05", discovered: 18, dedup: 15, cost: "£0.30", status: "Complete" },
];

export const territories = [
  { name: "West London — July batch", items: "3 outer, 2 inner", postcodes: "~640", lastUsed: "2026-07-11", status: "Draft" },
  { name: "UB1 2 (manual test)", items: "1 inner sector", postcodes: "~14", lastUsed: "2026-07-05", status: "Complete" },
  { name: "Expansion probe — Slough", items: "1 expansion list", postcodes: "~210", lastUsed: "—", status: "Draft" },
];

export const discoveredLeads = [
  { id: "LD-1041", brand: "Chick & Grill", postcode: "UB1 2AA", tier: "A", score: 84, verify: "FSA+CH", status: "Warning" },
  { id: "LD-1043", brand: "Smash Yard", postcode: "TW3 1PP", tier: "A", score: 91, verify: "CH pending", status: "Running" },
  { id: "LD-1044", brand: "Wing It", postcode: "UB2 4RS", tier: "Low", score: 52, verify: "No mobile", status: "Warning" },
  { id: "LD-1045", brand: "New Flame BBQ", postcode: "HA0 1LT", tier: "A", score: 88, verify: "FSA+CH", status: "Exported" },
  { id: "LD-1049", brand: "Old Town Fry", postcode: "UB1 2JJ", tier: "—", score: 0, verify: "—", status: "Blocked" },
];

export const ignoredSummary = [
  { reason: "ACTIVE_MATCH", count: 214, note: "Existing active customers" },
  { reason: "OUT_OF_AREA", count: 96, note: "Outside delivery boundary" },
  { reason: "DISSOLVED", count: 41, note: "Companies House dissolved" },
  { reason: "NOT_FOOD", count: 38, note: "Not a foodservice operator" },
  { reason: "LOW_SCORE", count: 22, note: "Below threshold" },
  { reason: "NO_FSA", count: 7, note: "No FSA registration match" },
];

export const telesalesAssignments = [
  { id: "TA-2001", brand: "Chick & Grill", postcode: "UB1 2AA", phone: "07xxx 100201", tier: "A", trigger: "—", worked: "Open" },
  { id: "TA-2002", brand: "New Flame BBQ", postcode: "HA0 1LT", phone: "07xxx 100990", tier: "A", trigger: "New FSA reg", worked: "In progress" },
  { id: "TA-2003", brand: "Peri Peri Palace", postcode: "UB2 4RS", phone: "07xxx 100455", tier: "B", trigger: "Review complaint", worked: "Contacted" },
];

export const exportBatches = [
  { id: "EXB-014", run: "RUN-0041", leads: 121, status: "Draft", approvedBy: "—", date: "2026-07-08" },
  { id: "EXB-013", run: "RUN-0039", leads: 11, status: "Blocked", approvedBy: "—", date: "2026-07-05" },
];

// Coverage tiles for the mock map panel (schematic — not real geography).
export type CovTile = { code: string; level: 0 | 1 | 2 | 3 | 4; gap?: boolean; expansion?: boolean };
export const coverageTiles: CovTile[] = [
  { code: "HA2", level: 0, gap: true }, { code: "UB4", level: 1 }, { code: "HA0", level: 3 }, { code: "HA1", level: 2 }, { code: "W5", level: 1 }, { code: "NW10", level: 1 },
  { code: "UB3", level: 2 }, { code: "UB1", level: 4 }, { code: "UB6", level: 0, gap: true }, { code: "W7", level: 0, gap: true }, { code: "W3", level: 2 }, { code: "W13", level: 0, gap: true },
  { code: "UB2", level: 3 }, { code: "TW5", level: 1 }, { code: "TW3", level: 3 }, { code: "TW7", level: 0, gap: true }, { code: "W4", level: 0, gap: true }, { code: "SW13", level: 0 },
  { code: "SL1", level: 1, expansion: true }, { code: "TW4", level: 1 }, { code: "TW13", level: 0, gap: true }, { code: "TW8", level: 0, gap: true }, { code: "SW14", level: 0 }, { code: "SL3", level: 0, expansion: true },
];

export const adminUsers = [
  { name: "Zoeb", role: "Owner / Admin", tenant: "Demo Company", active: true },
  { name: "Sales Manager", role: "Management", tenant: "Demo Company", active: true },
  { name: "Telesales x4", role: "Telesales", tenant: "Demo Company", active: true },
  { name: "Dev", role: "Developer (UAT)", tenant: "Demo Company", active: true },
];
