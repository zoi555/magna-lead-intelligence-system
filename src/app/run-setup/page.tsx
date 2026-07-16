"use client";

import React from "react";
import { PageHeader } from "@/components/PageHeader";

// Create Lead Run — Step 1: Territory Setup. Client screen; draft saved to
// localStorage. Postcode-level auto-detection is done inline (UK postcode grammar).

const STEPS = ["Territory", "Discovery Sources", "Validation", "Enrichment", "Exclusions", "Review Rules", "Export Mapping", "Run Summary"];
const DRAFT_KEY = "li_run_setup_territory_v1";

type Level = "area" | "district" | "sector" | "unit" | "invalid" | "empty";
const LEVEL_LABEL: Record<Level, string> = {
  area: "Postcode area", district: "Postcode District", sector: "Postcode sector",
  unit: "Full postcode / postcode unit", invalid: "Invalid / needs review", empty: "—",
};
const areaOf = (outcode: string) => (outcode.match(/^[A-Z]{1,2}/)?.[0] ?? outcode);

interface Detected { raw: string; level: Level; value: string; area?: string; district?: string; sector?: string; unit?: string }

function classify(raw: string): Detected {
  const t = (raw || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!t) return { raw, level: "empty", value: "" };
  const full = t.replace(/\s+/g, "");
  const mUnit = full.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (mUnit) return { raw, level: "unit", value: `${mUnit[1]} ${mUnit[2]}`, area: areaOf(mUnit[1]), district: mUnit[1], sector: `${mUnit[1]} ${mUnit[2][0]}`, unit: `${mUnit[1]} ${mUnit[2]}` };
  const mSec = t.match(/^([A-Z]{1,2}\d[A-Z\d]?)\s(\d)$/);
  if (mSec) return { raw, level: "sector", value: `${mSec[1]} ${mSec[2]}`, area: areaOf(mSec[1]), district: mSec[1], sector: `${mSec[1]} ${mSec[2]}` };
  const mDist = full.match(/^([A-Z]{1,2}\d[A-Z\d]?)$/);
  if (mDist) return { raw, level: "district", value: mDist[1], area: areaOf(mDist[1]), district: mDist[1] };
  const mArea = full.match(/^([A-Z]{1,2})$/);
  if (mArea) return { raw, level: "area", value: mArea[1], area: mArea[1] };
  return { raw, level: "invalid", value: t };
}
function splitTokens(input: string): string[] { return input.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean); }

const SURROUNDING = [
  { id: "none", label: "Do not show surrounding areas" },
  { id: "context", label: "Show surrounding areas as context only" },
  { id: "include", label: "Include surrounding areas in scan" },
];
const LOCATION_RULE = [
  { id: "require", label: "Require physical postcode match" },
  { id: "medium_review", label: "Allow medium-confidence location for manual review only" },
  { id: "exclude_unproven", label: "Exclude unproven location" },
];
const MODES = [
  { id: "auto", label: "Auto-detect" }, { id: "area", label: "Postcode area" }, { id: "district", label: "Postcode District" },
  { id: "sector", label: "Sector" }, { id: "unit", label: "Full postcode" }, { id: "upload", label: "Upload CSV" },
];

