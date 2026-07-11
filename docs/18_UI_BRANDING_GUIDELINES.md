# UI & Branding Guidelines — Lead Intelligence Platform

> **STATUS: DESIGN DIRECTION ONLY — not built, not implemented, not deployed. No app shell yet.**
> SaaS-neutral visual direction for a future product. **"Magna" is NOT the product brand** —
> Magna Foodservice is only the first internal tenant/customer example. Colour, typography, and
> layout tokens below are **fixed**; the future app shell must use them exactly.

## 1. Product naming

- **Working product name:** **Lead Intelligence Platform**
- **Short UI name:** **Lead Intelligence** (top bar, tab title, compact contexts)
- Neutral, SaaS-ready, sellable across industries. Never put "Magna" in the product name, UI
  chrome, colour palette, domain, or product identity.
- Magna may appear only as the first tenant, or as example/mock data.

## 2. Tenant / customer model

**Product branding and tenant branding are separate.** The chrome is always "Lead Intelligence";
the tenant is data. The app should later support:

- **Product name:** Lead Intelligence (constant — `APP_NAME`)
- **Tenant name:** configurable (`TENANT_NAME`)
- **Tenant logo:** configurable later
- **Tenant accent colour:** configurable later (constrained to accessible values; must not change
  status or map semantics)
- **Custom domains:** later

MVP is single-tenant in the data model (ADR-0012), but the UI must already treat tenant identity as
config so multi-tenant/white-label is a config change, not a rebrand.

## 3. Future domain plan (placeholders only)

- **Do not** use `magnafoodservice.co.uk` (or `leads.magnafoodservice.co.uk`) as the product domain.
- Future SaaS domain is **undecided**. Placeholder patterns only:
  - `app.[future-saas-domain].com` — main app
  - `[tenant].[future-saas-domain].com` — per-tenant subdomain
  - customer custom domains later
- Domain / trademark / social-handle checks are **future work**.

## 4. Design style

- SaaS business-intelligence dashboard / **sales operations control centre**.
- Professional, clean, fast, serious; clear enough for non-technical users; suitable for multiple
  industries later.
- **Not** ecommerce, **not** playful, **not** public-marketing style, **not** Magna-branded.

## 5. Fixed colour system (use exactly)

| Token | Hex | Use |
|---|---|---|
| Page background | `#F6F8FB` | app background |
| Card background | `#FFFFFF` | cards, panels, tables |
| Sidebar / nav primary | `#111827` | sidebar, nav |
| Header text | `#1F2937` | headers |
| Main action blue | `#2563EB` | primary buttons, links, primary actions |
| Action hover blue | `#3B82F6` | primary hover/active |
| Intelligence purple | `#7C3AED` | intelligence/analytics emphasis, saturated coverage |
| Analytics cyan | `#0891B2` | analytics highlights |
| Border grey | `#E5E7EB` | 1px borders |
| Main text | `#111827` | body text |
| Muted text | `#6B7280` | secondary text, labels |
| Success green | `#16A34A` | success/complete |
| Warning amber | `#F59E0B` | warnings |
| Danger red | `#DC2626` | destructive/blocked (rare) |
| Neutral slate | `#64748B` | neutral/draft |

## 6. Map colours (fixed — blue→purple ramp, consistent with the accepted map POC)

| Token | Hex | Use |
|---|---|---|
| Coverage low | `#DBEAFE` | 1× targeted |
| Coverage medium | `#93C5FD` | 2–3× targeted |
| Coverage high | `#2563EB` | 4× targeted |
| Coverage saturated | `#7C3AED` | 5+× targeted |
| Delivery gaps | `#F59E0B` | in-delivery, not-yet-targeted (amber) |
| Expansion areas | `#8B5CF6` (dashed) | expansion (purple, dashed outline) |
| Roads | `#334155` | motorways / main roads |
| A roads | `#16A34A` (muted) | A roads |
| Map background | `#F3F4F6` | neutral basemap-less background |

> Selected / hover map states **reuse fixed tokens** (do not invent colours): hover outline
> `#111827`; selected polygon / current territory outline `#2563EB`. Uncovered areas render as a
> light dashed neutral. Legends must label every band.

## 7. Typography

- **Font:** **Inter**. Fallback: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **Scale:**
  - Page title — 28–32px, 700
  - Section heading — 18–20px, 600
  - Card title — 14–16px, 600
  - Body — 14px, 400
  - Table text — 13–14px, 400
  - Badge — 12px, 600
