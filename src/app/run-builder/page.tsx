"use client";

// Discovery Run Builder — first screen (AspectLead).
// Run identity · pipeline navigator · territory · national map · target profile
// (business/cuisine/service/ownership taxonomies) · exclusions · configurable chain
// registry · include/exclude terms · requested data fields · custom fields · result
// tags · live configuration summary · validation · draft recovery · DB-ready draft.
// Does NOT proceed to Discovery Sources.

import React from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  CUISINES, SERVICE_MODELS, OWNERSHIP_TYPES, DEFAULT_EXCLUSIONS,
  REQUESTED_DATA_FIELDS, RESULT_TAGS, TaxonomyItem, BusinessTypeOption, CustomRequestedField,
  CUSTOM_FIELD_DATA_TYPES, CUSTOM_FIELD_SOURCES, CUSTOM_FIELD_VISIBILITY, CUSTOM_FIELD_EXPORT,
} from "@/lib/discovery/target-profile";
import {
  allBusinessTypeOptions, searchBusinessTypes, addCustomBusinessType, removeCustomBusinessType,
  addCustomRequestedField, removeCustomRequestedField, emptyCustomFieldDraft, slugifyKey,
  validateInternalKey, CustomFieldDraft,
} from "@/lib/discovery/custom-config";
import {
  RunDraft, newRunDraft, validateRunDraft, summariseRunDraft, saveRunDraft, loadRunDraft, clearRunDraft,
  generateDefaultRunName, resetProfileToDefaults,
} from "@/lib/discovery/run-draft";
import {
  ChainEntry, loadChainRegistry, saveChainRegistry, addChain, setChainEnabled,
} from "@/lib/discovery/chain-registry";
import type { FeederRoadEntry, MapViewState, TerritoryGeometry } from "@geospatial/map";
import { ExpandableMap } from "@/features/geospatial/ExpandableMap";
import { aspectleadSourceConfig, NATIONAL_INITIAL_VIEW } from "@/features/geospatial/aspectlead-map-config";
import { runTerritoryGeometry } from "@/features/geospatial/aspectlead-territory";

const PIPELINE = ["Run Builder", "Discovery Sources", "Validation", "Enrichment", "Exclusions", "Review Rules", "Export Mapping", "Run Summary"];

