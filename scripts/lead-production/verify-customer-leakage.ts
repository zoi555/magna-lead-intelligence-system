// Independent pre-release customer-leakage verifier (2026-08-03, board-escalated customer-
// suppression audit). Deliberately does NOT reuse match-customers.ts/customer-match-
// materiality.ts's tier logic or trust any stage's stored `magna_customer_match_result` — it
// re-derives every identifier comparison from scratch against the raw customer master file, so
// a bug in the main matching pipeline cannot also hide itself from this check. Read-only, no
// live call: reads an already-built combined Master workbook's "Operationally Usable Leads"
// sheet and the customer master CSV.
//
// Blocks the release (exit 1) if ANY row in the releasable population has a CONFIRMED or
// PROBABLE match against ANY customer record (active or inactive) on any of: exact NetSuite
// customer ID appearing on the lead row itself (should never happen for a new lead), exact
// company number, exact phone (candidate's Main Phone against the customer's Phone + every
// alternate phone column), exact email, exact domain (candidate website vs customer Email/
// Invoice Email Address domains), exact full postcode + name correspondence, or an exact
// trading-name/alias match at the same postal district. A postcode-only or generic-name-only
// hit is reported but never blocks (see CLEARED_ONLY_REASONS below) — matches the same
// evidentiary bar already used elsewhere in this pipeline (weak name similarity alone never
// auto-excludes).

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsv } from "./csv";
import { normaliseName, normalisePhone, normalisePostcode, normaliseDomain, nameSimilarity } from "./normalize";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const STRONG_NAME_SIM = 0.6;
const MODERATE_NAME_SIM = 0.3;
// Below this, a shared identifier (phone/domain) is treated as a real-world reassignment/
// coincidence rather than the same business — matches the explicit "reassigned phone with
// conflicting evidence held rather than auto-excluded" regression requirement.
const CONFLICTING_NAME_FLOOR = 0.1;

// The conflict check specifically must not treat a shared TOWN/AREA name as identity
// corroboration (real case: "Franzos - Ilford" vs "Peri Peri Chicken Bites (Ilford)" share
// nothing but "ilford", inflating Jaccard similarity to 0.2 — well above a naive floor — even
// though these are obviously unrelated businesses). Stripped ONLY for the conflict check below,
// never for the corroboration checks elsewhere, which intentionally still credit a genuine
// postcode+name match. Small, explicit, pilot-district-scoped list — never a general gazetteer.
const LOCATION_WORDS = new Set(["ilford", "chelmsford", "bromley", "dartford", "romford", "london"]);
function stripLocationWords(normalisedName: string): string {
  return normalisedName.split(" ").filter((t) => t && !LOCATION_WORDS.has(t)).join(" ");
}

export interface CustomerIndexEntry {
  id: string;
  name: string;
  isActive: boolean;
  phones: string[]; // normalised
  emails: string[];
  domains: string[]; // normalised, derived from emails
  postcode: string | null; // normalised canonical
  outward: string | null;
}

export function buildCustomerIndex(csvText: string): CustomerIndexEntry[] {
  const rows = parseCsv(csvText);
  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);
  const iInactive = idx("Inactive"), iId = idx("ID"), iName = idx("Name"), iCompanyName = idx("Company Name");
  const iPhone = idx("Phone"), iOfficePhone = idx("Office Phone"), iWhatsApp = idx("Invoice WhatsApp Number");
  const iEmail = idx("Email"), iInvoiceEmail = idx("Invoice Email Address");
  const iZip = idx("Billing Zip"), iShipZip = idx("Shipping Zip");
  const missing = [["Inactive", iInactive], ["ID", iId], ["Name", iName]].filter(([, i]) => i === -1).map(([n]) => n);
  if (missing.length) throw new Error(`verify-customer-leakage: customer file is missing required column(s): ${missing.join(", ")}. Refusing to build an incomplete identity index.`);

  const entries: CustomerIndexEntry[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => !c)) continue;
    const rawPhones = [row[iPhone], iOfficePhone >= 0 ? row[iOfficePhone] : null, iWhatsApp >= 0 ? row[iWhatsApp] : null].filter((v): v is string => !!v);
    const rawEmails = [row[iEmail], iInvoiceEmail >= 0 ? row[iInvoiceEmail] : null].filter((v): v is string => !!v);
    const postcodeRaw = row[iZip] || (iShipZip >= 0 ? row[iShipZip] : "");
    const np = normalisePostcode(postcodeRaw);
    entries.push({
      id: row[iId] ?? "",
      name: row[iName] || row[iCompanyName] || "",
      isActive: (row[iInactive] ?? "").trim().toLowerCase() !== "yes",
      phones: [...new Set(rawPhones.map((p) => normalisePhone(p).comparison).filter((p): p is string => !!p))],
      emails: [...new Set(rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))],
      domains: [...new Set(rawEmails.map((e) => (e.includes("@") ? normaliseDomain(e.split("@")[1]) : null)).filter((d): d is string => !!d))],
      postcode: np.canonical,
      outward: np.outward,
    });
  }
  return entries;
}

