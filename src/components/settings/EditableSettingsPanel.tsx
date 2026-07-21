"use client";

// Real, persisted, audited settings — replaces the old static SETTINGS_DEFAULTS
// read-only panel. Fetches/patches /api/settings, which enforces owner/admin write
// access via RLS (not just this component hiding the form). Any tenant member can view;
// only owner/admin can edit.

import React from "react";

interface TenantSettings {
  tenant_id: string;
  display_name: string | null;
  default_spend_ceiling_gbp: number | null;
  default_sources: string[];
  data_retention_days: number | null;
  import_defaults: { defaultFormat: string; requireChecksumMatch: boolean };
  export_defaults: { defaultFormat: string; includeUnverifiedFields: boolean };
  default_territory_behaviour: string;
  default_existing_customer_exclusion: boolean;
  updated_at: string;
  updated_by: string | null;
}
interface SourceSetting { source_id: string; enabled: boolean; updated_at: string }
interface AuditRow { id: string; action: string; actor_email: string | null; target_table: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string }

export function EditableSettingsPanel() {
  const [role, setRole] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<TenantSettings | null>(null);
  const [sources, setSources] = React.useState<SourceSetting[]>([]);
  const [audit, setAudit] = React.useState<AuditRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => {
      if (!j.ok) { setError(j.error ?? "Failed to load settings"); return; }
      setRole(j.role); setSettings(j.settings); setSources(j.sources); setAudit(j.recentAudit ?? []);
    }).catch((e) => setError(String(e)));
  }, []);
  React.useEffect(load, [load]);

  if (error) return <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft text-[13px] text-[#b91c1c]">{error}</div>;
  if (!settings) return <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft text-[13px] text-muted">Loading settings…</div>;

  const canEdit = role === "owner" || role === "admin";
  const update = (patch: Partial<TenantSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            display_name: settings.display_name,
            default_spend_ceiling_gbp: settings.default_spend_ceiling_gbp,
            data_retention_days: settings.data_retention_days,
            default_existing_customer_exclusion: settings.default_existing_customer_exclusion,
          },
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      setSaved(true);
      load();
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  };

  const toggleSource = async (sourceId: string, enabled: boolean) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: [{ source_id: sourceId, enabled }] }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      load();
    } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
          <span className="text-[11px] text-muted">Your role: {role ?? "—"}{!canEdit && " (read-only)"}</span>
        </div>
        <p className="mb-3 text-[12.5px] text-muted">
          Persisted, audited, owner/admin-editable. Per-run territory, anchors, provider and spend
          belong to each run, set in <a href="/pipeline-runs/new" className="text-actionblue hover:text-actionhover">Create New Run</a>, never here.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-[12px] text-muted">Tenant display name
            <input disabled={!canEdit} className="mt-1 w-full rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] disabled:bg-[#F5F7FA]"
              value={settings.display_name ?? ""} placeholder="(falls back to environment default)"
              onChange={(e) => update({ display_name: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted">Default spend ceiling (£)
            <input disabled={!canEdit} type="number" min="0" className="mt-1 w-full rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] disabled:bg-[#F5F7FA]"
              value={settings.default_spend_ceiling_gbp ?? ""} placeholder="none set"
              onChange={(e) => update({ default_spend_ceiling_gbp: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="text-[12px] text-muted">Data retention (days)
            <input disabled={!canEdit} type="number" min="1" className="mt-1 w-full rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] disabled:bg-[#F5F7FA]"
              value={settings.data_retention_days ?? ""} placeholder="no policy set"
              onChange={(e) => update({ data_retention_days: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-muted pt-5">
            <input disabled={!canEdit} type="checkbox" checked={settings.default_existing_customer_exclusion}
              onChange={(e) => update({ default_existing_customer_exclusion: e.target.checked })} />
            Default existing-customer exclusion
          </label>
        </div>
        {canEdit && (
          <div className="mt-3 flex items-center gap-2">
            <button disabled={busy} onClick={save} className="rounded-btn bg-[#2563EB] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
              {busy ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="text-[12px] text-[#137a3b]">Saved.</span>}
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[12px] text-[#b91c1c]">{error}</p>}
      </div>

      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Source enablement (operational)</h2>
        <p className="mb-2 text-[12.5px] text-muted">Technical capability is code-defined and cannot be changed here — this only toggles whether a technically-supported source is switched on.</p>
        <ul className="space-y-1.5">
          {sources.map((s) => (
            <li key={s.source_id} className="flex items-center justify-between text-[13px]">
              <span className="text-ink">{s.source_id}</span>
              <label className="flex items-center gap-2">
                <input disabled={!canEdit} type="checkbox" checked={s.enabled} onChange={(e) => toggleSource(s.source_id, e.target.checked)} />
                <span className="text-[12px] text-muted">{s.enabled ? "enabled" : "disabled"}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Recent settings changes (audit)</h2>
        {audit.length === 0 ? <p className="text-[13px] text-muted">No changes recorded yet.</p> : (
          <ul className="divide-y divide-bordergrey text-[12.5px]">
            {audit.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="text-ink">{a.target_table}</span> changed by <span className="text-ink">{a.actor_email ?? "unknown"}</span>
                <span className="text-muted"> · {new Date(a.created_at).toLocaleString("en-GB")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
