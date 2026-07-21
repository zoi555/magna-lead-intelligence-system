"use client";

import React from "react";

// Next.js App Router error boundaries must be client components.
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-card border p-4 text-[13px]" style={{ background: "#FBE9E9", borderColor: "#f2c1c1", color: "#7a1f1f" }}>
      <p className="font-semibold">Something went wrong loading this screen.</p>
      <p className="mt-1 text-[12.5px]">{error.message || "Unknown error"}</p>
      <button
        onClick={() => reset()}
        className="mt-3 rounded-btn border border-bordergrey bg-card px-3 py-1.5 text-[12.5px] text-ink hover:bg-[#fafbfc]"
      >
        Try again
      </button>
    </div>
  );
}
