// Product vs tenant identity — SaaS-neutral. Tenant is configurable data, NOT hardcoded to Magna.
export const APP_NAME = "Lead Intelligence";
export const APP_FULL_NAME = "Lead Intelligence Platform";
export const TENANT_NAME = "Demo Company";

export const PROTOTYPE_NOTICE =
  "Prototype using mock data. No real customer data. No integrations connected.";

export type NavItem = { label: string; href: string };

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Coverage Map", href: "/coverage-map" },
  { label: "Territories", href: "/territories" },
  { label: "Pipeline Runs", href: "/pipeline-runs" },
  { label: "Discovery Results", href: "/discovery-results" },
  { label: "Leads", href: "/leads" },
  { label: "Telesales", href: "/telesales" },
  { label: "Export Review", href: "/export-review" },
  { label: "Settings", href: "/settings" },
  { label: "Admin", href: "/admin" },
];
