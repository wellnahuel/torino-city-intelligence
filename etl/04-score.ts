/**
 * 04-score.ts — join population CSV by ZONASTAT, spatial-join POIs to zones,
 * compute the 5 scoring variables, min-max normalize, and write scores.geojson.
 *
 * Scoring model (weights from the SDD design, D5):
 *   café competition  30%  INVERSE of café density (fewer competitors = better)
 *   potential traffic 25%  commercial POI density (cafes+restaurants+services) / km²
 *   transit access    20%  transit stops within 500 m of zone centroid
 *   population        15%  aperTO residents 2023
 *   daytime flow      10%  daytime anchors (schools+services) / km²
 *
 * Run:  bun run etl/04-score.ts
 * Pure helpers are exported for unit tests (etl/score.test.ts).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from "geojson";
import { WEIGHTS, minMax, weightedTotal } from "../src/lib/scoring";

export { WEIGHTS, minMax, weightedTotal };

const ROOT = path.resolve(import.meta.dir, "..");
const RAW = path.join(ROOT, "etl", "raw");
const DATA_OUT = path.join(ROOT, "public", "data");

export interface ScoreInputs {
  pop2023: number;
  cafes: number;
  cafeDensity: number;
  stops500m: number;
  trafficRaw: number;
  flowRaw: number;
}

/** Canonical ZONASTAT key: zero-pad numeric codes, keep "NNbis" as-is. */
export function canonicalCode(code: string): string {
  const c = String(code).trim();
  return /^\d+$/.test(c) ? c.padStart(2, "0") : c;
}

/** Point-in-polygon (ray casting). Polygon rings: outer + holes. */
export function pointInPolygon(point: Position, poly: Polygon): boolean {
  const [x, y] = point;
  const inside = (ring: Position[]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        hit = !hit;
      }
    }
    return hit;
  };
  if (!inside(poly.coordinates[0])) return false;
  for (let k = 1; k < poly.coordinates.length; k++) {
    if (inside(poly.coordinates[k])) return false;
  }
  return true;
}

export function pointInGeometry(point: Position, geom: Polygon | MultiPolygon): boolean {
  if (geom.type === "Polygon") return pointInPolygon(point, geom);
  return geom.coordinates.some((poly) => pointInPolygon(point, { type: "Polygon", coordinates: poly }));
}

/** Shoelace centroid of the outer ring (planar degrees — fine for tiny polygons). */
export function polygonCentroid(poly: Polygon): Position {
  const ring = poly.coordinates[0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

export function geometryCentroid(geom: Polygon | MultiPolygon): Position {
  if (geom.type === "Polygon") return polygonCentroid(geom);
  // Area-weighted centroid across polygons.
  let areaSum = 0, cx = 0, cy = 0;
  for (const poly of geom.coordinates) {
    const c = polygonCentroid({ type: "Polygon", coordinates: poly });
    const ring = poly[0];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    a *= 0.5;
    areaSum += a;
    cx += c[0] * a;
    cy += c[1] * a;
  }
  return areaSum ? [cx / areaSum, cy / areaSum] : [0, 0];
}

/** Equirectangular area in km², anchored at the zone latitude. */
export function areaKm2(poly: Polygon, lat0: number): number {
  const ky = 110.574; // km per degree latitude
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ring = poly.coordinates[0];
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs((a / 2) * kx * ky);
}

export function geometryAreaKm2(geom: Polygon | MultiPolygon, lat0: number): number {
  if (geom.type === "Polygon") return areaKm2(geom, lat0);
  return geom.coordinates.reduce((s, p) => s + areaKm2({ type: "Polygon", coordinates: p }, lat0), 0);
}

/** Haversine distance in metres. */
export function haversineKm(a: Position, b: Position): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la = (a[1] * Math.PI) / 180;
  const lb = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

interface LayerFile {
  layer: string;
  path: string;
}

function loadPoints(file: string): Position[] {
  const fc = readJson<FeatureCollection>(file);
  const pts: Position[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type === "Point") pts.push(f.geometry.coordinates);
  }
  return pts;
}

function loadZones(): Feature[] {
  const fc = readJson<FeatureCollection>(path.join(DATA_OUT, "zones.geojson"));
  return fc.features.filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
}

function parsePopCsv(): Map<string, number> {
  const raw = fs.readFileSync(path.join(RAW, "pop_zona_2023.csv"), "utf8");
  const out = new Map<string, number>();
  const rows = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Header: "Num_zona_stat";"Desc_zona_stat";"Femmine";"Maschi"
  for (const row of rows.slice(1)) {
    const cols = row.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 4) continue;
    const pop = Number(cols[2]) + Number(cols[3]);
    if (!Number.isFinite(pop)) continue;
    out.set(canonicalCode(cols[0]), pop);
  }
  return out;
}

