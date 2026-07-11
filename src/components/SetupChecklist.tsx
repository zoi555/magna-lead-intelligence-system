import React from "react";
import { StatusBadge } from "./StatusBadge";

type Item = { id: string; label: string; owner: string; status: string };

export function SetupChecklist({ items }: { items: Item[] }) {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Blocked setup items</h2>
        <span className="text-[12px] text-muted">Resolve before real runs</span>
      </div>
      <ul className="divide-y divide-bordergrey">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">
                <span className="text-muted">{it.id}</span> · {it.label}
              </div>
              <div className="text-[12px] text-muted">Owner: {it.owner}</div>
            </div>
            <StatusBadge status={it.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
