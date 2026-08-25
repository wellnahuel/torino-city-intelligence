#!/usr/bin/env bash
# 00-tools.sh — install osmium-tool + gdal-bin WITHOUT root by downloading the
# Ubuntu .deb packages and extracting them into ~/.local/opt/debroot.
# Prefer a system install (`sudo apt install osmium-tool gdal-bin`) when possible.
set -uo pipefail

GEO_ROOT="${GEO_ROOT:-$HOME/.local/opt/debroot}"
DL="$(mktemp -d)"
mkdir -p "$GEO_ROOT"

declare -A DONE

fetch() {
  local pkg="$1"
  if [ "${DONE[$pkg]:-}" = "1" ]; then return 0; fi
  if dpkg -s "$pkg" >/dev/null 2>&1; then DONE[$pkg]=1; return 0; fi
  DONE[$pkg]=1
  echo "== fetch $pkg"
  rm -f "$DL"/*.deb
  ( cd "$DL" && apt-get download "$pkg" >/dev/null 2>&1 ) || { echo "!! apt-get download failed: $pkg"; return 1; }
  local f; f=$(ls "$DL"/*.deb 2>/dev/null | head -1)
  dpkg -x "$f" "$GEO_ROOT" || { echo "!! dpkg -x failed: $pkg"; return 1; }
  rm -f "$f"
  local dep alt
  while read -r line; do
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/^<//;s/>$//')
    case "$line" in
      Depends:*|Depende:*) dep="${line#*: }";;
      \|*) alt="${line#| }"; [ -n "${DONE[$alt]:-}" ] && dep="";;
      *) dep="";;
    esac
    if [ -n "${dep:-}" ]; then
      dep=$(echo "$dep" | sed 's/(.*)//' | xargs)
      fetch "$dep" || true
    fi
  done < <(apt-cache depends "$pkg" 2>/dev/null)
}

for p in osmium-tool gdal-bin libarpack2t64; do
  fetch "$p"
done

export LD_LIBRARY_PATH="$GEO_ROOT/usr/lib/x86_64-linux-gnu:$GEO_ROOT/usr/lib"
export PROJ_LIB="$GEO_ROOT/usr/share/proj"
export PATH="$GEO_ROOT/usr/bin:$PATH"

echo "== verifying"
osmium --version | head -1
ogr2ogr --version | head -1
echo "Tools ready at $GEO_ROOT (sourced via etl/env.sh)"