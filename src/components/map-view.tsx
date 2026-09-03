"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  Map,
  Popup,
  Source,
  Layer,
  NavigationControl,
  type MapRef,
  type LayerProps,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LayerKey, MapSelection, Zone } from "@/types/data";
import { zoneFeatureId } from "@/lib/zone-list";
import {
  computeZoneScore,
  normalizeWeights,
  quantileBreaks,
  type ScoringWeights,
} from "@/lib/scoring";
import { geometryBounds, geometryCentroid } from "@/lib/geometry";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const TORINO = { longitude: 7.6869, latitude: 45.0703, zoom: 11.5 };

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

const FALLBACK_STYLE_LIGHT: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#ffffff" } }],
};
const FALLBACK_STYLE_DARK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0a0a" } }],
};

/**
 * 6-tone ramp for the dynamic quantile choropleth (pale blue → accent blue).
 * Breaks are re-derived from the CURRENT displayed totals, so extreme custom
 * weights spread across all six tones instead of piling into fixed buckets.
 */
const FILL = ["#dce5ff", "#b0bcff", "#8494ff", "#586bff", "#2c43ff", "#001aff"];

/**
 * Distinct hues for the compare slots 1..3 — none equal to the selected
 * accent (#001aff) or the choropleth blues.
 */
const COMPARE_COLORS = ["#00c853", "#ff6d00", "#d500f9"];

interface MapViewProps {
  displayScores: FeatureCollection<Polygon | MultiPolygon> | null;
  layerData: Partial<Record<LayerKey, FeatureCollection>>;
  active: Set<LayerKey>;
  choroplethOn: boolean;
  /** Selection contract — highlight and fly are derived from this prop. */
  selected: MapSelection;
  /** Session comparison set — each zone gets a `compare1..3` feature-state slot. */
  compare: Zone[];
  /** Custom weights — the hover tooltip score is live-computed from these. */
  weights: ScoringWeights;
  onZoneSelect: (zone: Zone | null) => void;
  onBasemapError: (failed: boolean) => void;
}