export default function RunSetupPage() {
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState("auto");
  const [surrounding, setSurrounding] = React.useState("context");
  const [locationRule, setLocationRule] = React.useState("require");
  const [csvName, setCsvName] = React.useState("");
  const [saved, setSaved] = React.useState<string | null>(null);
  const [showStep2, setShowStep2] = React.useState(false);

  React.useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (d) { setInput(d.input ?? ""); setMode(d.mode ?? "auto"); setSurrounding(d.surrounding ?? "context"); setLocationRule(d.locationRule ?? "require"); } } catch { /* ignore */ }
  }, []);

  const tokens = splitTokens(input);
  const detected = tokens.map(classify);
  const single = detected.length === 1 ? detected[0] : null;
  const multiple = detected.length > 1;

  function expansionPreview(d: Detected): string {
    if (d.level === "area") return `${d.area} postcode area will expand to all ${d.area} districts${d.area === "TW" ? " (TW1–TW20)" : ""}.`;
    if (d.level === "district") return `${d.value} Postcode District selected.`;
    if (d.level === "sector") return `${d.value} postcode sector selected.`;
    if (d.level === "unit") return "Full postcode selected.";
    return "Invalid entry — please check the postcode format.";
  }

  function saveDraft() {
    const draft = { input, mode, surrounding, locationRule, detected, savedAt: new Date().toISOString() };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); setSaved("Territory step saved as a local draft."); } catch { setSaved("Could not save draft (localStorage unavailable)."); }
  }

  const valid = detected.length > 0 && detected.every((d) => d.level !== "invalid" && d.level !== "empty");

  return (
    <div className="space-y-4">
      <PageHeader title="Create Lead Run" subtitle="Step 1 of 8 — Territory Setup. Define which postcodes this run will target." />

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* step rail */}
        <ol className="rounded-card border border-bordergrey bg-card p-2 shadow-soft">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] ${i === 0 ? "bg-[#26506e] text-white" : "text-muted"}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i === 0 ? "bg-white text-[#26506e]" : "border border-bordergrey"}`}>{i + 1}</span>
              <span className={i === 0 ? "font-semibold" : ""}>{s}</span>
            </li>
          ))}
        </ol>

        {/* step 1 content */}
        <div className="space-y-4">
          <Card title="Territory Setup">
            <label className="mb-1 block text-[13px] font-semibold text-ink">Enter postcode area, district, sector, full postcode, or multiple values</label>
            <textarea value={input} onChange={(e) => { setInput(e.target.value); setSaved(null); }} rows={2} placeholder="TW  or  TW3  or  TW3 1  or  TW3 1AB   (comma or new line for multiple)"
              className="w-full rounded-btn border border-bordergrey px-3 py-2 text-[14px] outline-none focus:border-actionblue" />

            <div className="mt-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Territory mode</div>
              <div className="flex flex-wrap gap-1.5">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => setMode(m.id)} className={`rounded-btn border px-3 py-1.5 text-[13px] ${mode === m.id ? "border-[#26506e] bg-[#26506e] text-white" : "border-bordergrey bg-card text-muted hover:text-ink"}`}>{m.label}</button>
                ))}
              </div>
            </div>

            {/* auto-detect result */}
            {input.trim() !== "" && mode !== "upload" && (
              <div className="mt-3 rounded-md border border-bordergrey bg-[#f7f9fb] p-3">
                {single && (
                  <div className="flex items-center gap-2 text-[13.5px]">
                    <span className="text-muted">Detected:</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${single.level === "invalid" ? "bg-[#f7e3e3] text-[#8a3030]" : "bg-[#e6f2ea] text-[#2f7d4f]"}`}>{LEVEL_LABEL[single.level]}</span>
                    <span className="font-mono text-ink">{single.value || single.raw}</span>
                  </div>
                )}
                {multiple && (
                  <div>
                    <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Multiple territories detected ({detected.length})</div>
                    <table className="w-full text-[13px]">
                      <thead><tr className="text-left text-muted"><th className="py-1">Input</th><th>Detected type</th><th>Value</th><th>Area</th></tr></thead>
                      <tbody>
                        {detected.map((d, i) => (
                          <tr key={i} className="border-t border-bordergrey">
                            <td className="py-1 font-mono">{d.raw}</td>
                            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.level === "invalid" ? "bg-[#f7e3e3] text-[#8a3030]" : "bg-[#e6f2ea] text-[#2f7d4f]"}`}>{LEVEL_LABEL[d.level]}</span></td>
                            <td className="font-mono">{d.value}</td>
                            <td className="font-mono text-muted">{d.area ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* expansion preview */}
            {single && single.level !== "invalid" && single.level !== "empty" && (
              <div className="mt-3 rounded-md border border-[#cbd8e6] bg-[#eef4fb] p-3 text-[13.5px] text-[#264a6e]">
                <b>Territory expansion:</b> {expansionPreview(single)}
              </div>
            )}
          </Card>

          {/* upload CSV */}
          <Card title="Upload territory CSV (optional)">
            <p className="mb-2 text-[13px] text-muted">Upload a postcode list for larger or saved territories. Expected columns:</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["postcode", "outcode", "postcode_district", "postcode_sector", "route", "sales_rep", "notes"].map((c) => (
                <code key={c} className="rounded border border-bordergrey bg-[#f5f7fa] px-1.5 py-0.5 text-[12px]">{c}</code>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-btn border border-dashed border-bordergrey bg-[#fafbfc] px-3 py-2 text-[13px] text-muted hover:border-actionblue">
              <input type="file" accept=".csv" className="hidden" onChange={(e) => setCsvName(e.target.files?.[0]?.name ?? "")} />
              Choose CSV file…
            </label>
            {csvName && <span className="ml-2 text-[13px] text-ink">{csvName} <span className="text-muted">(will be processed when the run is created)</span></span>}
          </Card>

          {/* surrounding areas */}
          <Card title="Surrounding areas">
            <RadioGroup name="surrounding" options={SURROUNDING} value={surrounding} onChange={setSurrounding} />
            <p className="mt-1 text-[12px] text-muted">Default: show surrounding areas as context only.</p>
          </Card>

          {/* physical location rule */}
          <Card title="Physical location rule (required)">
            <div className="mb-2 rounded-md border border-[#e8d29a] bg-[#fbf1d9] p-2.5 text-[13px] text-[#7a5a10]">
              Platform results may include businesses that <b>deliver into</b> the area but are <b>not physically located</b> there. Before export, every lead must pass location proof.
            </div>
            <RadioGroup name="location" options={LOCATION_RULE} value={locationRule} onChange={setLocationRule} />
            <p className="mt-1 text-[12px] text-muted">Default: require physical postcode match.</p>
          </Card>

          {/* actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={saveDraft} className="rounded-btn border border-bordergrey bg-card px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-[#f0f3f7]">Save Territory Step</button>
            <button onClick={() => { saveDraft(); setShowStep2(true); }} disabled={!valid && mode !== "upload"} title={!valid && mode !== "upload" ? "Enter a valid postcode territory first" : ""}
              className={`rounded-btn px-3.5 py-2 text-[13px] font-semibold ${valid || mode === "upload" ? "bg-[#26506e] text-white hover:bg-[#1f405a]" : "cursor-not-allowed bg-[#e5e9ee] text-[#9aa4ad]"}`}>
              Continue to Discovery Sources →
            </button>
            {saved && <span className="text-[13px] text-[#2f7d4f]">{saved}</span>}
          </div>

          {showStep2 && (
            <Card title="Step 2 — Discovery Sources">
              <p className="text-[13.5px] text-muted">Territory saved. Discovery Sources (Just Eat, FSA validation, Google Places, Companies House) will be configured in the next step. This step is coming next.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}
function RadioGroup({ name, options, value, onChange }: { name: string; options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => (
        <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13.5px] ${value === o.id ? "border-[#26506e] bg-[#eef4fb] text-ink" : "border-bordergrey text-muted hover:text-ink"}`}>
          <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
