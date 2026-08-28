import type { MultiPolygon, Polygon, Position } from "geojson";

/**
 * Pure geometry helpers shared by the ETL (source of truth) and the client
 * map (centroid/bbox for flyTo/fitBounds). Extracted from etl/04-score.ts.
 */

/** Shoelace centroid of the outer ring (planar degrees — fine for tiny polygons). */
export function polygonCentroid(poly: Polygon): Position {
  const ring = poly.coordinates[0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

export function geometryCentroid(geom: Polygon | MultiPolygon): Position {
  if (geom.type === "Polygon") return polygonCentroid(geom);
  // Area-weighted centroid across polygons.
  let areaSum = 0, cx = 0, cy = 0;
  for (const poly of geom.coordinates) {
    const c = polygonCentroid({ type: "Polygon", coordinates: poly });
    const ring = poly[0];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    a *= 0.5;
    areaSum += a;
    cx += c[0] * a;
    cy += c[1] * a;
  }
  return areaSum ? [cx / areaSum, cy / areaSum] : [0, 0];
}

/** Bounding box of a polygon's outer ring: `[sw, ne]` = `[[minLon, minLat], [maxLon, maxLat]]`. */
export function polygonBounds(poly: Polygon): [Position, Position] {
  const ring = poly.coordinates[0];
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/** Bounding box across all polygons of a geometry (union for MultiPolygon). */
export function geometryBounds(geom: Polygon | MultiPolygon): [Position, Position] {
  if (geom.type === "Polygon") return polygonBounds(geom);
  const bounds = geom.coordinates.map((c) => polygonBounds({ type: "Polygon", coordinates: c }));
  const sw: Position = [
    Math.min(...bounds.map((b) => b[0][0])),
    Math.min(...bounds.map((b) => b[0][1])),
  ];
  const ne: Position = [
    Math.max(...bounds.map((b) => b[1][0])),
    Math.max(...bounds.map((b) => b[1][1])),
  ];
  return [sw, ne];
}