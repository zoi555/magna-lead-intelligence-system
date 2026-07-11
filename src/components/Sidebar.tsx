"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, NAV_ITEMS } from "@/lib/app-config";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="flex w-[260px] shrink-0 flex-col bg-sidebar text-white"
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
        SaaS-neutral shell · mock data
      </div>
    </aside>
  );
}
