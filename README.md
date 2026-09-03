# Torino City Intelligence

Interactive map of Turin answering **"where to open a café"**. Six toggleable POI layers (cafés, restaurants, transit stops, schools, hospitals & supermarkets, green areas) over a choropleth of the city's 94 statistical zones, each scored 0–100 with an explainable per-variable breakdown.

Built with Next.js 16 (App Router, SSG) + MapLibre GL (react-map-gl) on the OpenFreeMap basemap. Trilingual UI (EN/ES/IT). **Zero API keys, zero database, zero recurring cost.**

---

## Architecture

```
Next.js 16 static export (output: export) on Vercel Hobby
├── public/data/*.geojson      precomputed, static (committed to repo)
│   ├── cafes/restaurants/transit/schools/services/green.geojson   POI layers (OSM)
│   ├── zones.geojson           aperTO zone polygons, EPSG:4326 (reprojected)
│   ├── scores.geojson          zones + 5 scoring variables + total (94 features)
│   └── manifest.json           layer/zone counts (no DB, no API route)
├── src/app/[locale]/           SSG route per locale (en/es/it)
├── src/components/             MapView (MapLibre), LayerToggle, ScorePanel, ...
├── src/lib/scoring.ts          weights + min-max shared by ETL and UI
└── etl/                        one-time local data pipeline (see below)
```

Design decisions (full rationale in the SDD design doc):

- **No database.** Data is a few MB of read-only static GeoJSON. A DB adds infra, a 7-day inactivity pause on free tiers, and zero benefit for a yearly refresh. CDN-cacheable and trivially rollback-able.
- **Precomputed scores at build time** in the ETL — deterministic, unit-tested, and the client just renders.
- **MapLibre GL (WebGL)** for the choropleth fills + POI density at ~4.8k points; the SVG-DOM alternative (react-leaflet) degrades at that scale.
- **Lazy, on-demand payloads.** Initial load fetches only `manifest.json` + `scores.geojson` (tiny). Each POI layer GeoJSON is fetched on first toggle (`next/dynamic` + per-layer fetch), keeping first paint in the few-MB budget.
- **No env vars.** Everything runs on public static assets.

---

## Data sources

| Source | What | URL | License |
|---|---|---|---|
| OpenStreetMap (Geofabrik) | POI layers (cafés, restaurants, transit stops, schools, services, parks) | <https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf> | [ODbL 1.0](https://www.openstreetmap.org/copyright) |
| aperTO — zone_statistiche | 94 statistical-zone polygons (EPSG:3003) | <http://geoportale.comune.torino.it/geodati/zip/zone_statistiche_geo.zip> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| aperTO — population 2023 | Residents per zone | <https://risorse.comune.torino.it/statistica/dati/2023/csv/A3%20Pop%20per%20Sesso%20e%20Zone%20statistiche.csv> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| OpenFreeMap | Basemap tiles (liberty/dark) | <https://openfreemap.org/> | Free, no key, no limits |

The POI layers, zone polygons, and scores are **derived data** computed from the sources above. ODbL share-alike applies to the OSM-derived layers.

---

## ETL (reproduction)

One-time local pipeline: `Geofabrik extract → osmium → ogr2ogr → Bun scoring → GeoJSON`.

**Prerequisites:** `osmium-tool`, GDAL (`ogr2ogr`), `python3`, Bun. No root needed — see "Installing the tools without root" below.

```bash
# 0. (optional) system tools, else use the rootless .deb extraction
sudo apt install osmium-tool gdal-bin        # or: bash etl/00-tools.sh
source etl/env.sh                            # picks up system tools, falls back to debroot

# 1. Download sources into etl/raw/ (~587 MB extract + aperTO files, gitignored)
bash etl/01-fetch.sh

# 2. Extract Torino bbox, filter per-category POIs → public/data/*.geojson (EPSG:4326)
bash etl/02-filter.sh

# 3. Reproject aperTO zones EPSG:3003 → EPSG:4326
bash etl/03-zones.sh

# 4. Join population CSV by ZONASTAT, compute + normalize the 5 variables, write scores
bun run etl/04-score.ts

# 5. Fail-loud data integrity asserts (94 zones, EPSG:4326, counts in tolerance, no null scores)
bun run etl/05-assert.ts

# 6. Precompute layer counts into manifest.json (replaces an API route under output: export)
bun run etl/06-manifest.ts
```

Outputs are committed; re-running is only needed to refresh the data. The pipeline **fails loudly** (non-zero exit) on schema/source drift instead of emitting silently corrupt output — e.g. md5-verified PBF, EPSG asserts, and a `FATAL` guard when a zone lacks a population row.

### Installing the tools without root

`etl/00-tools.sh` downloads the Ubuntu `.deb` packages and extracts them into `~/.local/opt/debroot` (osmium 1.16, GDAL 3.8). `etl/env.sh` sources the right `PATH`/`LD_LIBRARY_PATH`/`PROJ_LIB` automatically.

---

## Scoring methodology

Each of the 94 statistical zones receives a **0–100** score from **5 weighted variables**. Variables are **min-max normalized** across zones to [0, 1], then combined with the weights (they sum to 100%):

| Variable | Weight | Raw input | Direction |
|---|---|---|---|
| Café competition | 30% | café density (cafés/km²) | **inverse** — fewer competitors → better |
| Potential traffic | 25% | commercial POI density (cafés+restaurants+services)/km² | higher → better |
| Transit access | 20% | transit stops within 500 m of zone centroid | higher → better |
| Population | 15% | aperTO residents (2023) | higher → better |
| Daytime flow | 10% | daytime anchors (schools+services)/km² | higher → better |

`total = 100 × (0.30·(1−cafe_norm) + 0.25·traffic_norm + 0.20·transit_norm + 0.15·pop_norm + 0.10·flow_norm)`, rounded to one decimal. Scores range **30.4–57.1** across zones. The client renders the same weights/contributions from `src/lib/scoring.ts` (single source of truth shared with the ETL), and the ScorePanel shows weight, raw value, and contribution per variable — summing to the zone total.

---

## Attribution

The app footer visibly credits (in all three languages):

- **Map data © OpenStreetMap contributors (ODbL 1.0)**
- **Zones & population © aperTO — Città di Torino (CC BY 4.0)**
- A note that POI layers and zone scores are derived data from those sources.

Any redistribution of the OSM-derived GeoJSON must keep ODbL 1.0 share-alike.

---

## Development

```bash
bun install
bun dev          # http://localhost:3000
bun test         # ETL scoring unit tests
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
```

`next.config.ts` sets `output: "export"` — the app builds to a fully static site. **Do not run `next build` locally for gating** (static export output); use the typecheck + lint + test gates above.

## CI

[![CI](https://github.com/wellnahuel/torino-city-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/wellnahuel/torino-city-intelligence/actions/workflows/ci.yml)

Quality gate on push/PR to `main` — typecheck (`tsc --noEmit`), lint (`eslint src`), and the test suite (`bun test`). No `next build`: Vercel runs the production build on deploy.

## Deployment (Vercel Hobby)

1. Import the repo at <https://vercel.com> (Hobby = free, non-commercial — fine for a personal portfolio).
2. Framework preset **Next.js**; build command `next build`; output is a static export. **No environment variables.**
3. Deploy. The static GeoJSON is served straight from the CDN; heavy layers load lazily on toggle so the initial payload stays small.

---

## License

Code: private portfolio project. Data: see [Attribution](#attribution) — OSM (ODbL 1.0), aperTO (CC BY 4.0).