"use client";

// Geography Standard v1.0 UI (objective 12). Previews how the run's territory resolves:
// result type per selection, expansion count, child postcode districts/sectors to inspect,
// honest unresolved (place/admin) reporting, and per-district exclusions before execution.
// Calls POST /api/geography/resolve (no save). Reports the chosen exclusions upward.

import React from "react";

interface SelectionView {
  original: string; type: string; status: string; method: string;
  expansionCount: number; queryUnits: string[]; children: string[]; reason: string | null;
}
interface PlaceResolution { token: string; name: string; kind: string; localAuthority: string | null; region: string | null; districts: string[] }
interface AmbiguousPlace { token: string; choices: { placeId: string; name: string; kind: string; localAuthority: string | null; region: string | null; districts: string[] }[] }
interface ResolveResult {
  ok: boolean; error?: string;
  selections: SelectionView[];
  queryUnits: string[]; expansionCount: number;
  excluded: string[];
  placeResolutions?: PlaceResolution[];
  ambiguousPlaces?: AmbiguousPlace[];
  unresolved: { value: string; status: string; reason: string | null }[];
}

const TYPE_LABEL: Record<string, string> = {
  postcode_area: "Postcode Area", postcode_district: "Postcode District",
  postcode_sector: "Postcode Sector", postcode_unit: "Postcode Unit",
  map_polygon: "Map area (centroid-based)", unresolved: "Unresolved",
};

export function GeographySelector({ input, onExclusionsChange }: { input: string; onExclusionsChange: (codes: string[]) => void }) {
  const [data, setData] = React.useState<ResolveResult | null>(null);
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resolve = React.useCallback(async () => {
    if (!input.trim()) { setData(null); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/geography/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, exclusions: [...excluded] }) });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "Could not resolve geography"); setData(null); return; }
      setData(j);
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }, [input, excluded]);

  const toggleExclude = (code: string) => {
    setExcluded((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); onExclusionsChange([...n]); return n; });
  };
  const toggleOpen = (orig: string) => setOpen((prev) => { const n = new Set(prev); n.has(orig) ? n.delete(orig) : n.add(orig); return n; });

  const finalUnits = data ? data.queryUnits.filter((u) => !excluded.has(u.toUpperCase())) : [];

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Geography</span>
        <button type="button" onClick={resolve} disabled={busy || !input.trim()} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-300">
          {busy ? "Resolving…" : "Preview geography"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}

      {data && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[11px] text-gray-500">
            Resolves to <b className="text-gray-800">{finalUnits.length}</b> postcode district{finalUnits.length === 1 ? "" : "s"} to query
            {excluded.size > 0 && <span> ({excluded.size} excluded)</span>}.
          </div>

          {data.selections.map((s) => (
            <div key={s.original} className="text-xs border border-gray-100 rounded px-2 py-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-800">{s.original}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                  {TYPE_LABEL[s.type] ?? s.type}{s.status === "available" ? ` · ${s.expansionCount}` : ` · ${s.status}`}
                </span>
              </div>
              {s.status !== "available" && s.reason && <div className="text-[10px] text-amber-700 mt-0.5">{s.reason}</div>}
              {s.children.length > 0 && (
                <div className="mt-1">
                  <button type="button" onClick={() => toggleOpen(s.original)} className="text-[10px] text-blue-600 underline">
                    {open.has(s.original) ? "Hide" : "Inspect"} {s.children.length} {s.type === "postcode_area" ? "districts" : "sectors"}
                  </button>
                  {open.has(s.original) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.children.map((c) => (
                        <label key={c} className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer ${excluded.has(c.toUpperCase()) ? "bg-gray-100 text-gray-400 line-through border-gray-200" : "bg-white border-gray-300 text-gray-700"}`}>
                          <input type="checkbox" className="hidden" checked={!excluded.has(c.toUpperCase())} onChange={() => toggleExclude(c.toUpperCase())} />{c}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {data.placeResolutions && data.placeResolutions.length > 0 && (
            <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              Places (OS Open Names): {data.placeResolutions.map((p) => `${p.name} (${p.kind}) → ${p.districts.join("/") || "no district"}`).join("; ")}.
            </div>
          )}
          {data.ambiguousPlaces && data.ambiguousPlaces.length > 0 && (
            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
              {data.ambiguousPlaces.map((a) => (
                <div key={a.token} className="mb-0.5">
                  <b>{a.token}</b> is ambiguous — {a.choices.length} places (choose one): {a.choices.slice(0, 6).map((c) => `${c.name}${c.region ? ` (${c.region})` : ""}→${c.districts.join("/")}`).join("; ")}{a.choices.length > 6 ? "…" : ""}
                </div>
              ))}
            </div>
          )}
          {data.unresolved.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Not expandable (honest — no guess): {data.unresolved.map((u) => u.value).join(", ")}. Administrative geography needs ONSPD (pending data).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
