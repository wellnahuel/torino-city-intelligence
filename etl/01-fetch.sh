#!/usr/bin/env bash
# 01-fetch.sh — download the three raw sources into etl/raw/ (gitignored).
#  1. Geofabrik nord-ovest OSM extract (~587 MB, md5-verified)
#  2. aperTO zone_statistiche SHP (EPSG:3003, CC BY 4.0)
#  3. aperTO population by zone, 2023 (CSV, CC BY 4.0)
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$RAW"
cd "$RAW"

echo "== [1/3] Geofabrik nord-ovest extract"
curl -sL --fail --retry 3 -C - -o nord-ovest-latest.osm.pbf \
  "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf"
curl -sL --fail --retry 3 -o nord-ovest-latest.osm.pbf.md5 \
  "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf.md5"
md5sum -c nord-ovest-latest.osm.pbf.md5 || { echo "FATAL: Geofabrik md5 mismatch — source changed." >&2; exit 1; }

echo "== [2/3] aperTO zone statistiche (SHP)"
curl -sL --fail --retry 3 -o zone_statistiche_geo.zip \
  "http://geoportale.comune.torino.it/geodati/zip/zone_statistiche_geo.zip"
unzip -o zone_statistiche_geo.zip >/dev/null

echo "== [3/3] aperTO population by zone 2023 (CSV)"
curl -sL --fail --retry 3 -o pop_zona_2023.csv \
  "https://risorse.comune.torino.it/statistica/dati/2023/csv/A3%20Pop%20per%20Sesso%20e%20Zone%20statistiche.csv"

echo "OK: sources ready in $RAW"
ls -la "$RAW"