"use client";

// AspectLead wrapper around the portable @geospatial/map component.
// Adds an "Expand" control WITHOUT creating a second map: the single GeospatialMap
// instance is never unmounted — expanding only swaps the CSS of its container between
// an embedded box and a full-viewport overlay, then calls maplibre's resize(). Because
// the React subtree is untouched, the expanded map retains its view, study mode,
// selection, territory, roads, coverage overlays and feeder configuration.
//
// This is framework glue only. No geographic/map logic lives here — that all belongs to
// the package. Application-specific overlay panels are passed in as `children`.

import React from "react";
import { GeospatialMap } from "@geospatial/map";
import type { GeospatialMapProps, MapInstanceReference } from "@geospatial/map";

interface ExpandableMapProps extends GeospatialMapProps {
  /** Tailwind height classes for the EMBEDDED (non-expanded) state. */
  embeddedClassName?: string;
  /** Optional overlay UI (e.g. a coverage panel) rendered above the map in both states. */
  children?: React.ReactNode;
}

export function ExpandableMap({ embeddedClassName = "h-[620px] md:h-[720px] lg:h-[760px]", children, onMapReady, ...mapProps }: ExpandableMapProps) {
  const [expanded, setExpanded] = React.useState(false);
  const handleRef = React.useRef<MapInstanceReference | null>(null);

  // Same instance keeps working; only its box changes size, so tell maplibre to re-measure.
  const resizeSoon = React.useCallback(() => {
    const m = handleRef.current?.map as { resize?: () => void } | undefined;
    if (!m?.resize) return;
    requestAnimationFrame(() => { m.resize?.(); requestAnimationFrame(() => m.resize?.()); });
  }, []);

  React.useEffect(() => { resizeSoon(); }, [expanded, resizeSoon]);

  // Escape collapses (but only when expanded, so it never fights the map's own Escape-clear).
  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const containerClass = expanded
    ? "fixed inset-0 z-50 bg-white"
    : `relative w-full rounded-lg border border-gray-200 overflow-hidden ${embeddedClassName}`;

  return (
    <div className={containerClass} style={{ position: expanded ? "fixed" : "relative" }}>
      <GeospatialMap {...mapProps} onMapReady={(h) => { handleRef.current = h; onMapReady?.(h); }} />
      {children}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-pressed={expanded}
        className="absolute top-2.5 left-2.5 z-[7] inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
      >
        {expanded ? "↙ Collapse map" : "⤢ Expand map"}
      </button>
    </div>
  );
}
