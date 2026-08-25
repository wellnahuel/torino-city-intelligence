/**
 * 06-manifest.ts — precompute layer/zone counts into public/data/manifest.json.
 * Replaces an API route (route handlers are unavailable under `output: export`),
 * satisfying DATA-1 (static data) + PERF-1 (tiny manifest, counts without payload).
 * Run: bun run etl/06-manifest.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { LayerKey } from "../src/types/data";

const DATA_OUT = path.resolve(import.meta.dir, "..", "public", "data");
const LAYERS: LayerKey[] = ["cafes", "restaurants", "transit", "schools", "services", "green"];

function count(file: string): number {
  const fc = JSON.parse(fs.readFileSync(path.join(DATA_OUT, file), "utf8"));
  return fc.features?.length ?? 0;
}

const zonesFc = JSON.parse(fs.readFileSync(path.join(DATA_OUT, "scores.geojson"), "utf8"));
const manifest = {
  zones: zonesFc.features?.length ?? 0,
  layers: Object.fromEntries(LAYERS.map((l) => [l, count(`${l}.geojson`)])) as Record<LayerKey, number>,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(DATA_OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`manifest.json written — zones=${manifest.zones}`, manifest.layers);