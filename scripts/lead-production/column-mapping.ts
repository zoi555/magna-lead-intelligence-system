// Explicit, fail-loud column mapping. Never guesses silently: a header is only mapped to a
// field if it matches the field's key or one of its declared aliases (case/space/punctuation
// -insensitive). Anything else in the file is reported as "unmapped" for the audit trail.

export interface FieldSpec {
  key: string;
  aliases: string[];
  required: boolean;
}

export interface ColumnMappingResult {
  mapping: Record<string, string | null>; // field key -> actual header text (or null if unmapped)
  missingRequired: string[];              // field keys that are required but have no matching column
  unmappedColumns: string[];              // header columns that matched no field spec
}

function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapColumns(header: string[], specs: FieldSpec[]): ColumnMappingResult {
  const canonHeader = header.map((h) => ({ raw: h, canon: canon(h) }));
  const usedHeaders = new Set<string>();
  const mapping: Record<string, string | null> = {};

  for (const spec of specs) {
    const candidates = [spec.key, ...spec.aliases].map(canon);
    const hit = canonHeader.find((h) => !usedHeaders.has(h.raw) && candidates.includes(h.canon));
    mapping[spec.key] = hit ? hit.raw : null;
    if (hit) usedHeaders.add(hit.raw);
  }

  const missingRequired = specs.filter((s) => s.required && !mapping[s.key]).map((s) => s.key);
  const unmappedColumns = header.filter((h) => !usedHeaders.has(h));

  return { mapping, missingRequired, unmappedColumns };
}

export class ColumnMappingError extends Error {
  constructor(public fileLabel: string, public missingRequired: string[], public header: string[]) {
    super(
      `${fileLabel}: could not map required column(s) [${missingRequired.join(", ")}]. ` +
      `Actual columns found: [${header.join(", ")}]. Refusing to guess — rename the column(s) or extend the alias list.`,
    );
  }
}
