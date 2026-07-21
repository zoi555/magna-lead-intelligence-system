"use client";

// Login form — collects ONLY an email address. Never lets the client choose a role, an
// owner flag, or anything else; the server-side bootstrap decides role entirely from the
// verified session email against INITIAL_OWNER_EMAIL.

import React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function LoginForm() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (sendError) throw sendError;
      setSent(true);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-card border border-bordergrey bg-card p-4 text-[14px] text-ink shadow-soft">
        Check your email — we sent a sign-in link to <b>{email}</b>. Open it on this device to continue.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-card border border-bordergrey bg-card p-5 shadow-soft">
      <label className="block text-[13px] text-muted">
        Email address
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-btn border border-bordergrey px-3 py-2 text-[14px]"
          placeholder="you@example.com"
        />
      </label>
      {error && <p role="alert" className="text-[13px] text-[#b91c1c]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email}
        className="w-full rounded-btn bg-[#2563EB] px-3 py-2 text-[14px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
