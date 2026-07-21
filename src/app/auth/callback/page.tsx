"use client";

// Auth callback — handles BOTH Supabase Auth flow shapes so it works whichever the
// project is configured for:
//   - PKCE: redirected here with ?code=... — exchangeCodeForSession does the rest.
//   - Implicit (what supabase.auth.admin.generateLink() produces, since there's no prior
//     client-side PKCE verifier for an admin-generated link): redirected with
//     #access_token=...&refresh_token=... in the URL fragment, which only client-side JS
//     can read — setSession() picks it up.
// Either way, once a session exists, POSTs to /api/auth/bootstrap (server-side: records
// the sign-in, attempts the owner bootstrap) then redirects to `next` or `/`.

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = React.useState("Signing you in…");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      try {
        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError) throw exchangeError;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error: setError2 } = await supabase.auth.setSession({ access_token, refresh_token });
            if (setError2) throw setError2;
          } else {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw new Error("No sign-in code or token found in the callback URL.");
          }
        }

        if (cancelled) return;
        setStatus("Finalising your account…");
        const res = await fetch("/api/auth/bootstrap", { method: "POST" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Could not finalise sign-in");

        if (cancelled) return;
        const next = params.get("next") || "/";
        router.replace(next);
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => { cancelled = true; };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4">
      <div className="w-full max-w-sm rounded-card border border-bordergrey bg-card p-5 text-center shadow-soft">
        {error ? (
          <>
            <p role="alert" className="text-[14px] text-[#b91c1c]">{error}</p>
            <a href="/login" className="mt-3 inline-block text-[13px] text-actionblue underline">Back to sign in</a>
          </>
        ) : (
          <p className="text-[14px] text-ink">{status}</p>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <CallbackInner />
    </React.Suspense>
  );
}
