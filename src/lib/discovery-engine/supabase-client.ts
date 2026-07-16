// Supabase client factories.
//
// - createServiceClient(): SERVER-SIDE ONLY. Uses the service-role key, bypasses RLS,
//   used by the worker and server route handlers. Throws if ever imported into the
//   browser bundle, so a service credential can never reach the client.
// - createAnonClient(): browser-safe, uses the publishable/anon key + user session; all
//   access is constrained by RLS. (Used once auth is wired into the client.)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

let serviceSingleton: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServiceClient() must never run in the browser — service-role key is server-only");
  }
  if (serviceSingleton) return serviceSingleton;
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  serviceSingleton = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceSingleton;
}

export function hasServiceCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAnonClient(accessToken?: string): SupabaseClient {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}
