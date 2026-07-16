import { createHash } from "node:crypto";

/** Deterministic canonical JSON (sorted keys) so equal payloads hash equally. */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce((acc, k) => { acc[k] = norm(o[k]); return acc; }, {} as Record<string, unknown>);
  };
  return JSON.stringify(norm(value));
}

/** sha256 of the canonical JSON — the content hash for duplicate detection. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
