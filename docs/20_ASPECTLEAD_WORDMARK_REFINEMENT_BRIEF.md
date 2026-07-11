# AspectLead — Wordmark Refinement Brief (Route B: Perspective Cut)

> **Status: DRAFT direction — NOT final, NOT legally cleared, NOT implemented.**
> This brief carries forward **Route B — Perspective Cut** from the brand board
> (`docs/design-previews/aspectlead-brand-board.html`, described in
> `docs/19_ASPECTLEAD_BRAND_IDENTITY_DRAFT.md`) as the **preferred** wordmark direction to
> take to a professional designer. It is a specification of intent, not a finished logo.
> Nothing here locks the brand. No colours, geometry, or files are production assets.
> "Magna" is **not** the product brand — Magna is the future first tenant only.

---

## 0. Purpose of this document

This is a **refinement brief** for a professional designer (or a design studio). It tells them
exactly what "Perspective Cut" means, what to build, what to leave alone, and what must be checked
before anything is approved. It does **not** produce final artwork. The rough SVGs on the brand
board are *reference sketches only* — they exist to communicate intent, and must be **rebuilt from
scratch as proper vector artwork** (see §9).

The designer's job is to make a single, ownable, credible SaaS wordmark that:
- reads as **AspectLead** instantly and legibly at all sizes,
- carries one subtle idea — **aspect / viewpoint / angle** — through a "cut" in the letterforms,
- optionally hints at **territory/geography** without ever looking like a delivery, courier, or
  logistics brand,
- works in a **dark-first product** and on **light marketing surfaces** equally well.

---

## 1. The exact wordmark direction

**One-line definition:** *AspectLead set as a single two-tone wordmark, with one or two letters
carrying a precise angled "cut" that reads as a change of viewpoint (an aspect), on a very slight
overall perspective lean.*

Concrete specification:

- **Text:** `AspectLead` — one word, no space, camel-case internal capital `L`. Never "Aspect Lead",
  "Aspectlead", or "ASPECTLEAD" as the primary lockup.
- **Two-tone colour split:** `Aspect` in the ink/neutral colour, `Lead` in the brand accent. The
  split is on the **word boundary** (`Aspect` | `Lead`), reinforcing the internal capital `L`. It is
  **not** a per-letter rainbow and not a gradient across the whole word.
- **Overall lean:** a **very slight** forward skew of the entire wordmark — target **5°, hard
  maximum 7°** horizontal skew (`skewX`). Enough to feel forward-moving and "engineered", never
  enough to look italic or falling over. The baseline stays horizontal; only the vertical strokes
  lean.
- **The "cut":** one deliberate angled facet slices through **one or two chosen letters** (see §2),
  as if the letter is being viewed from a slightly rotated angle — the *aspect*. The cut is a clean
  straight edge at a **consistent angle** shared with the skew, so the whole mark feels cut from the
  same plane.
- **Weight & feel:** semi-bold to bold, geometric-humanist sans, tight but not cramped tracking.
  Confident, modern, "instrument-grade" — closer to a precision-tool brand than a playful consumer
  app.
- **Single idea only:** perspective/aspect is the *whole* concept. Do not also add a prism, an eye, a
  target, a pin, or a chart. Restraint is the brief.

**Emotional target:** sharp, premium, trustworthy, technical. "This tool sees the angle others miss."

---

## 2. Which letters should be customised

Custom letterforms should be **minimal and surgical** — the wordmark must still read as ordinary,
confident type. Priority order:

1. **Capital `A` (primary custom letter).** The `A` is the natural home of "Aspect" and of an angled
   cut (its apex is already a viewpoint/angle). Refine the apex and give it the primary **perspective
   cut** — a clean facet where the two diagonals meet, or a sliced apex that implies a face turned in
   space. This is the letter that carries the concept.
2. **Capital `L` in `Lead` (secondary custom letter).** Because it starts the accent-coloured second
   half, the `L` can echo the same cut angle on its foot or its inner corner — a quiet rhyme with the
   `A`, tying `Aspect` and `Lead` together. Keep it subtler than the `A`.
3. **The `t` / `d` terminals (optional, tertiary).** Consider squaring or angling the stroke
   terminals of `t` and `d` to the **same cut angle** so the whole word feels cut from one plane.
   Optional — only if it reads as consistency, not decoration.

**Leave alone:** `s`, `p`, `e`, `c`, `e`, `a` — these should stay as clean, well-drawn standard
glyphs from the chosen typeface family. Over-customising mid-word hurts legibility and makes the mark
look gimmicky.

**Rule:** if a customised letter is ever hard to recognise at 16 px, it is over-designed. Dial back.

---

## 3. How the perspective cuts should work

The "cut" is the signature. It must be **geometric, precise, and consistent** — an engineered facet,
not a brush stroke or a torn edge.

