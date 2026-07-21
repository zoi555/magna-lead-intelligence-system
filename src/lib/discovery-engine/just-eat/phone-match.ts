// Defensible name/address match validation for phone enrichment. Deliberately conservative
// — false negatives (missed matches, reported "ambiguous") are safer than false positives
// (a wrong phone number written to a real record).

function normaliseForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Token-overlap name match: at least half the shorter name's significant tokens (len>2)
 *  must appear in the other name. */
export function namesMatch(a: string, b: string): boolean {
  const ta = normaliseForMatch(a).split(" ").filter((t) => t.length > 2);
  const tb = normaliseForMatch(b).split(" ").filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const overlap = shorter.filter((t) => longerSet.has(t)).length;
  return overlap / shorter.length >= 0.5;
}

/** Address/postcode match: the returned address must contain the outlet's full postcode,
 *  or at minimum its outward code (e.g. "UB1"). */
export function addressMatches(outletPostcode: string, returnedAddress: string | null): boolean {
  if (!returnedAddress) return false;
  const addr = returnedAddress.toUpperCase().replace(/\s+/g, " ");
  const pc = outletPostcode.toUpperCase().replace(/\s+/g, " ").trim();
  if (pc && addr.includes(pc)) return true;
  const outward = pc.split(" ")[0];
  return Boolean(outward) && addr.includes(outward);
}
