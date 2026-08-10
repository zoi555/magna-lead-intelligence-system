"use client";

// Cooperative cancellation control for the canonical run-detail screen. Calls the existing
// /api/discovery/executions/[id]/cancel route — no new cancellation logic, just a client
// affordance for what already exists server-side.

import React from "react";

export function CancelExecutionButton({ executionId, cancellable }: { executionId: string; cancellable: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  if (!cancellable) return null;

  async function cancel() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/discovery/executions/${executionId}/cancel`, { method: "POST" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to request cancellation");
      setMsg("Cancellation requested — the worker will stop on its next heartbeat (cooperative, not immediate).");
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        disabled={busy}
        onClick={cancel}
        className="rounded-btn border border-[#b91c1c] px-3 py-1.5 text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#FBE9E9] disabled:opacity-50"
      >
        {busy ? "Requesting…" : "Request cancellation"}
      </button>
      {msg && <p role="status" className="mt-1 text-[12px] text-muted">{msg}</p>}
    </div>
  );
}
