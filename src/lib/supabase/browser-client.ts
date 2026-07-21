"use client";

// Browser-side Supabase Auth client (cookie-backed session, via @supabase/ssr). Uses only
// the anon key — never the service-role key. Distinct from the service-role client in
// src/lib/discovery-engine/supabase-client.ts, which must never run in the browser.

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
