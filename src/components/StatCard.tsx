import React from "react";

export function StatCard({
  label,
  value,
  trend,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  trend?: string;
  accent?: string; // optional hex for the number
}) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none" style={{ color: accent ?? "#111827" }}>
        {value}
      </div>
      {trend && <div className="mt-1 text-[12px] text-muted">{trend}</div>}
    </div>
  );
}
