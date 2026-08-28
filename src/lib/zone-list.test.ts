import { describe, expect, test } from "bun:test";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Zone, ZoneScoreProperties } from "@/types/data";
import {
  FACTOR_DIRECTION,
  filterZones,
  formatCellValue,
  getRank,
  normalizeName,
  sortZones,
  zoneFeatureId,
  zoneName,
} from "./zone-list";

type FactorProps = Partial<
  Pick<ZoneScoreProperties, "total" | "cafe_density" | "traffic_raw" | "stops500m" | "pop2023" | "flow_raw">
>;

const DEFAULTS: Required<FactorProps> = {
  total: 50,
  cafe_density: 10,
  traffic_raw: 20,
  stops500m: 5,
  pop2023: 1000,
  flow_raw: 3,
};

/** Minimal square-polygon zone fixture (source-order index == feature id). */
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
      cafe_norm: null,
      traffic_norm: null,
      transit_norm: null,
      pop_norm: null,
      flow_norm: null,
      traffic_raw: p.traffic_raw,
      flow_raw: p.flow_raw,
      total: p.total,
    },
  };
}

describe("normalizeName", () => {
  test("strips accents and lowercases", () => {
    expect(normalizeName("Caffè")).toBe("caffe");
    expect(normalizeName("Mirafiori - Città Giardino")).toBe("mirafiori - citta giardino");
  });
});

describe("zoneName", () => {
  test("falls back to ZONASTAT when name is empty", () => {
    expect(zoneName(makeZone("07", "Barriera"))).toBe("Barriera");
    expect(zoneName({ ...makeZone("07", ""), properties: { ...makeZone("07", "").properties, name: "" } })).toBe("07");
  });
});

describe("sortZones", () => {
  test("asc / desc on a numeric key", () => {
    const zones = [
      makeZone("01", "High", { total: 90 }),
      makeZone("02", "Mid", { total: 50 }),
      makeZone("03", "Low", { total: 30 }),
    ];
    expect(sortZones(zones, "total", "asc").map((z) => z.properties.ZONASTAT)).toEqual(["03", "02", "01"]);
    expect(sortZones(zones, "total", "desc").map((z) => z.properties.ZONASTAT)).toEqual(["01", "02", "03"]);
  });

  test("best-first follows FACTOR_DIRECTION (cafe best ⇒ asc, traffic best ⇒ desc)", () => {
    expect(FACTOR_DIRECTION.cafe).toBe("asc");
    expect(FACTOR_DIRECTION.traffic).toBe("desc");
    const zones = [
      makeZone("01", "Dense", { cafe_density: 50, traffic_raw: 10 }),
      makeZone("02", "Sparse", { cafe_density: 5, traffic_raw: 100 }),
    ];
    // Fewer cafés per km² = better → sparse first.
    expect(sortZones(zones, "cafe", "best").map((z) => z.properties.name)).toEqual(["Sparse", "Dense"]);
    // More traffic = better → dense-traffic first.
    expect(sortZones(zones, "traffic", "best").map((z) => z.properties.name)).toEqual(["Sparse", "Dense"]);
  });

  test("nulls sort last in both directions", () => {
    const zones = [
      makeZone("01", "HasValue", { total: 50 }),
      makeZone("02", "NullValue", { total: null }),
      makeZone("03", "LowValue", { total: 30 }),
    ];
    expect(sortZones(zones, "total", "asc").map((z) => z.properties.ZONASTAT)).toEqual(["03", "01", "02"]);
    expect(sortZones(zones, "total", "desc").map((z) => z.properties.ZONASTAT)).toEqual(["01", "03", "02"]);
  });

  test("ties break by normalized name asc, then source index", () => {
    const zones = [
      makeZone("01", "Zulu", { total: 50 }),
      makeZone("02", "Alpha", { total: 50 }),
      makeZone("03", "Beta", { total: 50 }),
    ];
    expect(sortZones(zones, "total", "desc").map((z) => z.properties.name)).toEqual(["Alpha", "Beta", "Zulu"]);
  });

  test("equal names keep source order (deterministic)", () => {
    const zones = [
      makeZone("01", "Same", { total: 50 }),
      makeZone("02", "Same", { total: 50 }),
    ];
    expect(sortZones(zones, "total", "desc").map((z) => z.properties.ZONASTAT)).toEqual(["01", "02"]);
  });

  test("name key sorts alphabetically with direction", () => {
    const zones = [
      makeZone("01", "Borgata"),
      makeZone("02", "Aurora"),
      makeZone("03", "Crocetta"),
    ];
    expect(sortZones(zones, "name", "asc").map((z) => z.properties.name)).toEqual(["Aurora", "Borgata", "Crocetta"]);
    expect(sortZones(zones, "name", "desc").map((z) => z.properties.name)).toEqual(["Crocetta", "Borgata", "Aurora"]);
  });

  test("never mutates the source array order", () => {
    const zones = [
      makeZone("01", "A", { total: 10 }),
      makeZone("02", "B", { total: 90 }),
      makeZone("03", "C", { total: 50 }),
    ];
    sortZones(zones, "total", "desc");
    expect(zones.map((z) => z.properties.ZONASTAT)).toEqual(["01", "02", "03"]);
  });

  test("empty array", () => {
    expect(sortZones([], "total", "best")).toEqual([]);
  });
});

