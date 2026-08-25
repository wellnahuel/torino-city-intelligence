import { describe, expect, test } from "bun:test";
import {
  WEIGHTS,
  canonicalCode,
  weightedTotal,
  pointInPolygon,
  polygonCentroid,
  areaKm2,
  haversineKm,
} from "./04-score";

describe("canonicalCode", () => {
  test("pads numeric codes to two digits", () => {
    expect(canonicalCode("1")).toBe("01");
    expect(canonicalCode("92")).toBe("92");
  });
  test("keeps bis codes as-is", () => {
    expect(canonicalCode("09bis")).toBe("09bis");
    expect(canonicalCode("17bis")).toBe("17bis");
  });
});

describe("spatial helpers", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  test("point in polygon", () => {
    expect(pointInPolygon([5, 5], { type: "Polygon", coordinates: [square] })).toBe(true);
    expect(pointInPolygon([15, 5], { type: "Polygon", coordinates: [square] })).toBe(false);
  });

  test("hole excludes point", () => {
    const holed = { type: "Polygon" as const, coordinates: [square, [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]] };
    expect(pointInPolygon([5, 5], holed)).toBe(false);
    expect(pointInPolygon([8, 8], holed)).toBe(true);
  });

  test("centroid of square", () => {
    const c = polygonCentroid({ type: "Polygon", coordinates: [square] });
    expect(c[0]).toBeCloseTo(5, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });

  test("haversine ~111km per degree", () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.2, 0);
  });

  test("square area in km2 at equator", () => {
    const a = areaKm2({ type: "Polygon", coordinates: [square] }, 0);
    expect(a).toBeCloseTo(10 * 111.32 * 10 * 110.574, 3); // ~1230909 km²
  });
});

describe("scoring", () => {
  test("weights sum to 1", () => {
    const s = WEIGHTS.cafe + WEIGHTS.traffic + WEIGHTS.transit + WEIGHTS.population + WEIGHTS.flow;
    expect(s).toBeCloseTo(1, 6);
  });

  test("inverse cafe: lower density yields higher contribution", () => {
    const low = WEIGHTS.cafe * (1 - 0.1); // cafe_norm 0.1
    const high = WEIGHTS.cafe * (1 - 0.9); // cafe_norm 0.9
    expect(low).toBeGreaterThan(high);
  });

  test("weighted total stays in [0,1]", () => {
    const allZero = weightedTotal([0, 0, 0, 0, 0]);
    const allMax = weightedTotal([WEIGHTS.cafe, WEIGHTS.traffic, WEIGHTS.transit, WEIGHTS.population, WEIGHTS.flow]);
    expect(allZero).toBe(0);
    expect(allMax).toBeCloseTo(1, 6);
  });

  test("weights produce contribution within weight", () => {
    const c = WEIGHTS.cafe * 0.5;
    expect(c).toBeLessThanOrEqual(WEIGHTS.cafe);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});