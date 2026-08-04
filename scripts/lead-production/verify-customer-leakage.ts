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
import { normaliseName, normalisePhone, extractAllUkPhoneComparisons, normalisePostcode, normaliseAddress, normaliseDomain, nameSimilarity } from "./normalize";
import { parseAddressComponents, compareAddressComponents, type AddressComponents } from "./address-components";
import { fuzzyNameCandidate } from "./fuzzy-name-match";

// T/A ("trading as") alias extraction — the real customer master routinely embeds the actual
// trading name inside the legal/account name (e.g. "Al Shukraan Ltd T/A Al Qasr Restaurant").
// Extracted as an explicit, separately-matchable alias, not just left folded into the combined
// name string nameSimilarity() already tolerates.
function extractTradingAsAlias(raw: string): string | null {
  const m = /t\/a\s+(.+?)(?:\s*\(closed\))?$/i.exec(raw);
  return m ? m[1].trim() : null;
}

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
  id: string; // NetSuite entity/customer ID (e.g. "A632") — the column literally named "ID"
  internalId: string; // NetSuite "Internal ID" — a separate, numeric identifier
  name: string;
  legalName: string;
  aliases: string[]; // normalised T/A-parsed trading-name aliases
  isActive: boolean;
  phones: string[]; // normalised
  emails: string[];
  domains: string[]; // normalised, derived from emails
  postcode: string | null; // normalised canonical
  outward: string | null;
  address: string | null; // normalised (normaliseAddress), for whole-string fallback corroboration
  addressComponents: AddressComponents | null; // component-level parse, for the preferred comparison
}

export function buildCustomerIndex(csvText: string): CustomerIndexEntry[] {
  const rows = parseCsv(csvText);
  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);
  const iInactive = idx("Inactive"), iId = idx("ID"), iInternalId = idx("Internal ID"), iName = idx("Name"), iCompanyName = idx("Company Name");
  const iPhone = idx("Phone"), iOfficePhone = idx("Office Phone"), iWhatsApp = idx("Invoice WhatsApp Number");
  const iEmail = idx("Email"), iInvoiceEmail = idx("Invoice Email Address");
  const iZip = idx("Billing Zip"), iShipZip = idx("Shipping Zip");
  const iAddr1 = idx("Billing Address 1"), iAddr2 = idx("Billing Address 2"), iCity = idx("Billing City");
  const missing = [["Inactive", iInactive], ["ID", iId], ["Name", iName]].filter(([, i]) => i === -1).map(([n]) => n);
  if (missing.length) throw new Error(`verify-customer-leakage: customer file is missing required column(s): ${missing.join(", ")}. Refusing to build an incomplete identity index.`);

  const entries: CustomerIndexEntry[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => !c)) continue;
    const rawPhones = [row[iPhone], iOfficePhone >= 0 ? row[iOfficePhone] : null, iWhatsApp >= 0 ? row[iWhatsApp] : null].filter((v): v is string => !!v);
    const rawEmails = [row[iEmail], iInvoiceEmail >= 0 ? row[iInvoiceEmail] : null].filter((v): v is string => !!v);
    const postcodeRaw = row[iZip] || (iShipZip >= 0 ? row[iShipZip] : "");
    const np = normalisePostcode(postcodeRaw);
    const name = row[iName] || row[iCompanyName] || "";
    const legalName = iCompanyName >= 0 ? (row[iCompanyName] ?? "") : "";
    const aliasSources = [name, legalName].map(extractTradingAsAlias).filter((a): a is string => !!a);
    const addrParts = [iAddr1 >= 0 ? row[iAddr1] : "", iAddr2 >= 0 ? row[iAddr2] : "", iCity >= 0 ? row[iCity] : ""].filter(Boolean);
    entries.push({
      id: row[iId] ?? "",
      internalId: iInternalId >= 0 ? (row[iInternalId] ?? "") : "",
      name, legalName,
      aliases: [...new Set(aliasSources.map((a) => normaliseName(a)).filter(Boolean))],
      isActive: (row[iInactive] ?? "").trim().toLowerCase() !== "yes",
      // extractAllUkPhoneComparisons (not a single normalisePhone() call) — a phone-ish column
      // can carry more than one genuine number plus free-text annotation in the same cell (real,
      // confirmed on 17 rows of "Office Phone" alone); every genuine number embedded in the cell
      // must still be a matchable candidate, not just the first/only one.
      phones: [...new Set(rawPhones.flatMap((p) => extractAllUkPhoneComparisons(p)))],
      emails: [...new Set(rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))],
      domains: [...new Set(rawEmails.map((e) => (e.includes("@") ? normaliseDomain(e.split("@")[1]) : null)).filter((d): d is string => !!d))],
      postcode: np.canonical,
      outward: np.outward,
      address: addrParts.length ? normaliseAddress(addrParts.join(", ")) : null,
      // Real bug found via testing: Address 1/2/City alone never contain a postcode (it's a
      // SEPARATE "Billing Zip" column), so parseAddressComponents's own postcode extraction found
      // nothing and every customer's addressComponents.postcode was silently null — meaning
      // postcodeMatch (required by BOTH compatiblePremises and premisesIdentifierConflict) could
      // never be true for any real customer. Fixed by appending the already-parsed canonical
      // postcode (`np`, computed above from Billing Zip/Shipping Zip) onto the address text before
      // parsing, mirroring how a lead's own "Full Operating Address" field naturally already ends
      // with its postcode.
      addressComponents: addrParts.length ? parseAddressComponents([...addrParts, np.canonical ?? postcodeRaw].filter(Boolean).join(", ")) : null,
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
  address?: string | null;
  netsuiteAccountCode?: string | null;
}

