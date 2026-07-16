// UK telephone normalisation.
//
// DEPENDENCY NOTE: the Just Eat listing endpoint supplies NO phone number, so there is
// no phone data to normalise in Stage 1. Rather than add a heavy dependency
// (libphonenumber-js) for a field the current source never returns, this is a small,
// well-tested GB-only normaliser. It is deliberately conservative: an unparseable
// number is NEVER discarded and NEVER fabricated — the raw value is retained with a
// reason. If a lawful outlet-detail endpoint that returns phones is added later, swap
// this for libphonenumber-js and justify the dependency then.

export interface NormalisedPhone {
  raw: string;                 // original value, never discarded
  comparison: string | null;   // digits-only comparison key
  e164: string | null;         // +44… where confidently derivable
  national: string | null;     // 0… UK display form
  extension: string | null;
  valid: boolean;
  invalidReason: string | null;
}

export function normaliseUkPhone(input: string | null | undefined): NormalisedPhone {
  const raw = (input ?? "").toString();
  const base: NormalisedPhone = { raw, comparison: null, e164: null, national: null, extension: null, valid: false, invalidReason: null };
  if (!raw.trim()) return { ...base, invalidReason: "empty" };

  // Pull an extension if written as "x123" / "ext 123".
  let work = raw;
  let extension: string | null = null;
  const extMatch = work.match(/(?:\s*(?:ext|x|extension)\.?\s*)(\d{1,6})\s*$/i);
  if (extMatch) { extension = extMatch[1]; work = work.slice(0, extMatch.index).trim(); }

  const hasPlus = /^\s*\+/.test(work);
  let digits = work.replace(/[^\d]/g, "");
  if (!digits) return { ...base, extension, invalidReason: "no digits" };

  // Normalise international prefixes to a GB national significant number (NSN).
  let nsn: string | null = null;
  if (hasPlus && digits.startsWith("44")) nsn = digits.slice(2);
  else if (digits.startsWith("0044")) nsn = digits.slice(4);
  else if (digits.startsWith("44") && digits.length >= 11) nsn = digits.slice(2);
  else if (digits.startsWith("0")) nsn = digits.slice(1);
  else nsn = digits; // assume already NSN

  const comparison = digits;
  if (!nsn || nsn.length < 9 || nsn.length > 10) {
    return { ...base, comparison, extension, invalidReason: `unexpected GB length (${nsn?.length ?? 0})` };
  }

  return {
    raw,
    comparison,
    e164: `+44${nsn}`,
    national: `0${nsn}`,
    extension,
    valid: true,
    invalidReason: null,
  };
}
