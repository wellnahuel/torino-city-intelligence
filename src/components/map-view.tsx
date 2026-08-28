"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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

/** Score buckets: pale blue (low) → accent blue (high). */
const SCORE_BUCKETS: { max: number; color: string }[] = [
  { max: 20, color: "#dce5ff" },
  { max: 40, color: "#b9c7ff" },
  { max: 60, color: "#8ea4ff" },
  { max: 80, color: "#4d6bff" },
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
  /** Selection contract — highlight/fly are derived from this in the T12 refactor. */
  selected: MapSelection;
  onZoneSelect: (zone: Zone | null) => void;
  onBasemapError: (failed: boolean) => void;
}

export function MapView({
  scores,
  layerData,
  active,
  choroplethOn,
  onZoneSelect,
  onBasemapError,
}: MapViewProps) {
  const t = useTranslations("Map");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mapRef = useRef<MapRef>(null);
  const loadedRef = useRef(false);
  const selectedIdRef = useRef<number | null>(null);
  const [basemapError, setBasemapError] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const mapStyle = useMemo(() => {
    if (basemapError) return isDark ? FALLBACK_STYLE_DARK : FALLBACK_STYLE_LIGHT;
    return isDark ? STYLE_DARK : STYLE_LIGHT;
  }, [basemapError, isDark]);

  const selectFeature = useCallback((id: number | null) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (selectedIdRef.current !== null) {
      map.removeFeatureState({ source: "zones", id: selectedIdRef.current });
    }
    selectedIdRef.current = id;
    if (id !== null) {
      map.setFeatureState({ source: "zones", id }, { selected: true });
    }
  }, []);

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
        selectFeature(numericId);
        onZoneSelect(zone);
      } else {
        selectFeature(null);
        onZoneSelect(null);
      }
    },
    [onZoneSelect, selectFeature]
  );

  const handleLoad = useCallback(() => {
    loadedRef.current = true;
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
  }, []);

  const zonesFill: LayerProps = useMemo(
    () => ({
      id: "zones-fill",
      type: "fill",
      paint: {
        "fill-color": choroplethOn ? fillColorExpression() : "#c7c9d1",
        "fill-opacity": choroplethOn ? 0.55 : 0.22,
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