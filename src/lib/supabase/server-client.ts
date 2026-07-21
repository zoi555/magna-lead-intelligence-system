// Server-side, session-scoped Supabase Auth client (cookie-backed, via @supabase/ssr).
// Uses only the anon key + the caller's own session cookies — RLS enforces what it can
// see/write, same as the browser client would. This is deliberately NOT the service-role
// client: settings writes and other session-driven mutations go through this client so
// row-level security is the real enforcement boundary, not an app-code check alone.
//
// Works for both Server Component rendering (setAll silently no-ops there — fine, since
// middleware refreshes the session on the next request) and Route Handlers / Server
// Actions (where next/headers' cookies().set() IS permitted, so real cookie writes — e.g.
// establishing a session in /auth/callback, or clearing one in /auth/signout — work here).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render — cookies can't be set there.
          }
        },
      },
    },
  );
}

/** Get the current authenticated user (or null) — the one call every protected server
 *  path/route should make before trusting anything about "who is asking." */
export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
