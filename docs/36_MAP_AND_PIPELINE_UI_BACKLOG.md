# Map & Pipeline UI Backlog (parked)

These are future/parked requirements captured during the NOW-sprint. No code is being written for these tonight; they are recorded here so they are not lost. They must not block the data-pipeline work.

## Map (reusable map engine — future)

- **Progressive labelling on zoom.** Reveal postcode labels in stages as the user zooms:
  - Zoomed out: show OUTER postcode area labels first.
  - Zooming in: reveal DISTRICT labels.
  - Zoomed in further: reveal SECTOR / inner postcode labels.
- **A-road labels appear only when zoomed in.** Keep them hidden at low zoom to avoid clutter.
- **Intelligent decluttering for "All A Roads".** When the "All A Roads" option is selected, labels must declutter automatically — collision avoidance, priority by road class, and thinning at low zoom.
- **A-roads stay visible above shaded coverage.** Roads must render ABOVE shaded coverage areas using professional contrast (halo / outline / casing and correct layer ordering). Shaded territory fills must never hide the road network.
- **Reusable map engine, not a one-off page.** The map must remain a reusable engine for future projects — lead coverage, active/inactive customers, demographics, route planning — with swappable data overlays rather than a single hard-coded view.

## Pipeline monitor (future redesign)

- The current Flow Network animation is NOT the final desired concept.
- The main pipeline page should be both:
  - **Actionable** — operational control, real counts, drill-down.
  - **Premium** — an advanced, "spaceship-like" feel, while remaining clearly understandable.
- This needs a future redesign pass AFTER the data pipeline is stable. Do not redesign now.

## Notes

- Colour scheme is fixed for now — do not change it during these future items.
- These items are deferred until the end-to-end data pipeline and lead output are proven.
