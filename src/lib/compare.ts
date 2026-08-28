/** Pure comparison helpers — no i18n, no React. */

import { FACTOR_DIRECTION, SORT_FIELD, getRank } from "@/lib/zone-list";
import { computeZoneScore, normalizeWeights, type ScoringWeights } from "@/lib/scoring";
import { FACTOR_KEYS, type CompareMetricKey, type Zone } from "@/types/data";

/** One transposed row of the comparison table. */
export interface CompareRow {
  key: CompareMetricKey;
  /** Per-zone values, index-aligned with the `zones` argument. Rank 0 = absent (renders "–"). */
  values: (number | string | null)[];
  /** Best cell index; ties keep the FIRST index; null when every value is null/non-numeric. */
  winnerIndex: number | null;
}

/** Direction-aware best index. Non-numbers are skipped; strict compare → ties keep the first. */
function bestIndex(
  values: (number | string | null | undefined)[],
  dir: "asc" | "desc"
): number | null {
  let best = -1;
  let bestVal: number | null = null;
  values.forEach((v, i) => {
    if (typeof v !== "number") return;
    if (bestVal === null) {
      best = i;
      bestVal = v;
      return;
    }
    if (dir === "asc" ? v < bestVal : v > bestVal) {
      best = i;
      bestVal = v;
    }
  });
  return best < 0 ? null : best;
}

/**
 * 7 transposed rows for the comparison table: total, the 5 raw factor values
 * (in FACTOR_KEYS order) and the full-list rank.
 *
 * Totals ALWAYS recompute from the CURRENT weights via computeZoneScore —
 * properties.total is never read (a selection captured under earlier weights
 * is stale). Factor rows use the RAW stored values with their scoring
 * direction (cafe asc → FEWER cafés wins). Rank uses getRank on `allZones`
 * (the full displayed list in map-app), 1-based, lower rank wins.
 */
export function buildCompareRows(
  zones: Zone[],
  weights: ScoringWeights,
  allZones: Zone[] = zones
): CompareRow[] {
  const norm = normalizeWeights(weights);
  const rows: CompareRow[] = [];

  const totals = zones.map((z) => computeZoneScore(z.properties, norm));
  rows.push({ key: "total", values: totals, winnerIndex: bestIndex(totals, FACTOR_DIRECTION.total) });

  for (const k of FACTOR_KEYS) {
    const values = zones.map((z) => z.properties[SORT_FIELD[k]] as number | null);
    rows.push({ key: k, values, winnerIndex: bestIndex(values, FACTOR_DIRECTION[k]) });
  }

  const ranks = zones.map((z) => getRank(allZones, z, "total", "desc"));
  rows.push({ key: "rank", values: ranks, winnerIndex: bestIndex(ranks, "asc") });

  return rows;
}

/** Index of the zone with the best LIVE total; ties → first; empty → -1. */
export function overallWinner(zones: Zone[], weights: ScoringWeights): number {
  if (zones.length === 0) return -1;
  const norm = normalizeWeights(weights);
  const idx = bestIndex(
    zones.map((z) => computeZoneScore(z.properties, norm)),
    "desc"
  );
  return idx === null ? -1 : idx;
}