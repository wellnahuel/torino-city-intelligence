import { describe, expect, test } from "bun:test";
import type { Zone, ZoneScoreProperties } from "@/types/data";
import { buildCompareRows, overallWinner } from "./compare";
import {
  DEFAULT_POSITIONS,
  computeZoneScore,
  normalizeWeights,
  type ScoringWeights,
} from "./scoring";
import { getRank } from "./zone-list";

type FactorProps = Partial<
  Pick<
    ZoneScoreProperties,
    | "total"
    | "cafe_density"
    | "traffic_raw"
    | "stops500m"
    | "pop2023"
    | "flow_raw"
    | "cafe_norm"
    | "traffic_norm"
    | "transit_norm"
    | "pop_norm"
    | "flow_norm"
  >
>;

const DEFAULTS: Required<FactorProps> = {
  total: 50,
  cafe_density: 10,
  traffic_raw: 20,
  stops500m: 5,
  pop2023: 1000,
  flow_raw: 3,
  cafe_norm: 0.5,
  traffic_norm: 0.5,
  transit_norm: 0.5,
  pop_norm: 0.5,
  flow_norm: 0.5,
};

/** Minimal square-polygon zone fixture with norms set so computeZoneScore is exact. */
function makeZone(code: string, name: string, props: FactorProps = {}): Zone {
  const p = { ...DEFAULTS, ...props };
  return {
    type: "Feature",
    id: Number(code) || undefined,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
    properties: {
      ZONASTAT: code,
      name,
      DENOM: name,
      pop2023: p.pop2023,
      cafes: null,
      cafe_density: p.cafe_density,
      stops500m: p.stops500m,
      cafe_norm: p.cafe_norm,
      traffic_norm: p.traffic_norm,
      transit_norm: p.transit_norm,
      pop_norm: p.pop_norm,
      flow_norm: p.flow_norm,
      traffic_raw: p.traffic_raw,
      flow_raw: p.flow_raw,
      total: p.total,
    },
  };
}

/**
 * 3-zone fixture. `total` is deliberately WRONG (10/99/50) — the live
 * recompute MUST ignore it: Beta's stored 99 would win if properties.total
 * were read, but the real winner under every weight set is Alpha (index 0).
 */
const ZONES = [
  makeZone("01", "Alpha", {
    total: 10,
    cafe_density: 2,
    traffic_raw: 30,
    stops500m: 5,
    pop2023: 1000,
    flow_raw: 3,
    cafe_norm: 0.2,
    traffic_norm: 0.4,
    transit_norm: 0.3,
    pop_norm: 0.6,
    flow_norm: 0.5,
  }),
  makeZone("02", "Beta", {
    total: 99,
    cafe_density: 10,
    traffic_raw: 90,
    stops500m: 12,
    pop2023: 2000,
    flow_raw: 5,
    cafe_norm: 0.8,
    traffic_norm: 0.9,
    transit_norm: 0.2,
    pop_norm: 0.3,
    flow_norm: 0.7,
  }),
  makeZone("03", "Gamma", {
    total: 50,
    cafe_density: 6,
    traffic_raw: 60,
    stops500m: 7,
    pop2023: 1500,
    flow_raw: 4,
    cafe_norm: 0.5,
    traffic_norm: 0.5,
    transit_norm: 0.5,
    pop_norm: 0.5,
    flow_norm: 0.1,
  }),
];

const CUSTOM: ScoringWeights = { cafe: 60, traffic: 20, transit: 10, population: 5, flow: 5 };

describe("buildCompareRows shape", () => {
  test("7 rows in order: total, cafe, traffic, transit, population, flow, rank", () => {
    const rows = buildCompareRows(ZONES, DEFAULT_POSITIONS);
    expect(rows.map((r) => r.key)).toEqual([
      "total",
      "cafe",
      "traffic",
      "transit",
      "population",
      "flow",
      "rank",
    ]);
  });

  test("every row carries one value per zone", () => {
    const rows = buildCompareRows(ZONES, DEFAULT_POSITIONS);
    for (const r of rows) expect(r.values).toHaveLength(ZONES.length);
  });
});

describe("direction-aware winner", () => {
  test("cafe is INVERSE: the zone with FEWER cafés wins", () => {
    const cafe = buildCompareRows(ZONES, DEFAULT_POSITIONS).find((r) => r.key === "cafe")!;
    expect(cafe.values).toEqual([2, 10, 6]);
    expect(cafe.winnerIndex).toBe(0); // Alpha has the fewest cafés
  });

  test("traffic is direct: the zone with HIGHER traffic wins", () => {
    const traffic = buildCompareRows(ZONES, DEFAULT_POSITIONS).find((r) => r.key === "traffic")!;
    expect(traffic.values).toEqual([30, 90, 60]);
    expect(traffic.winnerIndex).toBe(1); // Beta has the most traffic
  });
});