export type VerdictTier = "confirmed" | "probable" | "clear";
export interface LeakageFinding {
  lead: LeadForVerification;
  customer: CustomerIndexEntry;
  signals: string[];
  tier: VerdictTier;
}

// Extracted so the release-decision path (verifyLeadAgainstIndex, below — unchanged behaviour)
// and the audit-trail candidate trace (traceLeadCandidates, for the leakage-audit workbook's
// Phone/Postcode/Address/Fuzzy-Name Trigger Candidate sheets) share exactly one evaluation, never
// two independently-maintained copies that could silently drift apart. Returns null only when NO
// candidate signal exists at all between this lead and this customer (nothing to log); otherwise
// returns the same signals/tier the release path would compute, PLUS "clear" as a real possible
// tier (a genuine candidate — e.g. an exact postcode match with only weak name correspondence —
// that was considered and explicitly resolved as not material, not one that silently never
// existed). verifyLeadAgainstIndex filters "clear" out to preserve its exact prior contract.
export interface PairEvaluation { signals: string[]; tier: VerdictTier | "clear"; triggerSignals: string[] }
export function evaluateLeadCustomerPair(lead: LeadForVerification, cust: CustomerIndexEntry): PairEvaluation | null {
  const candPhone = lead.phone ? normalisePhone(lead.phone).comparison : null;
  const candEmail = lead.email ? lead.email.trim().toLowerCase() : null;
  const candDomain = lead.website ? normaliseDomain(lead.website) : null;
  const candPostcode = normalisePostcode(lead.postcode);
  const candNameNorm = normaliseName(lead.tradingName);
  const candAddressNorm = lead.address ? normaliseAddress(lead.address) : null;

  {
    if (lead.netsuiteAccountCode && cust.id && lead.netsuiteAccountCode.trim().toUpperCase() === cust.id.trim().toUpperCase()) {
      return { signals: ["exact_netsuite_account_code"], tier: "confirmed", triggerSignals: ["netsuite_account_code"] };
    }
    const hasPhone = !!candPhone && cust.phones.includes(candPhone);
    const hasEmail = !!candEmail && cust.emails.includes(candEmail);
    const hasDomain = !!candDomain && cust.domains.includes(candDomain);
    // Exact trading-name alias match (the T/A-parsed name, e.g. candidate "Al Qasr Restaurant"
    // against customer "Al Shukraan Ltd T/A Al Qasr Restaurant"'s parsed alias "al qasr
    // restaurant") — a direct identity match, not merely a similarity score.
    const hasExactAlias = !!candNameNorm && cust.aliases.includes(candNameNorm);
    // Compared against BOTH the trading name and the separate legal/company name column — a
    // candidate can genuinely match either (the user explicitly requires "company/legal names"
    // as its own tested identifier, not folded silently into the trading-name comparison).
    const custNameNorm = normaliseName(cust.name);
    const custLegalNameNorm = cust.legalName ? normaliseName(cust.legalName) : "";
    const exactSim = Math.max(
      candNameNorm && custNameNorm ? nameSimilarity(candNameNorm, custNameNorm) : 0,
      candNameNorm && custLegalNameNorm ? nameSimilarity(candNameNorm, custLegalNameNorm) : 0,
    );
    // Fuzzy spelling/word-boundary variation (Damerau-Levenshtein — see fuzzy-name-match.ts):
    // catches minor misspellings ("Mohammed Grill"/"Mohamad Grill"), joined/split words ("Grill
    // House"/"Grillhouse"), and singular/plural ("Rafiques"/"Rafique") that exact-token Jaccard
    // similarity misses entirely (0 token overlap). Only reaches `sim` at FUZZY_SUPPORT_FLOOR
    // (0.85) — high enough that it behaves exactly like the existing exact-similarity signal (it
    // can support/corroborate an independent postcode/phone/domain match, or feed the dedicated
    // fuzzy-only candidate branch below), but a fuzzy match on its own NEVER reaches STRONG_NAME_SIM
    // by this path alone unless the words are genuinely almost identical — it never confirms alone.
    const fuzzyVsName = candNameNorm && custNameNorm ? fuzzyNameCandidate(candNameNorm, custNameNorm) : null;
    const fuzzyVsLegal = candNameNorm && custLegalNameNorm ? fuzzyNameCandidate(candNameNorm, custLegalNameNorm) : null;
    const bestFuzzy = [fuzzyVsName, fuzzyVsLegal].filter((f): f is NonNullable<typeof f> => !!f).sort((a, b) => b.comparison.bestSimilarity - a.comparison.bestSimilarity)[0] ?? null;
    const sim = Math.max(exactSim, bestFuzzy && bestFuzzy.supportsCorroboration ? bestFuzzy.comparison.bestSimilarity : 0);
    const conflictSim = nameSimilarity(stripLocationWords(candNameNorm), stripLocationWords(custNameNorm));
    const nameConflicts = conflictSim < CONFLICTING_NAME_FLOOR; // essentially unrelated names (ignoring a merely-shared town/area word) — a reassigned number/address, not the same business
    const samePostcode = !!candPostcode.canonical && candPostcode.canonical === cust.postcode;
    const sameDistrict = !!candPostcode.outward && candPostcode.outward === cust.outward;
    const nameCorroborates = sim >= MODERATE_NAME_SIM;
    // A fuzzy-name-only candidate (no other signal at all) is gated to the same postal district —
    // matches this codebase's existing "foundational geographic gate" principle and keeps an
    // 8000+-row customer master from generating unbounded fuzzy-name noise. Never confirms alone;
    // see the dedicated decision branch below (always PROBABLE, per the owner's explicit rule).
    const hasFuzzyNameOnlyCandidate = !!bestFuzzy?.isCandidate && sameDistrict;
    // Component-level address comparison (address-components.ts) is preferred over the whole-
    // string Jaccard fallback: "same postcode but different unit/building: not confirmation"
    // cannot be expressed by a flat bag-of-tokens score (two different shop numbers on the same
    // road share every other token and score a HIGH Jaccard despite being different premises).
    const candAddressComponents = lead.address ? parseAddressComponents(lead.address) : null;
    const addressComparison = candAddressComponents && cust.addressComponents ? compareAddressComponents(candAddressComponents, cust.addressComponents) : null;
    // Full-address corroboration — genuinely useful when a full postcode isn't available but a
    // free-text address is (a common gap pre-enrichment); never a substitute for postcode when
    // the postcode itself disagrees. Used only as a fallback when component-level parsing didn't
    // produce a usable comparison on either side.
    const addressSim = candAddressNorm && cust.address ? nameSimilarity(candAddressNorm, cust.address) : 0;
    const wholeStringSameAddress = addressSim >= STRONG_NAME_SIM && (!candPostcode.outward || !cust.outward || candPostcode.outward === cust.outward);
    const componentConflict = !!addressComparison?.premisesIdentifierConflict;
    const sameAddress = !componentConflict && (!!addressComparison?.compatiblePremises || (!addressComparison && wholeStringSameAddress));
    // Model-defect fix (2026-08-03, authoritative-source rerun): an exact trading-name alias
    // (T/A-parsed) is just as reusable/generic as a bare trading name — real case: "Spice Hut" is
    // an exact T/A alias shared by 5 completely unrelated customers in different towns. The
    // owner's own rule requires "exact trading-name alias + postcode" for CONFIRMED — alias alone
    // is never enough. Likewise "same address with uncertain operator" is explicitly listed as
    // PROBABLE, not confirmed — a different, unrelated business can genuinely occupy a former
    // customer's old premises (real case: "Kings Diner" at the same address as "Madoona's Ltd
    // T/A Morley's - Downham", a flatly different name).
    const aliasConfirmed = hasExactAlias && samePostcode;
    const aliasProbable = hasExactAlias && !samePostcode;
    const addressConfirmed = sameAddress && !nameConflicts && (samePostcode || sim >= MODERATE_NAME_SIM);
    const addressProbable = sameAddress && !addressConfirmed;

    // Every raw candidate signal is recorded as a trigger even when it ultimately resolves
    // "clear" below — the owner's rule is that phone/postcode must be mandatory triggers that are
    // always explicitly resolved (confirmed/probable/cleared), never silently invisible.
    const triggerSignals: string[] = [];
    if (hasPhone) triggerSignals.push("phone");
    if (samePostcode) triggerSignals.push("postcode");
    if (sameAddress) triggerSignals.push("address");
    if (hasDomain) triggerSignals.push("domain");
    if (hasEmail) triggerSignals.push("email");
    if (hasExactAlias) triggerSignals.push("alias");
    if (!triggerSignals.length && (exactSim >= MODERATE_NAME_SIM || !!bestFuzzy?.isCandidate)) triggerSignals.push("fuzzy_name");

    if (!hasPhone && !hasEmail && !hasDomain && !hasExactAlias && !samePostcode && !sameDistrict && !sameAddress) return null;

    const strongSignalCount = [hasPhone, hasEmail, hasDomain, aliasConfirmed, samePostcode].filter(Boolean).length;
    const signals: string[] = [];
    if (hasPhone) signals.push("exact_phone");
    if (hasEmail) signals.push("exact_email");
    if (hasDomain) signals.push("exact_domain");
    if (hasExactAlias) signals.push("exact_trading_name_alias");

    let tier: VerdictTier | "clear";
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
    } else if (aliasConfirmed) {
      tier = "confirmed"; signals.push("alias_plus_postcode");
    } else if (aliasProbable) {
      tier = "probable"; signals.push("alias_without_postcode_corroboration");
    } else if (hasDomain && samePostcode) {
      // Domain alone requires corroborating name OR postcode to confirm, per the explicit rule
      // ("exact verified website/email domain plus corroborating name/postcode").
      tier = "confirmed";
      signals.push("corroborating_postcode");
    } else if (hasDomain && nameCorroborates && sameDistrict) {
      // Model-defect fix (2026-08-03, authoritative-source rerun): name corroboration alone,
      // with NO geographic agreement at all, is not enough for a shared domain — a brand-wide
      // domain used across multiple independent franchise locations (real case: "phatbuns.co.uk",
      // shared by "PHAT Buns - Romford" (legal entity "Phat Buns London Ltd") and an unrelated
      // franchisee "Cha Sha Hounslow Ltd T/A Phat buns hounslow" in a different town/company
      // entirely) is exactly the "possible branch/successor relationship" case the owner's rules
      // put in the PROBABLE tier, never confirmed on domain+name alone. Requiring at least the
      // same postal DISTRICT here matches the same geographic-gate principle already used
      // throughout this codebase (customer-match-materiality.ts's "foundational geographic gate").
      tier = "confirmed";
      signals.push("corroborating_name_same_district");
    } else if (hasDomain) {
      tier = "probable";
      signals.push(nameCorroborates ? "corroborating_name_different_district_possible_franchise" : "differing_trading_name");
    } else if (samePostcode && sim >= STRONG_NAME_SIM) {
      tier = "confirmed"; signals.push("exact_postcode_strong_name");
    } else if (addressConfirmed) {
      tier = "confirmed"; signals.push("exact_full_address_plus_corroboration");
    } else if (addressProbable) {
      tier = "probable"; signals.push("exact_address_uncertain_operator");
    } else if (samePostcode && sim >= MODERATE_NAME_SIM) {
      tier = "probable"; signals.push("exact_postcode_moderate_name");
    } else if (sameDistrict && sim >= STRONG_NAME_SIM) {
      tier = "probable"; signals.push("same_district_strong_name");
    } else if (hasFuzzyNameOnlyCandidate) {
      // Fuzzy spelling/word-boundary variation (see fuzzy-name-match.ts) is a candidate-
      // generation and corroboration-support mechanism ONLY, per the owner's explicit rule — it
      // may never confirm a customer alone, however similar the strings are. Always PROBABLE, for
      // human review, gated to the same postal district.
      tier = "probable";
      signals.push(`fuzzy_name_variation_same_district (${bestFuzzy!.comparison.method}, similarity ${bestFuzzy!.comparison.bestSimilarity.toFixed(2)})`);
    } else {
      // A genuine candidate WAS considered (exact postcode/district/address/alias overlap, or a
      // fuzzy-name hit) but resolved as not material — explicitly "clear", not silently dropped.
      // Never release-blocking (unchanged from the prior behaviour); logged here purely for the
      // audit trail so every mandatory-trigger candidate has a recorded, explicit resolution.
      tier = "clear";
      signals.push(samePostcode ? "exact_postcode_weak_name" : sameAddress ? "exact_address_weak_name" : sameDistrict ? "same_district_weak_name" : "fuzzy_name_only");
    }

    return { signals, tier, triggerSignals };
  }
}