Mechanics for the designer:

- **One shared angle.** Pick a single cut angle (a good starting point: the same **~7°** as the skew,
  or a complementary steeper facet around **20–30°** for the `A` apex). Every cut in the system — `A`,
  `L`, terminals, favicon — uses that angle or its mirror. Consistency is what makes it feel designed
  rather than random.
- **Clean straight edges only.** Cuts are straight lines, sharp corners. No curves, no bevels, no
  drop shadows, no 3-D extrusion. The illusion of perspective comes from the *angle*, not from
  rendering tricks.
- **Cut = removal or offset, not outline.** The facet should read as if a plane sliced the letter:
  either a small wedge is removed (negative space shows through), or the sliced portion is offset
  into the accent colour. Prefer **negative-space cuts** at small sizes (they survive better) and
  reserve the two-tone offset for large/marketing use.
- **Direction of the cut implies the viewpoint.** All cuts should lean the *same way* as the overall
  skew so the word looks like one object seen from one angle — not several letters each rotated
  differently.
- **Test the cut at three sizes before committing:** 16 px (favicon/nav), 24 px (sidebar wordmark),
  and 240 px (hero). The cut must be visible-but-quiet at 16 px and crisp at 240 px. If it disappears
  at 16 px, thicken it or move it to a stroke that survives.
- **Do not let the cut break letter recognition.** The `A` must still be an `A`. If the facet makes it
  ambiguous (reads as `4`, `R`, or a triangle), reduce it.

**Anti-goals for the cut:** glitch/datamosh effect, "torn paper", chevrons/arrows, speed lines, or
anything that reads as motion-blur. This is precision, not velocity.

---

## 4. Subtle geographic / map cues — without looking like logistics

Geography is a **whisper**, optional and secondary. The concept lead is *aspect/viewpoint*; territory
is a supporting hint only. The hard constraint: **never look like a courier, delivery, maps-app, or
logistics brand.**

Allowed, subtle cues (pick **at most one**, and keep it faint):

- **Contour whisper.** A single thin contour/topographic line fragment can sit *under* the wordmark
  as an optional extended-lockup element (not in the compact mark). One line, low contrast, clearly
  decorative — echoing "territory" without drawing a map.
- **Facet-as-terrain.** The cut angle itself can subconsciously echo a slope/ridge line — lean into
  this by keeping cut angles consistent with a gentle terrain gradient. This needs **no extra
  artwork**, which is the cleanest option.
- **Grid/section hint.** A very faint sense of a cross-section or plan-view plane in the `A`'s facet
  (as if looking down at angled ground). Extremely subtle.

**Forbidden geographic cues (these read as logistics/maps and must not appear):**

- ❌ Map pins / location teardrops / "drop pin" shapes.
- ❌ Roads, routes with arrowheads, dashed delivery lines, vans, boxes, parcels.
- ❌ Folded-paper map, globe, compass rose, or a literal map outline.
- ❌ Route C's travelling "signal node on a path" (that's a *different* route — do not blend it in;
  it risks the delivery/courier read).
- ❌ Pushpins, waypoints, GPS crosshairs, or "you are here" motifs.

**Test:** show the mark to someone cold and ask "what does this company do?" If the answer is
"deliveries", "maps", "taxis", or "couriers", the geographic cue is too strong — remove it. Acceptable
cold-read answers: "software", "data", "analytics", "something technical/finance/intelligence".

---

## 5. Light theme colour use

Light surfaces = marketing site, PDFs, printed material, light-mode app screens.

- **`Aspect`** in **Ink `#0F172A`** (near-black slate). High contrast, authoritative.
- **`Lead`** in **Aspect Blue `#2563FF`** (brand primary). This is the accent that carries the name's
  payoff.
- **Background:** White `#FFFFFF` or Platinum `#F4F6FA`. The wordmark must be tested on both.
- **The cut / facet:** shown as **negative space** (background shows through) at small sizes; at large
  sizes the sliced facet may be filled with **Aspect Indigo `#4338CA`** or a slightly deeper blue to
  add dimension — but keep it within the blue family, never a second unrelated hue.
- **Single-colour light fallback** (when two-tone can't be used — faxes, single-colour print,
  engraving, embossing): entire wordmark in **Ink `#0F172A`**, cut as negative space only.
- **Minimum contrast:** the `Lead` blue on white must clear **WCAG AA for large text/graphics
  (≥3:1)**; `#2563FF` on white passes. Do **not** use Signal Cyan for wordmark text on light — it
  fails contrast (cyan is a UI signal accent, not a text colour).

Starting spec (designer may refine within the AspectLead palette): `Aspect` `#0F172A` · `Lead`
`#2563FF` · facet `#4338CA` · on `#FFFFFF`/`#F4F6FA`.

---