describe("ties and nulls", () => {
  test("equal values → FIRST index wins (deterministic)", () => {
    const zones = [
      makeZone("01", "A", { traffic_raw: 50 }),
      makeZone("02", "B", { traffic_raw: 50 }),
      makeZone("03", "C", { traffic_raw: 50 }),
    ];
    const traffic = buildCompareRows(zones, DEFAULT_POSITIONS).find((r) => r.key === "traffic")!;
    expect(traffic.winnerIndex).toBe(0);
  });

  test("all-null values → winnerIndex null", () => {
    const zones = [
      makeZone("01", "A", { traffic_raw: null }),
      makeZone("02", "B", { traffic_raw: null }),
    ];
    const traffic = buildCompareRows(zones, DEFAULT_POSITIONS).find((r) => r.key === "traffic")!;
    expect(traffic.winnerIndex).toBeNull();
  });
});

describe("live weights (never properties.total)", () => {
  test("total values equal computeZoneScore with normalized custom weights — wrong fixture total ignored", () => {
    const total = buildCompareRows(ZONES, CUSTOM).find((r) => r.key === "total")!;
    const norm = normalizeWeights(CUSTOM);
    expect(total.values).toEqual(ZONES.map((z) => computeZoneScore(z.properties, norm)));
    expect(total.values).toEqual([64.5, 37, 48]); // NOT [10, 99, 50]
  });

  test("changing weights changes the totals", () => {
    const def = buildCompareRows(ZONES, DEFAULT_POSITIONS).find((r) => r.key === "total")!;
    const custom = buildCompareRows(ZONES, CUSTOM).find((r) => r.key === "total")!;
    expect(def.values).toEqual([54, 44, 46]);
    expect(custom.values).toEqual([64.5, 37, 48]);
    expect(custom.values).not.toEqual(def.values);
  });
});

describe("rank row", () => {
  test("values mirror getRank on the full list (1-based)", () => {
    const rank = buildCompareRows(ZONES, DEFAULT_POSITIONS, ZONES).find((r) => r.key === "rank")!;
    expect(rank.values).toEqual(ZONES.map((z) => getRank(ZONES, z, "total", "desc")));
  });

  test("absent zone → rank 0", () => {
    const ghost = makeZone("99", "Ghost", { total: 30 });
    const rank = buildCompareRows([ghost], DEFAULT_POSITIONS, ZONES).find((r) => r.key === "rank")!;
    expect(rank.values).toEqual([0]);
  });

  test("rank winner is the LOWEST rank (asc)", () => {
    // Stored totals match the live ones here, so ranks follow the scores: 54/44/46 → 1/3/2.
    const live = [
      makeZone("01", "Alpha", {
        total: 54,
        cafe_norm: 0.2,
        traffic_norm: 0.4,
        transit_norm: 0.3,
        pop_norm: 0.6,
        flow_norm: 0.5,
      }),
      makeZone("02", "Beta", {
        total: 44,
        cafe_norm: 0.8,
        traffic_norm: 0.9,
        transit_norm: 0.2,
        pop_norm: 0.3,
        flow_norm: 0.7,
      }),
      makeZone("03", "Gamma", {
        total: 46,
        cafe_norm: 0.5,
        traffic_norm: 0.5,
        transit_norm: 0.5,
        pop_norm: 0.5,
        flow_norm: 0.1,
      }),
    ];
    const rank = buildCompareRows(live, DEFAULT_POSITIONS, live).find((r) => r.key === "rank")!;
    expect(rank.values).toEqual([1, 3, 2]);
    expect(rank.winnerIndex).toBe(0);
  });
});

describe("overallWinner", () => {
  test("returns the index of the max LIVE total (wrong fixture total ignored)", () => {
    expect(overallWinner(ZONES, DEFAULT_POSITIONS)).toBe(0); // Alpha 54 > Gamma 46 > Beta 44
    expect(overallWinner(ZONES, CUSTOM)).toBe(0); // Alpha 64.5 > Gamma 48 > Beta 37
  });

  test("ties → first index", () => {
    const zones = [
      makeZone("01", "A", { total: 10 }),
      makeZone("02", "B", { total: 10 }),
    ];
    expect(overallWinner(zones, DEFAULT_POSITIONS)).toBe(0);
  });

  test("empty → -1", () => {
    expect(overallWinner([], DEFAULT_POSITIONS)).toBe(-1);
  });
});

describe("default allZones", () => {
  test("a 2-zone pair ranks within the pair", () => {
    const pair = [
      makeZone("01", "Alpha", {
        total: 80,
        cafe_norm: 0.2,
        traffic_norm: 0.4,
        transit_norm: 0.3,
        pop_norm: 0.6,
        flow_norm: 0.5,
      }),
      makeZone("02", "Beta", {
        total: 60,
        cafe_norm: 0.8,
        traffic_norm: 0.9,
        transit_norm: 0.2,
        pop_norm: 0.3,
        flow_norm: 0.7,
      }),
    ];
    const rank = buildCompareRows(pair, DEFAULT_POSITIONS).find((r) => r.key === "rank")!;
    expect(rank.values).toEqual([1, 2]);
    expect(rank.winnerIndex).toBe(0);
  });
});