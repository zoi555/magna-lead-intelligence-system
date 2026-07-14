// Public types for the portable geospatial-map package.
//
// Grouped by concern (map / layers / roads / labels / postcodes / overlays / events)
// in one module for consistency; the README maps these to the suggested folder names.
// NOTHING here references AspectLead, leads, customers, Sales Pro or NetSuite.

/* ============================ map ============================ */

export type LabelDensity = "standard" | "dense" | "maximum";

export interface AttributionDefinition { text: string; url?: string }

/** Environment-independent source + asset configuration. No hardcoded hosts. */
export interface GeospatialSourceConfig {
  /** Base URL for PMTiles / GeoJSON assets, e.g. "/map/tiles" or a CDN origin. */
  tileBaseUrl: string;
  /** MapLibre glyphs template, e.g. "/map/fonts/{fontstack}/{range}.pbf" or CDN. */
  glyphBaseUrl: string;
  /** Named source files (relative to tileBaseUrl unless absolute). */
  sources: {
    zoomstack?: string;
    openRoads?: string;
    codePoint?: string;
    greenspace?: string;
    rivers?: string;
    boundaryLine?: string;
    openMapLocal?: string;
    postcodeLabels?: string;
  };
  attribution: AttributionDefinition[];
}

export interface MapViewState {
  longitude: number; latitude: number; zoom: number; bearing?: number; pitch?: number;
}

/** Opaque handle to the underlying MapLibre map returned via onMapReady. */
export interface MapInstanceReference {
  map: unknown; // maplibregl.Map
  addOverlay(o: MapOverlayDefinition): void;
  removeOverlay(id: string): void;
  setOverlayVisibility(id: string, visible: boolean): void;
  setLayerVisibility(layerId: string, visible: boolean): void;
  fitBounds(b: MapBounds, padding?: number): void;
  flyTo(v: Partial<MapViewState>): void;
}

export interface MapControlCapabilities {
  mapDetail?: boolean;
  roads?: boolean;
  feederRoads?: boolean;
  placesAndLabels?: boolean;
  postcodes?: boolean;
  transport?: boolean;
  environment?: boolean;
  operationalOverlays?: boolean;
}

/* ============================ roads ============================ */

export type ApplicationRoadClass =
  | "motorway" | "primary" | "a_road" | "b_road" | "local" | "minor"
  | "service" | "private" | "track" | "other";

export interface RoadClassStyleMapping {
  sourceClass: string;                 // value as it appears in the source data
  applicationClass: ApplicationRoadClass;
  minZoom: number;
  maxZoom?: number;
  defaultVisibility: "always" | "automatic" | "optional";
  userToggle: boolean;                 // false = locked (motorways)
  styleId: string;
  colour: string;
  width: [number, number];
}

export interface RoadCoverageReport {
  discovered: string[];
  mapped: { sourceClass: string; applicationClass: ApplicationRoadClass; styleId: string }[];
  unmapped: string[];                  // classes with no mapping/alias — a FAILURE
  ok: boolean;
}

export interface RoadLayerConfig {
  motorwaysVisible: true;              // LOCKED — type-level: cannot be false
  primaryARoads: boolean;
  allARoads: boolean;
  bRoads: "automatic" | "show" | "hide";
  localRoads: "automatic" | "show" | "hide";
  privateAndTracks: "automatic" | "show" | "hide";
}

/* ---- feeder roads ---- */

export type FeederSource = "organisation_default" | "manual" | "automatic_suggestion" | "application";
export type FeederStatus = "included" | "excluded" | "suggested";
export type FeederPriority = "primary" | "secondary" | "context";

export interface FeederRoadEntry {
  id: string;
  displayName: string;
  roadNumber?: string | null;
  roadName?: string | null;
  sourceFeatureIds: string[];
  geographyRefs?: string[];
  source: FeederSource;
  status: FeederStatus;
  priority: FeederPriority;
  reason?: string | null;
}

export interface FeederRoadConfig { showFeeders: boolean; highlightColour: string }

export interface TerritoryReference { id: string; label?: string }
export interface SettlementReference { id: string; name: string; longitude: number; latitude: number }
export interface RoadNodeReference { id: string; longitude: number; latitude: number }
export interface RoadNetworkReference { id: string }
export interface FeederSuggestionContext {
  selectedTerritories: TerritoryReference[];
  settlementCentres: SettlementReference[];
  motorwayJunctions: RoadNodeReference[];
  strategicRoadNetwork?: RoadNetworkReference;
}

/* ============================ labels ============================ */

export interface LabelConfig {
  cities: boolean;
  towns: boolean;
  villages: "automatic" | "show" | "hide";
  localities: "automatic" | "show" | "hide";
  motorwayNumbers: true;               // LOCKED — mandatory
  aRoadNumbers: boolean;
  bRoadNumbers: "automatic" | "show" | "hide";
  roadNames: "automatic" | "show" | "hide";
  streetNames: "automatic" | "show" | "hide";
  railwayStations: boolean;
  postcodeAreas: "automatic" | "show" | "hide";
  postcodeDistricts: "automatic" | "show" | "hide";
  postcodeSectors: "automatic" | "show" | "hide";
  fullPostcode: "selection_only" | "hover_and_selection";
  density: LabelDensity;
}

