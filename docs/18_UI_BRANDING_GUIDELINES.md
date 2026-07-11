# UI & Branding Guidelines — Lead Intelligence Platform

> **STATUS: DESIGN DIRECTION ONLY — not a built app.** Nothing here is implemented, applied,
> deployed, or production-ready. This document defines the SaaS-neutral visual direction for the
> future app shell. **"Magna" is not the product brand** — it is only the first internal
> tenant/example.

## 1. SaaS product naming

- **Working product name:** **Lead Intelligence Platform**
- **Short UI name:** **Lead Intelligence** (top bar / tab title / compact contexts)
- The product brand stays **neutral and SaaS-ready** — sellable to multiple industries.
- **Do not** put "Magna" in the product name, logo, colour system, domain, or UI identity.
- Magna Foodservice may appear **only** as the first internal tenant, or as an example dataset —
  never as the app's brand.
- Tenant/company name is **configurable** (see §2, §18); the shell must render it from config, not
  hardcode it.

## 2. Tenant / customer branding model

- **Single product brand, many tenants.** The app chrome is "Lead Intelligence"; each tenant has a
  configurable **display name** (e.g. "Magna Foodservice") shown in the tenant switcher / account
  area — not in the product logo.
- MVP is single-tenant in the data model (ADR-0012), but the **UI must already treat the tenant name
  as data**, so multi-tenant/white-label is a later config change, not a rebrand.
- Tenant-configurable later (constrained): display name, logo, optional single accent override
  (within the accessible palette). Core neutrals, status colours, and map colours stay fixed.

## 3. Future domain plan (placeholders only)

- **Do not** use `leads.magnafoodservice.co.uk` as the product domain — that is a tenant URL at
  most, not the product.
- The future SaaS domain is **undecided**. Use placeholders in code/docs:
  - `app.[future-saas-domain].com` — main app
  - `[tenant].[future-saas-domain].com` — per-tenant subdomain
  - custom customer domains later if needed
- Domain purchase, trademark, and social-handle checks are **future work** — not done here.

## 4. Colour tokens (suggested hex)

Neutral SaaS palette. Coverage-map colours are held **consistent with the accepted map POC**
(ADR-0011). These are design tokens — the shell should expose them as CSS variables / theme tokens.

### Core
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f4f6f8` | app background (light grey / off-white) |
| `--surface` | `#ffffff` | cards, panels, tables |
| `--surface-2` | `#f0f3f5` | subtle fills, table header |
| `--border` | `#d9dee3` | soft grey borders |
| `--ink` | `#1f2933` | primary text |
| `--ink-muted` | `#5b6670` | secondary text |
| `--primary` | `#22303f` | deep navy/charcoal — sidebar, top bar, headings |
| `--primary-ink` | `#ffffff` | text on primary |
| `--accent` | `#2b6cb0` | modern blue — primary buttons, links, focus |
| `--accent-hover` | `#245c98` | accent hover/active |
| `--accent-quiet` | `#e8f0f8` | accent tint (selected rows, chips) |

> The accent is a **neutral blue**, deliberately not tied to Magna. A controlled red may be used
> for destructive actions only (see danger), never as the brand accent.

### Status
| Token | Text | Background | Use |
|---|---|---|---|
| `--success` / `--success-bg` | `#2f7d4f` | `#e6f2ea` | verified, complete, ok |
| `--warning` / `--warning-bg` | `#8a6100` | `#fbf1d9` | pending, needs attention |
| `--danger` / `--danger-bg` | `#9a3030` | `#f7e3e3` | blocked, error, destructive |
| `--info` / `--info-bg` | `#3a53a4` | `#e7e8f5` | informational, neutral map notes |

