# UI & Branding Guidelines — Lead Intelligence Platform

> **Brand is NOT locked.** The product name, logo direction, and final colour identity are **not
> chosen yet**. This document therefore separates the **current official baseline** (what the app
> uses today) from **candidate visual directions** under evaluation.
>
> - **Current official state:** the **SaaS-neutral baseline design tokens** in §A below. These are
>   what the running app shell implements. They are intentionally neutral and safe.
> - **Candidate direction (under evaluation, NOT final):** **Signal Command** — §B. A static visual
>   proof lives at `docs/design-previews/signal-command-preview.html`.
> - **Rule:** **final brand colours, logo, and UI identity must be chosen only AFTER the brand
>   name and logo direction are selected** (see the brand-route exploration). Do not implement
>   candidate colours as if they were final.
>
> Not implemented beyond §A · not production · no Supabase · no real data. **"Magna" is NOT the
> product brand** — Magna Foodservice is only the first internal tenant/example.

---

# §A. Current official baseline — SaaS-neutral design tokens (implemented)

This is the authoritative token set the app shell uses now. It stays in force until a brand route
is chosen and formally promoted.

## A.1 Product & tenant
- Product name: **Lead Intelligence Platform** (short: **Lead Intelligence**).
- `APP_NAME` = "Lead Intelligence"; `TENANT_NAME` configurable (never hardcode a tenant).

## A.2 Colour tokens (fixed baseline)
| Token | Hex | Use |
|---|---|---|
| Page background | `#F6F8FB` | app background |
| Card background | `#FFFFFF` | cards, tables |
| Sidebar / nav | `#111827` | sidebar |
| Header text | `#1F2937` | headers |
| Action blue | `#2563EB` | primary actions/links |
| Action hover | `#3B82F6` | hover |
| Intelligence purple | `#7C3AED` | emphasis |
| Analytics cyan | `#0891B2` | analytics |
| Border grey | `#E5E7EB` | borders |
| Main text | `#111827` | body |
| Muted text | `#6B7280` | secondary |
| Success | `#16A34A` | success |
| Warning | `#F59E0B` | warning |
| Danger | `#DC2626` | danger |
| Slate | `#64748B` | neutral/draft |

**Map colours (baseline, consistent with the accepted map POC):** coverage `#DBEAFE → #93C5FD →
#2563EB → #7C3AED` (blue→purple), gaps `#F59E0B`, expansion `#8B5CF6` (dashed), roads `#334155`,
A roads `#16A34A`, map bg `#F3F4F6`.

## A.3 Typography, layout, nav
- **Inter** with `system-ui, -apple-system, "Segoe UI", sans-serif` fallback. Scale: page title
  28–32/700, section 18–20/600, card title 14–16/600, body 14/400, table 13–14/400, badge 12/600.
- Layout: 260px sidebar, 24px content padding, 12px card radius, 8px button radius, 1px `#E5E7EB`
  borders, light shadows only. No gradients/glassmorphism/hero.
- Nav: Overview · Coverage Map · Territories · Pipeline Runs · Leads · Telesales · Export Review ·
  Settings · Admin.

## A.4 Badges, usability, accessibility
- Badges: Complete=green, Running=blue, Draft=slate, Blocked=red, Warning=amber, Exported=purple,
  Mock=slate outline. Always with a text label.
- Every page answers: what's happening / what needs attention / what to do next. Mock pages show the
  prototype banner: *"Prototype using mock data. No real customer data. No integrations connected."*
- Accessibility: ≥4.5:1 body contrast; never colour-alone for status; visible focus; readable tables;
  clear button labels.

---

# §B. Candidate visual direction — "Signal Command" (UNDER EVALUATION, NOT FINAL)

A premium "AI-assisted sales-intelligence command centre" candidate. **Not adopted, not final, not
implemented.** Evaluate before committing.

- **Idea:** dual-surface system — **dark command chrome** (rail, command bar, map canvas, live
  telemetry panels) + **light work surfaces** (tables, forms, review). Accent = **signal** (cyan =
  live, violet = AI/intelligence, blue = action, amber = attention), used only where something is
  happening.
- **Candidate tokens (illustrative only — do NOT adopt as final):** command `#0B1020`, command-soft
  `#111827`, panel-dark `#151B2D`, on-dark text `#E2E8F0`/`#94A3B8`, border-command `#223049`,
  accent-cyan `#22D3EE`, accent-blue `#2563EB`, accent-violet `#8B5CF6`, accent-amber `#F59E0B`,
  success `#22C55E`, danger `#EF4444`, app `#F7F8FC`. Coverage ramp stays blue→violet (POC continuity).
- **Candidate typography:** Space Grotesk (display) + Inter (UI) + JetBrains Mono (metrics), CSS
  fallbacks only.
- **Candidate motion:** subtle, functional, reduced-motion aware (run pulse, progress shimmer, hover
  elevation, map layer glow).
- **Candidate component language:** CommandRail, CommandBar, SignalTile, SignalBadge, DataGrid,
  DetailDrawer, RunMonitor, MapCanvas, GateBanner.
- **Proof:** `docs/design-previews/signal-command-preview.html` — three screens (Command Overview,
  Territory Intelligence Map, Telesales Call Deck / Export Gate). Static, self-contained, mock data.
- **Status:** one of several routes. See the brand-route exploration (Signal/Command, Vantage/
  Intelligence, Atlas/Territory, Beacon/Discovery, Grid/OS) captured in the AI work log. **Contrast
  guardrails apply if ever adopted** (cyan not as text on light; darken amber/danger/success text on
  light).

---

# §C. What must happen before any brand/colour is locked
1. **Choose a brand name + logo direction** (names are unverified — clear trademark/domain/social first).
2. Only then select the **final palette, typography, and UI identity** — anchored to the chosen brand,
   not chosen in isolation.
3. Promote the chosen direction into a new authoritative §A (replacing the neutral baseline), then
   implement presentationally (tokens/fonts → badges/tiles → chrome → overview → map → grid/drawer →
   telesales/export). Keep the 9-page IA and data contracts stable.

## Do not change yet
No data model / migrations / RLS, no map POC repo, no Supabase/Vercel/SQL, no real data. Do not lock
a name/logo/palette until clearance. Keep status + map semantics and the prototype banner.
