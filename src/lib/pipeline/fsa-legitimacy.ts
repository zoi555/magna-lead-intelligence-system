// FSA address legitimacy — NOW SPRINT #2 Phase A.
// FSA is not just a hygiene rating: an FSA record is evidence of a REGISTERED
// food business at a verified address/postcode in a known local authority. This
// module turns those facts into legitimacy signals + reason codes for scoring.

import type { WorkingRecord, FsaLegitimacy } from "./types";

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}$/;
const RECENT_DAYS = 365;

function normName(s: string): string {
  return (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normName(a).split(" ").filter(Boolean));
  const tb = new Set(normName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}

/**
 * Compute FSA legitimacy for one record. Cross-checks the FSA name against the
 * Just Eat and Companies House names to flag a possible address/identity conflict.
 */
export function computeFsaLegitimacy(r: WorkingRecord, referenceDateMs: number): FsaLegitimacy {
  const reasonCodes: string[] = [];
  const pc = r.fsa.postcode ?? "";
  const postcodeVerified = POSTCODE_RE.test(pc.toUpperCase());
  const hasAddress = (r.fsa.addressLine ?? "").trim().length > 0;
  const coordinatesPresent = r.fsa.latitude != null && r.fsa.longitude != null;

  let ratingRecent = false;
  if (r.fsa.ratingDate) {
    const t = Date.parse(r.fsa.ratingDate);
    if (!Number.isNaN(t)) {
      const days = (referenceDateMs - t) / 86_400_000;
      ratingRecent = days >= 0 && days <= RECENT_DAYS;
    }
  }

  // FSA presence = registered food business.
  reasonCodes.push("FSA_REGISTERED_FOOD_BUSINESS");
  if (hasAddress) reasonCodes.push("FSA_ADDRESS_VERIFIED");
  if (postcodeVerified) reasonCodes.push("FSA_POSTCODE_VERIFIED");
  if (ratingRecent) reasonCodes.push("FSA_RECENT_RATING");
  else if (r.fsa.ratingDate) reasonCodes.push("FSA_OLD_RATING_DATE");
  if (!coordinatesPresent) reasonCodes.push("FSA_COORDINATES_MISSING");

  // Cross-source name conflict check (Just Eat / Companies House).
  let addressConflict = false;
  const jeName = r.justEat?.matched ? r.justEat.businessName ?? "" : "";
  const chName = r.companiesHouse?.matched ? r.companiesHouse.companyName ?? "" : "";
  if (jeName && tokenOverlap(r.fsa.businessName, jeName) < 0.2) addressConflict = true;
  if (chName && tokenOverlap(r.fsa.businessName, chName) < 0.2) addressConflict = true;
  if (addressConflict) reasonCodes.push("FSA_ADDRESS_CONFLICT");

  // Address legitimacy score: weighted signals.
  let addressLegitimacyScore = 0;
  addressLegitimacyScore += postcodeVerified ? 0.4 : 0;
  addressLegitimacyScore += hasAddress ? 0.3 : 0;
  addressLegitimacyScore += coordinatesPresent ? 0.2 : 0;
  addressLegitimacyScore += ratingRecent ? 0.1 : 0;
  if (addressConflict) addressLegitimacyScore = Math.max(0, addressLegitimacyScore - 0.2);
  addressLegitimacyScore = Math.min(1, Number(addressLegitimacyScore.toFixed(2)));

  // Source confidence: FSA is an authoritative registration source.
  const sourceConfidence = Math.min(1, Number((0.6 + addressLegitimacyScore * 0.4).toFixed(2)));

  return {
    registeredFoodBusiness: true,
    addressLegitimacyScore,
    postcodeVerified,
    coordinatesPresent,
    ratingRecent,
    ratingDate: r.fsa.ratingDate,
    sourceConfidence,
    addressConflict,
    reasonCodes,
  };
}