function main() {
  const zones = loadZones();
  const pop = parsePopCsv();

  const cafes = loadPoints(path.join(DATA_OUT, "cafes.geojson"));
  const restaurants = loadPoints(path.join(DATA_OUT, "restaurants.geojson"));
  const schools = loadPoints(path.join(DATA_OUT, "schools.geojson"));
  const services = loadPoints(path.join(DATA_OUT, "services.geojson"));
  const transit = loadPoints(path.join(DATA_OUT, "transit.geojson"));

  const rawVars: ScoreInputs[] = [];
  let missingPop = 0;

  for (const zone of zones) {
    const props = zone.properties as Record<string, unknown>;
    const code = canonicalCode(String(props.ZONASTAT ?? ""));
    const name = String(props.DENOM ?? props.name ?? code);
    const geom = zone.geometry as Polygon | MultiPolygon;
    const centroid = geometryCentroid(geom);
    const area = geometryAreaKm2(geom, centroid[1]);

    const countIn = (pts: Position[]) =>
      pts.filter((p) => pointInGeometry(p, geom)).length;

    const cafesN = countIn(cafes);
    const restaurantsN = countIn(restaurants);
    const schoolsN = countIn(schools);
    const servicesN = countIn(services);

    const stops500m = transit.filter((p) => haversineKm(centroid, p) <= 0.5).length;
    const pop2023 = pop.get(code);

    if (pop2023 === undefined) {
      missingPop += 1;
      console.warn(`  zone ${code} (${name}): no population row — marked invalid`);
      for (const k of ["pop2023","cafes","cafe_density","stops500m","cafe_norm","traffic_norm","transit_norm","pop_norm","flow_norm","traffic_raw","flow_raw","total"]) {
        props[k] = null;
      }
      props.name = name;
      continue;
    }

    const cafeDensity = area > 0 ? cafesN / area : 0;
    const trafficRaw = area > 0 ? (cafesN + restaurantsN + servicesN) / area : 0;
    const flowRaw = area > 0 ? (schoolsN + servicesN) / area : 0;

    rawVars.push({ pop2023, cafes: cafesN, cafeDensity, stops500m, trafficRaw, flowRaw });

    Object.assign(props, {
      name,
      pop2023,
      cafes: cafesN,
      cafe_density: Number(cafeDensity.toFixed(4)),
      stops500m,
      traffic_raw: Number(trafficRaw.toFixed(4)),
      flow_raw: Number(flowRaw.toFixed(4)),
    });
  }

  if (missingPop > 0) {
    console.error(`FATAL: ${missingPop} zone(s) missing population data — scores invalid.`);
    process.exit(1);
  }

  // Normalize each variable across zones (min-max).
  const cafeNorm = minMax(rawVars.map((v) => v.cafeDensity));
  const trafficNorm = minMax(rawVars.map((v) => v.trafficRaw));
  const transitNorm = minMax(rawVars.map((v) => v.stops500m));
  const popNorm = minMax(rawVars.map((v) => v.pop2023));
  const flowNorm = minMax(rawVars.map((v) => v.flowRaw));

  const normByCafe = new Map(rawVars.map((v) => [v, cafeNorm.get(v.cafeDensity)!]));
  const normByTraffic = new Map(rawVars.map((v) => [v, trafficNorm.get(v.trafficRaw)!]));
  const normByTransit = new Map(rawVars.map((v) => [v, transitNorm.get(v.stops500m)!]));
  const normByPop = new Map(rawVars.map((v) => [v, popNorm.get(v.pop2023)!]));
  const normByFlow = new Map(rawVars.map((v) => [v, flowNorm.get(v.flowRaw)!]));

  let i = 0;
  for (const zone of zones) {
    const props = zone.properties as Record<string, unknown>;
    // Zones invalidated in the pass above keep pop2023 null — skip them here.
    if (props.pop2023 === null) continue;
    const v = rawVars[i++];
    const cafeN = normByCafe.get(v)!;
    const trafficN = normByTraffic.get(v)!;
    const transitN = normByTransit.get(v)!;
    const popN = normByPop.get(v)!;
    const flowN = normByFlow.get(v)!;

    const contribution = (weight: number, normalized: number) => weight * normalized;
    const total =
      contribution(WEIGHTS.cafe, 1 - cafeN) +
      contribution(WEIGHTS.traffic, trafficN) +
      contribution(WEIGHTS.transit, transitN) +
      contribution(WEIGHTS.population, popN) +
      contribution(WEIGHTS.flow, flowN);

    Object.assign(props, {
      cafe_norm: Number(cafeN.toFixed(4)),
      traffic_norm: Number(trafficN.toFixed(4)),
      transit_norm: Number(transitN.toFixed(4)),
      pop_norm: Number(popN.toFixed(4)),
      flow_norm: Number(flowN.toFixed(4)),
      total: Math.round(total * 1000) / 10,
    });
  }

  const fc: FeatureCollection = { type: "FeatureCollection", features: zones };
  fs.writeFileSync(path.join(DATA_OUT, "scores.geojson"), JSON.stringify(fc));

  const totals = zones.map((z) => (z.properties as Record<string, unknown>).total as number);
  console.log(
    `OK: scores.geojson written — ${zones.length} zones, total range ${Math.min(...totals)}–${Math.max(...totals)}`
  );
}

if (import.meta.main) {
  main();
}

export { main };