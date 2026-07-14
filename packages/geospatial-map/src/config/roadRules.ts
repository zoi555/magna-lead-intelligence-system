// Road hierarchy — class→style mappings, aliases and coverage validation.
// LOCKED: motorways are always visible and cannot be disabled. Every road class
// found in a source must map to a style (or documented alias) or a test fails.

import type { RoadClassStyleMapping, RoadCoverageReport, ApplicationRoadClass } from "../types";

export const LOCKED_DECISIONS: string[] = [
  "The national map is infrastructure shared by all applications and modules.",
  "The selected territory is an operational overlay and never limits national browsing.",
  "Motorways are always visible at every appropriate zoom and cannot be disabled.",
  "Every road class available in the source becomes visible at its appropriate scale.",
  "No road class is permanently omitted merely because it is minor.",
  "Road, place, settlement, postcode and transport labels are zoom-dependent and user-configurable.",
  "Selected and hovered features always show their identity.",
  "Feeder roads are configurable data and may be manually selected or automatically suggested.",
  "Postcode areas, districts and sectors are geographic layers independent of operational data.",
  "The map remains nationally browsable even where no operational run exists.",
  "No application-specific rule may become generic map logic.",
];

// Colours kept consistent with the accepted cartographic base.
export const ROAD_CLASS_MAPPINGS: RoadClassStyleMapping[] = [
  { sourceClass: "Motorway", applicationClass: "motorway", minZoom: 5, defaultVisibility: "always", userToggle: false, styleId: "road-motorway", colour: "#3f6bb3", width: [1.2, 6] },
  { sourceClass: "A Road", applicationClass: "a_road", minZoom: 7, defaultVisibility: "always", userToggle: true, styleId: "road-a", colour: "#4b8f63", width: [0.6, 3] },
  { sourceClass: "B Road", applicationClass: "b_road", minZoom: 11, defaultVisibility: "optional", userToggle: true, styleId: "road-b", colour: "#8a97a5", width: [0.5, 2] },
  { sourceClass: "Minor Road", applicationClass: "minor", minZoom: 13, defaultVisibility: "automatic", userToggle: true, styleId: "road-minor", colour: "#b6c0cc", width: [0.4, 1.6] },
  { sourceClass: "Local Road", applicationClass: "local", minZoom: 14, defaultVisibility: "automatic", userToggle: true, styleId: "road-local", colour: "#c3cdd8", width: [0.4, 1.4] },
  { sourceClass: "Local Access Road", applicationClass: "local", minZoom: 15, defaultVisibility: "automatic", userToggle: true, styleId: "road-localaccess", colour: "#ccd5df", width: [0.3, 1.2] },
  { sourceClass: "Restricted Local Access Road", applicationClass: "service", minZoom: 16, defaultVisibility: "automatic", userToggle: true, styleId: "road-restricted", colour: "#d6dde5", width: [0.3, 1] },
  { sourceClass: "Secondary Access Road", applicationClass: "service", minZoom: 16, defaultVisibility: "automatic", userToggle: true, styleId: "road-secondary-access", colour: "#d6dde5", width: [0.3, 1] },
  { sourceClass: "Private Road - Publicly Accessible", applicationClass: "private", minZoom: 16, defaultVisibility: "optional", userToggle: true, styleId: "road-private-public", colour: "#dfe5ec", width: [0.3, 0.9] },
  { sourceClass: "Private Road - Restricted Access", applicationClass: "private", minZoom: 17, defaultVisibility: "optional", userToggle: true, styleId: "road-private-restricted", colour: "#e4e9ef", width: [0.3, 0.8] },
  { sourceClass: "Track", applicationClass: "track", minZoom: 17, defaultVisibility: "optional", userToggle: true, styleId: "road-track", colour: "#e4e9ef", width: [0.3, 0.7] },
];

// Aliases cover both OS Open Roads fields (road_function granular + road_classification).
export const ROAD_CLASS_ALIASES: Record<string, string> = {
  "A Road Primary": "A Road", "B Road Primary": "B Road",
  "Classified Unnumbered": "Minor Road", "Unclassified": "Local Road",
  "Not Classified": "Local Road", "Unknown": "Local Road",
  "Pedestrianised Street": "Local Access Road",
  "Restricted Secondary Access Road": "Restricted Local Access Road",
};

export function mappingFor(sourceClass: string): RoadClassStyleMapping | undefined {
  const byClass = new Map(ROAD_CLASS_MAPPINGS.map((m) => [m.sourceClass, m]));
  const canonical = byClass.has(sourceClass) ? sourceClass : ROAD_CLASS_ALIASES[sourceClass];
  return canonical ? byClass.get(canonical) : undefined;
}

/** Every discovered road class must map to a style (or documented alias). */
export function validateRoadCoverage(discovered: string[]): RoadCoverageReport {
  const mapped: RoadCoverageReport["mapped"] = [];
  const unmapped: string[] = [];
  for (const raw of discovered) {
    const m = mappingFor(raw);
    if (m) mapped.push({ sourceClass: raw, applicationClass: m.applicationClass, styleId: m.styleId });
    else unmapped.push(raw);
  }
  return { discovered, mapped, unmapped, ok: unmapped.length === 0 };
}

/** Motorways can never be switched off. */
export function motorwayLocked(): boolean {
  const m = ROAD_CLASS_MAPPINGS.find((r) => r.applicationClass === "motorway");
  return !!m && m.defaultVisibility === "always" && m.userToggle === false;
}

export const APPLICATION_ROAD_CLASSES: ApplicationRoadClass[] =
  ["motorway", "primary", "a_road", "b_road", "local", "minor", "service", "private", "track", "other"];
