"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, NAV_ITEMS } from "@/lib/app-config";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the mobile drawer whenever the route changes (link click, back/forward).
  React.useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed left-3 top-3 z-40 rounded-md bg-sidebar px-2.5 py-2 text-[16px] text-white shadow-soft md:hidden"
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[260px] shrink-0 flex-col overflow-y-auto bg-sidebar text-white transition-transform duration-200 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ minHeight: "100vh" }}
      >
        {/* Product brand (NOT tenant) */}
        <div className="flex items-center gap-2 px-5 py-4">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold"
            style={{ background: "#2563EB" }}
          >
            LI
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <nav className="flex-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="mb-0.5 flex items-center gap-2 rounded-md px-3 py-2 text-[13.5px] transition-colors"
                style={{
                  background: active ? "#1f2a3b" : "transparent",
                  color: active ? "#ffffff" : "#cbd2dc",
                  borderLeft: active ? "3px solid #2563EB" : "3px solid transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-3 text-[11px]" style={{ color: "#8b93a1" }}>
          Internal beta · Just Eat live
        </div>
      </aside>
    </>
  );
}
