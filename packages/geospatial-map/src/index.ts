// @geospatial/map — portable, application-independent GB map package.
// Public API. Nothing here imports application (AspectLead) code.

// ---- components ----
export { GeospatialMap } from "./components/GeospatialMap";
export { MapControlDrawer } from "./components/MapControlDrawer";
export { FeatureInspector } from "./components/FeatureInspector";
export { MapSearch } from "./components/MapSearch";
export { MapStatus } from "./components/MapStatus";

// ---- profile ----
export { createDefaultMapProfile, validateMapProfile, mergeMapProfiles, serialiseMapProfile, deserialiseMapProfile } from "./config/defaultMapProfile";
export type { ProfileValidation } from "./config/defaultMapProfile";

// ---- config / rules ----
export { ROAD_CLASS_MAPPINGS, ROAD_CLASS_ALIASES, validateRoadCoverage, motorwayLocked, mappingFor, LOCKED_DECISIONS, APPLICATION_ROAD_CLASSES } from "./config/roadRules";
export { CONTROL_SECTIONS, layerVisibilityForProfile } from "./config/layerRegistry";
export type { DrawerSection, DrawerControl } from "./config/layerRegistry";

// ---- core ----
export { createMapStyle, buildMapSources } from "./core/createMapStyle";
export { registerPmtilesProtocol } from "./core/pmtilesProtocol";
export { ensureMaplibre, setMaplibreAssets } from "./core/mapLifecycle";

// ---- feeder engine ----
export { isFeederCandidate, suggestFeeders, includedFeederNumbers, addManualFeeder, addFeederByName, setFeederStatus, setFeederPriority, removeFeeder } from "./feeder/feederEngine";
export type { RoadFeatureLite } from "./feeder/feederEngine";

// ---- adapters ----
export { defaultFeatureInfoAdapter, createDefaultSearchAdapter } from "./adapters/adapters";
export type { MapSearchAdapter, FeatureInfoAdapter, TileSourceAdapter, RawMapFeature } from "./adapters/adapters";

// ---- utils ----
export { lngLatToTile, boundsFromCoords, isValidLngLat, clamp, GB_BOUNDS } from "./utils/utils";

// ---- types ----
export type {
  GeospatialMapProps, GeospatialMapControls, MapProfile, MapLayerConfig, RoadLayerConfig, RoadClassStyleMapping,
  RoadCoverageReport, ApplicationRoadClass, FeederRoadEntry, FeederRoadConfig, FeederSource, FeederStatus, FeederPriority,
  FeederSuggestionContext, LabelConfig, LabelDensity, PostcodeLayerConfig, TransportLayerConfig, EnvironmentLayerConfig,
  MapFeatureSelection, MapOverlayDefinition, MapOverlayLayerDefinition, MapOverlaySource, GeoJSONSourceDefinition,
  VectorTileSourceDefinition, MapLegendDefinition, MapEventHandlers, GeospatialSourceConfig, AttributionDefinition,
  MapViewState, MapInstanceReference, MapControlCapabilities, MapBounds, TerritoryGeometry, TerritoryAction,
  MapSearchResult, MapSearchContext, SupplementalRoadSource,
} from "./types";
