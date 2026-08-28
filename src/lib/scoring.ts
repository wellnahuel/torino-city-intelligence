/** Scoring model shared by the ETL (source of truth) and the client UI. */

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { FACTOR_KEYS, type FactorKey, type ZoneScoreProperties } from "@/types/data";

export const WEIGHTS = {
  cafe: 0.3,
  traffic: 0.25,
  transit: 0.2,
  population: 0.15,
  flow: 0.1,
} as const;

/** Slider positions, integer 0-100 per factor. */
export type ScoringWeights = Record<FactorKey, number>;

/** Normalized weights — fractions summing to 1. */
export type NormalizedWeights = Record<FactorKey, number>;

/** A scores.geojson FeatureCollection (zones with scoring properties). */
export type ZoneFC = FeatureCollection<Polygon | MultiPolygon, ZoneScoreProperties>;

/** Default normalized weights (fractions, Σ=1) — fallback when slider positions sum to 0. */
export const DEFAULT_WEIGHTS: ScoringWeights = { ...WEIGHTS };

/** Default slider positions (0-100 integers) — the official "default" view. */
export const DEFAULT_POSITIONS: ScoringWeights = {
  cafe: 30,
  traffic: 25,
  transit: 20,
  population: 15,
  flow: 10,
};

/** All 5 factor keys equal, key by key. */
export function weightsEqual(a: ScoringWeights, b: ScoringWeights): boolean {
  return FACTOR_KEYS.every((k) => a[k] === b[k]);
}

/** Slider positions (0-100) → fractions Σ=1. All-zero positions fall back to DEFAULT_WEIGHTS. */
export function normalizeWeights(w: ScoringWeights): NormalizedWeights {
  const sum = FACTOR_KEYS.reduce((s, k) => s + w[k], 0);
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  const out = {} as NormalizedWeights;
  for (const k of FACTOR_KEYS) out[k] = w[k] / sum;
  return out;
}

/** Stored norm field backing each factor (population → pop_norm — NOT population_norm). */
const NORM_FIELD: Record<FactorKey, keyof ZoneScoreProperties> = {
  cafe: "cafe_norm",
  traffic: "traffic_norm",
  transit: "transit_norm",
  population: "pop_norm",
  flow: "flow_norm",
};

/**
 * 0-1 contribution of one factor: weight × (cafe inverted → 1 − norm, else norm).
 * Null norms contribute 0.
 */
export function computeContribution(
  p: ZoneScoreProperties,
  k: FactorKey,
  w: NormalizedWeights
): number {
  const norm = (p[NORM_FIELD[k]] as number | null | undefined) ?? 0;
  return w[k] * (k === "cafe" ? 1 - norm : norm);
}

/** Rounds a 0-100 score to 1 decimal, matching the ETL (`Math.round(sum*1000)/10` on the 0-1 sum). */
const round1 = (x: number) => Math.round(x * 1000) / 10;

/**
 * 0-100 zone score from stored norms + normalized weights.
 * Null norm → 0; cafe uses 1 − cafe_norm (mirrors ETL 04-score.ts).
 */
export function computeZoneScore(p: ZoneScoreProperties, w: NormalizedWeights): number {
  const sum = FACTOR_KEYS.reduce((s, k) => s + computeContribution(p, k, w), 0);
  return round1(sum);
}

/**
 * Clones the FeatureCollection with recomputed totals for custom weights.
 * Order-preserving (generateId feature ids == indices); input NEVER mutated.
 * Returns the ORIGINAL reference when weights == defaults (identity — zero drift).
 */
export function applyWeights(fc: ZoneFC, w: ScoringWeights): ZoneFC {
  if (weightsEqual(w, DEFAULT_POSITIONS)) return fc;
  const norm = normalizeWeights(w);
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, total: computeZoneScore(f.properties, norm) },
    })),
  };
}

/**
 * n−1 quantile breaks from `values` (ascending). Clamped to unique−1 when the
 * value domain is small; all-equal values → n−1 identical breaks (every zone
 * lands in the top bucket); empty input → [].
 */
export function quantileBreaks(values: number[], n: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const unique = new Set(sorted).size;
  if (unique === 1) return Array(n - 1).fill(sorted[0]);
  const k = Math.min(n - 1, unique - 1);
  const breaks: number[] = [];
  for (let i = 0; i < k; i++) {
    breaks.push(sorted[Math.floor(((i + 1) * sorted.length) / n)]);
  }
  return breaks;
}

/** Min-max normalization; constant series normalize to 0. */
export function minMax(values: number[]): Map<number, number> {
  const norm = new Map<number, number>();
  if (values.length === 0) return norm;
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  for (const v of values) {
    norm.set(v, span === 0 ? 0 : (v - min) / span);
  }
  return norm;
}

export function weightedTotal(contributions: number[]): number {
  return contributions.reduce((s, c) => s + c, 0);
}