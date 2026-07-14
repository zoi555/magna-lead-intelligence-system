// Configurable large-chain registry — AspectLead.
//
// A DATA registry of large chains/brands that the default profile excludes as
// "not independent". It is intentionally externalised and editable (per organisation
// / per run) — it must NEVER become hardcoded control-flow, and it is a starting
// seed, not an exhaustive or authoritative list. Organisations can add/remove/disable
// entries. SaaS-neutral: no tenant-specific logic.

export interface ChainEntry {
  id: string; name: string; category: "qsr" | "coffee" | "casual_dining" | "pub" | "supermarket" | "bakery" | "other";
  aliases: string[]; enabled: boolean; source: "seed" | "organisation" | "run";
}

/** Seed registry — a starting list of well-known UK chains. Editable data, not logic. */
export function seedChainRegistry(): ChainEntry[] {
  const seed = (id: string, name: string, category: ChainEntry["category"], aliases: string[] = []): ChainEntry =>
    ({ id, name, category, aliases, enabled: true, source: "seed" });
  return [
    seed("mcdonalds", "McDonald's", "qsr", ["mcdonald", "maccies"]),
    seed("kfc", "KFC", "qsr", ["kentucky fried chicken"]),
    seed("burger_king", "Burger King", "qsr"),
    seed("subway", "Subway", "qsr"),
    seed("greggs", "Greggs", "bakery"),
    seed("dominos", "Domino's Pizza", "qsr", ["dominos"]),
    seed("pizza_hut", "Pizza Hut", "qsr"),
    seed("papa_johns", "Papa John's", "qsr", ["papa johns"]),
    seed("costa", "Costa Coffee", "coffee", ["costa"]),
    seed("starbucks", "Starbucks", "coffee"),
    seed("caffe_nero", "Caffè Nero", "coffee", ["caffe nero", "cafe nero"]),
    seed("pret", "Pret A Manger", "coffee", ["pret a manger"]),
    seed("nandos", "Nando's", "casual_dining", ["nandos"]),
    seed("wagamama", "Wagamama", "casual_dining"),
    seed("pizza_express", "PizzaExpress", "casual_dining", ["pizza express"]),
    seed("zizzi", "Zizzi", "casual_dining"),
    seed("frankie_bennys", "Frankie & Benny's", "casual_dining", ["frankie and bennys"]),
    seed("five_guys", "Five Guys", "qsr"),
    seed("wetherspoon", "J D Wetherspoon", "pub", ["wetherspoons", "spoons"]),
    seed("greene_king", "Greene King", "pub"),
    seed("tesco", "Tesco", "supermarket"),
    seed("sainsburys", "Sainsbury's", "supermarket", ["sainsburys"]),
    seed("asda", "Asda", "supermarket"),
    seed("morrisons", "Morrisons", "supermarket"),
    seed("aldi", "Aldi", "supermarket"),
    seed("lidl", "Lidl", "supermarket"),
    seed("iceland", "Iceland", "supermarket"),
    seed("waitrose", "Waitrose", "supermarket"),
    seed("coop", "Co-op", "supermarket", ["co op", "cooperative", "co-operative"]),
    seed("gails", "GAIL's Bakery", "bakery", ["gails"]),
  ];
}

/** Case/whitespace-insensitive match of a business name against enabled chains. */
export function matchesChain(name: string, registry: ChainEntry[]): ChainEntry | null {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const c of registry) {
    if (!c.enabled) continue;
    const names = [c.name.toLowerCase(), ...c.aliases.map((a) => a.toLowerCase())];
    if (names.some((x) => n.includes(x))) return c;
  }
  return null;
}

export function addChain(reg: ChainEntry[], name: string, category: ChainEntry["category"] = "other", source: ChainEntry["source"] = "organisation"): ChainEntry[] {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!id || reg.some((c) => c.id === id)) return reg;
  return [...reg, { id, name: name.trim(), category, aliases: [], enabled: true, source }];
}
export function setChainEnabled(reg: ChainEntry[], id: string, enabled: boolean): ChainEntry[] {
  return reg.map((c) => (c.id === id ? { ...c, enabled } : c));
}

// ---- persistence ----
const KEY = "aspectlead.chain-registry";
export function loadChainRegistry(): ChainEntry[] {
  if (typeof window === "undefined") return seedChainRegistry();
  try { const raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : seedChainRegistry(); } catch { return seedChainRegistry(); }
}
export function saveChainRegistry(reg: ChainEntry[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(reg)); } catch { /* ignore */ }
}
