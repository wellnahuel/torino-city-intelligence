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

/** Scoring factor keys, ordered like WEIGHTS (cafe, traffic, transit, population, flow). */
export type FactorKey = "cafe" | "traffic" | "transit" | "population" | "flow";

export const FACTOR_KEYS: FactorKey[] = [
  "cafe",
  "traffic",
  "transit",
  "population",
  "flow",
];

/** Metric keys of the comparison table — total, the 5 factors, and rank (7 values). */
export type CompareMetricKey = "total" | FactorKey | "rank";

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

/**
 * Selection contract shared by the zone list and the map — single source
 * of truth for the highlighted zone (drives map feature-state, ScorePanel,
 * and the list's highlighted row).
 */
export interface MapSelection {
  zone: Zone | null;
  /** "list" → list-originated (fly to zone); "map" → map click (highlight only). */
  source: "map" | "list" | null;
  /** Increments on every selection — forces the map effect to re-run on same-zone re-clicks. */
  nonce: number;
}

/** Empty selection — no zone highlighted, no fly. */
export const NULL_SELECTION: MapSelection = { zone: null, source: null, nonce: 0 };

export interface LayerCounts {
  zones: number;
  layers: Record<LayerKey, number>;
  generatedAt: string;
}

export type FeatureCollectionLike = { features: unknown[] };