## 6. Dark theme colour use

Dark surfaces = the product's default command chrome (the app is dark-first), dark marketing hero,
social avatars on dark.

- **`Aspect`** in **White `#FFFFFF`** or a very light platinum (`#F4F6FA`) — never mid-grey, which
  looks muddy on dark.
- **`Lead`** in a **brightened brand accent** so it holds up on dark. Aspect Blue `#2563FF` can go
  slightly lighter/more saturated on dark (e.g. toward `#4C82FF`) — designer to tune for contrast and
  vibrancy against the dark surface. **Signal Cyan `#00D9F5`** may be used for the accent *only in
  live/hero contexts* where the extra glow is wanted, but the **default** accent stays in the blue
  family for brand consistency across themes.
- **Dark backgrounds to test against:** Aspect Carbon `#0F1115`, Midnight Command `#0B1220`, Deep
  Navy `#101827`. The mark must work on all three.
- **The cut / facet:** negative space shows the dark surface through it. At large sizes the facet may
  be filled with a lighter blue or a faint cyan edge to imply a lit angle — subtle, one accent only.
- **White-on-dark single-colour fallback:** entire wordmark in **White `#FFFFFF`**, cut as negative
  space. This is the safe default for any dark placement where two-tone is risky.
- **Contrast:** white text on `#0F1115` is ~AAA; the brightened `Lead` accent must still clear **≥3:1**
  against whichever dark surface it sits on.

**Consistency rule across themes:** the *shape* of the wordmark is identical in light and dark — only
the colours flip. Never redraw the geometry per theme. Provide the two-tone light, two-tone dark,
mono-ink, and mono-white as the four canonical lockups.

---

## 7. Favicon / app icon — derived from the wordmark stroke, not a generic "A"

