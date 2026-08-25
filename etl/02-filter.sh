#!/usr/bin/env bash
# 02-filter.sh — OSM → Torino bbox → per-category GeoJSON (EPSG:4326).
#  bbox 7.50,44.99,7.82,45.20 (Torino municipality + hill zones)
# point layers: cafes, restaurants, transit, schools, services
# polygon layer: green (parks/gardens)
# NOTE: plain tag filters (no a/ prefix) match all object types; the
# --geometry-types point export keeps only point geometries. The a/ prefix
# would restrict to closed-way areas and collapse the layer to a handful of
# features (previous bug).
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$DATA_OUT"
cd "$RAW"

BBOX="7.50,44.99,7.82,45.20"

if [ ! -f torino.osm.pbf ]; then
  echo "== bbox extract (one pass over nord-ovest)"
  osmium extract --bbox "$BBOX" --strategy=complete_ways \
    nord-ovest-latest.osm.pbf -o torino.osm.pbf
fi

# filter_points <layer> <tags...>: points-only POI layer, stripped to id/name.
filter_points() {
  local layer="$1"; shift
  echo "== $layer (points)"
  rm -f "$layer.osm.pbf" "$layer.raw.geojson"
  osmium tags-filter -f pbf torino.osm.pbf "$@" -o "$layer.osm.pbf"
  osmium export -f geojson --geometry-types point -O "$layer.osm.pbf" -o "$layer.raw.geojson"
  rm -f "$layer.osm.pbf"
  rm -f "$DATA_OUT/$layer.geojson"
  # osmium point exports carry only geometry + tags (no id field), so select
  # just `name`; POIProperties.id is nullable in the app data contract.
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 -select name -overwrite \
    "$DATA_OUT/$layer.geojson" "$layer.raw.geojson"
  rm -f "$layer.raw.geojson"
}

filter_points cafes  "amenity=cafe" "amenity=bar" "amenity=fast_food"
filter_points restaurants "amenity=restaurant"
filter_points transit "highway=bus_stop" "railway=tram_stop" "railway=station" "railway=halt" "public_transport=platform"
filter_points schools "amenity=school" "amenity=kindergarten" "amenity=college" "amenity=university"
filter_points services "amenity=hospital" "amenity=clinic" "amenity=pharmacy" "shop=supermarket"

echo "== green (polygons)"
rm -f green.osm.pbf green.raw.geojson
osmium tags-filter -f pbf torino.osm.pbf "a/leisure=park" "a/leisure=garden" -o green.osm.pbf
osmium export -f geojson --geometry-types polygon -O green.osm.pbf -o green.raw.geojson
rm -f green.osm.pbf
rm -f "$DATA_OUT/green.geojson"
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -select name -simplify 0.00008 -overwrite \
  "$DATA_OUT/green.geojson" green.raw.geojson
rm -f green.raw.geojson

echo "OK: layers written to $DATA_OUT"
for f in cafes restaurants transit schools services green; do
  printf "%s: %s features\n" "$f" "$(python3 -c "import json;print(len(json.load(open('$DATA_OUT/$f.geojson'))['features']))" 2>/dev/null || echo '?')"
done