/* ============================ postcodes / transport / environment ============================ */

/** Generic descriptor for a single style/overlay layer's visibility policy. */
export interface MapLayerConfig {
  id: string;
  type: "fill" | "line" | "circle" | "symbol" | "background";
  minZoom?: number;
  maxZoom?: number;
  visibility: "always" | "automatic" | "optional";
  userToggle: boolean;
}

export interface PostcodeLayerConfig { areas: boolean; districts: boolean; sectors: boolean; points: boolean }
export interface TransportLayerConfig { railways: boolean; stations: boolean }
export interface EnvironmentLayerConfig { greenspace: boolean; woodland: boolean; water: boolean; buildings: boolean; functionalSites: boolean }

/* ============================ map profile ============================ */

export interface MapProfile {
  version: 1;
  roads: RoadLayerConfig;
  feederRoads: FeederRoadConfig;
  labels: LabelConfig;
  postcodes: PostcodeLayerConfig;
  transport: TransportLayerConfig;
  environment: EnvironmentLayerConfig;
  labelDensity: LabelDensity;
}

/* ============================ overlays ============================ */

export interface GeoJSONSourceDefinition { kind: "geojson"; data: unknown | string }
export interface VectorTileSourceDefinition { kind: "vector"; url: string; sourceLayer: string }
export type MapOverlaySource = GeoJSONSourceDefinition | VectorTileSourceDefinition;

export interface MapOverlayLayerDefinition {
  id: string;
  type: "fill" | "line" | "circle" | "symbol";
  sourceLayer?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown;
  minzoom?: number;
  maxzoom?: number;
}
export interface MapLegendDefinition { items: { colour: string; label: string }[] }

export interface MapOverlayDefinition {
  id: string;
  label: string;
  group: string;
  source: MapOverlaySource;
  layers: MapOverlayLayerDefinition[];
  defaultVisible: boolean;
  minZoom?: number;
  maxZoom?: number;
  legend?: MapLegendDefinition;
  metadata?: Record<string, unknown>;
}

/* ============================ events / selection ============================ */

export interface MapBounds { west: number; south: number; east: number; north: number }

export interface MapFeatureSelection {
  id: string;
  sourceId: string;
  layerId: string;
  featureType: string;
  displayName: string;
  properties: Record<string, unknown>;
  coordinates?: { longitude: number; latitude: number };
  bounds?: MapBounds;
  sourceMetadata?: { dataset?: string; version?: string };
}

export interface TerritoryGeometry { id: string; label?: string; geojson: unknown }
export interface TerritoryAction { type: "fit" | "select" | "clear"; territoryId?: string }

export interface MapSearchContext { view?: MapViewState }
export interface MapSearchResult {
  id: string;
  type: "postcode" | "postcode_district" | "postcode_sector" | "city" | "town" | "village" | "locality" | "road" | "station" | "functional_site" | "custom";
  label: string;
  longitude: number; latitude: number; zoom?: number;
  bounds?: MapBounds;
}

export interface MapEventHandlers {
  onMapReady?: (map: MapInstanceReference) => void;
  onViewChange?: (view: MapViewState) => void;
  onFeatureHover?: (feature: MapFeatureSelection | null) => void;
  onFeatureSelect?: (feature: MapFeatureSelection | null) => void;
  onTerritoryAction?: (action: TerritoryAction) => void;
  onProfileChange?: (profile: MapProfile) => void;
  /** Fired when the user edits feeder roads in the drawer. The app owns feeder state
   *  and passes it back via the `feederRoads` prop. */
  onFeederRoadsChange?: (feeders: FeederRoadEntry[]) => void;
}

/* ============================ component props ============================ */

export interface GeospatialMapControls extends MapControlCapabilities {
  layerDrawer?: boolean;
  search?: boolean;
  featureInspector?: boolean;
  scale?: boolean;
  zoomIndicator?: boolean;
  fullscreen?: boolean;
  fitSelection?: boolean;
  nationalView?: boolean;
}

export interface GeospatialMapProps extends MapEventHandlers {
  id?: string;
  sources: GeospatialSourceConfig;
  profile?: MapProfile;
  initialView?: MapViewState;
  selectedTerritories?: TerritoryGeometry[];
  feederRoads?: FeederRoadEntry[];
  overlays?: MapOverlayDefinition[];
  controls?: GeospatialMapControls;
  search?: import("./adapters/adapters").MapSearchAdapter;
  featureInfo?: import("./adapters/adapters").FeatureInfoAdapter;
  className?: string;
}

/* ---- supplemental road source (Part 9) ---- */
export interface SupplementalRoadSource {
  id: string;
  provider: string;
  classesProvided: string[];
  licence: string;
  attribution: string;
  precedence: number;
  enabled: boolean;
}
