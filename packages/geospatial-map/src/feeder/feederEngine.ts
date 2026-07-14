// Generic feeder-road engine — suggestion + curation logic, decoupled from rendering.
// The map displays feeder results; this module calculates/curates them. No persistence
// here (that is an application concern) and no application-specific data.

import type { FeederRoadEntry, FeederPriority, FeederStatus } from "../types";

export interface RoadFeatureLite {
  road_classification_number?: string | null;
  name_1?: string | null;
  road_function?: string | null;
  road_classification?: string | null;
  primary_route?: number | boolean;
  trunk_road?: number | boolean;
}

/** A feeder candidate is a strategic connector (primary/trunk A or motorway), NOT every A road. */
export function isFeederCandidate(f: RoadFeatureLite): boolean {
  const cls = f.road_function || f.road_classification || "";
  const strategic = !!f.primary_route || !!f.trunk_road;
  return strategic && (cls === "A Road" || cls === "Motorway");
}

/** Turn road features (e.g. from queryRenderedFeatures) into suggestions, deduped by number. */
export function suggestFeeders(features: RoadFeatureLite[], already: FeederRoadEntry[]): FeederRoadEntry[] {
  const have = new Set(already.map((e) => (e.roadNumber || e.id).toUpperCase()));
  const byNumber = new Map<string, FeederRoadEntry>();
  for (const f of features) {
    if (!isFeederCandidate(f)) continue;
    const num = (f.road_classification_number || "").toUpperCase();
    if (!num || have.has(num) || byNumber.has(num)) continue;
    byNumber.set(num, {
      id: num, displayName: num, roadNumber: num, roadName: f.name_1 || null, sourceFeatureIds: [],
      source: "automatic_suggestion", status: "suggested",
      priority: f.trunk_road ? "primary" : "secondary",
      reason: f.trunk_road ? "Trunk road serving the area" : "Primary route serving the area",
    });
  }
  return [...byNumber.values()];
}

export function includedFeederNumbers(entries: FeederRoadEntry[]): string[] {
  return entries.filter((e) => e.status === "included" && e.roadNumber).map((e) => e.roadNumber!.toUpperCase());
}

export function addManualFeeder(entries: FeederRoadEntry[], roadNumber: string, reason: string, priority: FeederPriority = "secondary"): FeederRoadEntry[] {
  const num = roadNumber.trim().toUpperCase();
  if (!num || entries.some((e) => (e.roadNumber || "").toUpperCase() === num)) return entries;
  return [...entries, { id: num, displayName: num, roadNumber: num, roadName: null, sourceFeatureIds: [], source: "manual", status: "included", priority, reason: reason || "Manually added" }];
}
export function addFeederByName(entries: FeederRoadEntry[], roadName: string, reason: string): FeederRoadEntry[] {
  const name = roadName.trim(); if (!name) return entries;
  const id = `name:${name.toLowerCase()}`;
  if (entries.some((e) => e.id === id)) return entries;
  return [...entries, { id, displayName: name, roadNumber: null, roadName: name, sourceFeatureIds: [], source: "manual", status: "included", priority: "secondary", reason: reason || "Manually added by name" }];
}
export const setFeederStatus = (e: FeederRoadEntry[], id: string, status: FeederStatus): FeederRoadEntry[] => e.map((x) => (x.id === id ? { ...x, status } : x));
export const setFeederPriority = (e: FeederRoadEntry[], id: string, priority: FeederPriority): FeederRoadEntry[] => e.map((x) => (x.id === id ? { ...x, priority } : x));
export const removeFeeder = (e: FeederRoadEntry[], id: string): FeederRoadEntry[] => e.filter((x) => x.id !== id);
