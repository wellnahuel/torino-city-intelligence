"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  Map,
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
 * Score buckets: pale blue (low) → accent blue (high).
 * Remapped to the REAL score range (30.4–57.1) so every tone is used;
 * previously the 0–100 theoretical scale left the 60–100 buckets empty.
 */
const SCORE_BUCKETS: { max: number; color: string }[] = [
  { max: 35, color: "#dce5ff" },
  { max: 40, color: "#b0bcff" },
  { max: 45, color: "#8494ff" },
  { max: 50, color: "#586bff" },
  { max: 55, color: "#2c43ff" },
  { max: 100, color: "#001aff" },
];

function fillColorExpression(): ExpressionSpecification {
  const expr: unknown[] = ["case", ["==", ["get", "total"], null], "#f5f5f5"];
  for (const b of SCORE_BUCKETS) {
    expr.push(["<", ["get", "total"], b.max], b.color);
  }
  expr.push("#001aff");
  return expr as unknown as ExpressionSpecification;
}

interface MapViewProps {
  scores: FeatureCollection<Polygon | MultiPolygon> | null;
  layerData: Partial<Record<LayerKey, FeatureCollection>>;
  active: Set<LayerKey>;
  choroplethOn: boolean;
  /** Selection contract — highlight and fly are derived from this prop. */
  selected: MapSelection;
  onZoneSelect: (zone: Zone | null) => void;
  onBasemapError: (failed: boolean) => void;
}

export function MapView({
  scores,
  layerData,
  active,
  choroplethOn,
  selected,
  onZoneSelect,
  onBasemapError,
}: MapViewProps) {
  const t = useTranslations("Map");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mapRef = useRef<MapRef>(null);
  const loadedRef = useRef(false);
  /** Currently highlighted feature id — written ONLY by the prop-driven effect below. */
  const selectedIdRef = useRef<number | null>(null);
  const [basemapError, setBasemapError] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [mapReady, setMapReady] = useState(false);

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
        map.removeFeatureState({ source: "zones", id: selectedIdRef.current });
        selectedIdRef.current = null;
      }
      const { zone } = selected;
      if (!zone || !scores) return;
      const id = zoneFeatureId(zone, scores);
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
  }, [selected, scores, mapKey, mapReady]);

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

  const zonesFill: LayerProps = useMemo(
    () => ({
      id: "zones-fill",
      type: "fill",
      paint: {
        "fill-color": choroplethOn ? fillColorExpression() : "#c7c9d1",
        // Selected zone gains emphasis (higher opacity) on top of the base value.
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          choroplethOn ? 0.75 : 0.5,
          choroplethOn ? 0.55 : 0.22,
        ],
        "fill-outline-color": choroplethOn ? "transparent" : "rgba(10,10,10,0.18)",
      },
    }),
    [choroplethOn]
  );

  const zonesLine: LayerProps = useMemo(
    () => ({
      id: "zones-line",
      type: "line",
      paint: {
        "line-color": "#0a0a0a",
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 0.6],
        "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.9, 0.45],
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
        onLoad={handleLoad}
        onError={handleError}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />
        {scores && (
          <Source id="zones" type="geojson" data={scores} generateId>
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