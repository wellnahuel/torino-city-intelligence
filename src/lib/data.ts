import type {
  FeatureCollection,
  Feature,
  Polygon,
  MultiPolygon,
  Point,
} from "geojson";
import type { LayerCounts, LayerGeoJSON, LayerKey, POI, Zone } from "@/types/data";

const BASE = "/data";

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${label} (${url}): HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchZones(): Promise<Zone[]> {
  const fc = await fetchJson<FeatureCollection<Polygon | MultiPolygon>>(
    `${BASE}/scores.geojson`,
    "zone scores"
  );
  return fc.features as Zone[];
}

export async function fetchLayer(layer: LayerKey): Promise<POI[]> {
  const fc = await fetchJson<FeatureCollection<Point>>(
    `${BASE}/${layer}.geojson`,
    `layer "${layer}"`
  );
  return fc.features as POI[];
}

export async function fetchLayerCounts(): Promise<LayerCounts> {
  return fetchJson<LayerCounts>(`${BASE}/manifest.json`, "layer manifest");
}

export { fetchJson };
export type { LayerGeoJSON, Feature }; // re-export for consumers