"use client";

// Create New Run — the discovery run creation wizard, reached via the "Create New Run"
// button on /pipeline-runs (Main Runs). Refactored (2026-08-10, P4 control decision) into
// the nine explicit governing stages: Identity, Source Mode, Geography, Limits/Cost,
// Exclusions, Scoring Profile, Assignment, Outputs, Review. Business-type/taxonomy
// targeting (business types, cuisines, service models, ownership, requested fields, tags)
// is not one of the nine named stages — it is kept inside Exclusions, since it defines
// scope in/out exactly like the rest of that stage (see docs/09_DECISIONS.md for this
// judgment call). Anchors are likewise not a named stage — folded into Geography as
// supporting map context.

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
  RunDraft, RunAnchor, AssignmentPolicyId, OutputTypeId, SourceModeId,
  newRunDraft, validateRunDraft, summariseRunDraft, saveRunDraft, loadRunDraft, clearRunDraft,
  generateDefaultRunName, resetProfileToDefaults, migrateDraft, ASSIGNMENT_LABELS, OUTPUT_LABELS,
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

const STEPS = [
  "Identity", "Source Mode", "Geography", "Limits & Cost", "Exclusions",
  "Scoring Profile", "Assignment", "Outputs", "Review",
] as const;
const STEP_GEOGRAPHY = 2;
const STEP_LIMITS = 3;
const STEP_REVIEW = 8;

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
  const [newManualExclusion, setNewManualExclusion] = React.useState("");
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
  interface OverlapEntry {
    runId: string; name: string; reference: string | null; ownerLabel: string; sourceMode: string | null;
    status: string; territoryInput: string | null; overlappingUnits: string[]; overlapType: "exact" | "partial";
    createdAt: string; estimatedAdditionalCostGbp: number | null;
  }
  const [overlapResult, setOverlapResult] = React.useState<{ overlaps: OverlapEntry[]; materialOverlap: boolean } | null>(null);
  // Explicit overlap-check state — deliberately distinct from "materialOverlap": that flag
  // only means anything once overlapCheckStatus === "ok". "unavailable" (no canonical/
  // resolved query units to check yet) and "error" (the lookup itself failed) must NEVER be
  // conflated with a genuine "zero overlapping runs" result (P4 control correction,
  // 2026-08-12 — the reopened-draft bug was exactly this conflation: an empty resolvedUnits
  // array was silently read as "no prior run on this territory").
  const [overlapCheckStatus, setOverlapCheckStatus] = React.useState<"checking" | "unavailable" | "error" | "ok">("unavailable");
  const [overlapNote, setOverlapNote] = React.useState("");
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

          // Restore the overlap-check input from the CANONICAL query_unit table (not
          // browser-only state) so a reopened draft can be disclosure-checked at Review
          // without the user having to revisit Geography and re-click "Preview geography"
          // (P4 control correction, 2026-08-12 — the reopened-draft overlap-disclosure gap:
          // resolvedUnits used to start empty on every mount regardless of what was already
          // persisted, so Review could show a false "nothing to disclose" for an active
          // territory overlap until Geography was manually revisited). Only ever the
          // authoritative persisted units — never invented, never derived_query_units when
          // canonical rows exist (see getQueryUnitsForRun's own header comment).
          if (Array.isArray(j.queryUnits) && j.queryUnits.length > 0) setResolvedUnits(j.queryUnits);

          // Preferred path: the full v3 (or older) config_snapshot, migrated forward — this is
          // the authoritative source once a run has been saved through this wizard at least once.
          const fromSnapshot = migrateDraft(run.config_snapshot);
          if (fromSnapshot) {
            setDraft({ ...fromSnapshot, savedRunId: run.id });
            announce(`Reopened draft "${run.name}" — all previous selections restored.`);
            return;
          }

          // Fallback: reconstruct from the legacy target_filters bag + top-level columns, for
          // rows created without a UI-built config_snapshot (e.g. direct repository calls).
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
            anchors: Array.isArray(tf.anchors) ? (tf.anchors as RunAnchor[]) : [],
            sourceMode: { mode: "just_eat_only", selectedProviders: Array.isArray(tf.selectedProviders) ? (tf.selectedProviders as string[]) : ["just_eat"] },
            limitsAndCost: { ...base.limitsAndCost, spendCeilingGbp: typeof tf.spendCeilingGbp === "number" ? (tf.spendCeilingGbp as number) : null },
            exclusions: { ...base.exclusions, existingCustomerExclusion: { ...base.exclusions.existingCustomerExclusion, requested: Boolean(tf.existingCustomerExclusion) } },
            review: { ...base.review, overlapAcknowledgement: (tf.overlapAcknowledgement as RunDraft["review"]["overlapAcknowledgement"]) ?? null },
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

  // estimate + conflict check refresh whenever we reach the relevant step
  React.useEffect(() => {
    if (step < STEP_LIMITS || resolvedUnits.length === 0) return;
    setEstimating(true);
    fetch("/api/discovery/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryUnits: resolvedUnits }) })
      .then((r) => r.json()).then((j) => setEstimatedVolume(j.ok ? j.estimatedVolume : null)).catch(() => setEstimatedVolume(null))
      .finally(() => setEstimating(false));
  }, [step, resolvedUnits.join(",")]);

  const refreshOverlaps = React.useCallback(async (excludeRunIdOverride?: string | null) => {
    // Canonical/resolved query units genuinely unavailable — a brand-new draft that hasn't
    // previewed its geography yet, or a persisted run whose territory resolves to nothing.
    // This is NOT "zero overlapping runs found" and must never be displayed as such.
    if (resolvedUnits.length === 0) { setOverlapResult(null); setOverlapCheckStatus("unavailable"); return; }
    setOverlapCheckStatus("checking");
    try {
      // excludeRunIdOverride lets a caller pass the just-saved run id explicitly instead of
      // relying on draft.savedRunId — React state updates are async, so calling this right
      // after update((d) => { d.savedRunId = runId }) (e.g. confirmAndStart's stale-
      // disclosure recovery) would otherwise still read the PRE-update (null) value from
      // this closure and show the draft's own row in its own overlap disclosure table.
      const excludeRunId = excludeRunIdOverride !== undefined ? excludeRunIdOverride : (draft?.savedRunId ?? null);
      const r = await fetch("/api/discovery/runs/conflicts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryUnits: resolvedUnits, excludeRunId }) });
      const j = await r.json();
      if (!j.ok) { setOverlapResult(null); setOverlapCheckStatus("error"); return; }
      setOverlapResult({ overlaps: j.overlaps, materialOverlap: j.materialOverlap });
      setOverlapCheckStatus("ok");
    } catch { setOverlapResult(null); setOverlapCheckStatus("error"); }
  }, [resolvedUnits.join(","), draft?.savedRunId]);

  React.useEffect(() => {
    if (step < STEP_REVIEW) return;
    refreshOverlaps();
  }, [step, refreshOverlaps]);

  /** The exact currently-ACTIVE overlapping run ids the Review screen is showing right
   *  now — what an acknowledgement ticked at this instant is disclosure evidence FOR. Sent
   *  to the server, which re-verifies it is still accurate before allowing the queue
   *  (CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE otherwise — P4 independent review, 2026-08-10). */
  const currentActiveOverlapRunIds = (overlapResult?.overlaps ?? [])
    .filter((o) => ["queued", "running", "cancelling"].includes(o.status))
    .map((o) => o.runId);

  if (loadingSaved || !draft) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  const p = draft.profile;
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
    update((d) => { d.anchors = [...d.anchors, { id: `anchor_${Date.now()}`, label: anchorLabel.trim(), lat, lng }]; });
    setAnchorLabel(""); setAnchorLat(""); setAnchorLng("");
  };
  const addAnchorAtPoint = (pt: { lat: number; lng: number }) => {
    update((d) => { d.anchors = [...d.anchors, { id: `anchor_${Date.now()}`, label: `Anchor ${d.anchors.length + 1}`, lat: pt.lat, lng: pt.lng }]; });
    announce("Anchor added from map click.");
  };
  const removeAnchor = (id: string) => update((d) => { d.anchors = d.anchors.filter((a) => a.id !== id); });

  const toggleProvider = (id: string, selectable: boolean) => {
    if (!selectable) return;
    update((d) => { d.sourceMode.selectedProviders = toggle(d.sourceMode.selectedProviders, id); });
  };
  const setSourceModeId = (mode: SourceModeId) => update((d) => { d.sourceMode.mode = mode; });
  const toggleOutput = (type: OutputTypeId) => {
    if (type === "canonical_audit") return; // required — cannot be deselected
    update((d) => { d.outputs = d.outputs.map((o) => (o.type === type ? { ...o, requested: !o.requested } : o)); });
  };
  const setAssignmentPolicy = (policy: AssignmentPolicyId) => update((d) => { d.assignment.policy = policy; });
  const addManualExclusion = () => {
    const t = newManualExclusion.trim(); if (!t) return;
    update((d) => { if (!d.exclusions.manualExclusions.includes(t)) d.exclusions.manualExclusions = [...d.exclusions.manualExclusions, t]; });
    setNewManualExclusion("");
  };
  const removeManualExclusion = (t: string) => update((d) => { d.exclusions.manualExclusions = d.exclusions.manualExclusions.filter((x) => x !== t); });

  const registryFor = (id: string) => SOURCE_REGISTRY.find((r) => r.id === id);
  const costGbp = draft.sourceMode.selectedProviders.includes("just_eat") ? 0 : null;
  // Territory overlap is PERMITTED (P4 control correction, 2026-08-10) — it is never a
  // blocking conflict. An explicit acknowledgement is required only when overlap is
  // MATERIAL (shares query units with a currently active — queued/running/cancelling —
  // run), as evidence the user was warned, not as authorisation of a forbidden action.
  const materialOverlap = overlapResult?.materialOverlap ?? false;
  const acknowledgementRequired = materialOverlap && !draft.review.overlapAcknowledgement?.acknowledged;
  // Fail-closed overlap verification (P4 control correction, 2026-08-12): only Just Eat is
  // queueable in this vertical slice, so only a run that has Just Eat selected needs a
  // genuinely-completed overlap check before it can be confirmed — a manual-import-only run
  // has no query units to check and its own flow is unaffected (per instruction, do not
  // invent query units where none exist). "ok" is the ONLY status that counts as verified —
  // "unavailable" (nothing resolved yet) and "error" (the lookup itself failed) must never
  // silently permit confirmation, matching confirm_and_queue_run's own fail-closed design.
  const overlapCheckRequired = draft.sourceMode.selectedProviders.includes("just_eat");
  const overlapVerified = !overlapCheckRequired || overlapCheckStatus === "ok";
  const canConfirm = validation.ok && draft.sourceMode.selectedProviders.length > 0 && !acknowledgementRequired && overlapVerified;

  function buildPayload() {
    const d = draft!;
    const snapshotDraft: RunDraft = { ...d, exclusions: { ...d.exclusions, geographyExclusions: geoExclusions } };
    return {
      name: d.name, reference: d.reference, objective: d.objective,
      territory_mode: d.territory.mode, territory_input: d.territory.input,
      exclusions: geoExclusions,
      search_terms: p.includeTerms,
      target_filters: {
        businessTypes: p.businessTypes, cuisines: p.cuisines, serviceModels: p.serviceModels,
        ownership: p.ownership, exclusions: p.exclusions, excludeTerms: p.excludeTerms,
        anchors: d.anchors, selectedProviders: d.sourceMode.selectedProviders,
        existingCustomerExclusion: d.exclusions.existingCustomerExclusion.requested, spendCeilingGbp: d.limitsAndCost.spendCeilingGbp,
        overlapAcknowledgement: d.review.overlapAcknowledgement,
      },
      requested_fields: p.dataFields,
      source_config: { source: d.sourceMode.selectedProviders.includes("just_eat") ? "just_eat" : (d.sourceMode.selectedProviders[0] ?? "manual_import"), mode: d.sourceMode.mode },
      config_snapshot: snapshotDraft as unknown as Record<string, unknown>,
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
      if (draft!.sourceMode.selectedProviders.includes("just_eat")) {
        const q = await fetch(`/api/discovery/runs/${runId}/queue`, { method: "POST" });
        const qj = await q.json();
        if (!qj.ok) {
          // A browser-generated confirmation timestamp is never trusted as authoritative —
          // confirmedAtIso is stamped ONLY by confirm_and_queue_run's own transaction, so a
          // failed queue call correctly leaves it null (nothing above set it optimistically).
          if (String(qj.error ?? "").includes("CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE")) {
            // The overlap the user acknowledged is no longer accurate — something became
            // (or stopped being) active since the Review screen was last shown. Clear the
            // stale acknowledgement and pull a fresh disclosure rather than retrying blind.
            update((d) => { d.review.overlapAcknowledgement = null; });
            await refreshOverlaps(runId);
            throw new Error("The territory overlap changed since you last reviewed it (another run became active, or one is no longer active). Review the updated overlap below and acknowledge it again before confirming.");
          }
          throw new Error(qj.error || "Failed to queue execution");
        }
        setStarted({ status: qj.execution.status, completed: qj.execution.completed_queries, planned: qj.execution.planned_queries });
        // Pull the server-authoritative confirmation evidence back into the local draft (the
        // wizard never invents this timestamp itself) so the Review summary and sidebar
        // reflect exactly what confirm_and_queue_run actually stamped, not a guess.
        try {
          const statusRes = await fetch(`/api/discovery/runs/${runId}/status`, { cache: "no-store" });
          const statusJson = await statusRes.json();
          const migrated = statusJson.ok ? migrateDraft(statusJson.run?.config_snapshot) : null;
          if (migrated) update((d) => { d.review = migrated.review; });
        } catch { /* non-fatal — the run is already queued; the detail page shows the authoritative value regardless */ }
        announce("Run confirmed and queued for Just Eat discovery.");
      } else {
        announce("Run confirmed. No queueable provider selected (manual import) — upload data for this run from the Import screen.");
      }
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }

  const providerRow = (id: string, name: string, selectable: boolean, statusLabel?: string) => {
    const s = registryFor(id);
    const on = draft.sourceMode.selectedProviders.includes(id);
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
                <Field label="Run name *"><input className={inp} value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value; })} placeholder="e.g. Independent chicken shops — Q3" /></Field>
                <Field label="Reference"><input className={inp} value={draft.reference} onChange={(e) => update((d) => { d.reference = e.target.value; })} placeholder="e.g. RUN-0001" /></Field>
                <Field label="Description / objective" wide><textarea className={inp} rows={2} value={draft.objective} onChange={(e) => update((d) => { d.objective = e.target.value; })} placeholder="What is this run for?" /></Field>
              </div>
            </Card>
          )}

          {step === 1 && (
            <>
              <Card title="Source mode">
                <Muted>The product preserves exactly two source modes. Selecting mode B represents intent and readiness only — Uber Eats and Deliveroo are not yet executable (no authorised source, ISS-0021).</Muted>
                <div className="space-y-1.5 mt-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" name="sourceMode" checked={draft.sourceMode.mode === "just_eat_only"} onChange={() => setSourceModeId("just_eat_only")} className="mt-0.5" />
                    <span><b>A. Just Eat only</b> — <span className="text-green-700">AVAILABLE</span></span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" name="sourceMode" checked={draft.sourceMode.mode === "just_eat_uber_deliveroo"} onChange={() => setSourceModeId("just_eat_uber_deliveroo")} className="mt-0.5" />
                    <span><b>B. Just Eat + Uber Eats + Deliveroo</b> — <span className="text-amber-600">NOT YET PRODUCTION APPROVED</span> (multi-platform architecture represented; only Just Eat will actually execute)</span>
                  </label>
                </div>
              </Card>
              <Card title="Provider selection">
                {providerRow("just_eat", "Just Eat", true)}
                {providerRow("manual_import", "Manual import", true, MANUAL_IMPORT_STATUS)}
                {providerRow("uber_eats", "Uber Eats", false)}
                {providerRow("deliveroo", "Deliveroo", false)}
                <p className="text-[11px] text-gray-400 mt-2">Uber Eats and Deliveroo are shown for visibility only — not selectable this session (paused pending authorised source / ingestion completion).</p>
              </Card>
            </>
          )}

          {step === STEP_GEOGRAPHY && (
            <>
              <Card title="Territory">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Territory mode">
                    <select className={inp} value={draft.territory.mode} onChange={(e) => update((d) => { d.territory.mode = e.target.value as any; })}>
                      {/* "pilot" intentionally excluded from the selectable options — AspectLead is a
                          Great Britain-wide product, not scoped to any one pilot territory (P4 control,
                          2026-08-10). The RunTerritory type keeps "pilot" as a valid value only so an
                          already-persisted old draft/run using it remains readable, never as something a
                          user can newly choose. The internal enum value for the next option stays
                          "full_uk" (backwards compatibility with already-persisted runs — changing it
                          would need a data migration for no user-facing benefit), but its LABEL says
                          "Full Great Britain": the current product covers England, Scotland and Wales
                          only — Northern Ireland is out of scope for the geospatial platform, so no
                          user-facing text may say "UK" (P4 independent review, 2026-08-10). */}
                      {([["manual_outcodes", "Manual postcode districts"], ["vp_coverage", "VP coverage"], ["full_uk", "Full Great Britain"], ["custom", "Custom"]] as const).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
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
                    <textarea className={inp} rows={3} value={draft.territory.input} onChange={(e) => update((d) => { d.territory.input = e.target.value; })} placeholder="A postcode area (e.g. SW), district(s) (e.g. SW1, SW2), a sector (e.g. SW1 2), or a pasted list — anywhere in Great Britain" />
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

              <Card title="Reference points (anchors)">
                <Muted>Optional reference points for this run (e.g. a high street centre) — supports territory review, not scope on its own. Click the map or enter coordinates manually.</Muted>
                <AspectLeadMap mode="run-planning" territoryInput={draft.territory.input} anchors={draft.anchors} onMapClickPoint={addAnchorAtPoint} embeddedClassName="h-[420px]" />
                <div className="grid sm:grid-cols-4 gap-2 my-2">
                  <input className={inp} value={anchorLabel} onChange={(e) => setAnchorLabel(e.target.value)} placeholder="Label, e.g. Town Hall" />
                  <input className={inp} value={anchorLat} onChange={(e) => setAnchorLat(e.target.value)} placeholder="Latitude" />
                  <input className={inp} value={anchorLng} onChange={(e) => setAnchorLng(e.target.value)} placeholder="Longitude" />
                  <button className={btn} onClick={addAnchor}>Add anchor</button>
                </div>
                {draft.anchors.length === 0 && <p className="text-xs text-gray-400">No anchors added yet — optional.</p>}
                <ul className="space-y-1">
                  {draft.anchors.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1">
                      <span>{a.label} <span className="text-gray-400 text-xs">({a.lat.toFixed(4)}, {a.lng.toFixed(4)})</span></span>
                      <button onClick={() => removeAnchor(a.id)} className="text-gray-400 hover:text-gray-700">×</button>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {step === STEP_LIMITS && (
            <>
              <Card title="Expected volume, cost, cap and approval — per source">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Expected volume</th><th className="py-1 pr-3">Estimated charge</th><th className="py-1 pr-3">Readiness</th><th className="py-1">Approval</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-gray-100">
                        <td className="py-1.5 pr-3 font-medium">Just Eat</td>
                        <td className="py-1.5 pr-3">{estimating ? "Estimating…" : estimatedVolume == null ? "Not available" : `${estimatedVolume} (existing coverage)`}</td>
                        <td className="py-1.5 pr-3">£0.00 (open lawful listing endpoint — genuinely free)</td>
                        <td className="py-1.5 pr-3 text-green-700">AVAILABLE</td>
                        <td className="py-1.5">Not required (free)</td>
                      </tr>
                      {draft.sourceMode.mode === "just_eat_uber_deliveroo" && (["uber_eats", "deliveroo"] as const).map((id) => {
                        const s = registryFor(id);
                        return (
                          <tr key={id} className="border-t border-gray-100 opacity-70">
                            <td className="py-1.5 pr-3 font-medium">{s?.name ?? id}</td>
                            <td className="py-1.5 pr-3">Not available — no authorised source</td>
                            <td className="py-1.5 pr-3">Not available — no approved cost model</td>
                            <td className="py-1.5 pr-3 text-amber-600">{s?.statusLabel ?? s?.marketplaceStatus ?? "PENDING_AUTHORISATION"}</td>
                            <td className="py-1.5 text-red-600">Blocked — provider not yet authorised</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="Maximum spend">
                <Field label="Spend ceiling (£, optional)">
                  <input className={inp} type="number" min="0" value={draft.limitsAndCost.spendCeilingGbp ?? ""} onChange={(e) => update((d) => { d.limitsAndCost.spendCeilingGbp = e.target.value === "" ? null : Number(e.target.value); })} placeholder="No ceiling set" />
                </Field>
                <label className="flex items-center gap-2 text-sm mt-3 opacity-60">
                  <input type="checkbox" checked={false} disabled />
                  Approve paid execution
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Currently all selectable providers are free, so this ceiling is not enforced against a live cost yet. Paid-execution approval cannot be enabled in this vertical slice — no approved paid provider exists.</p>
              </Card>
            </>
          )}

          {step === 4 && (
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
                  <input type="checkbox" checked={draft.exclusions.existingCustomerExclusion.requested} onChange={() => update((d) => { d.exclusions.existingCustomerExclusion.requested = !d.exclusions.existingCustomerExclusion.requested; })} />
                  Exclude matches against the existing-customer reference data
                </label>
                <p className={`text-[11px] mt-1 ${draft.exclusions.existingCustomerExclusion.ready ? "text-gray-400" : "text-amber-600"}`}>
                  {draft.exclusions.existingCustomerExclusion.ready
                    ? "Matching logic is real and the reference master is live."
                    : "NOT operational — matching logic is real, but the reference master is currently mock data (ISS-0001 unresolved). Requesting this does not suppress anything yet."}
                </p>
              </Card>

              <Card title="Commercial / brand / customer-suppression rule profiles">
                <Muted>Forward-looking only — these will reference VERSIONED profiles from a controlled TEMP-PIPELINE → permanent promotion pass (next P4 milestone). None are implemented in this vertical slice; this app never depends on scripts/lead-production or config/lead-production directly.</Muted>
                <dl className="text-xs mt-2 space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Commercial rule profile</dt><dd className="text-amber-600">{draft.exclusions.commercialRuleProfile.profile ? `${draft.exclusions.commercialRuleProfile.profile.id} (${draft.exclusions.commercialRuleProfile.profile.version})` : draft.exclusions.commercialRuleProfile.blockedReason}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Brand/group decision profile</dt><dd className="text-amber-600">{draft.exclusions.brandGroupDecisionProfile.profile ? `${draft.exclusions.brandGroupDecisionProfile.profile.id} (${draft.exclusions.brandGroupDecisionProfile.profile.version})` : draft.exclusions.brandGroupDecisionProfile.blockedReason}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Customer suppression profile</dt><dd className="text-amber-600">{draft.exclusions.customerSuppressionProfile.profile ? `${draft.exclusions.customerSuppressionProfile.profile.id} (${draft.exclusions.customerSuppressionProfile.profile.version})` : draft.exclusions.customerSuppressionProfile.blockedReason}</dd></div>
                </dl>
              </Card>

              <Card title="Manual exclusions">
                <TokenInput value={newManualExclusion} setValue={setNewManualExclusion} onAdd={addManualExclusion} tokens={draft.exclusions.manualExclusions} onRemove={removeManualExclusion} placeholder="Free-text manual exclusion note" />
                <div className="mt-3">
                  <Field label="Override policy">
                    <select className={inp} value={draft.exclusions.overridePolicy} onChange={(e) => update((d) => { d.exclusions.overridePolicy = e.target.value as any; })}>
                      <option value="none">None</option>
                      <option value="owner_ack_required">Owner acknowledgement required to override an exclusion</option>
                    </select>
                  </Field>
                </div>
              </Card>
            </>
          )}

          {step === 5 && (
            <Card title="Scoring profile">
              <Muted>A single, versioned, approved profile — no custom-weight editing in this vertical slice. Scoring stays deterministic and explainable.</Muted>
              <dl className="text-sm mt-2 space-y-1">
                <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="text-gray-900">{draft.scoringProfile.name}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Profile ID</dt><dd className="text-gray-900 font-mono text-xs">{draft.scoringProfile.profileId}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Version / source</dt><dd className="text-gray-900 font-mono text-xs">{draft.scoringProfile.version}</dd></div>
              </dl>
              <p className="text-xs text-gray-600 mt-2">{draft.scoringProfile.summary}</p>
            </Card>
          )}

          {step === 6 && (
            <Card title="Assignment policy">
              <Muted>Configures downstream assignment POLICY only. No individual lead is assigned during run creation — actual assignment happens after qualification/scoring.</Muted>
              <div className="space-y-1.5 mt-2">
                {(["manual_management_review", "territory_based", "telesales", "field_sales", "both"] as AssignmentPolicyId[]).map((policy) => {
                  const disabled = policy === "territory_based" && !draft.assignment.territoryBasedAvailable;
                  return (
                    <label key={policy} className={`flex items-start gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
                      <input type="radio" name="assignmentPolicy" className="mt-0.5" disabled={disabled} checked={draft.assignment.policy === policy} onChange={() => setAssignmentPolicy(policy)} />
                      <span>
                        {ASSIGNMENT_LABELS[policy]}
                        {policy === "manual_management_review" && <span className="text-gray-400"> — default</span>}
                        {disabled && <span className="text-amber-600"> — not currently available (no rep/territory assignment table wired to runs yet)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}

          {step === 7 && (
            <Card title="Requested outputs">
              <Muted>P4-APP selects requested output TYPES only. P4-EXPORTS owns the actual controlled schemas and generators — this app never rewrites CTO or Sales Pro field mappings.</Muted>
              <div className="space-y-1.5 mt-2">
                {draft.outputs.map((o) => (
                  <label key={o.type} className="flex items-start justify-between gap-2 text-sm">
                    <span className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5" checked={o.requested} disabled={o.type === "canonical_audit"} onChange={() => toggleOutput(o.type)} />
                      <span>{OUTPUT_LABELS[o.type]}{o.type === "canonical_audit" && <span className="text-gray-400"> — required</span>}</span>
                    </span>
                    <span className={o.ready ? "text-green-700 text-xs" : "text-amber-600 text-xs text-right max-w-[220px]"}>{o.ready ? "Ready" : o.blockedReason}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {step === STEP_REVIEW && (
            <>
              <Card title="Territory overlap — searching the same geography again is allowed">
                <p className="text-[11px] text-gray-400 mb-2">AspectLead allows the same geography to be searched more than once. Overlap is detected and disclosed here, not blocked — acknowledgement is only required when this run overlaps another run that is currently active.</p>
                {overlapCheckStatus === "checking" ? <p className="text-sm text-gray-500">Checking…</p>
                : overlapCheckStatus === "unavailable" ? (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Territory not yet resolved for this run — overlap has not been checked. Visit Geography and preview the territory, or click Refresh below.
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" className="text-xs underline" onClick={() => setStep(STEP_GEOGRAPHY)}>Go to Geography</button>
                      <button type="button" className="text-xs underline" onClick={() => refreshOverlaps()}>Refresh check</button>
                    </div>
                  </div>
                ) : overlapCheckStatus === "error" ? (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                    Could not verify territory overlap — the check itself failed, this is not "no overlap".
                    <button type="button" className="ml-2 text-xs underline" onClick={() => refreshOverlaps()}>Retry check</button>
                  </div>
                ) : overlapResult && overlapResult.overlaps.length > 0 ? (
                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-gray-500">
                          <th className="py-1 pr-2">Run</th><th className="py-1 pr-2">Owner</th><th className="py-1 pr-2">Source</th>
                          <th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Territory</th><th className="py-1 pr-2">Overlap</th>
                          <th className="py-1 pr-2">Units</th><th className="py-1 pr-2">Created</th><th className="py-1">Add'l cost</th>
                        </tr></thead>
                        <tbody>
                          {overlapResult.overlaps.map((o) => {
                            const active = ["queued", "running", "cancelling"].includes(o.status);
                            return (
                              <tr key={o.runId} className={`border-t border-gray-100 ${active ? "bg-amber-50" : ""}`}>
                                <td className="py-1 pr-2">{o.name}{o.reference && <span className="text-gray-400"> ({o.reference})</span>}</td>
                                <td className="py-1 pr-2">{o.ownerLabel}</td>
                                <td className="py-1 pr-2">{o.sourceMode ?? "—"}</td>
                                <td className="py-1 pr-2">{o.status}{active ? "" : " (history)"}</td>
                                <td className="py-1 pr-2">{o.territoryInput ?? "—"}</td>
                                <td className="py-1 pr-2">{o.overlapType}</td>
                                <td className="py-1 pr-2">{o.overlappingUnits.join(", ")}</td>
                                <td className="py-1 pr-2">{new Date(o.createdAt).toLocaleDateString("en-GB")}</td>
                                <td className="py-1">{o.estimatedAdditionalCostGbp == null ? "not available" : `£${o.estimatedAdditionalCostGbp.toFixed(2)}`}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {materialOverlap && (
                      <div className="mt-2 border-t border-gray-100 pt-2">
                        <label className="flex items-start gap-2 text-sm">
                          <input type="checkbox" className="mt-0.5" checked={!!draft.review.overlapAcknowledgement?.acknowledged}
                            onChange={(e) => update((d) => { d.review.overlapAcknowledgement = e.target.checked ? { acknowledged: true, note: overlapNote, disclosedOverlapRunIds: currentActiveOverlapRunIds, acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: [] } : null; })} />
                          I acknowledge this territory overlaps a currently active run and choose to proceed (recorded on the run).
                        </label>
                        {draft.review.overlapAcknowledgement?.acknowledged && (
                          <>
                            <input className={`${inp} mt-2`} value={overlapNote} onChange={(e) => { setOverlapNote(e.target.value); update((d) => { if (d.review.overlapAcknowledgement) d.review.overlapAcknowledgement.note = e.target.value; }); }} placeholder="Optional note (why this repeat/overlapping search is intended)" />
                            <p className="text-[11px] text-gray-400 mt-1">This records that you were shown the overlap above and chose to proceed — repeated/overlapping searches are a legitimate, permitted part of the product, not a restricted action.</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : <p className="text-sm text-green-700">No prior run on this territory yet — nothing to disclose.</p>}
              </Card>
              <Card title="Review">
                <dl className="text-xs space-y-1">
                  {summariseRunDraft(draft).map((s) => (
                    <div key={s.label} className="flex justify-between gap-2"><dt className="text-gray-500">{s.label}</dt><dd className="text-gray-900 text-right">{s.value}</dd></div>
                  ))}
                  <div className="flex justify-between gap-2"><dt className="text-gray-500">Anchors</dt><dd className="text-gray-900 text-right">{draft.anchors.length}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-gray-500">Provider(s)</dt><dd className="text-gray-900 text-right">{draft.sourceMode.selectedProviders.join(", ") || "none"}</dd></div>
                </dl>
                {!validation.ok && (
                  <div className="mt-2">{validation.errors.map((e) => <div key={e} className="text-xs text-red-600">● {e}</div>)}</div>
                )}
                {started ? (
                  <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                    Started — execution {started.status}, {started.completed}/{started.planned} postcode districts.
                    {" "}<a href="/pipeline-runs" className="underline">View in Main Runs</a>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy} className={btnGhost} onClick={saveDraft}>{busy ? "Saving…" : "Save draft"}</button>
                    <button disabled={busy || !canConfirm} className={canConfirm ? btn : btnDisabled} onClick={confirmAndStart}>{busy ? "Starting…" : "Confirm and start"}</button>
                  </div>
                )}
                {acknowledgementRequired && <p className="text-xs text-red-600 mt-1">Confirm is blocked — acknowledge the territory overlap above to proceed. Overlap itself is permitted; the acknowledgement is required evidence that you saw it.</p>}
                {overlapCheckRequired && !overlapVerified && overlapCheckStatus !== "checking" && <p className="text-xs text-red-600 mt-1">Confirm is blocked — territory overlap must be verified (see above) before this run can be queued.</p>}
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
