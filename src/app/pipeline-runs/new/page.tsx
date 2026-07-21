"use client";

// Create New Run — the discovery run creation wizard (replaces the old standalone Run
// Builder page; reached via the "Create New Run" button on /pipeline-runs). Ports the
// working target-profile/territory/national-map pieces from the former /run-builder
// verbatim (taxonomies, chain registry, custom fields, GeographySelector, national map) and
// adds what never existed anywhere in this codebase before: multiple anchors, provider
// selection, existing-customer exclusion, a real estimated volume + cost, a max-spend
// control, real duplicate-territory/conflict detection, an owner-override acknowledgement,
// and a review/confirm gate that a run cannot start without passing.

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  RunDraft, RunAnchor, newRunDraft, validateRunDraft, summariseRunDraft, saveRunDraft, loadRunDraft, clearRunDraft,
  generateDefaultRunName, resetProfileToDefaults,
} from "@/lib/discovery/run-draft";
import {
  ChainEntry, loadChainRegistry, saveChainRegistry, addChain, setChainEnabled,
} from "@/lib/discovery/chain-registry";
import type { FeederRoadEntry, MapViewState, TerritoryGeometry } from "@zoi555/geospatial-map";
import { ExpandableMap } from "@/features/geospatial/ExpandableMap";
import { aspectleadSourceConfig, NATIONAL_INITIAL_VIEW } from "@/features/geospatial/aspectlead-map-config";
import { runTerritoryGeometry } from "@/features/geospatial/aspectlead-territory";
import { GeographySelector } from "@/features/discovery/GeographySelector";
import { AspectLeadMap } from "@/features/geospatial/AspectLeadMap";
import { SOURCE_REGISTRY, MANUAL_IMPORT_STATUS } from "@/lib/sources/source-registry";

const STEPS = ["Identity", "Territory", "Target profile", "Anchors", "Provider & spend", "Review & confirm"] as const;