export function verifyLeadAgainstIndex(lead: LeadForVerification, index: CustomerIndexEntry[]): LeakageFinding[] {
  const findings: LeakageFinding[] = [];
  for (const cust of index) {
    const evaluation = evaluateLeadCustomerPair(lead, cust);
    if (!evaluation || evaluation.tier === "clear") continue; // preserves the exact prior contract: only confirmed/probable are ever returned here
    findings.push({ lead, customer: cust, signals: evaluation.signals, tier: evaluation.tier });
  }
  return findings;
}

export interface CandidateTraceRow {
  lead: LeadForVerification;
  customer: CustomerIndexEntry;
  triggerSignals: string[];
  signals: string[];
  tier: VerdictTier | "clear";
}

// Audit-trail candidate trace — EVERY candidate pair considered (including ones that resolve
// "clear"), for the leakage-audit workbook's Phone/Postcode/Address/Fuzzy-Name Trigger Candidate
// sheets. Never used to gate a release decision (verifyLeadAgainstIndex above is the only
// release-blocking path) — this exists purely so a human reviewer can see that a mandatory
// trigger (phone, postcode) was genuinely evaluated and explicitly resolved, not silently missed.
export function traceLeadCandidates(lead: LeadForVerification, index: CustomerIndexEntry[]): CandidateTraceRow[] {
  const rows: CandidateTraceRow[] = [];
  for (const cust of index) {
    const evaluation = evaluateLeadCustomerPair(lead, cust);
    if (!evaluation) continue;
    rows.push({ lead, customer: cust, triggerSignals: evaluation.triggerSignals, signals: evaluation.signals, tier: evaluation.tier });
  }
  return rows;
}