Hard rule (carried from the user's explicit rejection): **the icon must NOT be a generic standalone
letter "A" in a box.** It must be derived from the **wordmark's own cut/stroke geometry** so the icon
and the wordmark are visibly the same brand.

Direction for the designer:

- **Source the icon from the facet, not the letter.** Take the **perspective cut** — the signature
  angled facet from the `A` (and/or the `L` foot) — and isolate it as a small, bold, self-contained
  mark. The icon is "the cut", abstracted: an angled plane / sliced corner, not a readable letter.
- **Must be recognisable at 16×16 px.** Simplify hard. One or two shapes, one accent. It should read
  as a confident geometric glyph, not a shrunken logo.
- **Two-tone or mono:** provide (a) two-tone accent version for favicons/app tiles, and (b) a single
  white version for dark tiles and a single ink version for light tiles.
- **Container:** may sit in a rounded-square app-icon container (using a dark brand surface, e.g.
  Aspect Carbon `#0F1115`, with the cut in white/blue) **and** as a bare transparent glyph for
  favicons. Provide both.
- **What it must NOT be:** a plain `A`, a map pin, a location dot, a target, an eye, or a
  route/node motif. If, squinted at, it reads as any of those, redesign it.
- **Relationship test:** placed next to the full wordmark, the icon should look like a **crop of the
  same object** — same angle, same weight, same accent. If it looks unrelated, it's wrong.

Deliver the icon at: 16, 32, 48, 64, 180 (Apple touch), 192, 512 px, plus SVG master.

---

## 8. Logo usage rules

These govern how the finished wordmark/icon may be used once approved. (They apply to the future
final asset; nothing is approved yet.)

- **Clear space:** minimum clear space around the wordmark = the cap-height of the `A` on all sides.
  Nothing (text, edges, other logos) intrudes.
- **Minimum sizes:** wordmark no smaller than **96 px wide** on screen / 20 mm in print. Icon no
  smaller than **16 px**. Below the wordmark minimum, use the icon instead.
- **Canonical lockups only:** two-tone-light, two-tone-dark, mono-ink, mono-white, and the icon. Do
  not invent new colourways.
- **Backgrounds:** two-tone-light on white/platinum only; two-tone-dark / mono-white on approved dark
  surfaces only. On busy photography, use a solid brand panel behind the mark or use mono-white.
- **Do NOT:** stretch, condense, re-skew (the lean is fixed), rotate, add a second skew, recolour
  outside the palette, add gradients/glows/bevels/shadows/outlines, place the two-tone version on a
  mid-tone background where one half loses contrast, re-space the letters, separate `Aspect` from
  `Lead`, translate the word, or set it in a different typeface.
- **Do NOT combine with the tenant brand incorrectly:** when co-branded with a tenant (e.g. Magna as
  first tenant), AspectLead is the product mark and the tenant name is a separate, clearly secondary
  label — never merged into the wordmark, never implying the tenant *is* the product.
- **Compact contexts** (sidebar, header, favicon, PDF header, email signature): use the icon or the
  compact wordmark, never the extended contour lockup.
- **Motion (if animated):** the only sanctioned motion is a one-shot reveal of the cut (the facet
  sliding into place). No looping, no glitch. Respect `prefers-reduced-motion`.

---

## 9. What a professional designer must rebuild as vector

The brand-board SVGs are **communication sketches, not artwork.** A professional must rebuild
everything from scratch. Deliverables required from the designer:

1. **Proper letterform drawing.** Either (a) license the chosen display typeface and legally customise
   the `A`/`L`/terminals, or (b) draw the custom letters as bespoke vector outlines. Confirm the type
   license permits logo customisation and embedding (see §10).
2. **The final wordmark as clean vector outlines** — converted to paths (no live text dependency in
   the master), on a defined grid, with the skew and cut angles mathematically exact and consistent.
3. **All four canonical lockups:** two-tone-light, two-tone-dark, mono-ink, mono-white.
4. **The icon/favicon** derived from the cut (see §7), at all required raster sizes plus an SVG
   master, plus the app-tile container versions.
5. **A defined geometry spec:** exact skew angle, exact cut angle(s), stroke weights, letter spacing,
   the two-tone split point, and the clear-space/min-size rules as measured values.
6. **Colour definitions in every space needed:** HEX + RGB for screen, and (for print, if ever
   needed) CMYK and one or two Pantone spot references — designer to specify, not assumed here.
7. **Optional extended lockup** with the subtle contour whisper (§4), kept separate from the compact
   mark.
8. **Exported production files:** SVG (master + optimised web), PDF (print), PNG (transparent, multiple
   sizes), and favicon set (`.ico` + PNGs + SVG).
9. **A one-page usage sheet** capturing §8 (clear space, min sizes, do/don't) as visuals.
10. **Accessibility verification** of every colourway against its background at the sizes used
    (WCAG AA large-text/graphics ≥3:1 minimum), documented.

Until these exist as real vector artwork, **AspectLead has no production logo** — only a direction.

---

## 10. What must be checked legally before final approval

None of the following has been done. **All must clear before the brand is marked final or used
publicly.** (Not legal advice — engage a solicitor / trademark attorney for the formal steps.)

- **Word-mark trademark search** for "AspectLead" (and close variants "Aspect Lead", "Aspect",
  "AspectLeads") in the relevant classes — **UK IPO** and, if trading internationally, **EUIPO** and
  **USPTO/WIPO**. Priority classes: **Class 9** (software), **Class 42** (SaaS/software services),
  **Class 35** (business/sales/advertising services).
- **Common-law / unregistered use search** — existing companies, products, or services trading as
  "AspectLead" or confusingly similar, even without a registration.
- **Domain confirmation** — `aspectlead.app` availability and any defensive registrations
  (`.com`, `.co.uk`, `.io`) the business wants. (Do the WHOIS/registrar check; do not assume.)
- **Social handle availability** — consistent `@aspectlead` (or agreed variant) across the platforms
  the business will use.
- **Companies House** — check the name isn't taken / too similar for the trading entity, if a new
  entity is planned.
- **Design/logo clearance** — once the final wordmark exists, confirm the facet/cut mark isn't
  confusingly similar to an existing registered *figurative* mark in the same classes.
- **Typeface licensing** — the chosen display and UI fonts must be licensed for: logo use /
  customisation, web embedding (`@font-face`), app embedding, and any print/PDF use. Confirm the EULA
  covers all of these before the letterforms are finalised.
- **Colour / trade-dress sanity check** — ensure the two-tone-blue-with-cut treatment isn't close
  enough to a competitor's protected trade dress to cause confusion.
- **Tenant-conflict check** — confirm nothing in the AspectLead brand implies endorsement by or
  ownership of "Magna" (or vice versa), since Magna is a tenant, not the product owner.

**Only after** all clearances pass, the vector artwork exists (§9), and the user explicitly approves,
may AspectLead / Perspective Cut be promoted from DRAFT into `docs/18` §A as the product brand.
This document does not grant that approval.

---

## Appendix — carry-forward summary

- **Preferred route:** B — Perspective Cut (front-runner from the brand board, now the direction to
  refine). Routes A (Contour Line) and C (Route Stroke) are **not** carried forward, but their one
  good idea each — A's *contour whisper* — is optionally borrowed here as a faint secondary cue (§4).
  C's travelling-node motif is explicitly excluded (logistics risk).
- **Custom letters:** `A` (primary), `L` in `Lead` (secondary echo), `t`/`d` terminals (optional).
- **Signature:** one shared cut angle + ~5–7° skew, two-tone `Aspect`(ink)+`Lead`(accent).
- **Icon:** abstract the *cut*, never a generic "A".
- **Status:** DRAFT. Not final. Not legally cleared. Not implemented in the app. No colours locked.