function NewRunPageInner() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  const [draft, setDraft] = React.useState<RunDraft | null>(null);
  const [chains, setChains] = React.useState<ChainEntry[]>([]);
  const [recovered, setRecovered] = React.useState(false);
  const [loadingSaved, setLoadingSaved] = React.useState(!!draftId);
  const [step, setStep] = React.useState(0);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [includeInput, setIncludeInput] = React.useState("");
  const [excludeInput, setExcludeInput] = React.useState("");
  const [newChain, setNewChain] = React.useState("");
  const [mapFeeders, setMapFeeders] = React.useState<FeederRoadEntry[]>([]);
  const [mapView, setMapView] = React.useState<MapViewState | null>(null);
  const [territoryGeom, setTerritoryGeom] = React.useState<TerritoryGeometry[]>([]);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [alertMsg, setAlertMsg] = React.useState<string | null>(null);
  const [bizSearch, setBizSearch] = React.useState("");
  const [customBizLabel, setCustomBizLabel] = React.useState("");
  const [geoExclusions, setGeoExclusions] = React.useState<string[]>([]);
  const [resolvedUnits, setResolvedUnits] = React.useState<string[]>([]);
  const [anchorLabel, setAnchorLabel] = React.useState("");
  const [anchorLat, setAnchorLat] = React.useState("");
  const [anchorLng, setAnchorLng] = React.useState("");
  const [estimatedVolume, setEstimatedVolume] = React.useState<number | null>(null);
  const [estimating, setEstimating] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ overlaps: { runId: string; name: string; status: string; overlappingUnits: string[] }[]; identicalActiveConflict: boolean } | null>(null);
  const [checkingConflict, setCheckingConflict] = React.useState(false);
  const [overrideNote, setOverrideNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [started, setStarted] = React.useState<{ status: string; completed: number; planned: number } | null>(null);

  const announce = (msg: string) => { setAlertMsg(null); setSaved(msg); };
  const alert = (msg: string) => { setSaved(null); setAlertMsg(msg); };

  const freshDraft = () => newRunDraft(String(Math.floor(performance.now())), new Date().toISOString(), generateDefaultRunName(new Date()));

  // mount: load an existing persisted draft (?draftId=), else recover the localStorage draft, else start fresh
  React.useEffect(() => {
    setChains(loadChainRegistry());
    if (draftId) {
      fetch(`/api/discovery/runs/${draftId}/status`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!j.ok) { alert(`Could not load draft: ${j.error}`); setDraft(freshDraft()); return; }
          const run = j.run;
          if (run.status !== "draft") { alert(`This run is '${run.status}' — its configuration is frozen and cannot be reopened for editing.`); setDraft(freshDraft()); return; }
          const tf = (run.target_filters ?? {}) as Record<string, unknown>;
          const base = freshDraft();
          const hydrated: RunDraft = {
            ...base,
            name: run.name, reference: run.reference ?? "", objective: run.objective ?? "",
            territory: { ...base.territory, mode: (run.territory_mode as RunDraft["territory"]["mode"]) ?? base.territory.mode, input: run.territory_input ?? "" },
            profile: {
              ...base.profile,
              businessTypes: (tf.businessTypes as string[]) ?? base.profile.businessTypes,
              cuisines: (tf.cuisines as string[]) ?? base.profile.cuisines,
              serviceModels: (tf.serviceModels as string[]) ?? base.profile.serviceModels,
              ownership: (tf.ownership as string[]) ?? base.profile.ownership,
              exclusions: (tf.exclusions as string[]) ?? base.profile.exclusions,
              excludeTerms: (tf.excludeTerms as string[]) ?? base.profile.excludeTerms,
            },
            planning: {
              anchors: Array.isArray(tf.anchors) ? (tf.anchors as RunAnchor[]) : [],
              selectedProviders: Array.isArray(tf.selectedProviders) ? (tf.selectedProviders as string[]) : ["just_eat"],
              existingCustomerExclusion: Boolean(tf.existingCustomerExclusion),
              spendCeilingGbp: typeof tf.spendCeilingGbp === "number" ? (tf.spendCeilingGbp as number) : null,
              ownerOverride: (tf.ownerOverride as RunDraft["planning"]["ownerOverride"]) ?? null,
            },
            savedRunId: run.id,
          };
          setDraft(hydrated);
          announce(`Reopened draft "${run.name}" — all previous selections restored.`);
        })
        .catch((e) => { alert(String(e)); setDraft(freshDraft()); })
        .finally(() => setLoadingSaved(false));
      return;
    }
    const existing = loadRunDraft();
    if (existing) { setDraft(existing); setRecovered(true); announce("Saved draft restored from this browser."); }
    else setDraft(freshDraft());
  }, [draftId]);

  // autosave to localStorage (recovery only — canonical persistence is the DB, on explicit Save/Confirm)
  React.useEffect(() => { if (draft) { saveRunDraft(draft); setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })); } }, [draft]);

  const territoryInput = draft?.territory.input ?? "";
  React.useEffect(() => {
    let live = true;
    runTerritoryGeometry(territoryInput).then((g) => { if (live) setTerritoryGeom(g); });
    return () => { live = false; };
  }, [territoryInput]);

  // estimate + conflict check refresh whenever we reach the provider/spend or review step
  React.useEffect(() => {
    if (step < 4 || resolvedUnits.length === 0) return;
    setEstimating(true);
    fetch("/api/discovery/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryUnits: resolvedUnits }) })
      .then((r) => r.json()).then((j) => setEstimatedVolume(j.ok ? j.estimatedVolume : null)).catch(() => setEstimatedVolume(null))
      .finally(() => setEstimating(false));
  }, [step, resolvedUnits.join(",")]);

  React.useEffect(() => {
    if (step < 5 || resolvedUnits.length === 0) return;
    setCheckingConflict(true);
    fetch("/api/discovery/runs/conflicts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryUnits: resolvedUnits, excludeRunId: draft?.savedRunId ?? null }) })
      .then((r) => r.json()).then((j) => setConflict(j.ok ? { overlaps: j.overlaps, identicalActiveConflict: j.identicalActiveConflict } : null)).catch(() => setConflict(null))
      .finally(() => setCheckingConflict(false));
  }, [step, resolvedUnits.join(","), draft?.savedRunId]);

  if (loadingSaved || !draft) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  const p = draft.profile;
  const pl = draft.planning;
  const update = (fn: (d: RunDraft) => void) => setDraft((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const validation = validateRunDraft(draft);

  const addToken = (which: "includeTerms" | "excludeTerms", raw: string) => {
    const t = raw.trim(); if (!t) return;
    update((d) => { if (!d.profile[which].includes(t)) d.profile[which] = [...d.profile[which], t]; });
  };

  const addAnchor = () => {
    const lat = parseFloat(anchorLat), lng = parseFloat(anchorLng);
    if (!anchorLabel.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) { alert("Anchor needs a label and valid latitude/longitude."); return; }
    update((d) => { d.planning.anchors = [...d.planning.anchors, { id: `anchor_${Date.now()}`, label: anchorLabel.trim(), lat, lng }]; });
    setAnchorLabel(""); setAnchorLat(""); setAnchorLng("");
  };
  const addAnchorAtPoint = (pt: { lat: number; lng: number }) => {
    update((d) => { d.planning.anchors = [...d.planning.anchors, { id: `anchor_${Date.now()}`, label: `Anchor ${d.planning.anchors.length + 1}`, lat: pt.lat, lng: pt.lng }]; });
    announce("Anchor added from map click.");
  };
  const removeAnchor = (id: string) => update((d) => { d.planning.anchors = d.planning.anchors.filter((a) => a.id !== id); });

  const toggleProvider = (id: string, selectable: boolean) => {
    if (!selectable) return;
    update((d) => { d.planning.selectedProviders = toggle(d.planning.selectedProviders, id); });
  };

  const costGbp = pl.selectedProviders.length > 0 ? 0 : null;
  const blockingConflict = conflict?.identicalActiveConflict ?? false;
  const overrideRequired = blockingConflict && !pl.ownerOverride?.acknowledged;
  const canConfirm = validation.ok && pl.selectedProviders.length > 0 && !overrideRequired;

  function buildPayload() {
    return {
      name: draft!.name, reference: draft!.reference, objective: draft!.objective,
      territory_mode: draft!.territory.mode, territory_input: draft!.territory.input,
      exclusions: geoExclusions,
      search_terms: p.includeTerms,
      target_filters: {
        businessTypes: p.businessTypes, cuisines: p.cuisines, serviceModels: p.serviceModels,
        ownership: p.ownership, exclusions: p.exclusions, excludeTerms: p.excludeTerms,
        anchors: pl.anchors, selectedProviders: pl.selectedProviders,
        existingCustomerExclusion: pl.existingCustomerExclusion, spendCeilingGbp: pl.spendCeilingGbp,
        ownerOverride: pl.ownerOverride,
      },
      requested_fields: p.dataFields,
      source_config: { source: pl.selectedProviders.includes("just_eat") ? "just_eat" : (pl.selectedProviders[0] ?? "manual_import") },
      config_snapshot: draft as unknown as Record<string, unknown>,
    };
  }

  async function saveDraft() {
    setBusy(true); setError(null);
    try {
      const payload = buildPayload();
      const res = await fetch(draft!.savedRunId ? `/api/discovery/runs/${draft!.savedRunId}` : "/api/discovery/runs", {
        method: draft!.savedRunId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to save draft");
      update((d) => { d.savedRunId = j.run.id; });
      announce(`Draft saved (${j.run.id}). It will remain a draft until you confirm and start it.`);
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }

  async function confirmAndStart() {
    if (!canConfirm) return;
    setBusy(true); setError(null);
    try {
      const payload = buildPayload();
      const res = await fetch(draft!.savedRunId ? `/api/discovery/runs/${draft!.savedRunId}` : "/api/discovery/runs", {
        method: draft!.savedRunId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to save run");
      const runId = j.run.id;
      update((d) => { d.savedRunId = runId; });
      if (pl.selectedProviders.includes("just_eat")) {
        const q = await fetch(`/api/discovery/runs/${runId}/queue`, { method: "POST" });
        const qj = await q.json();
        if (!qj.ok) throw new Error(qj.error || "Failed to queue execution");
        setStarted({ status: qj.execution.status, completed: qj.execution.completed_queries, planned: qj.execution.planned_queries });
        announce("Run confirmed and queued for Just Eat discovery.");
      } else {
        announce("Run confirmed. No queueable provider selected (manual import) — upload data for this run from the Import screen.");
      }
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }

  const providerRow = (id: string, name: string, selectable: boolean, statusLabel?: string) => {
    const s = SOURCE_REGISTRY.find((r) => r.id === id);
    const on = pl.selectedProviders.includes(id);
    return (
      <label key={id} className={`flex items-center justify-between gap-2 py-1.5 text-sm ${selectable ? "" : "opacity-60"}`}>
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={on} disabled={!selectable} onChange={() => toggleProvider(id, selectable)} />
          {name}
        </span>
        <span className="text-[11px] text-gray-500">{statusLabel ?? s?.statusLabel ?? s?.marketplaceStatus ?? ""}</span>
      </label>
    );
  };

  return (
    <div>
      <PageHeader title="Create New Run" subtitle="Configure, review and confirm a discovery run. Nothing starts until Review & Confirm." />

      <nav className="sticky top-0 z-20 flex flex-wrap gap-1.5 px-6 py-2.5 bg-white/95 backdrop-blur border-b border-gray-100" aria-label="Run creation steps">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={`text-xs px-2.5 py-1 rounded-full border ${i === step ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}>{i + 1}. {s}</button>
        ))}
      </nav>

      {recovered && step === 0 && (
        <div className="mx-6 mt-3 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>Restored your previous run draft from this browser.</span>
          <button className="underline" onClick={() => { clearRunDraft(); setDraft(freshDraft()); setRecovered(false); }}>Start a new run</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 p-6">
        <div className="space-y-4">
          {step === 0 && (
            <Card title="Run identity">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Run name *"><input className={inp} value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value; })} placeholder="e.g. TW independents — Q3" /></Field>
                <Field label="Reference"><input className={inp} value={draft.reference} onChange={(e) => update((d) => { d.reference = e.target.value; })} placeholder="e.g. RUN-TW-001" /></Field>
                <Field label="Description / objective" wide><textarea className={inp} rows={2} value={draft.objective} onChange={(e) => update((d) => { d.objective = e.target.value; })} placeholder="What is this run for?" /></Field>
              </div>
            </Card>
          )}

          {step === 1 && (
            <>
              <Card title="Territory">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Territory mode">
                    <select className={inp} value={draft.territory.mode} onChange={(e) => update((d) => { d.territory.mode = e.target.value as any; })}>
                      {([["pilot", "Pilot"], ["manual_outcodes", "Manual postcode districts"], ["vp_coverage", "VP coverage"], ["full_uk", "Full UK"], ["custom", "Custom"]] as const).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Location rule">
                    <select className={inp} value={draft.territory.locationRule} onChange={(e) => update((d) => { d.territory.locationRule = e.target.value as any; })}>
                      <option value="require">Require physical location in territory</option>
                      <option value="prefer">Prefer, allow deliver-into</option>
                      <option value="off">Off</option>
                    </select>
                  </Field>
                  <Field label="Postcode areas, districts, sectors or pasted list" wide>
                    <textarea className={inp} rows={3} value={draft.territory.input} onChange={(e) => update((d) => { d.territory.input = e.target.value; })} placeholder="TW   or   TW3, TW4   or a pasted list (comma or new line separated)" />
                  </Field>
                </div>
                <p className="text-xs text-gray-500 mt-2">Preview resolves areas → districts/sectors and lets you exclude specific children before saving.</p>
                <GeographySelector input={draft.territory.input} onExclusionsChange={setGeoExclusions} onResolvedChange={setResolvedUnits} />
              </Card>

              <Card title="National map & feeder roads">
                <p className="text-xs text-gray-500 mb-2">Shared Great Britain map (OS OpenData). Browsing here does not change the run territory — that is set above. Saved territory shows as an orange outline.</p>
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
                  {territoryGeom.length > 0 ? `Territory outline: ${territoryGeom.length} district${territoryGeom.length === 1 ? "" : "s"}.` : draft.territory.input ? `No district polygons matched "${draft.territory.input}".` : "Enter a territory above to outline it."}
                </p>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card title="Target profile — business types">
                <BusinessTypePanel
                  options={allBusinessTypeOptions(p)} selected={p.businessTypes} search={bizSearch} setSearch={setBizSearch}
                  onToggle={(key) => update((d) => { d.profile.businessTypes = toggle(d.profile.businessTypes, key); })}
                  customLabel={customBizLabel} setCustomLabel={setCustomBizLabel}
                  onAddCustom={() => {
                    const res = addCustomBusinessType(p, customBizLabel);
                    if (res.error) { alert(res.error); return; }
                    update((d) => { d.profile = res.profile; }); setCustomBizLabel(""); announce("Custom business type added.");
                  }}
                  onRemoveCustom={(key) => { update((d) => { d.profile = removeCustomBusinessType(d.profile, key); }); announce("Custom business type removed."); }}
                />
              </Card>
              <Card title="Cuisines"><Muted>Empty = all cuisines.</Muted><ChipMulti items={CUISINES} selected={p.cuisines} onToggle={(id) => update((d) => { d.profile.cuisines = toggle(d.profile.cuisines, id); })} /></Card>
              <Card title="Service models"><ChipMulti items={SERVICE_MODELS} selected={p.serviceModels} onToggle={(id) => update((d) => { d.profile.serviceModels = toggle(d.profile.serviceModels, id); })} /></Card>
              <Card title="Ownership classification"><ChipMulti items={OWNERSHIP_TYPES} selected={p.ownership} onToggle={(id) => update((d) => { d.profile.ownership = toggle(d.profile.ownership, id); })} /></Card>
              <Card title="Default unsuitable-business exclusions">
                {DEFAULT_EXCLUSIONS.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 py-1 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={p.exclusions.includes(e.id)} onChange={() => update((d) => { d.profile.exclusions = toggle(d.profile.exclusions, e.id); })} />
                    <span>{e.label}{e.note && <span className="text-gray-400"> — {e.note}</span>}</span>
                  </label>
                ))}
              </Card>
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
              <div className="grid sm:grid-cols-2 gap-4">
                <Card title="Custom include terms">
                  <TokenInput value={includeInput} setValue={setIncludeInput} onAdd={() => { addToken("includeTerms", includeInput); setIncludeInput(""); }} tokens={p.includeTerms} onRemove={(t) => update((d) => { d.profile.includeTerms = d.profile.includeTerms.filter((x) => x !== t); })} placeholder="e.g. trattoria" />
                </Card>
                <Card title="Custom exclude terms">
                  <TokenInput value={excludeInput} setValue={setExcludeInput} onAdd={() => { addToken("excludeTerms", excludeInput); setExcludeInput(""); }} tokens={p.excludeTerms} onRemove={(t) => update((d) => { d.profile.excludeTerms = d.profile.excludeTerms.filter((x) => x !== t); })} placeholder="e.g. hotel" />
                </Card>
              </div>
              <Card title="Requested data fields">
                <div className="grid sm:grid-cols-2 gap-x-4">
                  {REQUESTED_DATA_FIELDS.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <input type="checkbox" checked={p.dataFields.includes(f.id)} onChange={() => update((d) => { d.profile.dataFields = toggle(d.profile.dataFields, f.id); })} />
                      <span>{f.label}{f.sensitive && <span className="text-amber-600 text-[10px] ml-1" title="Sensitive — handle per data policy">sensitive</span>}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 border-t pt-3">
                  <CustomFieldEditor
                    fields={p.customFields} existingKeys={p.customFields.map((f) => f.internalKey)}
                    onAdd={(fieldDraft) => {
                      const res = addCustomRequestedField(p, fieldDraft);
                      if (!res.validation.ok) { alert(res.validation.summary || "Fix the highlighted fields."); return res.validation; }
                      update((d) => { d.profile = res.profile; }); announce("Custom requested field added."); return res.validation;
                    }}
                    onRemove={(id) => { update((d) => { d.profile = removeCustomRequestedField(d.profile, id); }); announce("Custom requested field removed."); }}
                  />
                </div>
              </Card>
              <Card title="Result tags"><ChipMulti items={RESULT_TAGS} selected={p.tags} onToggle={(id) => update((d) => { d.profile.tags = toggle(d.profile.tags, id); })} /></Card>
              <Card title="Existing-customer exclusion">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pl.existingCustomerExclusion} onChange={() => update((d) => { d.planning.existingCustomerExclusion = !d.planning.existingCustomerExclusion; })} />
                  Exclude matches against the existing-customer reference data
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Matching logic is real; the reference master is currently mock data (see Settings → source registry).</p>
              </Card>
            </>
          )}

          {step === 3 && (
            <Card title="Anchors">
              <Muted>One or more reference points for this run (e.g. a high street centre). Multiple anchors were never supported before this screen — click the map or enter coordinates manually.</Muted>
              <AspectLeadMap mode="run-planning" territoryInput={draft.territory.input} anchors={pl.anchors} onMapClickPoint={addAnchorAtPoint} embeddedClassName="h-[420px]" />
              <div className="grid sm:grid-cols-4 gap-2 my-2">
                <input className={inp} value={anchorLabel} onChange={(e) => setAnchorLabel(e.target.value)} placeholder="Label, e.g. Southall Town Hall" />
                <input className={inp} value={anchorLat} onChange={(e) => setAnchorLat(e.target.value)} placeholder="Latitude" />
                <input className={inp} value={anchorLng} onChange={(e) => setAnchorLng(e.target.value)} placeholder="Longitude" />
                <button className={btn} onClick={addAnchor}>Add anchor</button>
              </div>
              {pl.anchors.length === 0 && <p className="text-xs text-gray-400">No anchors added yet — optional.</p>}
              <ul className="space-y-1">
                {pl.anchors.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1">
                    <span>{a.label} <span className="text-gray-400 text-xs">({a.lat.toFixed(4)}, {a.lng.toFixed(4)})</span></span>
                    <button onClick={() => removeAnchor(a.id)} className="text-gray-400 hover:text-gray-700">×</button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {step === 4 && (
            <>
              <Card title="Provider selection">
                {providerRow("just_eat", "Just Eat", true)}
                {providerRow("manual_import", "Manual import", true, MANUAL_IMPORT_STATUS)}
                {providerRow("uber_eats", "Uber Eats", false)}
                {providerRow("deliveroo", "Deliveroo", false)}
                <p className="text-[11px] text-gray-400 mt-2">Uber Eats and Deliveroo are shown for visibility only — not selectable this session (paused pending authorised source / ingestion completion).</p>
              </Card>
              <Card title="Estimated volume &amp; cost">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Estimated record volume</div>
                    <div className="font-semibold">{estimating ? "Estimating…" : estimatedVolume == null ? "Not available" : `${estimatedVolume} (existing Just Eat coverage in this territory)`}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Estimated cost</div>
                    <div className="font-semibold">{costGbp == null ? "Not available" : `£${costGbp.toFixed(2)} (${pl.selectedProviders.join(", ") || "no provider selected"} — no per-record provider cost)`}</div>
                  </div>
                </div>
              </Card>
              <Card title="Maximum spend">
                <Field label="Spend ceiling (£, optional)">
                  <input className={inp} type="number" min="0" value={pl.spendCeilingGbp ?? ""} onChange={(e) => update((d) => { d.planning.spendCeilingGbp = e.target.value === "" ? null : Number(e.target.value); })} placeholder="No ceiling set" />
                </Field>
                <p className="text-[11px] text-gray-400 mt-1">Recorded for this run. Currently all selectable providers are free, so this ceiling is not enforced against a live cost yet — it will gate provider selection once a paid source is authorised.</p>
              </Card>
            </>
          )}

          {step === 5 && (
            <>
              <Card title="Duplicate-territory / conflict check">
                {checkingConflict ? <p className="text-sm text-gray-500">Checking…</p> : conflict && conflict.overlaps.length > 0 ? (
                  <div className="space-y-1.5">
                    {conflict.overlaps.map((o) => (
                      <div key={o.runId} className={`text-sm rounded px-2 py-1 border ${conflict.identicalActiveConflict ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                        Overlaps run <b>{o.name}</b> ({o.status}) on {o.overlappingUnits.join(", ")}
                      </div>
                    ))}
                    {conflict.identicalActiveConflict && (
                      <div className="mt-2 border-t border-gray-100 pt-2">
                        <label className="flex items-start gap-2 text-sm">
                          <input type="checkbox" className="mt-0.5" checked={!!pl.ownerOverride?.acknowledged}
                            onChange={(e) => update((d) => { d.planning.ownerOverride = e.target.checked ? { acknowledged: true, note: overrideNote, at: new Date().toISOString() } : null; })} />
                          I acknowledge this territory conflict and choose to proceed anyway (recorded on the run).
                        </label>
                        {pl.ownerOverride?.acknowledged && (
                          <input className={`${inp} mt-2`} value={overrideNote} onChange={(e) => { setOverrideNote(e.target.value); update((d) => { if (d.planning.ownerOverride) d.planning.ownerOverride.note = e.target.value; }); }} placeholder="Optional note (why this override is acceptable)" />
                        )}
                      </div>
                    )}
                  </div>
                ) : <p className="text-sm text-green-700">No conflicting active/queued run on this territory.</p>}
              </Card>
              <Card title="Review">
                <dl className="text-xs space-y-1">
                  {summariseRunDraft(draft).map((s) => (
                    <div key={s.label} className="flex justify-between gap-2"><dt className="text-gray-500">{s.label}</dt><dd className="text-gray-900 text-right">{s.value}</dd></div>
                  ))}
                  <div className="flex justify-between gap-2"><dt className="text-gray-500">Anchors</dt><dd className="text-gray-900 text-right">{pl.anchors.length}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-gray-500">Provider(s)</dt><dd className="text-gray-900 text-right">{pl.selectedProviders.join(", ") || "none"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-gray-500">Spend ceiling</dt><dd className="text-gray-900 text-right">{pl.spendCeilingGbp != null ? `£${pl.spendCeilingGbp}` : "none set"}</dd></div>
                </dl>
                {!validation.ok && (
                  <div className="mt-2">{validation.errors.map((e) => <div key={e} className="text-xs text-red-600">● {e}</div>)}</div>
                )}
                {started ? (
                  <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                    Started — execution {started.status}, {started.completed}/{started.planned} postcode districts.
                    {" "}<a href="/discovery-runs" className="underline">View in Discovery Runs</a>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy} className={btnGhost} onClick={saveDraft}>{busy ? "Saving…" : "Save draft"}</button>
                    <button disabled={busy || !canConfirm} className={canConfirm ? btn : btnDisabled} onClick={confirmAndStart}>{busy ? "Starting…" : "Confirm and start"}</button>
                  </div>
                )}
                {overrideRequired && <p className="text-xs text-red-600 mt-1">Confirm is blocked — acknowledge the territory conflict above to proceed.</p>}
              </Card>
            </>
          )}

          {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}
        </div>

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
              {validation.ok && !validation.warnings.length && <div className="text-xs text-green-600">Ready to review.</div>}
            </div>
            <p aria-live="polite" className={`text-xs mt-2 ${saved ? "text-green-700" : "text-gray-400"}`}>{saved || " "}</p>
            {alertMsg && <p role="alert" className="text-xs mt-1 text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{alertMsg}</p>}
          </Card>
          <Card title="Draft">
            <Muted>Auto-saved to this browser{savedAt ? ` · last saved ${savedAt}` : ""}{draft.savedRunId ? ` · persisted as ${draft.savedRunId}` : " · not yet saved to the database"}.</Muted>
            <button className={`${btnGhost} mt-2 w-full`} onClick={() => { setDraft((d) => (d ? resetProfileToDefaults(d) : d)); setBizSearch(""); announce("Recommended defaults restored."); }}>Restore recommended defaults</button>
            <button className={`${btnGhost} mt-2 w-full`} onClick={() => { clearRunDraft(); setDraft(freshDraft()); setRecovered(false); setBizSearch(""); setStep(0); announce("Draft cleared — started a new run."); }}>Clear draft &amp; start new</button>
          </Card>
          <div className="flex justify-between">
            <button disabled={step === 0} className={step === 0 ? btnDisabled : btnGhost} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
            <button disabled={step === STEPS.length - 1} className={step === STEPS.length - 1 ? btnDisabled : btn} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Next</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function NewRunPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <NewRunPageInner />
    </Suspense>
  );
}

// ---- ported UI helpers (unchanged from the former /run-builder) ----
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
