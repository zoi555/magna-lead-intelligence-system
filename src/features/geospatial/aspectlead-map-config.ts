// AspectLead application adapter — geospatial source configuration.
// AspectLead is a CLIENT of the independent @zoi555/geospatial-map platform. This file is
// framework glue only: it reads AspectLead's own optional env override and passes the
// value to the package's production helper. The package itself never reads process.env.
//
//   NEXT_PUBLIC_MAP_ASSET_BASE_URL (optional override)
//     absent  → the package's production release default (https://assets.geospatmap.com/gb/2026-07-14)
//     present → createProductionSourceConfig({ assetBaseUrl }) — e.g. "/map" for local development

import { createProductionSourceConfig, type GeospatialSourceConfig } from "@zoi555/geospatial-map";

export function aspectleadSourceConfig(): GeospatialSourceConfig {
  const override = process.env.NEXT_PUBLIC_MAP_ASSET_BASE_URL;
  return override
    ? createProductionSourceConfig({ assetBaseUrl: override })
    : createProductionSourceConfig();
}

export const NATIONAL_INITIAL_VIEW = { longitude: -2.9, latitude: 54.3, zoom: 5.2 };
