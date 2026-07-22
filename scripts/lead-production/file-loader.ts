// Loads a CSV or Excel (.xlsx/.xls) file into a uniform {header, rows} shape. Excel dates/
// numbers are read as DISPLAY TEXT (raw: false) so downstream normalisation sees the same
// string shapes it would from a CSV export — never silently coerced to JS numbers/Dates.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsvObjects } from "./csv";

export interface TabularFile {
  header: string[];
  rows: Record<string, string>[];
  sourcePath: string;
  sheetName: string | null; // null for CSV
}

export async function loadTabularFile(filePath: string): Promise<TabularFile> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const text = await fs.readFile(filePath, "utf8");
    const { header, rows } = parseCsvObjects(text);
    return { header, rows, sourcePath: filePath, sheetName: null };
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const buf = await fs.readFile(filePath);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
    if (!aoa.length) return { header: [], rows: [], sourcePath: filePath, sheetName };
    const header = aoa[0].map((h) => String(h ?? "").trim());
    const rows = aoa.slice(1)
      .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
      .map((r) => {
        const o: Record<string, string> = {};
        header.forEach((h, i) => { o[h] = String(r[i] ?? "").trim(); });
        return o;
      });
    return { header, rows, sourcePath: filePath, sheetName };
  }
  throw new Error(`Unsupported file type "${ext}" for ${filePath} — expected .csv, .xlsx, or .xls`);
}
