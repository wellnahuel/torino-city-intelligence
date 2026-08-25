import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

/** Layer keys mirror the GeoJSON files under public/data/. */
export type LayerKey =
  | "cafes"
  | "restaurants"
  | "transit"
  | "schools"
  | "services"
  | "green";

export const LAYER_KEYS: LayerKey[] = [
  "cafes",
  "restaurants",
  "transit",
  "schools",
  "services",
  "green",
];

/** Properties of scores.geojson features (design data contract + additive fields). */
export interface ZoneScoreProperties {
  ZONASTAT: string;
  name: string;
  DENOM?: string;
  pop2023: number | null;
  cafes: number | null;
  cafe_density: number | null;
  stops500m: number | null;
  cafe_norm: number | null;
  traffic_norm: number | null;
  transit_norm: number | null;
  pop_norm: number | null;
  flow_norm: number | null;
  traffic_raw: number | null;
  flow_raw: number | null;
  total: number | null;
}

export interface POIProperties {
  id: number | string | null;
  name: string | null;
}

export type Zone = Feature<Polygon | MultiPolygon, ZoneScoreProperties>;
export type POI = Feature<Point, POIProperties>;
export type LayerGeoJSON = FeatureCollectionLike;

export interface LayerCounts {
  zones: number;
  layers: Record<LayerKey, number>;
  generatedAt: string;
}

export type FeatureCollectionLike = { features: unknown[] };