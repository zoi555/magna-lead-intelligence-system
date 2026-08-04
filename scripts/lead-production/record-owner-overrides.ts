// Records EXPLICIT, structured owner-override decisions onto specific named Master rows
// (2026-08-04, pre-push acceptance verification, item 2). An override decision must never be
// represented as an ordinary algorithmic outcome — every override gets its own dedicated,
// clearly-labelled column block (never overloaded onto the algorithmic "Magna Customer Match
// Status"/"Customer Match Confidence" fields a reviewer might mistake for the automated verdict).
//
// This script's decision table is intentionally NOT auto-derived — these are the owner's own
// explicit, named decisions (given verbatim in the owner's message), applied to specific Lead
// IDs. It independently re-verifies the ORIGINAL algorithmic evidence for each named lead before
// writing the record (never trusts the caller blindly), so the "original algorithm decision" and
// "evidence retained" fields are always the real, re-derived evidence, not a hand-typed guess.
//
// Read-only against the customer master; writes the combined Master workbook in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { buildCustomerIndex, traceLeadCandidates, type LeadForVerification } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

interface OverrideDecision {
  leadId: string;
  ownerDecision: "released_with_owner_override" | "held_with_owner_override";
  reason: string;
}

const OVERRIDES: OverrideDecision[] = [
  {
    leadId: "IG1-FA671913",
    ownerDecision: "released_with_owner_override",
    reason: "generic alias shared by unrelated customers; no phone, postcode, address, legal identity or account corroboration.",
  },
  {
    leadId: "RM1-015EC5DD",
    ownerDecision: "released_with_owner_override",
    reason: "shared franchise/brand domain only; different district and no matching phone, postcode, address, legal entity or parent account.",
  },
  {
    leadId: "BR1-63951AA0",
    ownerDecision: "held_with_owner_override",
    reason: "improved component-address matching shows different buildings, but owner has retained it for review pending a final commercial decision.",
  },
];

const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];

const toLead = (r: Record<string, unknown>): LeadForVerification => ({
  leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
  representative: (r["Assigned Representative"] as string) || null, tradingName: String(r["Trading Name"] ?? ""),
  phone: (r["Main Phone"] as string) || null, email: (r["Verified Email"] as string) || null,
  website: (r["Website"] as string) || null, postcode: (r["Full Postcode"] as string) || null,
  address: (r["Full Operating Address"] as string) || null, netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
});

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  const timestamp = arg("timestamp") ?? new Date(0).toISOString(); // caller must supply a real timestamp — Date.now() is unavailable in workflow scripts and a silent default would misrepresent when the decision was recorded
  if (!combinedMasterPath || !customersPath || !arg("timestamp")) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> --timestamp=<ISO8601> [--out=<path>] [--reviewer=<name>]");
    process.exit(1);
  }
  const outPath = arg("out") ?? combinedMasterPath;
  const reviewer = arg("reviewer") ?? "Owner (Zoeb) — explicit written instruction, not an in-app reviewer action";

  const { createHash } = await import("node:crypto");
  const customersCsv = await fs.readFile(customersPath, "utf8");
  const checksum = createHash("sha256").update(customersCsv).digest("hex");
  const index = buildCustomerIndex(customersCsv);

  const wb = XLSX.readFile(combinedMasterPath);
  const TIER_RANK: Record<string, number> = { confirmed: 3, probable: 2, clear: 1 };
  let recorded = 0;
  const notFound: string[] = [];

  for (const override of OVERRIDES) {
    let found = false;
    for (const sheetName of DISJOINT_SHEETS) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
      const row = rows.find((r) => String(r["Permanent Lead ID"]) === override.leadId);
      if (!row) continue;
      found = true;

      const lead = toLead(row);
      const trace = traceLeadCandidates(lead, index);
      const material = trace.filter((c) => c.tier === "confirmed" || c.tier === "probable");
      const bestTier = material.reduce<string>((acc, c) => (TIER_RANK[c.tier] > TIER_RANK[acc] ? c.tier : acc), "clear");
      const evidenceRetained = material.length
        ? material.map((m) => `${m.customer.id} "${m.customer.name}" (${m.customer.isActive ? "active" : "inactive"}) [${m.signals.join(", ")}]`).join(" | ")
        : "No confirmed/probable finding on independent re-derivation at the time this override was recorded.";

      row["Override: Lead ID"] = override.leadId;
      row["Override: Original Algorithm Decision"] = bestTier === "clear" ? "clear (no material finding)" : bestTier;
      row["Override: Owner Decision"] = override.ownerDecision;
      row["Override: Reason"] = override.reason;
      row["Override: Timestamp"] = timestamp;
      row["Override: Customer Master Checksum"] = checksum;
      row["Override: Reviewer"] = reviewer;
      row["Override: Evidence Retained"] = evidenceRetained;
      row["Override: Sheet At Time Of Recording"] = sheetName;

      wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows);
      console.log(`${override.leadId}: recorded ${override.ownerDecision} (original algorithm decision: ${bestTier}) in sheet "${sheetName}".`);
      recorded++;
      break;
    }
    if (!found) notFound.push(override.leadId);
  }

  if (notFound.length) { console.error(`NOT FOUND (refusing to guess): ${notFound.join(", ")}`); }

  XLSX.writeFile(wb, outPath);
  console.log(`\nOverride records written: ${outPath} (${recorded}/${OVERRIDES.length} recorded)`);
  if (notFound.length) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
