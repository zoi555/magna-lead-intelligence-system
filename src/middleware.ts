// Route protection (Stage 2 — added only after the owner login/bootstrap flow was proven
// with a real browser session, per docs/09_DECISIONS.md). Refreshes the Supabase session
// cookie on every matched request and redirects to /login when there's no session.
//
// The matcher excludes /login, /auth/* (callback/signout), /api/* (every sensitive API
// route independently checks its own session via requireSessionAndRole — defence in
// depth, not "the page protects the API"), static assets, and public map tile assets.
// Everything else — including every one of the 15 required routes and every other page
// in the app — requires a session. "Protect at minimum" the 15 is read broadly here:
// nothing is left accidentally public.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|login|auth|api|map/).*)"],
};
