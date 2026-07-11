// Shared map view-model types (client). Derived from the run export bundle.

export interface LeadPoint {
  lead_id: string;
  business_name: string;
  postcode: string;
  territory_code: string;
  grade: "A" | "B" | "C" | "D";
  score: number;
  lat: number;
  lng: number;
  delivery_status: string; // platform_presence_status summary
  delivery_risk: string;
  export_status: string;
  trigger: string;
}

export interface TerritorySelection {
  code: string;
  leads: LeadPoint[];
}

export interface RunInfo {
  run_id: string;
  fetched: number;
  in_territory: number;
  final_leads: number;
  rejected_total: number;
}

// ---- reusable map engine ----

export type Granularity = "areas" | "districts" | "sectors";
export type RoadMode = "motorways" | "feeder" | "primary" | "all" | "custom" | "hide";

export interface MapLayers {
  coverage: boolean;
  gaps: boolean;
  expansion: boolean;
  roads: boolean;
  points: boolean;
  labels: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayers = {
  coverage: true, gaps: true, expansion: true, roads: true, points: true, labels: true,
};

/** A generic point marker — reusable for leads, customers, demographics, routes. */
export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  postcode: string; // used to derive area/district/sector membership
  color: string;
  label: string;
  meta?: Record<string, string | number>;
}

export interface MapFeature {
  code: string;
  pts: string;
  pilot?: boolean;
  cat?: string;
  district?: string;
}

export interface Viewport {
  tx: number;
  ty: number;
  scale: number;
}

