# UI & Branding Guidelines — Lead Intelligence Platform

> **Working product brand: AspectLead (DRAFT — not final, not legally cleared).** See
> `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md` and the brand board
> `docs/design-previews/aspectlead-brand-board.html`. Domain direction `aspectlead.app`.
>
> - **Current official (implemented) state:** the **SaaS-neutral baseline design tokens** in §A
>   below — what the running app shell uses today. **These remain valid until the AspectLead brand
>   is approved and promoted.**
> - **AspectLead brand identity (DRAFT):** now **supersedes random palette exploration** as the
>   direction for future UI work — wordmark-led (no generic "A" icon), dual dark/light theme, new
>   AspectLead palette tied to the wordmark. **Not yet implemented; brand/logo/colours/legal not
>   locked.**
> - **Signal Command** (§B) remains only a **candidate visual direction** to evaluate — not final.
> - **Rule:** final colours, logo, and UI identity are chosen and promoted into §A only **after**
>   the AspectLead brand is approved and cleared (domain/trademark/social). Do not implement
>   candidate/draft colours as if they were final.
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

# §D. Map source direction (design authority for all map visuals)

- The **accepted map POC** (`~/Projects/magna/lead-intelligence-map-poc`, visually accepted 2026-07-10,
  frozen) is the **visual source of truth** for every AspectLead map surface: self-hosted **MapLibre GL JS**,
  **OS Code-Point Open** derived postcode polygons, **OS Open Roads**. No Google/Mapbox/paid tiles.
- **POC colour language (reuse verbatim):** coverage ramp blue→purple `rgba(84,120,205,.32)…rgba(156,42,166,.82)`
  (no green in coverage), delivery fill `rgba(38,96,180,.10)` / outline `#2B6CB0`, delivery gaps
  `rgba(232,150,25,.42)`, current/selected territory `#C85A00`, expansion dashed `#6A4A9A`, motorway
  `#123C66`, A road `#3A9E63`, postcode outline grey `#9AA4AD`. Granularity Area/District/Sector; A-road
  modes feeder/primary/all/custom; planning layers delivery boundary / gaps / expansion.
- **Design previews use a POC-DERIVED static asset only** (`docs/design-previews/assets/aspectlead-map-data.js`,
  regenerated from the POC). **No fake decorative blob maps.** The brand board frames the map **GB-wide** with
  any local territory (e.g. `UB1`) as a **focused lens**, never a West-London-only tool.
- **Production app must use the real MapLibre POC implementation** — not the static preview.
- **UK-wide coverage must be verified before production.** Current POC data is **Great Britain only**
  (Code-Point Open / OS Open Roads); a **Northern Ireland source must be confirmed** (OSNI / Royal Mail PAF).
  NI is shown hatched + flagged, not faked. Tracked as **ISS-0009**.

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