### Map (consistent with map POC — ADR-0011)
| Token | Value | Use |
|---|---|---|
| coverage ramp (1→5+) | `rgba(84,120,205,.32)` → `rgba(98,96,196,.44)` → `rgba(118,74,186,.56)` → `rgba(138,58,176,.68)` → `rgba(156,42,166,.82)` | **blue → purple** coverage shading |
| `--map-uncovered` | `#eef1f4` (dashed) | not-yet-targeted |
| `--map-gap` | `rgba(232,150,25,.42)` | **amber** remaining delivery gaps |
| `--map-delivery-line` / `--map-delivery-fill` | `#2b6cb0` / `rgba(38,96,180,.10)` | delivery boundary (blue outline + light-blue fill) |
| `--map-expansion` | `#6a4a9a` (dashed) | **purple** expansion areas |
| `--map-current` / selected | `#c85a00` | current territory set / selected polygon (orange) |
| `--map-hover` | `#111111` | strong hover outline |
| `--map-motorway` / `--map-aroad` | `#123c66` / `#3a9e63` | motorways (dark blue) / A roads (green, less dominant) |
| map background | `#f2f5f6` | neutral basemap-less background |

## 5. Typography

- **Font:** a neutral SaaS sans — **Inter** (or system stack fallback):
  `Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- **Scale (rem):** body 0.875 (14px), small 0.75 (12px), h3/section 0.875 uppercase-muted, h2 1rem,
  h1 1.125–1.25rem. Line-height 1.4–1.5.
- **Weights:** 400 body, 600 headings/labels, 700 emphasis. Avoid heavy display weights.
- Numerals in tables should use tabular figures where available.
- Tone: serious, precise, plain English (UK English in copy).

## 6. Layout rules

- **Spacing base 4px** (4/8/12/16/24/32). Consistent gutters.
- **App frame:** fixed left sidebar (240px) + top bar (48–56px) + scrollable content.
- Content max-width for reading/config screens (~1200–1360px); tables/maps may go full width inside
  an `overflow-x:auto` container (never let the page scroll horizontally).
- One primary action per view; secondary actions grouped right.
- Density: comfortable but information-dense (this is an ops tool, not marketing).

## 7. Sidebar / navigation style

- **Deep navy (`--primary`) sidebar**, white/late-grey text, grouped sections with small uppercase
  muted group labels.
- Active item: left accent bar (`--accent`) + slightly lighter row; hover: subtle row highlight.
- Role-aware: items the current role can't access are hidden or shown disabled (matches RLS model).
- Tenant/account area at the bottom or top: tenant display name + user role.

## 8. Dashboard card style

- White `--surface`, `1px --border`, radius 6–8px, optional very subtle shadow
  (`0 1px 2px rgba(0,0,0,.04)`).
- KPI tile: big number (`--ink`), small muted label; clickable tiles get a hover state and a
  "→" affordance.
- Group related cards; keep 3–5 KPIs per row on wide screens.
- Never use colour alone to convey a KPI's meaning — pair with a label.

## 9. Table style

- `--surface` background, header `--surface-2` with 12px uppercase muted labels, `1px --border`
  cell borders, optional zebra (`#fafbfc`).
- Left-align text, right-align numeric; status shown as chips (see §12).
- Row hover highlight; sticky header for long tables; horizontal scroll inside the table container.
- Dense padding (6–9px) suited to ops review.

## 10. Form / input style

- Label above input, 12px muted. Inputs: white, `1px --border` (→ `--accent` on focus with a
  2px focus ring), radius 4–6px, 6–8px padding.
- Validation: inline message + `--danger` border; never rely on colour alone (add text/icon).
- Group destructive/irreversible actions and confirm them (matches the "manual review gate" ethos).

## 11. Button style

- **Primary:** solid `--accent`, white text, hover `--accent-hover`.
- **Secondary:** white with `--border`, `--ink` text.
- **Destructive:** solid or outline `--danger` — used only for irreversible/blocking actions.
- **Disabled:** greyed, `not-allowed`; disabled primary actions must show *why* (tooltip/hint),
  matching the blocker/gate pattern (e.g. export disabled until ISS-0003).
- Sizes: default (32–36px) and small; consistent radius with inputs.

## 12. Badge / status colours