- UK English in copy. Tabular figures in tables where available.

## 8. Layout

- **Left sidebar: 260px.** Main content padding: **24px.** Page header at the top of each page.
- **Card radius: 12px. Button radius: 8px. Border: 1px `#E5E7EB`.**
- **Very light shadows only.** No heavy gradients, no glassmorphism, no cartoon styling.
- **No giant marketing hero sections inside the app.**
- Content dense but readable; tables/maps may go full-width inside an `overflow-x:auto` container
  (page body never scrolls horizontally).

## 9. Navigation (sidebar items)

Sidebar (`#111827`), grouped where helpful, role-aware (hide/disable what a role can't access):

- Overview
- Coverage Map
- Territories
- Pipeline Runs
- Leads
- Telesales
- Export Review
- Settings
- Admin

Active item: `#2563EB` left indicator + slightly lighter row. Tenant name + user role shown in the
account area (from config, never hardcoded).

## 10. Usability rules

Every page must clearly answer:
1. **What is happening?**
2. **What needs attention?**
3. **What should the user do next?**

## 11. Dashboard (Overview) must show

- latest run status
- coverage progress
- delivery gaps
- new leads
- export-ready leads
- telesales workload
- blocked setup items (e.g. ISS-0001/0002/0003)

## 12. Tables must have

- a search placeholder
- filters
- status badges
- clear **empty states**
- an action column
- a row-detail affordance (open/expand)

Table style: `#FFFFFF` background, header on a light fill with 12px muted labels, `1px #E5E7EB`
cell borders, row hover, sticky header for long tables. Left-align text, right-align numbers.

## 13. Prototype banner

Every mock-data page shows a slim top banner (neutral/slate, non-dismissible on reload):

> **"Prototype using mock data. No real customer data. No integrations connected."**

Never label a screen live/verified/operational unless it genuinely is.

## 14. Component rules

**Buttons**
- **Primary:** `#2563EB` background, white text (hover `#3B82F6`).
- **Secondary:** white with `#E5E7EB` border, `#111827` text.
- **Danger:** `#DC2626` — rare, for irreversible/blocking actions only.
- **Ghost:** text only.
- Disabled buttons show *why* (tooltip/hint) — matches the gate/blocker pattern.

**Cards**
- White background, soft `#E5E7EB` border, **12px radius**, very light shadow.
- Large metric number (`#111827`), muted label (`#6B7280`), subtle trend text.

## 15. Badges / status

| State | Colour |
|---|---|
| Complete | green `#16A34A` |
| Running | blue `#2563EB` |
| Draft | slate `#64748B` |
| Blocked | red `#DC2626` |
| Warning | amber `#F59E0B` |
| Exported | purple `#7C3AED` |
| Mock | slate outline (`#64748B` border, no fill) |

12px / 600, small radius, subtle border. Always include a text label — never colour alone.

## 16. Accessibility

- **≥ 4.5:1 contrast** for body text.
- **Do not rely on colour alone** for statuses (add text/icon; label every map band).
- **Focus states must be visible** (clear 2px focus ring on all interactive elements).
- Tables readable at **13–14px minimum**.
- Buttons must have **clear labels**; avoid tiny low-contrast text; respect keyboard navigation.

## 17. Claude implementation rules (for the future app shell)

- **Do not invent a new colour palette. Use these tokens exactly.**
- **Do not hardcode the tenant name as "Magna".** Use `APP_NAME` and `TENANT_NAME` constants;
  tenant name/logo/accent come from config.
- Keep all mock data **clearly labelled** (prototype banner + "Mock" badges).
- No random gradients, oversized cards, or generic SaaS hero styling.
- Keep the dashboard **dense but readable**; prioritise **usability over decoration**.
- Expose the tokens as CSS custom properties / theme config; components read tokens, never raw hex.
- Role-aware UI (owner/admin/management/telesales) consistent with the RLS model; self-contained
  map per the accepted POC (no external tiles/glyphs/paid services).
- This is guidance for a **future** shell — **no app code, package.json, or framework set up now.**

## 18. Future white-label / tenant branding

- Tenant config later: `{ TENANT_NAME, logo_url?, accent_override?, subdomain }`, with
  `accent_override` constrained to accessible values.
- Tenant branding affects the **account area and optional accent only** — never status or map
  colours, which must read identically across tenants for trust.
- Per-tenant subdomains first, custom domains later; all placeholders until the SaaS domain is chosen.
- An un-branded tenant must still look like a finished, professional product.
