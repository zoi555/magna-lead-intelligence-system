import React from "react";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-bordergrey bg-card px-6 py-12 text-center">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: "#EEF1F5", color: "#64748B", fontWeight: 700 }}
      >
        —
      </div>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-md text-[13px] text-muted">{hint}</div>}
    </div>
  );
}
