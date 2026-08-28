import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZoneScoreProperties } from "@/types/data";
import {
  DEFAULT_POSITIONS,
  DEFAULT_WEIGHTS,
  applyWeights,
  computeContribution,
  computeZoneScore,
  normalizeWeights,
  quantileBreaks,
  weightsEqual,
  type NormalizedWeights,
  type ScoringWeights,
  type ZoneFC,
} from "./scoring";

/** Committed fixture — 94 zones with stored norms + totals (ETL output). */
const fixture: ZoneFC = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/data/scores.geojson"), "utf8")
);

/** Base properties with every norm set; individual tests override what they need. */
function props(overrides: Partial<ZoneScoreProperties> = {}): ZoneScoreProperties {
  return {
    ZONASTAT: "X",
    name: "X",
    pop2023: 1,
    cafes: 1,
    cafe_density: 1,
    stops500m: 1,
    cafe_norm: 0.1,
    traffic_norm: 0.2,
    transit_norm: 0.3,
    pop_norm: 0.4,
    flow_norm: 0.5,
    traffic_raw: null,
    flow_raw: null,
    total: null,
    ...overrides,
  };
}

const W: NormalizedWeights = { cafe: 1, traffic: 0, transit: 0, population: 0, flow: 0 };

describe("default-weights parity with stored scores", () => {
  test("all 94 zones recompute within ±0.15 of the stored total", () => {
    const norm = normalizeWeights(DEFAULT_POSITIONS);
    for (const f of fixture.features) {
      const stored = f.properties.total as number;
      const recomputed = computeZoneScore(f.properties, norm);
      expect(
        Math.abs(recomputed - stored),
        `${f.properties.name} (${f.properties.ZONASTAT})`
      ).toBeLessThanOrEqual(0.15);
    }
  });
});

describe("applyWeights identity + clone semantics", () => {
  test("default positions return the ORIGINAL reference (identity)", () => {
    const out = applyWeights(fixture, DEFAULT_POSITIONS);
    expect(out).toBe(fixture);
  });

  test("custom weights return a new FC: same length, same ZONASTAT order, input untouched", () => {
    const custom: ScoringWeights = { cafe: 60, traffic: 20, transit: 10, population: 5, flow: 5 };
    const originalTotals = fixture.features.map((f) => f.properties.total);
    const out = applyWeights(fixture, custom);
    expect(out).not.toBe(fixture);
    expect(out.features).toHaveLength(fixture.features.length);
    expect(out.features.map((f) => f.properties.ZONASTAT)).toEqual(
      fixture.features.map((f) => f.properties.ZONASTAT)
    );
    expect(fixture.features.map((f) => f.properties.total)).toEqual(originalTotals);
  });

  test("cloned feature totals equal computeZoneScore with the normalized weights", () => {
    const custom: ScoringWeights = { cafe: 60, traffic: 20, transit: 10, population: 5, flow: 5 };
    const norm = normalizeWeights(custom);
    const out = applyWeights(fixture, custom);
    out.features.forEach((f, i) => {
      expect(f.properties.total).toBe(
        computeZoneScore(fixture.features[i].properties, norm)
      );
    });
  });

  test("all-zero positions still clone (guard path) and totals match stored ±0.15", () => {
    const zero: ScoringWeights = { cafe: 0, traffic: 0, transit: 0, population: 0, flow: 0 };
    const out = applyWeights(fixture, zero);
    expect(out).not.toBe(fixture);
    for (const f of out.features) {
      const stored = f.properties.total as number;
      expect(Math.abs((f.properties.total as number) - stored)).toBeLessThanOrEqual(0.15);
    }
  });
});

