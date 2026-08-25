/** Scoring model shared by the ETL (source of truth) and the client UI. */

export const WEIGHTS = {
  cafe: 0.3,
  traffic: 0.25,
  transit: 0.2,
  population: 0.15,
  flow: 0.1,
} as const;

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