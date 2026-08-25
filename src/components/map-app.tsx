"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { fetchLayer, fetchLayerCounts, fetchZones } from "@/lib/data";
import { LAYER_KEYS, type LayerCounts, type LayerKey, type Zone } from "@/types/data";
import { LayerToggle } from "@/components/layer-toggle";
import { MapLoading } from "@/components/map-loading";
import { ScorePanel } from "@/components/score-panel";

const MapView = dynamic(
  () => import("@/components/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <MapLoading />,
  }
);

const SCORE_BUCKET_COLORS = ["#dce5ff", "#b9c7ff", "#8ea4ff", "#4d6bff", "#001aff"];

export function MapApp() {
  const t = useTranslations("Map");

  const [counts, setCounts] = useState<LayerCounts | null>(null);
  const [scores, setScores] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [layerData, setLayerData] = useState<Partial<Record<LayerKey, FeatureCollection>>>({});
  const [active, setActive] = useState<Set<LayerKey>>(new Set(["cafes"]));
  const [choroplethOn, setChoroplethOn] = useState(true);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [basemapError, setBasemapError] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLayerCounts(), fetchZones()])
      .then(([c, zones]) => {
        if (cancelled) return;
        setCounts(c);
        const fc: FeatureCollection<Polygon | MultiPolygon> = {
          type: "FeatureCollection",
          features: zones,
        };
        setScores(fc);
      })
      .catch((err: Error) => {
        if (!cancelled) setDataError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLayer = useCallback(
    (key: LayerKey) => {
      setActive((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      // Lazy-load the layer payload on first enable.
      setLayerData((prev) => {
        if (prev[key]) return prev;
        fetchLayer(key)
          .then((features) => {
            setLayerData((cur) => ({
              ...cur,
              [key]: { type: "FeatureCollection", features } as FeatureCollection,
            }));
          })
          .catch((err: Error) => setDataError(err.message));
        return prev;
      });
    },
    []
  );

  const handleZoneSelect = useCallback((zone: Zone | null) => {
    setSelected(zone);
  }, []);

  const layerCounts = useMemo(() => {
    const empty: Record<LayerKey, number> = {
      cafes: 0,
      restaurants: 0,
      transit: 0,
      schools: 0,
      services: 0,
      green: 0,
    };
    return counts ? counts.layers : empty;
  }, [counts]);

  return (
    <div className="relative h-[calc(100dvh-3.5rem)]">
      <MapView
        scores={scores}
        layerData={layerData}
        active={active}
        choroplethOn={choroplethOn}
        onZoneSelect={handleZoneSelect}
        onBasemapError={setBasemapError}
      />

      {/* Layers panel */}
      <div className="absolute left-3 top-3 z-20 w-56 rounded-xl border border-border bg-card/90 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("layersTitle")}
          </h2>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {active.size}/{LAYER_KEYS.length}
          </span>
        </div>
        <LayerToggle counts={layerCounts} active={active} onToggle={toggleLayer} />

        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            aria-pressed={choroplethOn}
            onClick={() => setChoroplethOn((o) => !o)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-colors ${
              choroplethOn
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-accent/60"
            }`}
          >
            <span>{t("choroplethLabel")}</span>
            <span className="font-mono text-[10px]">
              {choroplethOn ? t("choroplethOn") : t("choroplethOff")}
            </span>
          </button>
        </div>

        {dataError && <p className="mt-2 text-[10px] text-red-500">{dataError}</p>}
        {loading && (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">{t("loading")}</p>
        )}
      </div>

      {/* Legend */}
      {choroplethOn && (
        <div className="absolute bottom-3 left-3 z-20 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("legend.title")}
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{t("legend.low")}</span>
            <div
              className="h-2 w-32 rounded-full"
              style={{
                background: `linear-gradient(to right, ${SCORE_BUCKET_COLORS.join(", ")})`,
              }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{t("legend.high")}</span>
          </div>
        </div>
      )}

      {basemapError && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 hidden rounded-full border border-border bg-card/90 px-3 py-1 font-mono text-[10px] text-muted-foreground shadow-lg backdrop-blur lg:block">
          {t("basemapError")}
        </div>
      )}

      {/* Score panel */}
      <div className="absolute inset-x-3 bottom-3 z-30 max-h-[45%] overflow-y-auto rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur lg:inset-x-auto lg:inset-y-3 lg:right-3 lg:max-h-[calc(100%-1.5rem)] lg:w-[340px]">
        <ScorePanel zone={selected} allLayersOff={active.size === 0} />
      </div>
    </div>
  );
}