export function MapView({
  displayScores,
  layerData,
  active,
  choroplethOn,
  selected,
  compare,
  weights,
  onZoneSelect,
  onBasemapError,
}: MapViewProps) {
  const t = useTranslations("Map");
  const tS = useTranslations("Scoring");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mapRef = useRef<MapRef>(null);
  const loadedRef = useRef(false);
  /** Currently highlighted feature id — written ONLY by the prop-driven effect below. */
  const selectedIdRef = useRef<number | null>(null);
  /** Compare feature-states set by the effect below — re-removed key-scoped on re-run. */
  const compareStatesRef = useRef<{ id: number; key: string }[]>([]);
  const [basemapError, setBasemapError] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  /** Hover tooltip — zone + live-computed score anchored to the cursor. */
  const [hover, setHover] = useState<{
    id: number;
    name: string;
    score: number;
    lng: number;
    lat: number;
  } | null>(null);
  /** Pending hide — a short delay avoids flicker on thin gaps between zones. */
  const hoverHideRef = useRef<number | null>(null);

  /** Normalized weights — the tooltip score is recomputed live, never read
   * from properties.total (stale under custom weights). */
  const normW = useMemo(() => normalizeWeights(weights), [weights]);

  // Clear any pending tooltip hide on unmount.
  useEffect(() => {
    return () => {
      if (hoverHideRef.current !== null) window.clearTimeout(hoverHideRef.current);
    };
  }, []);

  const mapStyle = useMemo(() => {
    if (basemapError) return isDark ? FALLBACK_STYLE_DARK : FALLBACK_STYLE_LIGHT;
    return isDark ? STYLE_DARK : STYLE_LIGHT;
  }, [basemapError, isDark]);

  // Highlight + fly are DERIVED from the `selected` prop — the map's feature-state
  // is synced here instead of in the click handler (single source of truth).
  // `mapKey`/`mapReady` re-run the effect so a pending selection re-applies after
  // a basemap retry remounts the <Map> or the initial load completes.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      if (selectedIdRef.current !== null) {
        // KEY-SCOPED removal — a bare removeFeatureState({source, id}) would wipe
        // the compare1..3 states on the same feature (regression fix). MapLibre v6
        // takes the key as a SECOND argument (not part of FeatureIdentifier).
        map.removeFeatureState(
          { source: "zones", id: selectedIdRef.current },
          "selected"
        );
        selectedIdRef.current = null;
      }
      const { zone } = selected;
      if (!zone || !displayScores) return;
      const id = zoneFeatureId(zone, displayScores);
      if (id < 0) return;
      map.setFeatureState({ source: "zones", id }, { selected: true });
      selectedIdRef.current = id;
      // Only list-originated selections fly; map clicks highlight in place.
      if (selected.source === "list" && loadedRef.current) {
        const bounds = geometryBounds(zone.geometry) as [[number, number], [number, number]];
        const degenerate =
          !Number.isFinite(bounds[0][0]) ||
          !Number.isFinite(bounds[0][1]) ||
          !Number.isFinite(bounds[1][0]) ||
          !Number.isFinite(bounds[1][1]) ||
          (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]);
        if (degenerate) {
          map.flyTo({
            center: geometryCentroid(zone.geometry) as [number, number],
            zoom: 13,
            duration: 700,
          });
        } else {
          // Clear the sidebar (340px) + ScorePanel (340px) on lg; the bottom
          // sheet on mobile.
          const lg = window.matchMedia("(min-width: 1024px)").matches;
          map.fitBounds(bounds, {
            padding: lg
              ? { left: 340, right: 360, top: 60, bottom: 60 }
              : { left: 40, right: 40, top: 60, bottom: 140 },
            maxZoom: 14.5,
            duration: 700,
          });
        }
      }
    } catch {
      // Map/source not ready (e.g. basemap error) — highlight + fly are best-effort.
    }
  }, [selected, displayScores, mapKey, mapReady]);

  // Compare multi-highlight: set `compare1..3` feature-state slots (one boolean
  // key per zone) with distinct colors. `mapKey`/`mapReady` re-run the effect
  // after a basemap retry remounts the <Map> or the initial load completes.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      // Key-scoped removal of the previous run's states — never bare
      // removeFeatureState (would wipe `selected` and other compare keys).
      for (const { id, key } of compareStatesRef.current) {
        map.removeFeatureState({ source: "zones", id }, key);
      }
      compareStatesRef.current = [];
      if (!displayScores) return;
      compare.forEach((zone, i) => {
        if (i >= 3) return; // cap — the UI enforces 3, defensive here
        const id = zoneFeatureId(zone, displayScores);
        if (id < 0) return;
        const key = `compare${i + 1}`;
        map.setFeatureState({ source: "zones", id }, { [key]: true });
        compareStatesRef.current.push({ id, key });
      });
    } catch {
      // Map/source not ready — best-effort, re-applied on mapKey/mapReady.
    }
  }, [compare, displayScores, mapKey, mapReady]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const numericId =
        feature && typeof feature.id === "number" ? feature.id : undefined;
      if (feature && numericId !== undefined && feature.properties) {
        const zone: Zone = {
          type: "Feature",
          id: numericId,
          geometry: feature.geometry as Polygon | MultiPolygon,
          properties: feature.properties as unknown as Zone["properties"],
        };
        onZoneSelect(zone); // the effect above owns highlight — no selectFeature call
      } else {
        onZoneSelect(null);
      }
    },
    [onZoneSelect]
  );

  const cancelHoverHide = useCallback(() => {
    if (hoverHideRef.current !== null) {
      window.clearTimeout(hoverHideRef.current);
      hoverHideRef.current = null;
    }
  }, []);

  const scheduleHoverHide = useCallback(
    (delay = 150) => {
      cancelHoverHide();
      hoverHideRef.current = window.setTimeout(() => {
        setHover(null);
        hoverHideRef.current = null;
      }, delay);
    },
    [cancelHoverHide]
  );

  /**
   * Hover tooltip — fires only on map hover. The legend/layers panel and the
   * score panel are HTML overlays OUTSIDE the map container, so hovering them
   * never reaches these events. The score uses the SAME live computation as
   * the choropleth (computeZoneScore with normalized weights).
   */
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const id = feature && typeof feature.id === "number" ? feature.id : undefined;
      if (!feature || id === undefined || !feature.properties) {
        scheduleHoverHide();
        return;
      }
      const props = feature.properties as unknown as Zone["properties"];
      setHover((prev) => {
        // Same zone under the cursor — keep the entry anchor, skip re-render.
        if (prev && prev.id === id) return prev;
        return {
          id,
          name: props.name || props.ZONASTAT,
          score: computeZoneScore(props, normW),
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
        };
      });
      cancelHoverHide();
    },
    [normW, cancelHoverHide, scheduleHoverHide]
  );

  /** Leave zone (or the map) — hide after a short delay to avoid flicker. */
  const handleMouseLeave = useCallback(() => {
    scheduleHoverHide();
  }, [scheduleHoverHide]);

  const handleLoad = useCallback(() => {
    loadedRef.current = true;
    setMapReady(true);
    setBasemapError(false);
    onBasemapError(false);
  }, [onBasemapError]);

  const handleError = useCallback(() => {
    if (!loadedRef.current) {
      setBasemapError(true);
      onBasemapError(true);
    }
  }, [onBasemapError]);

  const handleRetry = useCallback(() => {
    setBasemapError(false);
    setMapKey((k) => k + 1);
    loadedRef.current = false;
    setMapReady(false);
  }, []);

/**
 * Quantile fill expression over the CURRENT displayed totals: 6 equal-count
 * buckets → 5 breaks; null total → #f5f5f5; degenerate (all-equal) domains fall
 * through to the top tone; off/none → null (layers panel falls back to neutral).
 */
