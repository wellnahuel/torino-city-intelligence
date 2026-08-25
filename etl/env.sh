#!/usr/bin/env bash
# Shared environment for ETL scripts.
# Prefers system osmium/ogr2ogr; falls back to a local .deb extraction
# (see README "Installing the tools without root").
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v osmium >/dev/null 2>&1 || ! command -v ogr2ogr >/dev/null 2>&1; then
  GEO_ROOT="${GEO_ROOT:-$HOME/.local/opt/debroot}"
  export PATH="$GEO_ROOT/usr/bin:$PATH"
  export LD_LIBRARY_PATH="$GEO_ROOT/usr/lib/x86_64-linux-gnu:$GEO_ROOT/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export PROJ_LIB="$GEO_ROOT/usr/share/proj"
fi

# Fail loudly if the tools are still missing.
command -v osmium >/dev/null 2>&1 || { echo "FATAL: osmium not found. Install osmium-tool or run etl/00-tools.sh." >&2; exit 1; }
command -v ogr2ogr >/dev/null 2>&1 || { echo "FATAL: ogr2ogr not found. Install gdal-bin or run etl/00-tools.sh." >&2; exit 1; }

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export RAW="$ROOT/etl/raw"
export DATA_OUT="$ROOT/public/data"