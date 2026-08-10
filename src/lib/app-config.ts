// Product vs tenant identity — SaaS-neutral. Tenant is configurable data, NOT hardcoded to
// Magna (or any other tenant) in this reusable config file. Server-only reads of
// process.env are safe here — this file is imported only by server components
// (TopHeader, Sidebar, layout metadata); nothing here is bundled to the client.

export const APP_NAME = "AspectLead";
export const APP_FULL_NAME = "AspectLead";

/** Tenant display name — priority order: (1) authenticated tenant/user context, when auth
 *  exists (it does not yet — no login/session system is implemented anywhere in this repo);
 *  (2) NEXT_PUBLIC_TENANT_NAME env var, set per-deployment (e.g. in Vercel project settings —
 *  never hardcoded here); (3) a clearly-labelled fallback, and ONLY for genuine local
 *  development (no VERCEL_ENV at all) — a deployed environment without the var set shows an
 *  honest "not configured" state rather than a fabricated tenant name. */
export function resolveTenantName(): string {
  const configured = process.env.NEXT_PUBLIC_TENANT_NAME;
  if (configured) return configured;
  const isLocalDev = !process.env.VERCEL_ENV; // VERCEL_ENV is only ever set on Vercel itself
  return isLocalDev ? "Local Development Tenant" : "Tenant not configured";
}
export const TENANT_NAME = resolveTenantName();

export type EnvironmentLabel = "Production" | "Preview" | "Development" | "Local Development";

/** Real environment, from Vercel's own automatically-injected VERCEL_ENV — never a hardcoded
 *  label. VERCEL_ENV is "production" | "preview" | "development" (Vercel's own dev proxy);
 *  absent entirely = running outside Vercel (local `npm run dev`). */
export function resolveEnvironmentLabel(): EnvironmentLabel {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "Production";
  if (vercelEnv === "preview") return "Preview";
  if (vercelEnv === "development") return "Development";
  return "Local Development";
}
export const ENVIRONMENT_LABEL = resolveEnvironmentLabel();

export type NavItem = { label: string; href: string };

// 2026-08-10 (P4 control addendum — national GB product, no reachable TW-only screen):
// "Coverage Map" now points at /national-map (the genuinely GB-wide map workbench) instead
// of the former /coverage-map, which is TW-specific and reads a single hardcoded local TW
// export file. "Export Review" removed from navigation entirely — it is likewise
// TW-specific with no national equivalent built yet; its route/code is left untouched
// (not deleted) for when a national successor replaces it. See docs/09_DECISIONS.md.
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Main Runs", href: "/pipeline-runs" },
  { label: "Discovery Runs", href: "/discovery-runs" },
  { label: "Discovery Results", href: "/discovery-results" },
  { label: "National Map", href: "/national-map" },
  { label: "Territories", href: "/territories" },
  { label: "Data-Quality Exceptions", href: "/data-quality-exceptions" },
  { label: "Audit / Evidence", href: "/audit" },
  { label: "Import", href: "/import" },
  { label: "Leads", href: "/leads" },
  { label: "Telesales", href: "/telesales" },
  { label: "Settings", href: "/settings" },
  { label: "Admin", href: "/admin" },
];