const fillExpr = useMemo<ExpressionSpecification | null>(() => {
  if (!choroplethOn || !displayScores) return null;
  const totals = displayScores.features
    .map((f) => f.properties?.total)
    .filter((v): v is number => typeof v === "number");
  const breaks = quantileBreaks(totals, FILL.length);
  const expr: unknown[] = ["case", ["==", ["get", "total"], null], "#f5f5f5"];
  breaks.forEach((b, i) => expr.push(["<", ["get", "total"], b], FILL[i]));
  expr.push(FILL[FILL.length - 1]);
  return expr as unknown as ExpressionSpecification;
}, [displayScores, choroplethOn]);

const zonesFill: LayerProps = useMemo(
    () => ({
      id: "zones-fill",
      type: "fill",
      paint: {
        // Selected wins precedence; compare1..3 follow; base falls through.
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          choroplethOn ? fillExpr ?? "#c7c9d1" : "#c7c9d1",
          ["boolean", ["feature-state", "compare1"], false],
          COMPARE_COLORS[0],
          ["boolean", ["feature-state", "compare2"], false],
          COMPARE_COLORS[1],
          ["boolean", ["feature-state", "compare3"], false],
          COMPARE_COLORS[2],
          choroplethOn ? fillExpr ?? "#c7c9d1" : "#c7c9d1",
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          choroplethOn ? 0.75 : 0.5,
          ["boolean", ["feature-state", "compare1"], false],
          choroplethOn ? 0.75 : 0.5,
          ["boolean", ["feature-state", "compare2"], false],
          choroplethOn ? 0.75 : 0.5,
          ["boolean", ["feature-state", "compare3"], false],
          choroplethOn ? 0.75 : 0.5,
          choroplethOn ? 0.55 : 0.22,
        ],
        "fill-outline-color": choroplethOn ? "transparent" : "rgba(10,10,10,0.18)",
      },
    }),
    [choroplethOn, fillExpr]
  );

  const zonesLine: LayerProps = useMemo(
    () => ({
      id: "zones-line",
      type: "line",
      paint: {
        "line-color": "#0a0a0a",
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          2,
          ["boolean", ["feature-state", "compare1"], false],
          2,
          ["boolean", ["feature-state", "compare2"], false],
          2,
          ["boolean", ["feature-state", "compare3"], false],
          2,
          0.6,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0.9,
          ["boolean", ["feature-state", "compare1"], false],
          0.9,
          ["boolean", ["feature-state", "compare2"], false],
          0.9,
          ["boolean", ["feature-state", "compare3"], false],
          0.9,
          0.45,
        ],
      },
    }),
    []
  );

  return (
    <div className="relative h-full w-full">
      <Map
        key={mapKey}
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={mapStyle}
        initialViewState={TORINO}
        interactiveLayerIds={["zones-fill"]}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onLoad={handleLoad}
        onError={handleError}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />
        {displayScores && (
          <Source id="zones" type="geojson" data={displayScores} generateId>
            <Layer {...zonesFill} />
            <Layer {...zonesLine} />
          </Source>
        )}

        {(Array.from(active) as LayerKey[]).map((key) => {
          if (!active.has(key)) return null;
          const data = layerData[key];
          if (!data) return null;
          if (key === "green") {
            return (
              <Source key={key} id={key} type="geojson" data={data}>
                <Layer
                  id={`${key}-fill`}
                  type="fill"
                  paint={{
                    "fill-color": "#2e7d32",
                    "fill-opacity": 0.28,
                    "fill-outline-color": "rgba(46,125,50,0.5)",
                  }}
                />
              </Source>
            );
          }
          const circle: LayerProps = {
            id: `${key}-points`,
            type: "circle",
            paint: {
              "circle-radius": 3,
              "circle-color": isDark ? "#4d6bff" : "#001aff",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 0.5,
              "circle-opacity": 0.85,
            },
          };
          return (
            <Source key={key} id={key} type="geojson" data={data}>
              <Layer {...circle} />
            </Source>
          );
        })}

        {hover && (
          <Popup
            longitude={hover.lng}
            latitude={hover.lat}
            anchor="bottom"
            offset={10}
            closeButton={false}
            closeOnClick={false}
            className="rounded-xl border-2 border-border shadow-2xl"
          >
            <div className="px-3 py-2">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {hover.name}
              </p>
              <p className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
                <span className="text-xs text-muted-foreground">{tS("total")}</span>
                <span className="text-base font-bold leading-none text-accent">
                  {hover.score.toFixed(1)}
                </span>
              </p>
            </div>
          </Popup>
        )}
      </Map>

      {basemapError && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-xs shadow-lg">
          <span>{t("basemapError")}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full border border-accent px-3 py-0.5 font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t("retry")}
          </button>
        </div>
      )}
    </div>
  );
}