# AspectLead — Brand Identity (DRAFT / CANDIDATE)

> **STATUS: DRAFT — not final, not legally cleared, not implemented.** This documents the working
> brand direction for the product. The app UI has **not** been changed. "Magna" is **not** the
> product brand — Magna is only a future first tenant/customer. Nothing here is production-ready.

## 1. Brand name decision
**AspectLead** — the working product brand name.
- Reads as one word, two parts: **Aspect** (perspective / angle / facet — "see every angle of the
  market") + **Lead** (sales lead + leadership / winning territory).
- Positioning idea: *see every angle of the market, detect sales signals, and help teams win territory.*

## 2. Domain direction
- Primary production domain direction: **`aspectlead.app`**
- Product URL patterns (later): `app.aspectlead.app` (app), `demo-company.aspectlead.app` (tenant),
  custom tenant domains later. `aspectlead.com` may be held/checked separately.
- These are **directional**, not confirmed.

## 3. Legal / trademark status
**NOT cleared.** No domain, trademark, or social-handle clearance has been completed. AspectLead is a
working direction only — do not treat as legally available. Class 9 / 35 / 42 clearance across target
jurisdictions (USPTO, UKIPO, EUIPO, WIPO) is still required before locking.

## 4. Why a wordmark-led identity
- The product's meaning lives in the **name** (Aspect + Lead), so the wordmark itself should carry the
  brand — most premium B2B SaaS brands are wordmark-first (Stripe, Linear, Vercel, Notion).
- A wordmark scales cleanly across sidebar, app header, website nav, favicon, PDF/report header, and
  email footer without a bulky icon.
- It keeps the identity **compact and operational**, not decorative.

## 5. Why the generic standalone "A" icon was rejected
- A lone "A" mark is **generic and unownable** — thousands exist; it says nothing about perspective,
  territory, or signal.
- Earlier AI-generated "A" concepts looked like a template. The brand should express **aspect
  (perspective/angle)**, **territory (map/contour)**, and **signal (live intelligence)** — none of
  which a plain "A" conveys.
- Any icon/favicon must derive from the **wordmark's stroke motif** (contour / perspective cut /
  route stroke), not a standalone letter.

## 6. The three wordmark routes (see `docs/design-previews/aspectlead-brand-board.html`)
Hybrid intent for all three: **Concept 3** (aspect/perspective/prism) + **Concept 1** (dark
command-centre / signal intelligence) + **Concept 2** (map/territory/contour).

**A. Contour Line Wordmark** — wordmark-first, with a subtle **contour/topographic line** (territory
boundary) passing under/through part of the wordmark. Geographic, intelligent, premium, calm. Best for
map/territory intelligence.

**B. Perspective Cut Wordmark** — wordmark-first, with **custom letter styling / angled cuts / subtle
perspective breaks** in the typography, expressing "Aspect" as viewpoint/angle. Premium, sharp, modern,
ownable — **a likely strongest final direction.**

**C. Route Stroke Wordmark** — wordmark-first, with a subtle **route/path/signal stroke** connecting
Aspect → Lead (or travelling under the wordmark), suggesting discovery, movement, and territory
expansion — **without** looking like a delivery/logistics app (abstract signal, node-dots, not arrows).

Two-tone logic across all: **"Aspect" in main ink, "Lead" in brand accent** — reinforces one word,
emphasises "Lead," and stays legible mono/reversed.

## 7. Dark / light theme strategy (two linked palettes, one brand)
- **Dark theme** — command rail, top command bar, live run panels, map panels, signal/AI areas.
  Premium, powerful, *not* cyberpunk: deep dark base + blue/cyan/violet signal accents.
- **Light theme** — tables, forms, settings, export review, long working sessions. Clean, calm,
  readable — **same brand accents**, so it feels like one product, not two apps.
- **Theme behaviour (product rule):**
  - Default theme = **Auto** (follows system preference initially).
  - Later: optional daylight/time-based switching.
  - User can manually choose **Auto / Light / Dark**.
  - **User override is remembered** (persisted).
  - Theme toggle available in **the app shell** and in **Settings**.

## 8. Draft colour palette (AspectLead — refined from the starting palette)
Colour roles (draft; refinements noted). Full swatches + contrast notes in the brand board.

