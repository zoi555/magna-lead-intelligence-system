"use client";

// Import screen panel — controlled Uber Eats / Deliveroo CSV/JSON import. Dry-run validation
// (field mapping preview, invalid-row display, duplicate detection, geography validation)
// before an explicit confirm step. Uses the existing provider-neutral adapters via
// /api/discovery/import — no new acquisition logic, no live scraping.

import React from "react";

type Source = "uber_eats" | "deliveroo";
type Format = "csv" | "json";

interface ImportResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  confirmed?: boolean;
  persisted?: boolean;
  persistenceNote?: string;
  totalRowsSubmitted?: number;
  parsedCount?: number;
  invalidRowCount?: number;
  invalidRows?: { index: number; reason: string; raw: unknown }[];
  duplicateCount?: number;
  duplicates?: { source_outlet_id: string; count: number }[];
  geography?: {
    anchorOutcodes: string[];
    valid: number; outOfScope: number; unverifiable: number; status: string;
    outOfScopeSample: { name: string; reason: string }[];
  };
  fieldMappingPreview?: Record<string, unknown>[];
  evidenceReference?: string;
}

const TEMPLATES: Record<Source, string> = {
  uber_eats: "/templates/uber-eats-import-template.csv",
  deliveroo: "/templates/deliveroo-import-template.csv",
};

export function ImportPanel() {
  const [source, setSource] = React.useState<Source>("uber_eats");
  const [format, setFormat] = React.useState<Format>("csv");
  const [content, setContent] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setContent(text);
    setResult(null);
    setError(null);
  }

  async function runImport(confirm: boolean) {
    if (!content.trim()) { setError("Upload a CSV or JSON file first."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/discovery/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, format, content, confirm }),
      });
      const j = (await res.json()) as ImportResult;
      if (!j.ok) throw new Error(j.error || "Import failed");
      setResult(j);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">1. Source &amp; file</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[13px]">
            <span className="mb-1 block text-muted">Source</span>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value as Source); setResult(null); }}
              className="w-full rounded-btn border border-bordergrey px-3 py-1.5 text-[13px] outline-none focus:border-actionblue"
            >
              <option value="uber_eats">Uber Eats</option>
              <option value="deliveroo">Deliveroo</option>
            </select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block text-muted">Format</span>
            <select
              value={format}
              onChange={(e) => { setFormat(e.target.value as Format); setResult(null); }}
              className="w-full rounded-btn border border-bordergrey px-3 py-1.5 text-[13px] outline-none focus:border-actionblue"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input type="file" accept={format === "csv" ? ".csv,text/csv" : ".json,application/json"} onChange={onFileChange}
            className="text-[13px]" aria-label="Upload import file" />
          {fileName && <span className="text-[12px] text-muted">{fileName} ({content.length.toLocaleString()} bytes)</span>}
        </div>

        {format === "csv" && (
          <a href={TEMPLATES[source]} download className="mt-3 inline-block text-[12.5px] text-actionblue hover:text-actionhover">
            ↓ Download {source === "uber_eats" ? "Uber Eats" : "Deliveroo"} CSV template
          </a>
        )}

        {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12.5px] text-red-700">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button disabled={busy || !content.trim()} onClick={() => runImport(false)}
            className={`rounded-btn px-3 py-1.5 text-[13px] font-medium ${busy || !content.trim() ? "bg-gray-200 text-gray-400" : "bg-actionblue text-white hover:bg-actionhover"}`}>
            {busy ? "Validating…" : "Dry-run validate"}
          </button>
          {result?.dryRun && (
            <button disabled={busy} onClick={() => runImport(true)}
              className="rounded-btn border border-bordergrey bg-card px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-[#fafbfc]">
              Confirm import
            </button>
          )}
        </div>
      </div>

      {result && (
        <div aria-live="polite" className="space-y-4">
          {result.confirmed && (
            <div className="rounded-card border px-4 py-3 text-[13px]" style={{ background: "#E7F5EC", borderColor: "#bfe6cd", color: "#137a3b" }}>
              <b>Import confirmed.</b> {result.persistenceNote}
            </div>
          )}

          <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Import summary</h2>
            <div className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
              <Stat label="Rows submitted" value={result.totalRowsSubmitted} />
              <Stat label="Parsed" value={result.parsedCount} accent="#137a3b" />
              <Stat label="Invalid rows" value={result.invalidRowCount} accent={result.invalidRowCount ? "#b91c1c" : undefined} />
              <Stat label="Duplicates" value={result.duplicateCount} accent={result.duplicateCount ? "#b45309" : undefined} />
            </div>
            {result.evidenceReference && <p className="mt-2 font-mono text-[11px] text-muted">Evidence reference: {result.evidenceReference}</p>}
          </div>

          {!!result.invalidRowCount && (
            <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
              <h2 className="mb-2 text-[15px] font-semibold text-ink">Invalid rows <span className="font-normal text-muted">(skipped — never fabricated)</span></h2>
              <ul className="space-y-1 text-[12.5px]">
                {result.invalidRows?.map((r) => (
                  <li key={r.index} className="border-b border-bordergrey py-1 last:border-0">
                    <span className="text-muted">Row {r.index}:</span> {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!result.duplicateCount && (
            <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
              <h2 className="mb-2 text-[15px] font-semibold text-ink">Duplicate source IDs</h2>
              <ul className="space-y-1 text-[12.5px] font-mono">
                {result.duplicates?.map((d) => <li key={d.source_outlet_id}>{d.source_outlet_id} × {d.count}</li>)}
              </ul>
            </div>
          )}

          {result.geography && (
            <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
              <h2 className="mb-2 text-[15px] font-semibold text-ink">Geography validation <span className="font-normal text-muted">(anchor: {result.geography.anchorOutcodes.join(", ")})</span></h2>
              <div className="grid grid-cols-3 gap-2 text-[12.5px]">
                <Stat label="Valid" value={result.geography.valid} accent="#137a3b" />
                <Stat label="Out of scope" value={result.geography.outOfScope} accent={result.geography.outOfScope ? "#b91c1c" : undefined} />
                <Stat label="Unverifiable" value={result.geography.unverifiable} accent={result.geography.unverifiable ? "#b45309" : undefined} />
              </div>
              {result.geography.outOfScopeSample.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12px] text-muted">
                  {result.geography.outOfScopeSample.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}
                </ul>
              )}
            </div>
          )}

          {!!result.fieldMappingPreview?.length && (
            <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
              <h2 className="mb-2 text-[15px] font-semibold text-ink">Field mapping preview <span className="font-normal text-muted">(first {result.fieldMappingPreview.length})</span></h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted">
                      {Object.keys(result.fieldMappingPreview[0]).map((k) => <th key={k} className="py-1 pr-3">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.fieldMappingPreview.map((row, i) => (
                      <tr key={i} className="border-t border-bordergrey">
                        {Object.values(row).map((v, j) => <td key={j} className="py-1 pr-3">{v == null ? <span className="text-muted">—</span> : Array.isArray(v) ? v.join(", ") : String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value?: number; accent?: string }) {
  return (
    <div className="rounded border border-bordergrey px-2 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-mono text-[15px] font-semibold" style={{ color: accent ?? "#111827" }}>{value ?? 0}</div>
    </div>
  );
}
