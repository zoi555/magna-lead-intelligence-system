#!/usr/bin/env bash
# AspectLead national geospatial toolchain installer (macOS / Homebrew).
#
# Installs the exact tools needed to convert OS OpenData (British National Grid
# GeoPackage / Shapefile) into browser-deliverable PMTiles. Idempotent: skips
# anything already installed. Nothing here downloads mapping data.
#
#   bash scripts/geo/00-install-tools.sh
set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Homebrew not found. Install from https://brew.sh first." >&2
  exit 1
fi

for f in gdal tippecanoe pmtiles; do
  if brew list --formula "$f" >/dev/null 2>&1; then
    echo "✓ $f already installed ($(brew list --versions "$f"))"
  else
    echo "→ installing $f ..."
    brew install "$f"
  fi
done

echo ""
echo "Verifying:"
command -v ogr2ogr    >/dev/null 2>&1 && echo "  ogr2ogr    $(ogr2ogr --version)"      || { echo "  ogr2ogr MISSING";    exit 1; }
command -v tippecanoe >/dev/null 2>&1 && echo "  tippecanoe $(tippecanoe --version 2>&1 | head -1)" || { echo "  tippecanoe MISSING"; exit 1; }
command -v pmtiles    >/dev/null 2>&1 && echo "  pmtiles    $(pmtiles version 2>&1 | head -1)"       || { echo "  pmtiles MISSING";    exit 1; }
echo "Toolchain ready."