| Role | Token | Hex |
|---|---|---|
| Brand primary | Aspect Blue | `#2563FF` |
| Brand secondary | Aspect Indigo *(refined add — bridges blue↔violet)* | `#4338CA` |
| Signal / live | Signal Cyan | `#00D9F5` |
| Intelligence / AI | Insight Violet | `#7C3AED` |
| Warning / gap | Route Amber | `#F59E0B` |
| Danger | Alert Red *(refined add — true red for AA distinction from amber)* | `#E5484D` |
| Critical accent (optional) | Alert Orange | `#FF7A59` |
| Success | Signal Green *(refined add — starting palette had none)* | `#16A34A` |
| Dark surface (base) | Aspect Carbon | `#0F1115` |
| Dark surface (command) | Midnight Command | `#0B1220` |
| Dark surface (panel) | Deep Navy | `#101827` |
| Light app background | Platinum | `#F4F6FA` |
| Card surface | White | `#FFFFFF` |
| Border (light) | Border Light | `#E2E8F0` |
| Border (dark) | Border Dark | `#223049` |
| Muted text | Steel | `#8A92A6` |
| Main text (light mode) | Ink | `#0F172A` |
| Main text (dark mode) | Platinum | `#F4F6FA` |

**Accessibility (must follow):**
- **Signal Cyan `#00D9F5` must NOT be body/paragraph text on light** (fails AA). Use it on **dark
  surfaces, icons, dots, borders, glows** only.
- **Route Amber `#F59E0B` as text on white → darken to `#B45309`.**
- **Aspect Blue `#2563FF` for small body text/links on white → darken to `#1D4ED8`** (fine for large
  text/buttons as-is).
- **Alert Red `#E5484D` as text on white → darken to `#C0343A`.**
- **Never rely on colour alone for status** — always pair with dot/label/icon; label every map band.
- Both themes must hold ≥4.5:1 for body text.

## 9. Typography direction
- **Wordmark:** a **custom-styled geometric wordmark** (not plain typed text) — built on a geometric
  grotesk with small letterform tweaks + the route/contour/cut motif. Distinctive and ownable.
- **Product headings:** **Space Grotesk** (or **Sora**) — geometric, technical-premium, matches the wordmark.
- **UI / body:** **Inter** — neutral, legible at 13–14px, the workhorse.
- **Metrics / postcodes / run IDs:** **JetBrains Mono** (or **IBM Plex Mono**) — tabular figures give the
  telemetry/intelligence feel.
- *Why:* a geometric display + neutral grotesk pairing gives **distinctiveness + readability**; mono
  numerals reinforce the intelligence/telemetry positioning. All self-hosted later (no external fetch).

## 10. Logo usage rules
- **Wordmark-led** everywhere; the icon/favicon is a **fallback derived from the wordmark stroke**, never a
  standalone "A".
- Must stay **compact**: sidebar, app header, website nav, favicon/app icon, PDF/report header, email footer.
  Do not make a large decorative logo that wastes space.
- Minimum clear space = cap-height around the wordmark; minimum legible size defined per lockup.
- Reversed (white-on-dark) and single-colour (mono ink) versions are first-class; two-tone is the default.
- Never restyle, recolour outside the palette, add effects, or stretch the wordmark.

## 11. UI implications
- App shell gains a **dual-theme system** (Auto/Light/Dark, remembered) with the wordmark in the command rail.
- Dark surfaces = command/live/map/AI; light surfaces = work/tables/forms/export — one brand across both.
- Accent roles map to product meaning: blue=action, cyan=live, violet=AI/intelligence, amber=gap/attention,
  green=success, red=danger. Coverage map ramp stays blue→violet.
- Implementation is a **later, presentational** pass; data contracts and the 9-page IA stay stable.

## 12. Open decisions
- Which wordmark route wins (B Perspective Cut is the current front-runner; A/C may inform the favicon).
- Final accent balance (how much cyan vs violet; whether Aspect Indigo stays).
- Danger red vs Alert Orange usage split.
- Exact wordmark letterforms (custom tweaks) — needs a type/brand designer pass.
- Whether `aspectlead.com` is secured alongside `.app`.

## 13. Next steps before implementation
1. **Review the brand board** (`docs/design-previews/aspectlead-brand-board.html`) and pick a wordmark route.
2. **Legal/clearance:** run domain + trademark (classes 9/35/42, key jurisdictions) + social-handle checks;
   engage an attorney before locking.
3. **Finalise** the wordmark (designer pass) and the palette/type tokens.
4. **Promote** the approved brand into `docs/18` §A (replacing the neutral baseline) as the authoritative tokens.
5. **Then** implement the app theme system + redesign (tokens/fonts → components → screens), IA unchanged.

Taglines (draft — refine, do not lock):
1. *Short premium:* **"Every angle. Every signal."**
2. *Product-descriptive:* **"Territory lead intelligence for modern sales teams."**
3. *Command-centre:* **"See the market. Command the territory."**
