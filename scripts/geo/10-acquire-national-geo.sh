#!/usr/bin/env bash
# AspectLead national geospatial ACQUISITION.
#
# Downloads the free OGL v3.0 Great Britain OS OpenData products from the OS
# Downloads API (api.os.uk/downloads/v1 — no API key required for OpenData),
# records SHA-256 checksums, sizes, versions and licence, and writes a manifest.
#
# Downloads land OUTSIDE the git repo, in $GEO_ROOT (default ~/Data/aspectlead-geospatial).
# These raw datasets must NEVER be committed to git.
#
#   bash scripts/geo/10-acquire-national-geo.sh            # all products
#   bash scripts/geo/10-acquire-national-geo.sh OpenRoads  # one product
set -euo pipefail

GEO_ROOT="${GEO_ROOT:-$HOME/Data/aspectlead-geospatial}"
DL="$GEO_ROOT/downloads"; MAN="$GEO_ROOT/manifests"; LOG="$GEO_ROOT/logs"
mkdir -p "$DL" "$MAN" "$LOG"
API="https://api.os.uk/downloads/v1/products"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# product_id  format  (chosen format per national-acquisition-catalogue.ts)
PRODUCTS=(
  "OpenZoomstack|Vector Tiles"
  "OpenRoads|GeoPackage"
  "OpenNames|GeoPackage"
  "OpenMapLocal|GeoPackage"
  "CodePointOpen|GeoPackage"
  "OpenGreenspace|Vector Tiles"
  "OpenRivers|Vector Tiles"
  "BoundaryLine|Vector Tiles"
)

want="${1:-}"
manifest="$MAN/acquisition-$STAMP.json"
echo "[" > "$manifest"; first=1

for entry in "${PRODUCTS[@]}"; do
  id="${entry%%|*}"; fmt="${entry##*|}"
  [ -n "$want" ] && [ "$want" != "$id" ] && continue

  # Confirm upstream version + size from the API before downloading.
  meta_json="$(curl -s -m 60 "$API/$id")"
  version="$(printf '%s' "$meta_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version||"unknown")}catch(e){console.log("unknown")}})')"
  url="$API/$id/downloads?area=GB&format=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$fmt")&redirect"
  out="$DL/${id}.zip"

  echo "→ $id ($fmt, v$version)  → $out"
  curl -L --fail --retry 3 --retry-delay 5 -m 3600 -o "$out" "$url" 2>>"$LOG/acquire.log" \
    && status="downloaded" || status="FAILED"

  bytes=0; sha=""
  if [ "$status" = "downloaded" ] && [ -f "$out" ]; then
    bytes=$(stat -f%z "$out"); sha=$(shasum -a 256 "$out" | cut -d' ' -f1)
    echo "$sha  ${id}.zip" >> "$MAN/checksums.sha256"
  fi

  [ $first -eq 0 ] && echo "," >> "$manifest"; first=0
  cat >> "$manifest" <<JSON
  {"product":"$id","format":"$fmt","osVersion":"$version","licence":"OGL v3.0",
   "coverage":"Great Britain","downloadedAt":"$STAMP","status":"$status",
   "bytes":$bytes,"sha256":"$sha","file":"downloads/${id}.zip","sourceUrl":"$url"}
JSON
done

echo "]" >> "$manifest"
echo "Manifest: $manifest"
echo "Checksums: $MAN/checksums.sha256"
echo "NOTE: ONSPD (postcode→admin lookup) is on the ONS portal, not the OS API — acquire separately."
