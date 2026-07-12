"use client";

import React from "react";
import type { MapPoint } from "./types";

export type Selection =
  | { kind: "feature"; code: string; points: MapPoint[] }
  | { kind: "point"; point: MapPoint }
  | null;

export function MapSidePanel({ selection }: { selection: Selection }) {
  if (!selection) {
    return (
      <div className="rounded-card border border-bordergrey bg-card p-4 text-[13px] text-muted shadow-soft">
        Click a territory or a point on the map to see details. Scroll to zoom, drag to pan.
      </div>
    );
  }
  if (selection.kind === "point") return <PointDetail point={selection.point} />;
  return <FeatureDetail code={selection.code} points={selection.points} />;
}

function FeatureDetail({ code, points }: { code: string; points: MapPoint[] }) {
  const grade: Record<string, number> = {};
  const cats: Record<string, number> = {};
  const exp: Record<string, number> = {};
  let platformUnknown = 0, missingPhone = 0;
  points.forEach((p) => {
    const g = String(p.meta?.grade ?? "—"); grade[g] = (grade[g] ?? 0) + 1;
    const c = String(p.meta?.category ?? "—"); cats[c] = (cats[c] ?? 0) + 1;
    const e = String(p.meta?.export_status ?? "—"); exp[e] = (exp[e] ?? 0) + 1;
    if (/unknown|manual_review/.test(String(p.meta?.platform ?? ""))) platformUnknown++;
    if (String(p.meta?.phone_present ?? "no") === "no") missingPhone++;
  });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{code}</h3>
        <span className="font-mono text-[13px] text-muted">{points.length} leads</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
        {(["A", "B", "C", "D"] as const).map((g) => (
          <span key={g} className="rounded border border-bordergrey px-1.5 py-0.5 font-mono">{g}: {grade[g] ?? 0}</span>
        ))}
      </div>
      <dl className="mt-3 text-[12.5px]">
        <KV k="Top categories" v={topCats.map(([c, n]) => `${c} (${n})`).join(", ") || "—"} />
        <KV k="Platform unknown" v={String(platformUnknown)} />
        <KV k="Missing phone" v={String(missingPhone)} />
        <KV k="Export-eligible / manual-review" v={`${exp["ready_for_review"] ?? 0} / ${exp["manual_review"] ?? 0}`} />
      </dl>
      <div className="mt-3 max-h-40 overflow-y-auto">
        {points.slice(0, 20).map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-bordergrey py-1 text-[12.5px]">
            <span className="truncate text-ink">{p.label}</span>
            <span className="ml-2 shrink-0 font-mono text-muted">{String(p.meta?.grade ?? "")} · {p.postcode}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PointDetail({ point }: { point: MapPoint }) {
  const m = point.meta ?? {};
  const badges: { label: string; tone: string }[] = [];
  if (/unknown|manual_review/.test(String(m.platform ?? ""))) badges.push({ label: "delivery unverified", tone: "#b45309" });
  if (String(m.phone_present ?? "no") === "no") badges.push({ label: "no phone", tone: "#b45309" });
  if (String(m.export_status ?? "") === "manual_review") badges.push({ label: "manual review", tone: "#b45309" });
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{point.label}</h3>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: point.color, display: "inline-block" }} />
      </div>
      <dl className="mt-3 text-[13px]">
        <KV k="Postcode" v={point.postcode} mono />
        <KV k="Category" v={String(m.category ?? "—")} />
        <KV k="Grade" v={String(m.grade ?? "—")} />
        <KV k="Phone present" v={String(m.phone_present ?? "no")} />
        <KV k="Platform status" v={String(m.platform ?? "—")} />
        <KV k="Export status" v={String(m.export_status ?? "—")} />
        <KV k="Trigger" v={String(m.trigger ?? "—")} />
        <KV k="Coordinates" v={`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`} mono />
      </dl>
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span key={b.label} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: b.tone, background: b.tone + "18", border: `1px solid ${b.tone}33` }}>{b.label}</span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">Grade is a coarse band; internal score and reasons are not shown here.</p>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-bordergrey py-1.5">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className={`text-right ${mono ? "font-mono" : ""} text-ink`}>{v}</dd>
    </div>
  );
}
