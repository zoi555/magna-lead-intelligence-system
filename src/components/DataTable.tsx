"use client";

import React from "react";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

export type Column = {
  key: string;
  label: string;
  align?: "left" | "right";
  badge?: boolean;
};

export type TableFilter = { key: string; label: string; options: string[] };

type Row = Record<string, any>;

export function DataTable({
  columns,
  rows,
  searchKeys,
  searchPlaceholder = "Search…",
  filter,
  actionLabel = "View",
  emptyTitle = "Nothing to show",
  emptyHint,
}: {
  columns: Column[];
  rows: Row[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  filter?: TableFilter;
  actionLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const [q, setQ] = React.useState("");
  const [fval, setFval] = React.useState("All");
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const keys = searchKeys ?? columns.map((c) => c.key);
  const filtered = rows.filter((r) => {
    const matchQ =
      q.trim() === "" ||
      keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q.toLowerCase()));
    const matchF = !filter || fval === "All" || String(r[filter.key] ?? "") === fval;
    return matchQ && matchF;
  });

  return (
    <div className="rounded-card border border-bordergrey bg-card shadow-soft">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-bordergrey p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-56 rounded-btn border border-bordergrey px-3 py-1.5 text-[13px] outline-none focus:border-actionblue"
        />
        {filter && (
          <select
            value={fval}
            onChange={(e) => setFval(e.target.value)}
            className="rounded-btn border border-bordergrey px-2 py-1.5 text-[13px] outline-none focus:border-actionblue"
            aria-label={filter.label}
          >
            <option>All</option>
            {filter.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[12px] text-muted">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} hint={emptyHint} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="border-b border-bordergrey px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted"
                    style={{ textAlign: c.align ?? "left" }}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="border-b border-bordergrey px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <React.Fragment key={i}>
                  <tr className="hover:bg-[#fafbfc]">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className="border-b border-bordergrey px-3 py-2 text-ink"
                        style={{ textAlign: c.align ?? "left" }}
                      >
                        {c.badge ? <StatusBadge status={String(r[c.key])} /> : (r[c.key] as React.ReactNode)}
                      </td>
                    ))}
                    <td className="border-b border-bordergrey px-3 py-2 text-right">
                      <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="text-[13px] font-medium text-actionblue hover:text-actionhover"
                      >
                        {expanded === i ? "Hide" : actionLabel} {expanded === i ? "▲" : "→"}
                      </button>
                    </td>
                  </tr>
                  {expanded === i && (
                    <tr>
                      <td colSpan={columns.length + 1} className="border-b border-bordergrey bg-[#fafbfc] px-3 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 md:grid-cols-3">
                          {columns.map((c) => (
                            <div key={c.key} className="text-[12.5px]">
                              <span className="text-muted">{c.label}: </span>
                              <span className="text-ink">{String(r[c.key])}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
