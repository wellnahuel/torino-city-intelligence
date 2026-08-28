import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Zone, ZoneScoreProperties } from "@/types/data";

/** Sortable columns of the zone list. "name" sorts by normalized zone name. */
export type SortKey = "name" | "total" | "cafe" | "traffic" | "transit" | "population" | "flow";
/**
 * "best" = scoring-model direction (see FACTOR_DIRECTION);
 * "asc"/"desc" = plain value order.
 */
export type SortMode = "best" | "asc" | "desc";

/** Display model for a zone list row. */
export interface ZoneListRow {
  zone: Zone;
  /** 1-based position in the FULL sorted list — unaffected by search filtering. */
  rank: number;
}

/** Raw score property backing each sort key. */
export const SORT_FIELD: Record<SortKey, keyof ZoneScoreProperties> = {
  name: "name",
  total: "total",
  cafe: "cafe_density",
  traffic: "traffic_raw",
  transit: "stops500m",
  population: "pop2023",
  flow: "flow_raw",
};

/**
 * Best-first direction per key. cafe_density is INVERTED in the ETL
 * (the score uses `1 - cafe_norm`): fewer cafés per km² is better → asc.
 * All other factors are direct (higher = better) → desc. Name A→Z → asc.
 */
export const FACTOR_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  total: "desc",
  cafe: "asc",
  traffic: "desc",
  transit: "desc",
  population: "desc",
  flow: "desc",
};

/** Display name of a zone: `name`, falling back to the ZONASTAT code. */
export function zoneName(zone: Zone): string {
  return zone.properties.name || zone.properties.ZONASTAT;
}

/** Accent- and case-insensitive normalization: NFD + diacritic strip + lowercase. */
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function compareNullable(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls ALWAYS sort last, regardless of direction
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function compareNormalized(a: string, b: string, dir: "asc" | "desc"): number {
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

/**
 * Stable sort of a COPY of `zones` — the source array is never mutated
 * (the map's feature-state id mapping depends on source order). Nulls always
 * sort last in both directions. Ties: normalized name asc, then source index
 * asc (fully deterministic).
 */
export function sortZones(zones: Zone[], key: SortKey, mode: SortMode): Zone[] {
  const dir = mode === "best" ? FACTOR_DIRECTION[key] : mode;
  return zones
    .map((zone, index) => ({ zone, index }))
    .sort((a, b) => {
      let cmp: number;
      if (key === "name") {
        cmp = compareNormalized(normalizeName(zoneName(a.zone)), normalizeName(zoneName(b.zone)), dir);
      } else {
        cmp = compareNullable(
          a.zone.properties[SORT_FIELD[key]] as number | null,
          b.zone.properties[SORT_FIELD[key]] as number | null,
          dir
        );
      }
      if (cmp !== 0) return cmp;
      const na = normalizeName(zoneName(a.zone));
      const nb = normalizeName(zoneName(b.zone));
      if (na !== nb) return na < nb ? -1 : 1;
      return a.index - b.index;
    })
    .map((d) => d.zone);
}

/** Accent/case-insensitive substring search on name (ZONASTAT fallback). "" passes the array through. */
export function filterZones(zones: Zone[], query: string): Zone[] {
  const q = normalizeName(query);
  if (q === "") return zones;
  return zones.filter((z) => {
    const name = normalizeName(zoneName(z));
    const code = normalizeName(z.properties.ZONASTAT);
    return name.includes(q) || code.includes(q);
  });
}

/** 1-based rank of `target` in the sorted full list; 0 if absent. */
export function getRank(zones: Zone[], target: Zone, key: SortKey, mode: SortMode): number {
  const sorted = sortZones(zones, key, mode);
  let idx = sorted.indexOf(target);
  if (idx < 0) {
    const code = target.properties.ZONASTAT;
    idx = sorted.findIndex((z) => z.properties.ZONASTAT === code);
  }
  return idx < 0 ? 0 : idx + 1;
}

/**
 * Formatted cell value for a numeric sort key:
 * population → compact "27.1k" (≥1000, trailing ".0" trimmed); cafe/traffic/flow → 1 decimal;
 * transit → integer; total → 1 decimal; null → "–".
 */
export function formatCellValue(key: Exclude<SortKey, "name">, v: number | null): string {
  if (v === null || v === undefined) return "–";
  switch (key) {
    case "population": {
      if (v >= 1000) {
        const compact = (v / 1000).toFixed(1);
        return `${compact.endsWith(".0") ? compact.slice(0, -2) : compact}k`;
      }
      return String(v);
    }
    case "cafe":
    case "traffic":
    case "flow":
      return v.toFixed(1);
    case "transit":
      return String(v);
    case "total":
      return v.toFixed(1);
  }
}

/**
 * Feature id for map feature-state ops. The zones Source uses MapLibre
 * `generateId` on a static committed file, so feature id == index in
 * `scores.features`. indexOf covers list rows (same objects); findIndex by
 * ZONASTAT covers map-click zones (fresh objects — REQUIRED); -1 if absent.
 */
export function zoneFeatureId(
  zone: Zone,
  scores: FeatureCollection<Polygon | MultiPolygon> | null
): number {
  if (!scores) return -1;
  const idx = scores.features.indexOf(zone);
  if (idx >= 0) return idx;
  const code = zone.properties.ZONASTAT;
  return scores.features.findIndex((f) => f.properties?.ZONASTAT === code);
}