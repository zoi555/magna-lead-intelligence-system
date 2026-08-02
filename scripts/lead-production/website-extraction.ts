// Website field extraction — spec section B3. Regex/keyword-based over stripped page text,
// mirroring the same lightweight-extraction philosophy already established in this repo's
// accounts-document-parser.ts (never invents a value; a field is null unless genuinely found
// in the page). No email is ever guessed (e.g. info@domain) — only an email actually present in
// the HTML (mailto: link or literal text) is retained. No halal status is ever inferred from
// cuisine type alone — only an explicit "halal" text match counts as evidence.

import type { WebsiteEvidenceField } from "./types";

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

const UK_PHONE_PATTERN = /\b(?:0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}|\+44\s?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})\b/;
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const UK_POSTCODE_PATTERN = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

function field<T>(value: T | null, sourceUrl: string | null, evidenceText: string | null, confidence: WebsiteEvidenceField<T>["confidence"]): WebsiteEvidenceField<T> {
  return { value, sourceUrl, evidenceText, confidence };
}
const NOT_FOUND = <T,>(): WebsiteEvidenceField<T> => field<T>(null, null, null, "not_available");

export function extractPhone(html: string, url: string): WebsiteEvidenceField<string> {
  const mailtoTel = /href="tel:([^"]+)"/i.exec(html);
  if (mailtoTel) return field(mailtoTel[1].replace(/\s/g, ""), url, mailtoTel[0], "high");
  const text = stripTags(html);
  const m = UK_PHONE_PATTERN.exec(text);
  return m ? field(m[0], url, m[0], "medium") : NOT_FOUND();
}

export function extractEmail(html: string, url: string): WebsiteEvidenceField<string> {
  const mailto = /href="mailto:([^"?"]+)/i.exec(html);
  if (mailto) return field(mailto[1], url, mailto[0], "high");
  const text = stripTags(html);
  const m = EMAIL_PATTERN.exec(text);
  return m ? field(m[0], url, m[0], "medium") : NOT_FOUND();
}

export function extractContactForm(html: string, url: string): WebsiteEvidenceField<boolean> {
  const hasForm = /<form[\s\S]*?<\/form>/i.test(html) && /(contact|enquir|message|get in touch)/i.test(html);
  return hasForm ? field(true, url, "a <form> element found alongside contact-related text", "medium") : NOT_FOUND();
}

export function extractAddress(html: string, url: string): WebsiteEvidenceField<string> {
  const text = stripTags(html);
  const m = UK_POSTCODE_PATTERN.exec(text);
  if (!m) return NOT_FOUND();
  const start = Math.max(0, m.index - 80);
  const snippet = text.slice(start, m.index + m[0].length).trim();
  return field(snippet, url, snippet, "medium");
}

export function extractOpeningHours(html: string, url: string): WebsiteEvidenceField<string> {
  const text = stripTags(html);
  const m = /(opening hours|open\s*:|mon(day)?[\s-].{0,80}?(sun|sat)[a-z]*)/i.exec(text);
  if (!m) return NOT_FOUND();
  const snippet = text.slice(m.index, m.index + 150).trim();
  return field(snippet, url, snippet, "low");
}

export function extractMenuUrl(html: string, baseUrl: string): WebsiteEvidenceField<string> {
  const m = /href="([^"]*menu[^"]*)"/i.exec(html);
  if (!m) return NOT_FOUND();
  try { return field(new URL(m[1], baseUrl).toString(), baseUrl, m[0], "high"); } catch { return NOT_FOUND(); }
}

const CUISINE_KEYWORDS = ["indian", "punjabi", "pakistani", "bangladeshi", "chinese", "italian", "pizza", "kebab", "turkish", "fried chicken", "chicken shop", "fish and chips", "caribbean", "african", "thai", "japanese", "sushi", "mexican", "burger", "vegan", "vegetarian", "halal", "afghan", "lebanese", "greek"];
export function extractCuisineTags(html: string): string[] {
  const text = stripTags(html).toLowerCase();
  return CUISINE_KEYWORDS.filter((k) => text.includes(k));
}

function keywordField(html: string, url: string, keywords: string[]): WebsiteEvidenceField<boolean> {
  const text = stripTags(html).toLowerCase();
  const hit = keywords.find((k) => text.includes(k));
  return hit ? field(true, url, hit, "medium") : NOT_FOUND();
}
export function extractServiceModel(html: string, url: string) {
  return {
    delivery: keywordField(html, url, ["delivery", "we deliver", "order online"]),
    collection: keywordField(html, url, ["collection", "click and collect", "pickup", "pick up"]),
    dineIn: keywordField(html, url, ["dine in", "dine-in", "book a table", "reservations"]),
    catering: keywordField(html, url, ["catering", "cater for", "event catering", "party orders"]),
  };
}