describe("normalizeWeights", () => {
  test("default positions → WEIGHTS fractions", () => {
    const n = normalizeWeights(DEFAULT_POSITIONS);
    expect(n).toEqual({ cafe: 0.3, traffic: 0.25, transit: 0.2, population: 0.15, flow: 0.1 });
  });

  test("50/50/0/0/0 → 0.5/0.5", () => {
    const n = normalizeWeights({ cafe: 50, traffic: 50, transit: 0, population: 0, flow: 0 });
    expect(n.cafe).toBe(0.5);
    expect(n.traffic).toBe(0.5);
    expect(n.transit).toBe(0);
  });

  test("all-100 → 0.2 each", () => {
    const n = normalizeWeights({ cafe: 100, traffic: 100, transit: 100, population: 100, flow: 100 });
    expect(n.cafe).toBeCloseTo(0.2, 10);
    expect(n.traffic).toBeCloseTo(0.2, 10);
    expect(n.transit).toBeCloseTo(0.2, 10);
    expect(n.population).toBeCloseTo(0.2, 10);
    expect(n.flow).toBeCloseTo(0.2, 10);
  });

  test("single factor at 100 → 1 for it, 0 for the rest", () => {
    const n = normalizeWeights({ cafe: 100, traffic: 0, transit: 0, population: 0, flow: 0 });
    expect(n).toEqual({ cafe: 1, traffic: 0, transit: 0, population: 0, flow: 0 });
  });

  test("Σ=0 falls back to DEFAULT_WEIGHTS", () => {
    const n = normalizeWeights({ cafe: 0, traffic: 0, transit: 0, population: 0, flow: 0 });
    expect(n).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("computeZoneScore", () => {
  test("rounds the 0-1 sum to 1 decimal (0.354 → 35.4)", () => {
    const p = props({ cafe_norm: 0.646 });
    expect(computeZoneScore(p, W)).toBe(35.4);
  });

  test("null norms contribute 0 (cafe null → 1 − 0 = 1 → 100)", () => {
    const p = props({
      cafe_norm: null,
      traffic_norm: null,
      transit_norm: null,
      pop_norm: null,
      flow_norm: null,
    });
    expect(computeZoneScore(p, W)).toBe(100);
  });

  test("cafe is inverted — higher cafe_norm lowers the total, others equal", () => {
    const w = normalizeWeights(DEFAULT_POSITIONS);
    const low = computeZoneScore(props({ cafe_norm: 0.1 }), w);
    const high = computeZoneScore(props({ cafe_norm: 0.9 }), w);
    expect(high).toBeLessThan(low);
  });
});

describe("computeContribution", () => {
  test("cafe uses 1 − norm", () => {
    const p = props({ cafe_norm: 0.25 });
    const w: NormalizedWeights = { cafe: 0.3, traffic: 0, transit: 0, population: 0, flow: 0 };
    expect(computeContribution(p, "cafe", w)).toBeCloseTo(0.3 * 0.75, 10);
  });

  test("population reads pop_norm (NOT population_norm)", () => {
    const p = props({ pop_norm: 0.4 });
    const w: NormalizedWeights = { cafe: 0, traffic: 0, transit: 0, population: 0.15, flow: 0 };
    expect(computeContribution(p, "population", w)).toBeCloseTo(0.15 * 0.4, 10);
  });

  test("zero weight → zero contribution", () => {
    const p = props({ traffic_norm: 0.8 });
    const w: NormalizedWeights = { cafe: 0, traffic: 0, transit: 0, population: 0, flow: 0 };
    expect(computeContribution(p, "traffic", w)).toBe(0);
  });
});

describe("quantileBreaks", () => {
  test("1..94 with n=6 → 5 ascending breaks", () => {
    const values = Array.from({ length: 94 }, (_, i) => i + 1);
    const breaks = quantileBreaks(values, 6);
    expect(breaks).toHaveLength(5);
    for (let i = 1; i < breaks.length; i++) expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    expect(breaks[0]).toBe(16);
    expect(breaks[4]).toBe(79);
  });

  test("all-equal → n−1 identical breaks", () => {
    expect(quantileBreaks([42, 42, 42, 42], 6)).toEqual([42, 42, 42, 42, 42]);
  });

  test("fewer unique values than n → break count clamped to unique−1", () => {
    const breaks = quantileBreaks([1, 1, 2, 3, 3, 3], 6);
    expect(breaks).toHaveLength(2);
    expect(breaks[0]).toBeLessThan(breaks[1]);
  });

  test("empty input → []", () => {
    expect(quantileBreaks([], 6)).toEqual([]);
  });

  test("unsorted input → same breaks as sorted", () => {
    const unsorted = [50, 10, 40, 20, 30];
    const sorted = [10, 20, 30, 40, 50];
    expect(quantileBreaks(unsorted, 6)).toEqual(quantileBreaks(sorted, 6));
  });
});

describe("weightsEqual", () => {
  test("identical positions → true", () => {
    expect(weightsEqual(DEFAULT_POSITIONS, { ...DEFAULT_POSITIONS })).toBe(true);
  });

  test("any difference → false", () => {
    expect(weightsEqual(DEFAULT_POSITIONS, { ...DEFAULT_POSITIONS, cafe: 31 })).toBe(false);
    expect(
      weightsEqual(DEFAULT_POSITIONS, {
        cafe: 30,
        traffic: 25,
        transit: 20,
        population: 15,
        flow: 9,
      })
    ).toBe(false);
  });
});