describe("filterZones", () => {
  const zones = [
    makeZone("01", "Pilonetto"),
    makeZone("02", "Mirafiori - Città Giardino"),
    makeZone("03", "Caffè Roma"),
  ];

  test("accent- and case-insensitive substring match", () => {
    expect(filterZones(zones, "pilo").map((z) => z.properties.name)).toEqual(["Pilonetto"]);
    expect(filterZones(zones, "citta").map((z) => z.properties.name)).toEqual(["Mirafiori - Città Giardino"]);
    expect(filterZones(zones, "CAFFE").map((z) => z.properties.name)).toEqual(["Caffè Roma"]);
  });

  test("matches ZONASTAT as a fallback", () => {
    expect(filterZones(zones, "02").map((z) => z.properties.name)).toEqual(["Mirafiori - Città Giardino"]);
  });

  test("empty query passes the array through unchanged", () => {
    expect(filterZones(zones, "")).toBe(zones);
  });

  test("no match yields empty", () => {
    expect(filterZones(zones, "zzzz")).toEqual([]);
  });
});

describe("getRank", () => {
  const zones = [
    makeZone("01", "A", { total: 90 }),
    makeZone("02", "B", { total: 40 }),
    makeZone("03", "C", { total: 60 }),
  ];

  test("1-based rank in the sorted full list", () => {
    expect(getRank(zones, zones[0], "total", "desc")).toBe(1); // 90 → rank 1
    expect(getRank(zones, zones[1], "total", "desc")).toBe(3); // 40 → rank 3
    expect(getRank(zones, zones[2], "total", "desc")).toBe(2); // 60 → rank 2
  });

  test("0 when the zone is absent", () => {
    expect(getRank(zones, makeZone("99", "Ghost"), "total", "desc")).toBe(0);
  });
});

describe("formatCellValue", () => {
  test("population compacts to k with trimmed .0", () => {
    expect(formatCellValue("population", 27074)).toBe("27.1k");
    expect(formatCellValue("population", 27000)).toBe("27k");
    expect(formatCellValue("population", 500)).toBe("500");
  });

  test("cafe/traffic/flow one decimal, transit integer, total one decimal", () => {
    expect(formatCellValue("cafe", 4.5321)).toBe("4.5");
    expect(formatCellValue("traffic", 428.4)).toBe("428.4");
    expect(formatCellValue("flow", 51.37)).toBe("51.4");
    expect(formatCellValue("transit", 23)).toBe("23");
    expect(formatCellValue("total", 57.1)).toBe("57.1");
  });

  test("null renders en dash", () => {
    expect(formatCellValue("total", null)).toBe("–");
    expect(formatCellValue("population", null)).toBe("–");
  });
});

describe("zoneFeatureId", () => {
  const zones = [makeZone("01", "Alpha"), makeZone("02", "Beta")];
  const scores: FeatureCollection<Polygon | MultiPolygon> = { type: "FeatureCollection", features: zones };

  test("source index for same-object zones", () => {
    expect(zoneFeatureId(zones[0], scores)).toBe(0);
    expect(zoneFeatureId(zones[1], scores)).toBe(1);
  });

  test("ZONASTAT fallback for foreign objects (map-click zones)", () => {
    const foreign = makeZone("02", "Beta Fresh");
    expect(foreign).not.toBe(zones[1]);
    expect(zoneFeatureId(foreign, scores)).toBe(1);
  });

  test("-1 when absent", () => {
    expect(zoneFeatureId(makeZone("99", "Ghost"), scores)).toBe(-1);
    expect(zoneFeatureId(zones[0], null)).toBe(-1);
  });
});