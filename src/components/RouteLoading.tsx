import React from "react";

export function RouteLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-card border border-bordergrey bg-card p-12 text-[13px] text-muted shadow-soft">
      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-bordergrey border-t-actionblue" />
      {label}
    </div>
  );
}