export default function RunBuilderPage() {
  const [draft, setDraft] = React.useState<RunDraft | null>(null);
  const [chains, setChains] = React.useState<ChainEntry[]>([]);
  const [recovered, setRecovered] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [includeInput, setIncludeInput] = React.useState("");
  const [excludeInput, setExcludeInput] = React.useState("");
  const [newChain, setNewChain] = React.useState("");
  const [mapFeeders, setMapFeeders] = React.useState<FeederRoadEntry[]>([]);
  const [mapView, setMapView] = React.useState<MapViewState | null>(null);
  const [territoryGeom, setTerritoryGeom] = React.useState<TerritoryGeometry[]>([]);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [alertMsg, setAlertMsg] = React.useState<string | null>(null);  // role=alert (assertive, blocking)
  const [bizSearch, setBizSearch] = React.useState("");
  const [customBizLabel, setCustomBizLabel] = React.useState("");

  const announce = (msg: string) => { setAlertMsg(null); setSaved(msg); };       // aria-live polite
  const alert = (msg: string) => { setSaved(null); setAlertMsg(msg); };          // role=alert

  const freshDraft = () => newRunDraft(String(Math.floor(performance.now())), new Date().toISOString(), generateDefaultRunName(new Date()));

  // mount: recover draft or start new; load chain registry
  React.useEffect(() => {
    const existing = loadRunDraft();
    if (existing) { setDraft(existing); setRecovered(true); announce("Saved draft restored."); }
    else setDraft(freshDraft());
    setChains(loadChainRegistry());
  }, []);

  // autosave (also stamps the last-saved time)
  React.useEffect(() => { if (draft) { saveRunDraft(draft); setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })); } }, [draft]);

  // Territory outline overlay: recompute from the run's outcodes only (NOT from browsing).
  const territoryInput = draft?.territory.input ?? "";
  React.useEffect(() => {
    let live = true;
    runTerritoryGeometry(territoryInput).then((g) => { if (live) setTerritoryGeom(g); });
    return () => { live = false; };
  }, [territoryInput]);

  if (!draft) return <div className="p-8 text-sm text-gray-500">Loading run builder…</div>;

  const p = draft.profile;
  const update = (fn: (d: RunDraft) => void) => setDraft((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const validation = validateRunDraft(draft);

  const addToken = (which: "includeTerms" | "excludeTerms", raw: string) => {
    const t = raw.trim(); if (!t) return;
    update((d) => { if (!d.profile[which].includes(t)) d.profile[which] = [...d.profile[which], t]; });
  };

  return (
    <div>
      <PageHeader title="Discovery Run Builder" subtitle="Configure a lead discovery run. Independent Foodservice profile by default." />

      {/* pipeline navigator — sticky so the current step stays visible while scrolling */}
      <nav className="sticky top-0 z-20 flex flex-wrap gap-1.5 px-6 py-2.5 bg-white/95 backdrop-blur border-b border-gray-100" aria-label="Run pipeline">
        {PIPELINE.map((s, i) => (
          <span key={s} className={`text-xs px-2.5 py-1 rounded-full border ${i === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}>{i + 1}. {s}</span>
        ))}
      </nav>

      {recovered && (
        <div className="mx-6 mt-3 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>Restored your previous run draft from this browser.</span>
          <button className="underline" onClick={() => { clearRunDraft(); setDraft(freshDraft()); setRecovered(false); }}>Start a new run</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 p-6">
        <div className="space-y-4">
          {/* run identity */}
          <Card title="Run identity">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Run name *"><input className={inp} value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value; })} placeholder="e.g. TW independents — Q3" /></Field>
              <Field label="Reference"><input className={inp} value={draft.reference} onChange={(e) => update((d) => { d.reference = e.target.value; })} placeholder="e.g. RUN-TW-001" /></Field>
              <Field label="Objective" wide><textarea className={inp} rows={2} value={draft.objective} onChange={(e) => update((d) => { d.objective = e.target.value; })} placeholder="What is this run for?" /></Field>
            </div>
          </Card>

          {/* territory */}
          <Card title="Territory">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Territory mode">
                <select className={inp} value={draft.territory.mode} onChange={(e) => update((d) => { d.territory.mode = e.target.value as any; })}>
                  {["pilot", "manual_outcodes", "vp_coverage", "full_uk", "custom"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Location rule">
                <select className={inp} value={draft.territory.locationRule} onChange={(e) => update((d) => { d.territory.locationRule = e.target.value as any; })}>
                  <option value="require">Require physical location in territory</option>
                  <option value="prefer">Prefer, allow deliver-into</option>
                  <option value="off">Off</option>
                </select>
              </Field>
              <Field label="Postcodes / outcodes" wide><textarea className={inp} rows={2} value={draft.territory.input} onChange={(e) => update((d) => { d.territory.input = e.target.value; })} placeholder="TW   or   TW3, TW4   (comma or new line)" /></Field>
            </div>
            <p className="text-xs text-gray-500 mt-2">The run territory is an operational overlay. It never restricts national map browsing.</p>
          </Card>

          {/* national map — shared portable component (no iframe) */}
          <Card title="National map & feeder roads">
            <p className="text-xs text-gray-500 mb-2">Shared Great Britain map (OS OpenData) via the portable geospatial component. Browse anywhere; configure feeder roads and layers here. <b>Map browsing does not change the run territory</b> — the territory is set only in the Territory section above. The saved territory shows as an orange outline; use Expand for a full-screen view.</p>
            <ExpandableMap
              sources={aspectleadSourceConfig()}
              initialView={NATIONAL_INITIAL_VIEW}
              feederRoads={mapFeeders}
              onFeederRoadsChange={setMapFeeders}
              onViewChange={setMapView}
              selectedTerritories={territoryGeom}
              controls={{ layerDrawer: true, search: true, featureInspector: true, roads: true, feederRoads: true, placesAndLabels: true, postcodes: true, transport: true, environment: true, nationalView: true }}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {territoryGeom.length > 0
                ? `Territory outline: ${territoryGeom.length} district${territoryGeom.length === 1 ? "" : "s"} (${draft.territory.input}).`
                : draft.territory.input
                  ? `No district polygons matched “${draft.territory.input}”. Outlines are drawn from the Code-Point district feasibility layer.`
                  : "Enter outcodes in the Territory section to outline the run territory."}
              {mapView && ` Viewing ${mapView.latitude.toFixed(2)}, ${mapView.longitude.toFixed(2)} @ z${mapView.zoom.toFixed(1)} — territory unchanged.`}
            </p>
            <a href="/national-map" target="_blank" className="text-xs text-blue-600 underline mt-1 inline-block">Open the full National Map Workbench ↗</a>
          </Card>

          {/* target profile — searchable business types + custom types */}
          <Card title="Target profile — business types">
            <BusinessTypePanel
              options={allBusinessTypeOptions(p)}
              selected={p.businessTypes}
              search={bizSearch}
              setSearch={setBizSearch}
              onToggle={(key) => update((d) => { d.profile.businessTypes = toggle(d.profile.businessTypes, key); })}
              customLabel={customBizLabel}
              setCustomLabel={setCustomBizLabel}
              onAddCustom={() => {
                const res = addCustomBusinessType(p, customBizLabel);
                if (res.error) { alert(res.error); return; }
                update((d) => { d.profile = res.profile; });
                setCustomBizLabel(""); announce("Custom business type added.");
              }}
              onRemoveCustom={(key) => { update((d) => { d.profile = removeCustomBusinessType(d.profile, key); }); announce("Custom business type removed."); }}
            />
          </Card>
          <Card title="Cuisines"><Muted>Empty = all cuisines.</Muted><ChipMulti items={CUISINES} selected={p.cuisines} onToggle={(id) => update((d) => { d.profile.cuisines = toggle(d.profile.cuisines, id); })} /></Card>
          <Card title="Service models"><ChipMulti items={SERVICE_MODELS} selected={p.serviceModels} onToggle={(id) => update((d) => { d.profile.serviceModels = toggle(d.profile.serviceModels, id); })} /></Card>
          <Card title="Ownership classification"><ChipMulti items={OWNERSHIP_TYPES} selected={p.ownership} onToggle={(id) => update((d) => { d.profile.ownership = toggle(d.profile.ownership, id); })} /></Card>

          {/* exclusions */}
          <Card title="Default unsuitable-business exclusions">
            {DEFAULT_EXCLUSIONS.map((e) => (
              <label key={e.id} className="flex items-start gap-2 py-1 text-sm">
                <input type="checkbox" className="mt-0.5" checked={p.exclusions.includes(e.id)} onChange={() => update((d) => { d.profile.exclusions = toggle(d.profile.exclusions, e.id); })} />
                <span>{e.label}{e.note && <span className="text-gray-400"> — {e.note}</span>}</span>
              </label>
            ))}
          </Card>

          {/* chain registry */}
          <Card title="Large-chain registry (configurable)">
            <Muted>Editable data — not hardcoded. Disabled entries are not excluded as chains.</Muted>
            <div className="flex gap-2 my-2">
              <input className={inp} value={newChain} onChange={(e) => setNewChain(e.target.value)} placeholder="Add a chain / brand name" />
              <button className={btn} onClick={() => { const r = addChain(chains, newChain); setChains(r); saveChainRegistry(r); setNewChain(""); }}>Add</button>
            </div>
            <div className="max-h-44 overflow-y-auto grid sm:grid-cols-2 gap-x-4">
              {chains.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={c.enabled} onChange={() => { const r = setChainEnabled(chains, c.id, !c.enabled); setChains(r); saveChainRegistry(r); }} />
                  <span className={c.enabled ? "" : "text-gray-400 line-through"}>{c.name}</span>
                  <span className="text-[10px] text-gray-400">{c.category}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* terms */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Custom include terms">
              <TokenInput value={includeInput} setValue={setIncludeInput} onAdd={() => { addToken("includeTerms", includeInput); setIncludeInput(""); }} tokens={p.includeTerms} onRemove={(t) => update((d) => { d.profile.includeTerms = d.profile.includeTerms.filter((x) => x !== t); })} placeholder="e.g. trattoria" />
            </Card>
            <Card title="Custom exclude terms">
              <TokenInput value={excludeInput} setValue={setExcludeInput} onAdd={() => { addToken("excludeTerms", excludeInput); setExcludeInput(""); }} tokens={p.excludeTerms} onRemove={(t) => update((d) => { d.profile.excludeTerms = d.profile.excludeTerms.filter((x) => x !== t); })} placeholder="e.g. hotel" />
            </Card>
          </div>

          {/* standard requested fields + advanced custom fields */}
          <Card title="Requested data fields">
            <div className="grid sm:grid-cols-2 gap-x-4">
              {REQUESTED_DATA_FIELDS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={p.dataFields.includes(f.id)} onChange={() => update((d) => { d.profile.dataFields = toggle(d.profile.dataFields, f.id); })} />
                  <span>{f.label}{f.sensitive && <span className="text-amber-600 text-[10px] ml-1" title="Sensitive — handle per data policy">sensitive</span>}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Requesting a field does not guarantee a source can supply it.</p>
            <div className="mt-3 border-t pt-3">
              <CustomFieldEditor
                fields={p.customFields}
                existingKeys={p.customFields.map((f) => f.internalKey)}
                onAdd={(fieldDraft) => {
                  const res = addCustomRequestedField(p, fieldDraft);
                  if (!res.validation.ok) { alert(res.validation.summary || "Fix the highlighted fields."); return res.validation; }
                  update((d) => { d.profile = res.profile; }); announce("Custom requested field added."); return res.validation;
                }}
                onRemove={(id) => { update((d) => { d.profile = removeCustomRequestedField(d.profile, id); }); announce("Custom requested field removed."); }}
              />
            </div>
          </Card>

          {/* result tags */}
          <Card title="Result tags"><ChipMulti items={RESULT_TAGS} selected={p.tags} onToggle={(id) => update((d) => { d.profile.tags = toggle(d.profile.tags, id); })} /></Card>
        </div>

        {/* right rail: live summary + validation */}
        <aside className="space-y-4 xl:sticky xl:top-16 self-start">
          <Card title="Live configuration">
            <dl className="text-xs space-y-1">
              {summariseRunDraft(draft).map((s) => (
                <div key={s.label} className="flex justify-between gap-2"><dt className="text-gray-500">{s.label}</dt><dd className="text-gray-900 text-right">{s.value}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Validation">
            <div role={validation.ok ? undefined : "alert"} aria-live={validation.ok ? "polite" : "assertive"}>
              {validation.errors.map((e) => <div key={e} className="text-xs text-red-600 flex gap-1"><span aria-hidden>●</span>{e}</div>)}
              {validation.warnings.map((w) => <div key={w} className="text-xs text-amber-600 flex gap-1"><span aria-hidden>▲</span>{w}</div>)}
              {validation.ok && !validation.warnings.length && <div className="text-xs text-green-600">Ready to configure discovery sources.</div>}
            </div>
            <button disabled={!validation.ok} className={`mt-3 w-full ${validation.ok ? btn : btnDisabled}`} onClick={() => { saveRunDraft(draft); announce("Draft saved. Discovery Sources (the next step) is not built in this screen."); }}>Save run draft</button>
            {/* accessible status region: polite success + assertive blocking errors */}
            <p aria-live="polite" className={`text-xs mt-2 ${saved ? "text-green-700" : "text-gray-400"}`}>{saved || " "}</p>
            {alertMsg && <p role="alert" className="text-xs mt-1 text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{alertMsg}</p>}
          </Card>
          <Card title="Draft">
            <Muted>Auto-saved to this browser{savedAt ? ` · last saved ${savedAt}` : ""}. Recovery only — the canonical draft (schemaVersion {draft.schemaVersion}) is database-ready.</Muted>
            <button className={`${btnGhost} mt-2 w-full`} onClick={() => { setDraft((d) => (d ? resetProfileToDefaults(d) : d)); setBizSearch(""); announce("Recommended defaults restored. Custom types and fields were reset."); }}>Restore recommended defaults</button>
            <button className={`${btnGhost} mt-2 w-full`} onClick={() => { clearRunDraft(); setDraft(freshDraft()); setRecovered(false); setBizSearch(""); announce("Draft cleared — started a new run."); }}>Clear draft &amp; start new</button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---- small UI helpers ----
const inp = "w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm";
const btn = "px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700";
const btnDisabled = "px-3 py-1.5 rounded-md bg-gray-200 text-gray-400 text-sm cursor-not-allowed";
const btnGhost = "px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="bg-white border border-gray-200 rounded-xl p-4"><h2 className="text-sm font-semibold text-gray-800 mb-2">{title}</h2>{children}</section>;
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>;
}
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-gray-500 mb-1">{children}</p>;

function ChipMulti({ items, selected, onToggle, grouped }: { items: TaxonomyItem[]; selected: string[]; onToggle: (id: string) => void; grouped?: boolean }) {
  const groups = grouped ? [...new Set(items.map((i) => i.group || "Other"))] : [null];
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g ?? "all"}>
          {g && <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{g}</div>}
          <div className="flex flex-wrap gap-1.5">
            {items.filter((i) => !grouped || (i.group || "Other") === g).map((i) => {
              const on = selected.includes(i.id);
              return <button key={i.id} onClick={() => onToggle(i.id)} className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>{i.label}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
function TokenInput({ value, setValue, onAdd, tokens, onRemove, placeholder }: { value: string; setValue: (v: string) => void; onAdd: () => void; tokens: string[]; onRemove: (t: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="flex gap-2"><input className={inp} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} /><button className={btn} onClick={onAdd}>Add</button></div>
      <div className="flex flex-wrap gap-1.5 mt-2">{tokens.map((t) => <Tag key={t} onRemove={() => onRemove(t)}>{t}</Tag>)}</div>
    </div>
  );
}
function Tag({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return <span className="inline-flex items-center gap-1 text-xs bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">{children}<button onClick={onRemove} className="text-gray-400 hover:text-gray-700">×</button></span>;
}

// ---- searchable business-type panel + run-specific custom types ----
function BusinessTypePanel(props: {
  options: BusinessTypeOption[]; selected: string[]; search: string; setSearch: (v: string) => void;
  onToggle: (key: string) => void; customLabel: string; setCustomLabel: (v: string) => void;
  onAddCustom: () => void; onRemoveCustom: (key: string) => void;
}) {
  const { options, selected, search, setSearch, onToggle, customLabel, setCustomLabel, onAddCustom, onRemoveCustom } = props;
  const groups = searchBusinessTypes(search, options);
  return (
    <div>
      <label htmlFor="biz-search" className="block text-xs text-gray-500 mb-1">Search business types</label>
      <div className="flex gap-2 mb-2">
        <input id="biz-search" className={inp} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search restaurants, cafés, chicken shops, bakeries..." />
        {search && <button className={btnGhost} onClick={() => setSearch("")} aria-label="Clear business-type search">Clear</button>}
      </div>
      {groups.length === 0 && <p className="text-xs text-gray-400">No matching business types. Add a custom type below.</p>}
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{g.group}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((o) => {
                const on = selected.includes(o.key);
                return (
                  <span key={o.key} className="inline-flex items-center">
                    <button aria-pressed={on} onClick={() => onToggle(o.key)} className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"} ${o.source === "custom" ? "rounded-r-none" : ""}`}>{o.label}</button>
                    {o.source === "custom" && <button onClick={() => onRemoveCustom(o.key)} aria-label={`Remove custom business type ${o.label}`} className={`text-xs px-1.5 py-1 rounded-full rounded-l-none border border-l-0 ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300"}`}>×</button>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t pt-3">
        <label htmlFor="biz-custom" className="block text-xs text-gray-500 mb-1">Add custom business type</label>
        <div className="flex gap-2">
          <input id="biz-custom" className={inp} value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustom(); } }} placeholder="e.g. Poké bar" />
          <button className={btn} onClick={onAddCustom}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ---- advanced custom requested-field editor ----
function CustomFieldEditor(props: {
  fields: CustomRequestedField[]; existingKeys: string[];
  onAdd: (draft: CustomFieldDraft) => { ok: boolean; errors: Record<string, string> };
  onRemove: (id: string) => void;
}) {
  const { fields, existingKeys, onAdd, onRemove } = props;
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CustomFieldDraft>(emptyCustomFieldDraft());
  const [keyEdited, setKeyEdited] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = (k: keyof CustomFieldDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const onLabel = (v: string) => setDraft((d) => ({ ...d, label: v, internalKey: keyEdited ? d.internalKey : slugifyKey(v) }));
  const liveKeyErr = draft.internalKey ? validateInternalKey(draft.internalKey, existingKeys) : null;

  const submit = () => {
    const res = onAdd(draft);
    if (res.ok) { setDraft(emptyCustomFieldDraft()); setKeyEdited(false); setErrors({}); setOpen(false); }
    else setErrors(res.errors);
  };
  const err = (k: string) => errors[k] && <span className="text-[11px] text-red-600">{errors[k]}</span>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Custom requested fields ({fields.length})</span>
        <button className={btnGhost} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add custom field"}</button>
      </div>

      {/* committed fields with metadata */}
      <div className="mt-2 space-y-1.5">
        {fields.map((f) => (
          <div key={f.id} className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-gray-800">{f.label} <code className="text-[10px] text-gray-400">{f.internalKey}</code></div>
              <div className="text-gray-500">{f.dataType} · {f.requirement} · source: {f.intendedSource}{f.sourceNote ? ` (${f.sourceNote})` : ""} · {f.visibility} · export: {f.exportPermission}</div>
              {f.notes && <div className="text-gray-400 italic">{f.notes}</div>}
            </div>
            <button onClick={() => onRemove(f.id)} aria-label={`Remove ${f.label}`} className="text-gray-400 hover:text-gray-700">×</button>
          </div>
        ))}
      </div>

      {open && (
        <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-xs text-gray-500">Label
              <input className={inp} value={draft.label} onChange={(e) => onLabel(e.target.value)} placeholder="e.g. Number of branches" />{err("label")}
            </label>
            <label className="text-xs text-gray-500">Internal key
              <input className={inp} value={draft.internalKey} onChange={(e) => { setKeyEdited(true); set("internalKey", e.target.value); }} placeholder="number_of_branches" />
              {liveKeyErr ? <span className="text-[11px] text-red-600">{liveKeyErr}</span> : err("internalKey")}
            </label>
            <label className="text-xs text-gray-500">Data type
              <select className={inp} value={draft.dataType} onChange={(e) => set("dataType", e.target.value)}>{CUSTOM_FIELD_DATA_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </label>
            <label className="text-xs text-gray-500">Requirement
              <select className={inp} value={draft.requirement} onChange={(e) => set("requirement", e.target.value)}><option value="optional">Optional</option><option value="required">Required</option></select>
            </label>
            <label className="text-xs text-gray-500">Intended source
              <select className={inp} value={draft.intendedSource} onChange={(e) => set("intendedSource", e.target.value)}>{CUSTOM_FIELD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </label>
            {draft.intendedSource === "other" && (
              <label className="text-xs text-gray-500">Source note
                <input className={inp} value={draft.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} placeholder="Describe the source" />{err("sourceNote")}
              </label>
            )}
            <label className="text-xs text-gray-500">Visibility
              <select className={inp} value={draft.visibility} onChange={(e) => set("visibility", e.target.value)}>{CUSTOM_FIELD_VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}</select>
            </label>
            <label className="text-xs text-gray-500">Export permission
              <select className={inp} value={draft.exportPermission} onChange={(e) => set("exportPermission", e.target.value)}>{CUSTOM_FIELD_EXPORT.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            </label>
          </div>
          <label className="text-xs text-gray-500 block">Notes (optional)
            <textarea className={inp} rows={1} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Collection instructions or interpretation" />
          </label>
          <p className="text-[11px] text-gray-400">Requirement is desired collection behaviour — it does not guarantee a source can supply the value. Visibility is independent of export permission.</p>
          <div className="flex gap-2">
            <button className={btn} onClick={submit}>Add field</button>
            <button className={btnGhost} onClick={() => { setOpen(false); setErrors({}); setDraft(emptyCustomFieldDraft()); setKeyEdited(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
