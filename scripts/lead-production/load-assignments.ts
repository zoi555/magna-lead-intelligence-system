// Loads the salesperson-territory assignment file (CSV or Excel).
// Required: salesperson, role (telesales | field_sales), territory, required_lead_count.
// Optional: postcode_prefixes, priority_business_types, excluded_business_types,
// import_template, notes.
//
// Fails loudly on duplicate ACTIVE ownership of the same territory: more than one row for the
// same (territory, role) pair is ambiguous — which salesperson actually owns it? — and is
// rejected outright. Different roles (telesales + field_sales) MAY both own the same territory,
// since they serve different channels; that is not a duplicate.

import { loadTabularFile } from "./file-loader";
import { mapColumns, ColumnMappingError, type FieldSpec } from "./column-mapping";
import type { AssignmentRecord, SalespersonRole } from "./types";
import { SALESPERSON_ROLES } from "./types";

export const ASSIGNMENT_FIELD_SPECS: FieldSpec[] = [
  { key: "salesperson", aliases: ["sales rep", "sales_rep", "rep", "account manager", "salesperson name"], required: true },
  { key: "role", aliases: ["sales role", "channel"], required: true },
  { key: "territory", aliases: ["region", "area", "patch"], required: true },
  { key: "requiredLeadCount", aliases: ["required_lead_count", "lead target", "required leads", "target"], required: true },
  { key: "postcodePrefixes", aliases: ["postcode_prefixes", "outcodes", "postcode areas", "postcode districts"], required: false },
  { key: "priorityBusinessTypes", aliases: ["priority_business_types", "priority types"], required: false },
  { key: "excludedBusinessTypes", aliases: ["excluded_business_types", "excluded types"], required: false },
  { key: "importTemplate", aliases: ["import_template", "template"], required: false },
  { key: "notes", aliases: ["note", "comments"], required: false },
];

export class DuplicateTerritoryOwnershipError extends Error {
  constructor(public territory: string, public role: string, public salespeople: string[]) {
    super(`Duplicate active ownership of territory "${territory}" (role: ${role}): claimed by ${salespeople.length} salespeople [${salespeople.join(", ")}]. Each (territory, role) pair must have exactly one owner — different roles (telesales/field_sales) may share a territory, but the same role may not.`);
  }
}

export interface LoadedAssignments {
  assignments: AssignmentRecord[];
  header: string[];
  sheetName: string | null;
  rowCount: number;
  columnMapping: Record<string, string | null>;
  unmappedColumns: string[];
  sourcePath: string;
}

export async function loadAssignmentFile(filePath: string): Promise<LoadedAssignments> {
  const file = await loadTabularFile(filePath);
  const { mapping, missingRequired, unmappedColumns } = mapColumns(file.header, ASSIGNMENT_FIELD_SPECS);
  if (missingRequired.length) throw new ColumnMappingError(`Assignment file (${filePath})`, missingRequired, file.header);

  const get = (row: Record<string, string>, key: string): string | null => {
    const col = mapping[key];
    if (!col) return null;
    const v = (row[col] ?? "").trim();
    return v || null;
  };
  const getList = (row: Record<string, string>, key: string): string[] =>
    (get(row, key) ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  const assignments: AssignmentRecord[] = file.rows.map((row, i) => {
    const rowIndex = i + 2;
    const roleRaw = (get(row, "role") ?? "").toLowerCase().trim().replace(/\s+/g, "_");
    if (!SALESPERSON_ROLES.includes(roleRaw as SalespersonRole)) {
      throw new Error(`Assignment file (${filePath}) row ${rowIndex}: invalid role "${get(row, "role")}" — expected one of ${SALESPERSON_ROLES.join(", ")}.`);
    }
    const requiredLeadCountRaw = get(row, "requiredLeadCount") ?? "";
    const requiredLeadCount = Number(requiredLeadCountRaw);
    if (!requiredLeadCountRaw || !Number.isFinite(requiredLeadCount) || requiredLeadCount < 0) {
      throw new Error(`Assignment file (${filePath}) row ${rowIndex}: required_lead_count must be a non-negative number, got "${requiredLeadCountRaw}".`);
    }

    return {
      rowIndex,
      salesperson: get(row, "salesperson") ?? "",
      role: roleRaw as SalespersonRole,
      territory: get(row, "territory") ?? "",
      requiredLeadCount,
      postcodePrefixes: getList(row, "postcodePrefixes").map((s) => s.toUpperCase()),
      priorityBusinessTypes: getList(row, "priorityBusinessTypes"),
      excludedBusinessTypes: getList(row, "excludedBusinessTypes"),
      importTemplate: get(row, "importTemplate"),
      notes: get(row, "notes"),
    };
  });

  const ownership = new Map<string, AssignmentRecord[]>();
  for (const a of assignments) {
    const key = `${a.territory.toLowerCase().trim()}|${a.role}`;
    ownership.set(key, [...(ownership.get(key) ?? []), a]);
  }
  for (const [, rows] of ownership) {
    if (rows.length > 1) throw new DuplicateTerritoryOwnershipError(rows[0].territory, rows[0].role, rows.map((r) => r.salesperson));
  }

  return { assignments, header: file.header, sheetName: file.sheetName, rowCount: file.rows.length, columnMapping: mapping, unmappedColumns, sourcePath: filePath };
}