const PRODUCT_KEYWORDS = ["chicken", "wings", "burger", "pizza", "kebab", "chips", "fries", "naan", "biryani", "curry", "sauce", "cheese", "dessert", "cake", "milkshake", "shake", "soft drink", "beverage"];
export function extractProductRangeTags(html: string): string[] {
  const text = stripTags(html).toLowerCase();
  return PRODUCT_KEYWORDS.filter((k) => text.includes(k));
}

export function extractHalalEvidence(html: string, url: string): WebsiteEvidenceField<boolean> {
  const text = stripTags(html).toLowerCase();
  if (!text.includes("halal")) return NOT_FOUND();
  const idx = text.indexOf("halal");
  return field(true, url, text.slice(Math.max(0, idx - 40), idx + 60).trim(), "high");
}

// Closure-text detection (locked policy 2026-08-02) — the pipeline previously had NO website-
// based closure signal at all (only Google businessStatus / decisive Companies House
// dissolution). Whole-phrase match only, explicit closure language — never a bare "closed"
// (which false-positives on "closed Sundays"/"closed bank holidays"/"closed for Christmas Day"
// opening-hours text, extremely common on real UK food-service sites). Every matched phrase is
// retained as evidence text for human review, never auto-excluded on this signal alone — website
// text is the weakest of the closure signals (a stale/unmaintained page, or the crawler hitting a
// wrong/reused domain, can both produce a false positive) so this always feeds
// review_required_business_category or a closure-review flag, never a silent hard-exclude by
// itself.
const CLOSURE_TEXT_PATTERNS = [
  /permanently\s+closed/i,
  /(?:this\s+(?:business|restaurant|shop|store|premises)\s+(?:has|is)\s+)?closed\s+down/i,
  /no\s+longer\s+(?:trading|open|in\s+business|operating)/i,
  /ceased\s+trading/i,
  /(?:business|restaurant|shop|store)\s+has\s+closed/i,
  /we\s+have\s+now\s+closed/i,
  /sadly\s+(?:we\s+have\s+)?closed/i,
  /closed\s+permanently/i,
];
export function extractClosureEvidence(html: string, url: string): WebsiteEvidenceField<string> {
  const text = stripTags(html);
  for (const pattern of CLOSURE_TEXT_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      const idx = m.index;
      const snippet = text.slice(Math.max(0, idx - 60), idx + m[0].length + 60).trim();
      return field(m[0], url, snippet, "medium"); // "medium", never "high" — website text alone never auto-excludes
    }
  }
  return NOT_FOUND();
}

export function extractBranchList(html: string): string[] {
  const links = [...html.matchAll(/href="([^"]*(?:branch|location|find-us|store|outlet)[^"]*)"/gi)].map((m) => m[1]);
  return [...new Set(links)].slice(0, 20);
}

const SOCIAL_PATTERNS = [/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+/gi, /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s]+/gi, /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"'\s]+/gi, /https?:\/\/(?:www\.)?tiktok\.com\/[^"'\s]+/gi];
export function extractSocialLinks(html: string): string[] {
  const found: string[] = [];
  for (const p of SOCIAL_PATTERNS) found.push(...(html.match(p) ?? []));
  return [...new Set(found)];
}

const FRANCHISE_KEYWORDS = ["franchise", "part of the", "member of the", "trading as", "t/a ", "group of restaurants", "our other branches"];
export function extractFranchiseGroupClues(html: string): string[] {
  const text = stripTags(html).toLowerCase();
  return FRANCHISE_KEYWORDS.filter((k) => text.includes(k));
}

const CENTRAL_PURCHASING_KEYWORDS = ["head office", "central kitchen", "central production", "commissary", "supply chain", "procurement team"];
export function extractCentralPurchasingClues(html: string): string[] {
  const text = stripTags(html).toLowerCase();
  return CENTRAL_PURCHASING_KEYWORDS.filter((k) => text.includes(k));
}

// Only names clearly and explicitly labelled with a role/title near them — never a bare list
// of capitalised words, which would be an unreliable guess.
const TEAM_NAME_PATTERN = /(?:owner|manager|founder|director|chef)\s*[:\-]?\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})/g;
export function extractPublicTeamNames(html: string): string[] {
  const text = stripTags(html);
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TEAM_NAME_PATTERN.exec(text)) !== null) names.push(m[1]);
  return [...new Set(names)].slice(0, 10);
}