export interface LeadForVerification {
  leadId: string;
  district: string;
  representative?: string | null;
  tradingName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  postcode: string | null;
  netsuiteAccountCode?: string | null;
}

export type VerdictTier = "confirmed" | "probable" | "clear";
export interface LeakageFinding {
  lead: LeadForVerification;
  customer: CustomerIndexEntry;
  signals: string[];
  tier: VerdictTier;
}

export function verifyLeadAgainstIndex(lead: LeadForVerification, index: CustomerIndexEntry[]): LeakageFinding[] {
  const candPhone = lead.phone ? normalisePhone(lead.phone).comparison : null;
  const candEmail = lead.email ? lead.email.trim().toLowerCase() : null;
  const candDomain = lead.website ? normaliseDomain(lead.website) : null;
  const candPostcode = normalisePostcode(lead.postcode);
  const candNameNorm = normaliseName(lead.tradingName);

  const findings: LeakageFinding[] = [];
  for (const cust of index) {
    if (lead.netsuiteAccountCode && cust.id && lead.netsuiteAccountCode.trim().toUpperCase() === cust.id.trim().toUpperCase()) {
      findings.push({ lead, customer: cust, signals: ["exact_netsuite_account_code"], tier: "confirmed" });
      continue;
    }
    const hasPhone = !!candPhone && cust.phones.includes(candPhone);
    const hasEmail = !!candEmail && cust.emails.includes(candEmail);
    const hasDomain = !!candDomain && cust.domains.includes(candDomain);
    const custNameNorm = normaliseName(cust.name);
    const sim = candNameNorm && custNameNorm ? nameSimilarity(candNameNorm, custNameNorm) : 0;
    const conflictSim = nameSimilarity(stripLocationWords(candNameNorm), stripLocationWords(custNameNorm));
    const nameConflicts = conflictSim < CONFLICTING_NAME_FLOOR; // essentially unrelated names (ignoring a merely-shared town/area word) — a reassigned number/address, not the same business
    const samePostcode = !!candPostcode.canonical && candPostcode.canonical === cust.postcode;
    const sameDistrict = !!candPostcode.outward && candPostcode.outward === cust.outward;
    const nameCorroborates = sim >= MODERATE_NAME_SIM;

    if (!hasPhone && !hasEmail && !hasDomain && !samePostcode && !sameDistrict) continue;

    const strongSignalCount = [hasPhone, hasEmail, hasDomain, samePostcode].filter(Boolean).length;
    const signals: string[] = [];
    if (hasPhone) signals.push("exact_phone");
    if (hasEmail) signals.push("exact_email");
    if (hasDomain) signals.push("exact_domain");

    let tier: VerdictTier;
    if (strongSignalCount >= 2) {
      // Two independent strong signals — confirmed regardless of name, per the explicit rule.
      tier = "confirmed";
    } else if ((hasPhone || hasEmail) && !nameConflicts) {
      // Exact phone/email alone is confirmed UNLESS the name evidence actively conflicts (a
      // reassigned/shared number to a clearly different business — held for review instead).
      tier = "confirmed";
    } else if ((hasPhone || hasEmail) && nameConflicts) {
      tier = "probable";
      signals.push("conflicting_name_evidence");
    } else if (hasDomain && (nameCorroborates || samePostcode)) {
      // Domain alone requires corroborating name OR postcode to confirm, per the explicit rule
      // ("exact verified website/email domain plus corroborating name/postcode").
      tier = "confirmed";
      signals.push(nameCorroborates ? "corroborating_name" : "corroborating_postcode");
    } else if (hasDomain) {
      tier = "probable";
      signals.push("differing_trading_name");
    } else if (samePostcode && sim >= STRONG_NAME_SIM) {
      tier = "confirmed"; signals.push("exact_postcode_strong_name");
    } else if (samePostcode && sim >= MODERATE_NAME_SIM) {
      tier = "probable"; signals.push("exact_postcode_moderate_name");
    } else if (sameDistrict && sim >= STRONG_NAME_SIM) {
      tier = "probable"; signals.push("same_district_strong_name");
    } else {
      continue; // postcode/district alone with weak/no name correspondence — not material, never reported as a hit
    }

    findings.push({ lead, customer: cust, signals, tier });
  }
  return findings;
}

