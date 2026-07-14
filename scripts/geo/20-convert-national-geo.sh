#!/usr/bin/env bash
# AspectLead national geospatial CONVERSION → PMTiles.
#
# Reprojects OS OpenData (EPSG:27700 British National Grid) to WGS84 and tiles it
# into PMTiles for MapLibre. Runs product-by-product and deletes intermediate
# GeoJSON after tiling, to keep peak disk low (~30-50GB instead of ~150GB).
#
# Requires: ogr2ogr (GDAL), tippecanoe, pmtiles, unzip.  Run 00-install-tools.sh first.
#
#   bash scripts/geo/20-convert-national-geo.sh            # all downloaded products
#   bash scripts/geo/20-convert-national-geo.sh OpenRoads  # one product
set -euo pipefail

GEO_ROOT="${GEO_ROOT:-$HOME/Data/aspectlead-geospatial}"
DL="$GEO_ROOT/downloads"; EX="$GEO_ROOT/extracted"; INT="$GEO_ROOT/intermediate"
TILES="$GEO_ROOT/tiles"; LOG="$GEO_ROOT/logs"
mkdir -p "$EX" "$INT" "$TILES" "$LOG"

for t in ogr2ogr tippecanoe pmtiles unzip; do
  command -v "$t" >/dev/null 2>&1 || { echo "ERROR: $t missing — run scripts/geo/00-install-tools.sh" >&2; exit 1; }
done

want="${1:-}"

# Zoomstack / Greenspace / Rivers / Boundary-Line ship as MBTiles (Vector Tiles
# format) → convert straight to PMTiles, no reprojection/tiling needed.
# Some products (e.g. Zoomstack) arrive as a BARE .mbtiles (SQLite) rather than a
# zip; the OS API sets no extension, so we detect the real type with `file`.
mbtiles_to_pmtiles() {
  local id="$1"; local src="$DL/${id}.zip"
  [ -f "$src" ] || src="$DL/${id}.mbtiles"
  [ -f "$src" ] || { echo "skip $id (not downloaded)"; return; }
  local mb
  if file -b "$src" | grep -qi "SQLite"; then
    mb="$src"                                  # already an MBTiles, just misnamed
  else
    rm -rf "$EX/$id"; mkdir -p "$EX/$id"; unzip -o -q "$src" -d "$EX/$id"
    mb="$(find "$EX/$id" -iname '*.mbtiles' | head -1)"
  fi
  [ -n "$mb" ] || { echo "WARN $id: no .mbtiles found"; return; }
  pmtiles convert "$mb" "$TILES/${id,,}.pmtiles" 2>>"$LOG/convert.log"
  echo "✓ $id → $TILES/${id,,}.pmtiles"
  rm -rf "$EX/$id"
}

# GeoPackage products → reproject to WGS84 GeoJSONSeq → tippecanoe → pmtiles.
gpkg_to_pmtiles() {
  local id="$1"; local minzoom="$2"; local maxzoom="$3"; local zip="$DL/${id}.zip"
  [ -f "$zip" ] || { echo "skip $id (not downloaded)"; return; }
  rm -rf "$EX/$id"; mkdir -p "$EX/$id"; unzip -o -q "$zip" -d "$EX/$id"
  local gpkg; gpkg="$(find "$EX/$id" -iname '*.gpkg' | head -1)"
  [ -n "$gpkg" ] || { echo "WARN $id: no .gpkg inside archive"; return; }
  local geo="$INT/${id}.geojsonl"
  echo "  ogr2ogr reprojecting $id (27700→4326) ..."
  ogr2ogr -f GeoJSONSeq -t_srs EPSG:4326 "$geo" "$gpkg" 2>>"$LOG/convert.log"
  echo "  tippecanoe $id (z$minzoom-$maxzoom) ..."
  tippecanoe -Z"$minzoom" -z"$maxzoom" --drop-densest-as-needed --extend-zooms-if-still-dropping \
    --force -o "$INT/${id}.mbtiles" "$geo" 2>>"$LOG/convert.log"
  pmtiles convert "$INT/${id}.mbtiles" "$TILES/${id,,}.pmtiles" 2>>"$LOG/convert.log"
  echo "✓ $id → $TILES/${id,,}.pmtiles"
  rm -f "$geo" "$INT/${id}.mbtiles"; rm -rf "$EX/$id"   # reclaim disk immediately
}

run() { [ -z "$want" ] || [ "$want" = "$1" ]; }

run OpenZoomstack  && mbtiles_to_pmtiles OpenZoomstack
run OpenGreenspace && mbtiles_to_pmtiles OpenGreenspace
run OpenRivers     && mbtiles_to_pmtiles OpenRivers
run BoundaryLine   && mbtiles_to_pmtiles BoundaryLine
run OpenRoads      && gpkg_to_pmtiles OpenRoads     5 15
run OpenNames      && gpkg_to_pmtiles OpenNames     4 14
run CodePointOpen  && gpkg_to_pmtiles CodePointOpen 8 15
run OpenMapLocal   && gpkg_to_pmtiles OpenMapLocal  10 16

echo ""
echo "PMTiles written to $TILES/ — upload to object storage/CDN; do NOT commit to git."
echo "After OpenRoads converts, validate its road classes against map-layer-config ROAD_CLASSES:"
echo "  ogr2ogr -f CSV /vsistdout/ -sql \"SELECT DISTINCT roadClassification FROM RoadLink\" <gpkg>"
