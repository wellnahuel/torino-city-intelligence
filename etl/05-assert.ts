/**
 * 05-assert.ts — fail-loud data integrity checks on the committed outputs.
 * Run: bun run etl/05-assert.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { FeatureCollection } from "geojson";
import { WEIGHTS } from "./04-score";

const DATA_OUT = path.resolve(import.meta.dir, "..", "public", "data");

let failed = false;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    failed = true;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(` ok   ${name}`);
  }
}

function readLayers(name: string) {
  const fc = JSON.parse(fs.readFileSync(path.join(DATA_OUT, `${name}.geojson`), "utf8")) as FeatureCollection;
  return fc.features.length;
}

function countTolerance(name: string, actual: number, [lo, hi]: [number, number]) {
  check(
    `${name} count (${actual})`,
    actual >= lo && actual <= hi,
    `expected ${lo}–${hi}`
  );
}

// --- zones ---
const zones = JSON.parse(fs.readFileSync(path.join(DATA_OUT, "scores.geojson"), "utf8")) as FeatureCollection;
const zoneFeats = zones.features;
check("zone count", zoneFeats.length === 94, `got ${zoneFeats.length}`);
check("zone geometries", zoneFeats.every((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"));

// --- EPSG:4326 sanity: all coordinates must fall in the Torino bbox ---
const LON = [7.4, 7.9] as const;
const LAT = [44.9, 45.3] as const;
let coordsOk = true;
for (const f of zoneFeats) {
  const g = f.geometry as { coordinates: unknown };
  const walk = (c: unknown) => {
    if (typeof c === "number") return;
    if (Array.isArray(c)) {
      if (c.length === 2 && typeof c[0] === "number") {
        const [lon, lat] = c as [number, number];
        if (lon < LON[0] || lon > LON[1] || lat < LAT[0] || lat > LAT[1]) coordsOk = false;
      } else {
        c.forEach(walk);
      }
    }
  };
  walk(g.coordinates);
}
check("all zones EPSG:4326 in Torino bbox", coordsOk);

// --- scores ---
const props = zoneFeats.map((f) => f.properties as Record<string, unknown>);
check("no null scores", props.every((p) => p.total !== null && p.total !== undefined));
check("scores in [0,100]", props.every((p) => (p.total as number) >= 0 && (p.total as number) <= 100));
check("norms present", props.every((p) =>
  ["cafe_norm", "traffic_norm", "transit_norm", "pop_norm", "flow_norm"].every((k) => typeof p[k] === "number")
));

// recompute total from stored norms + weights (must equal zone total)
const totalOk = props.every((p) => {
  const t =
    WEIGHTS.cafe * (1 - (p.cafe_norm as number)) +
    WEIGHTS.traffic * (p.traffic_norm as number) +
    WEIGHTS.transit * (p.transit_norm as number) +
    WEIGHTS.population * (p.pop_norm as number) +
    WEIGHTS.flow * (p.flow_norm as number);
  return Math.abs(t * 100 - (p.total as number)) < 0.15;
});
check("weighted total matches stored score", totalOk);

// inverse-cafe rule: lower cafe_density -> higher cafe contribution
const sorted = [...props].sort((a, b) => (a.cafe_density as number) - (b.cafe_density as number));
check(
  "inverse cafe density",
  (sorted[0].cafe_norm as number) <= (sorted[sorted.length - 1].cafe_norm as number) &&
    (1 - (sorted[0].cafe_norm as number)) >= (1 - (sorted[sorted.length - 1].cafe_norm as number))
);

// --- layer counts (tolerance windows account for yearly OSM drift) ---
countTolerance("cafes", readLayers("cafes"), [1500, 4500]);
countTolerance("transit", readLayers("transit"), [1800, 4500]);
countTolerance("restaurants", readLayers("restaurants"), [300, 5000]);
countTolerance("schools", readLayers("schools"), [100, 2000]);
countTolerance("services", readLayers("services"), [300, 3000]);
countTolerance("green", readLayers("green"), [1000, 10000]);

if (failed) {
  console.error("\nASSERTIONS FAILED — outputs are suspect, do not ship.");
  process.exit(1);
}
console.log("\nAll ETL assertions passed.");