Use the status tokens (§4) as chips with rounded corners, small text, subtle border:
- **Success** — verified / complete / exported-ok.
- **Warning** — pending / ready-for-review / needs contact.
- **Danger** — blocked / active-customer-match / do-not-contact.
- **Info** — neutral state / informational.
Always include a text label; icons optional. Do not invent new status hues per screen.

## 13. Map UI style

- Reuse the map POC tokens (§4). Neutral background; **blue→purple** coverage ramp; **amber** gaps;
  **purple** expansion; delivery boundary as **blue outline + light-blue fill**; **orange** current
  set/selected; **black** hover outline; motorways dark blue, A roads green (less dominant).
- Controls panel: white card, grouped controls (granularity, colour-by, filters, layer toggles,
  A-road display mode), a legend, and a planning summary panel.
- Road-number labels via HTML markers (self-contained; no external glyphs/tiles), per the accepted
  POC. No Google Maps, no paid hosted tiles.
- A "mock/placeholder data" note stays visible while data is illustrative.

## 14. Prototype / mock-data banner style

- A slim top banner across any screen showing non-real data:
  **info** style (`--info` on `--info-bg`) or **warning** for stronger caution.
- Copy pattern: *"Prototype — illustrative/mock data. Not operational."*
- Must be dismissible per session but reappear on reload; never hide the fact that data is not real.
- Never label a screen "live"/"verified"/"operational" unless it genuinely is.

## 15. Accessibility basics

- **Contrast:** meet WCAG AA (≥4.5:1 body text, ≥3:1 large text/UI). Check accent/status on their
  backgrounds.
- **Never colour alone:** every status/coverage signal also carries text or an icon (colour-blind
  safe). Map legends label every band.
- **Focus visible:** clear 2px focus ring on all interactive elements; full keyboard navigation.
- **Hit targets:** ≥32px. Respect `prefers-reduced-motion`. Label all form controls and icon buttons.
- Support light theme first; if a dark theme is added, keep both accessible.

## 16. Do / don't

**Do**
- Keep the brand neutral, professional, fast, serious.
- Treat tenant name/logo as configurable data.
- Reuse the fixed status + map palettes everywhere.
- Show *why* an action is disabled (gates/blockers).

**Don't**
- Don't use "Magna" in product name, logo, colours, domain, or chrome.
- Don't use ecommerce, playful, or public-marketing styling.
- Don't hardcode a tenant, domain, or per-customer colour into the core.
- Don't convey meaning by colour alone.
- Don't imply anything is live/verified/operational when it isn't.

## 17. How the Next.js app shell should apply these rules

- **Theme tokens:** expose §4 as CSS custom properties (`:root`) and/or a Tailwind theme config; all
  components read tokens, never raw hex.
- **Shell components:** `AppShell` (sidebar + top bar + content), `Sidebar` (role-aware nav),
  `TopBar` (product name "Lead Intelligence", tenant switcher, user/role), `PageHeader`, `Card`,
  `DataTable`, `Button`, `Badge`, `FormField`, `Banner` (prototype/mock), `MapPanel` (map + controls
  + legend).
- **Config-driven identity:** product name is a constant; **tenant display name/logo come from
  config/DB**, never hardcoded. No "Magna" string in the component tree.
- **Role awareness:** nav and actions reflect the RLS roles (owner/admin/management/telesales);
  the UI must not show controls a role can't use.
- **Self-contained map** per the POC (no external tiles/glyphs/paid services).
- This is guidance for a **future** shell — no app code, package.json, or framework is set up now.

## 18. Future white-label / tenant branding considerations

- **Tenant config object** (later): `{ tenant_display_name, logo_url?, accent_override?, subdomain }`
  — with `accent_override` constrained to an accessible set so contrast/status/map colours stay safe.
- **Isolation:** tenant branding affects the account area and optional accent only — never status or
  map semantics, which must read identically across tenants for trust.
- **Domains:** per-tenant subdomains first (`[tenant].[future-saas-domain].com`), custom domains
  later; all placeholders until the SaaS domain is chosen.
- **Neutral defaults:** an un-branded tenant still looks like a finished, professional product.
- Trademark / name / handle clearance and any Magna-specific tenant theming are **future work**.
