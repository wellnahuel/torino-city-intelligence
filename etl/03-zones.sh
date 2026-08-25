#!/usr/bin/env bash
# 03-zones.sh — reproject aperTO zone SHP from EPSG:3003 to EPSG:4326.
# The aperTO zone_statistiche shapefile is Gauss-Boaga / Monte Mario Italy 1
# (EPSG:3003) — a mandatory reprojection before use in the app.
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$DATA_OUT"
cd "$RAW"

echo "== reprojecting zones EPSG:3003 -> EPSG:4326"
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco RFC7946=YES -overwrite \
  "$DATA_OUT/zones.geojson" zone_statistiche_geo.shp

echo "== writing base zones with empty score attributes"
python3 - "$DATA_OUT/zones.geojson" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
for f in data["features"]:
    props = f["properties"]
    props.setdefault("name", props.get("DENOM", ""))
    for k in ("pop2023","cafes","cafe_density","stops500m","cafe_norm","traffic_norm","transit_norm","pop_norm","flow_norm","traffic_raw","flow_raw","total"):
        props.setdefault(k, None)
json.dump(data, open(path, "w"))
print(f"zones: {len(data['features'])} features")
PY

echo "OK: zones written to $DATA_OUT/zones.geojson"