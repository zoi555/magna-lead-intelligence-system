"use client";

// National Map Workbench — renders the shared, portable @geospatial/map component
// with all controls. No bespoke MapLibre setup here (that lives in the package).
// Feeder-road state is owned by this app and persisted locally.

import React from "react";
import { GeospatialMap } from "@geospatial-map";
import type { FeederRoadEntry } from "@geospatial-map";
import { aspectleadSourceConfig, NATIONAL_INITIAL_VIEW } from "@/features/geospatial/aspectlead-map-config";

const LS_KEY = "aspectlead.national-map.feeders";
const loadFeeders = (): FeederRoadEntry[] => { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };

export default function NationalMapPage() {
  const [feeders, setFeeders] = React.useState<FeederRoadEntry[]>([]);
  React.useEffect(() => { setFeeders(loadFeeders()); }, []);
  const onFeeders = (f: FeederRoadEntry[]) => { setFeeders(f); try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ } };

  return (
    <div style={{ height: "calc(100vh - 104px)", width: "100%", position: "relative" }}>
      <GeospatialMap
        sources={aspectleadSourceConfig()}
        initialView={NATIONAL_INITIAL_VIEW}
        feederRoads={feeders}
        onFeederRoadsChange={onFeeders}
        controls={{ layerDrawer: true, search: true, featureInspector: true, scale: true, zoomIndicator: true, nationalView: true, roads: true, feederRoads: true, placesAndLabels: true, postcodes: true, transport: true, environment: true }}
      />
    </div>
  );
}
