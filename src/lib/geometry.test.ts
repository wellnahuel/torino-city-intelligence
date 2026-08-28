import { describe, expect, test } from "bun:test";
import type { MultiPolygon, Polygon } from "geojson";
import { geometryBounds, geometryCentroid, polygonBounds, polygonCentroid } from "./geometry";

const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

const poly = (coords: [number, number][][]): Polygon => ({ type: "Polygon", coordinates: coords });

/** Builds a MultiPolygon with one ring per polygon part (outer rings). */
const multi = (rings: [number, number][][]): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: rings.map((ring) => [ring]),
});

describe("polygonCentroid", () => {
  test("centroid of a square", () => {
    const c = polygonCentroid(poly([square]));
    expect(c[0]).toBeCloseTo(5, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });
});

describe("geometryCentroid", () => {
  test("area-weighted centroid of a MultiPolygon", () => {
    // Two 10x10 squares of equal area: left at x 0-10, right at x 10-20.
    const geom = multi([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 0],
      ],
    ]);
    const c = geometryCentroid(geom);
    expect(c[0]).toBeCloseTo(10, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });

  test("delegates to polygonCentroid for a single Polygon", () => {
    const c = geometryCentroid(poly([square]));
    expect(c[0]).toBeCloseTo(5, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });
});

describe("polygonBounds", () => {
  test("sw/ne of a square", () => {
    const [sw, ne] = polygonBounds(poly([square]));
    expect(sw[0]).toBe(0);
    expect(sw[1]).toBe(0);
    expect(ne[0]).toBe(10);
    expect(ne[1]).toBe(10);
  });
});

describe("geometryBounds", () => {
  test("union across MultiPolygon parts", () => {
    const geom = multi([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ],
    ]);
    const [sw, ne] = geometryBounds(geom);
    expect(sw).toEqual([0, 0]);
    expect(ne).toEqual([30, 30]);
  });

  test("single Polygon delegates to polygonBounds", () => {
    const [sw, ne] = geometryBounds(poly([square]));
    expect(sw).toEqual([0, 0]);
    expect(ne).toEqual([10, 10]);
  });
});