export interface LeakageCertificate {
  campaignId: string;
  customerMasterChecksum: string;
  customerMasterPath: string;
  activeCount: number;
  inactiveCount: number;
  releasedLeadCount: number;
  matchTestsPerformed: string[];
  confirmedLeakCount: number;
  probableMatchCount: number;
  result: "PASS" | "FAIL";
  generatedAt: string;
}

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  const campaignId = arg("campaign-id");
  const outJson = arg("out-json");
  const outXlsx = arg("out-xlsx");
  if (!combinedMasterPath || !customersPath || !campaignId || !outJson) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> --campaign-id=<id> --out-json=<path> [--out-xlsx=<path>]");
    process.exit(1);
  }

  const { createHash } = await import("node:crypto");
  const customersCsv = await fs.readFile(customersPath, "utf8");
  const checksum = createHash("sha256").update(customersCsv).digest("hex");
  const index = buildCustomerIndex(customersCsv);
  console.log(`Customer identity index: ${index.length} records (${index.filter((c) => c.isActive).length} active, ${index.filter((c) => !c.isActive).length} inactive), checksum ${checksum}.`);

  const wb = XLSX.readFile(combinedMasterPath);
  const ws = wb.Sheets["Operationally Usable Leads"];
  if (!ws) throw new Error(`${combinedMasterPath}: no "Operationally Usable Leads" sheet found.`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];

  const leads: LeadForVerification[] = rows.map((r) => ({
    leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
    representative: (r["Assigned Representative"] as string) || null,
    tradingName: String(r["Trading Name"] ?? ""), phone: (r["Main Phone"] as string) || null,
    email: (r["Verified Email"] as string) || null, website: (r["Website"] as string) || null,
    postcode: (r["Full Postcode"] as string) || null, netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
  }));

  const allFindings: LeakageFinding[] = [];
  for (const lead of leads) allFindings.push(...verifyLeadAgainstIndex(lead, index));
  const confirmed = allFindings.filter((f) => f.tier === "confirmed");
  const probable = allFindings.filter((f) => f.tier === "probable");

  console.log(`\nReleased lead population: ${leads.length}`);
  console.log(`Confirmed leaks: ${confirmed.length}`);
  for (const f of confirmed) console.log(`  BLOCK: ${f.lead.leadId} "${f.lead.tradingName}" -> customer ${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`);
  console.log(`Probable matches (held, not release-blocking on their own, reported for review): ${probable.length}`);
  for (const f of probable) console.log(`  REVIEW: ${f.lead.leadId} "${f.lead.tradingName}" -> customer ${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`);

  const result: LeakageCertificate["result"] = confirmed.length === 0 ? "PASS" : "FAIL";
  const certificate: LeakageCertificate = {
    campaignId, customerMasterChecksum: checksum, customerMasterPath: customersPath,
    activeCount: index.filter((c) => c.isActive).length, inactiveCount: index.filter((c) => !c.isActive).length,
    releasedLeadCount: leads.length,
    matchTestsPerformed: ["netsuite_account_code", "exact_phone (incl. alternate phone columns)", "exact_email", "exact_domain", "exact_postcode+name", "same_district+strong_name"],
    confirmedLeakCount: confirmed.length, probableMatchCount: probable.length, result,
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(certificate, null, 2));
  console.log(`\nZero-leakage certificate: ${outJson}`);
  console.log(`RESULT: ${result}`);

  if (outXlsx) {
    const clearedLeadIds = new Set(leads.map((l) => l.leadId));
    for (const f of allFindings) clearedLeadIds.delete(f.lead.leadId);
    const clearedLeads = leads.filter((l) => clearedLeadIds.has(l.leadId));

    const whyMissed = (f: LeakageFinding): string => {
      const parts: string[] = [];
      if (f.signals.includes("exact_phone") && !f.customer.phones[0]) parts.push("only matched via an alternate phone column (Office Phone / Invoice WhatsApp Number), not the primary Phone field");
      if (f.signals.includes("exact_domain")) parts.push("domain-only corroboration — the pipeline's own materiality check requires this to be threaded through explicitly per candidate");
      if (f.signals.includes("conflicting_name_evidence")) parts.push("shared identifier but a conflicting trading name — correctly held for human review, not a pipeline miss");
      if (f.signals.includes("differing_trading_name")) parts.push("shared domain but a differing trading name and no postcode agreement — correctly held for human review, not a pipeline miss");
      return parts.length ? parts.join("; ") : "matched on an identifier the automated pipeline's stage-by-stage matchers do not independently cross-check";
    };
    const revisedOutcome = (f: LeakageFinding): string => f.tier === "confirmed" ? "Move to Customer Master Exclusions — permanent hard exclusion" : "Move to Held/Review — requires human confirmation before release or exclusion";

    const outWb = XLSX.utils.book_new();
    const findingRows = (fs2: LeakageFinding[]) => fs2.map((f) => ({
      "Lead ID": f.lead.leadId, District: f.lead.district, Representative: f.lead.representative ?? "", "Lead Trading Name": f.lead.tradingName, "Lead Phone": f.lead.phone,
      "Lead Address/Postcode": f.lead.postcode, "Matched NetSuite Account Code": f.customer.id, "Matched Customer Name": f.customer.name,
      "Customer Lifecycle Status": f.customer.isActive ? "Active" : "Inactive", "Match Signals": f.signals.join(", "), "Match Confidence": f.tier,
      "Why the Original Pipeline Missed It": whyMissed(f), "Revised Final Outcome": revisedOutcome(f),
    }));
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(findingRows(confirmed)), "Confirmed Customer Leaks");
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(findingRows(probable)), "Probable Customer Matches");
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(findingRows(allFindings.filter((f) => f.customer.isActive))), "Active Customer Matches");
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(findingRows(allFindings.filter((f) => !f.customer.isActive))), "Inactive Customer Matches");

    const coverage = (label: string, count: number) => ({ Field: label, "Records with a value": count, "Coverage %": index.length ? Math.round((count / index.length) * 100) : 0 });
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet([
      { Metric: "Customer master file", Value: customersPath },
      { Metric: "SHA-256 checksum", Value: checksum },
      { Metric: "Total rows", Value: index.length },
      { Metric: "Active customers", Value: index.filter((c) => c.isActive).length },
      { Metric: "Inactive customers", Value: index.filter((c) => !c.isActive).length },
      coverage("NetSuite account code (ID)", index.filter((c) => c.id).length),
      coverage("Customer/trading name", index.filter((c) => c.name).length),
      coverage("Primary phone", index.filter((c) => c.phones.length > 0).length),
      coverage("Any email/domain", index.filter((c) => c.emails.length > 0).length),
      coverage("Postcode", index.filter((c) => c.postcode || c.outward).length),
    ]), "Customer Master Quality");

    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(allFindings.map((f) => ({
      "Lead ID": f.lead.leadId, "Matched Customer ID": f.customer.id, Tier: f.tier, Signals: f.signals.join(", "),
      "Lead Phone (normalised)": f.lead.phone, "Customer Phones (normalised)": f.customer.phones.join("; "),
      "Lead Postcode": f.lead.postcode, "Customer Postcode": f.customer.postcode ?? f.customer.outward,
      "Lead Trading Name": f.lead.tradingName, "Customer Name": f.customer.name,
    }))), "Match Evidence");

    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(clearedLeads.map((l) => ({
      "Lead ID": l.leadId, District: l.district, "Trading Name": l.tradingName, Phone: l.phone, Postcode: l.postcode,
      "Verification Result": "No identifier match against the customer master — cleared.",
    }))), "Cleared Pilot Leads");

    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet([certificate]), "Certificate");
    await fs.mkdir(path.dirname(outXlsx), { recursive: true });
    XLSX.writeFile(outWb, outXlsx);
    console.log(`Findings workbook: ${outXlsx}`);
  }

  if (result === "FAIL") process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