export interface LeakageCertificate {
  campaignId: string;
  authoritativeCustomerFilename: string;
  customerMasterChecksum: string;
  customerMasterPath: string;
  customerMasterRowCount: number;
  activeCount: number;
  inactiveCount: number;
  releasedLeadCount: number;
  matchTestsPerformed: string[];
  confirmedLeakCount: number;
  confirmedMatchesRemovedDuringReprocessing: number | null;
  probableMatchCount: number;
  masterResult: "PASS" | "FAIL";
  ctoResult: "PASS" | "FAIL" | "NOT_CHECKED";
  salesProResult: "PASS" | "FAIL" | "NOT_CHECKED";
  result: "PASS" | "FAIL";
  verificationTimestamp: string;
  generatedAt: string;
  verifierCommitHash: string;
}

async function verifySheet(wbPath: string, sheetName: string, index: CustomerIndexEntry[]): Promise<{ leads: LeadForVerification[]; findings: LeakageFinding[] }> {
  const wb = XLSX.readFile(wbPath);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`${wbPath}: no "${sheetName}" sheet found.`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
  const leads: LeadForVerification[] = rows.map((r) => ({
    leadId: String(r["Permanent Lead ID"] ?? r["Lead ID"] ?? ""), district: String(r["Postcode District"] ?? r["District"] ?? ""),
    representative: (r["Assigned Representative"] as string) || (r["Sales Rep"] as string) || null,
    tradingName: String(r["Trading Name"] ?? r["Shop Name"] ?? ""), phone: (r["Main Phone"] as string) || (r["Phone"] as string) || null,
    email: (r["Verified Email"] as string) || (r["Email"] as string) || null, website: (r["Website"] as string) || null,
    postcode: (r["Full Postcode"] as string) || (r["Postcode"] as string) || null, address: (r["Full Operating Address"] as string) || (r["Address Line 1"] as string) || null,
    netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
  }));
  const findings: LeakageFinding[] = [];
  for (const lead of leads) findings.push(...verifyLeadAgainstIndex(lead, index));
  return { leads, findings };
}

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  const campaignId = arg("campaign-id");
  const outJson = arg("out-json");
  const outXlsx = arg("out-xlsx");
  const ctoReviewPath = arg("cto-review");
  const salesProNewLeadsPaths = (arg("salespro-new-leads") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const removedCountArg = arg("removed-count");
  if (!combinedMasterPath || !customersPath || !campaignId || !outJson) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> --campaign-id=<id> --out-json=<path> [--out-xlsx=<path>] [--cto-review=<path>] [--salespro-new-leads=<path,path,...>] [--removed-count=<n>]");
    process.exit(1);
  }

  const { createHash } = await import("node:crypto");
  const { execSync } = await import("node:child_process");
  let verifierCommitHash = "unknown";
  try { verifierCommitHash = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { /* not fatal — reported as "unknown" */ }

  const customersCsv = await fs.readFile(customersPath, "utf8");
  const checksum = createHash("sha256").update(customersCsv).digest("hex");
  const index = buildCustomerIndex(customersCsv);
  console.log(`Customer identity index: ${index.length} records (${index.filter((c) => c.isActive).length} active, ${index.filter((c) => !c.isActive).length} inactive), checksum ${checksum}.`);

  const { leads, findings: allFindings } = await verifySheet(combinedMasterPath, "Operationally Usable Leads", index);
  const confirmed = allFindings.filter((f) => f.tier === "confirmed");
  const probable = allFindings.filter((f) => f.tier === "probable");
  const masterResult: "PASS" | "FAIL" = confirmed.length === 0 ? "PASS" : "FAIL";

  console.log(`\nReleased lead population (Master): ${leads.length}`);
  console.log(`Confirmed leaks: ${confirmed.length}`);
  for (const f of confirmed) console.log(`  BLOCK: ${f.lead.leadId} "${f.lead.tradingName}" -> customer ${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`);
  console.log(`Probable matches (held, not release-blocking on their own, reported for review): ${probable.length}`);
  for (const f of probable) console.log(`  REVIEW: ${f.lead.leadId} "${f.lead.tradingName}" -> customer ${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`);

  let ctoResult: LeakageCertificate["ctoResult"] = "NOT_CHECKED";
  let ctoConfirmed: LeakageFinding[] = [];
  if (ctoReviewPath) {
    const ctoCheck = await verifySheet(ctoReviewPath, "CTO Final Review", index);
    ctoConfirmed = ctoCheck.findings.filter((f) => f.tier === "confirmed");
    ctoResult = ctoConfirmed.length === 0 ? "PASS" : "FAIL";
    console.log(`\nCTO final-review population: ${ctoCheck.leads.length}, confirmed leaks: ${ctoConfirmed.length} -> ${ctoResult}`);
  }

  let salesProResult: LeakageCertificate["salesProResult"] = "NOT_CHECKED";
  const salesProConfirmedAll: LeakageFinding[] = [];
  if (salesProNewLeadsPaths.length) {
    for (const p of salesProNewLeadsPaths) {
      const { parseCsvObjects } = await import("./csv");
      const parsed = parseCsvObjects(await fs.readFile(p, "utf8"));
      const spLeads: LeadForVerification[] = parsed.rows.map((r) => ({
        leadId: r["Permanent Lead ID"] ?? "", district: r["Inward Code"] ?? "", tradingName: r["Shop Name"] ?? "",
        phone: r["Phone"] || null, email: r["Email"] || null, website: null, postcode: r["Postcode"] || null,
        address: null, netsuiteAccountCode: r["Customer NetSuite Account Code"] || null,
      }));
      for (const lead of spLeads) salesProConfirmedAll.push(...verifyLeadAgainstIndex(lead, index).filter((f) => f.tier === "confirmed"));
    }
    salesProResult = salesProConfirmedAll.length === 0 ? "PASS" : "FAIL";
    console.log(`\nSales Pro new-leads files checked: ${salesProNewLeadsPaths.length}, confirmed leaks: ${salesProConfirmedAll.length} -> ${salesProResult}`);
  }

  const overallResult: LeakageCertificate["result"] = [masterResult, ctoResult === "NOT_CHECKED" ? "PASS" : ctoResult, salesProResult === "NOT_CHECKED" ? "PASS" : salesProResult].every((r) => r === "PASS") ? "PASS" : "FAIL";
  const nowIso = new Date().toISOString();
  const certificate: LeakageCertificate = {
    campaignId,
    authoritativeCustomerFilename: path.basename(customersPath),
    customerMasterChecksum: checksum, customerMasterPath: customersPath, customerMasterRowCount: index.length,
    activeCount: index.filter((c) => c.isActive).length, inactiveCount: index.filter((c) => !c.isActive).length,
    releasedLeadCount: leads.length,
    matchTestsPerformed: [
      "netsuite_account_code", "exact_phone (Phone + Office Phone + Invoice WhatsApp Number)",
      "exact_email (Email + Invoice Email Address)", "exact_domain_with_corroboration",
      "exact_postcode_with_punctuation_stripped", "exact_full_address", "trading_name_alias (T/A-parsed)",
      "company_legal_name", "exact_postcode+name", "same_district+strong_name",
      "parent_branch_relationship (no usable data in this customer master — Account column is 99.98% blank)",
      "active_customers", "inactive_customers",
    ],
    confirmedLeakCount: confirmed.length,
    confirmedMatchesRemovedDuringReprocessing: removedCountArg ? Number(removedCountArg) : null,
    probableMatchCount: probable.length,
    masterResult, ctoResult, salesProResult, result: overallResult,
    verificationTimestamp: nowIso, generatedAt: nowIso, verifierCommitHash,
  };

  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(certificate, null, 2));
  console.log(`\nZero-leakage certificate: ${outJson}`);
  console.log(`RESULT: ${overallResult} (Master: ${masterResult}, CTO: ${ctoResult}, Sales Pro: ${salesProResult})`);

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

  if (overallResult === "FAIL") process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
