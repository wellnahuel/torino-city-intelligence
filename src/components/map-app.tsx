"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { fetchLayer, fetchLayerCounts, fetchZones } from "@/lib/data";
import { DEFAULT_POSITIONS, applyWeights, weightsEqual, type ScoringWeights } from "@/lib/scoring";
import {
  FACTOR_KEYS,
  LAYER_KEYS,
  NULL_SELECTION,
  type FactorKey,
  type LayerCounts,
  type LayerKey,
  type MapSelection,
  type Zone,
  type ZoneScoreProperties,
} from "@/types/data";
import { LayerToggle } from "@/components/layer-toggle";
import { MapLoading } from "@/components/map-loading";
import { ScorePanel } from "@/components/score-panel";
import { ZoneList, ZONE_LIST_PANEL_ID } from "@/components/zone-list";

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
  const tz = useTranslations("ZoneList");
  const tS = useTranslations("Scoring");

  const [counts, setCounts] = useState<LayerCounts | null>(null);
  const [scores, setScores] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    ZoneScoreProperties
  > | null>(null);
  const [layerData, setLayerData] = useState<Partial<Record<LayerKey, FeatureCollection>>>({});
  const [active, setActive] = useState<Set<LayerKey>>(new Set(["cafes"]));
  const [choroplethOn, setChoroplethOn] = useState(true);
  /** Custom scoring weights — slider positions 0-100 per factor (DEFAULT_POSITIONS = official view). */
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_POSITIONS);
  /** Weights accordion — collapsed by default (zero visual delta on load). */
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(NULL_SELECTION);
  /** Mobile overlay drawer — closed by default on fresh load. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** lg+ persistent sidebar — visible unless the user collapses it. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [basemapError, setBasemapError] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLayerCounts(), fetchZones()])
      .then(([c, zones]) => {
        if (cancelled) return;
        setCounts(c);
        const fc: FeatureCollection<Polygon | MultiPolygon, ZoneScoreProperties> = {
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

  /** Sliders differ from defaults → custom scoring mode (badge + legend swap). */
  const isCustom = !weightsEqual(weights, DEFAULT_POSITIONS);
  /** Recomputed scores: identity (original reference) on defaults, cloned totals otherwise. */
  const displayScores = useMemo(
    () => (scores ? applyWeights(scores, weights) : null),
    [scores, weights]
  );

  // READ persisted weights ONCE after mount (SSR-safe — effects never run server-side).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tci.weights.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<FactorKey, unknown>>;
      const next = { ...DEFAULT_POSITIONS };
      for (const k of FACTOR_KEYS) {
        const v = parsed[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          next[k] = Math.min(100, Math.max(0, Math.round(v)));
        }
      }
      // Stored == defaults → no pointless render. The setState is deferred out
      // of the effect body so the first client render matches the SSR output
      // (no hydration mismatch) and the update lands right after paint.
      if (!weightsEqual(next, DEFAULT_POSITIONS)) {
        queueMicrotask(() => setWeights(next));
      }
    } catch {
      // Corrupt storage → keep defaults, no crash.
    }
  }, []);

  // WRITE on every change; remove the key when back to defaults (reset clears storage).
  useEffect(() => {
    try {
      if (!isCustom) {
        localStorage.removeItem("tci.weights.v1");
      } else {
        localStorage.setItem("tci.weights.v1", JSON.stringify(weights));
      }
    } catch {
      // Storage unavailable (private mode, etc.) — in-memory weights still work.
    }
  }, [isCustom, weights]);

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

  /** Map click → highlight only (no fly); empty click clears the selection. */
  const handleZoneSelect = useCallback((zone: Zone | null) => {
    setSelection((s) => ({ zone, source: zone ? "map" : null, nonce: s.nonce + 1 }));
  }, []);

  /** List row → fly to the zone and close the mobile drawer (lg sidebar stays). */
  const handleListZoneSelect = useCallback((zone: Zone) => {
    setSelection((s) => ({ zone, source: "list", nonce: s.nonce + 1 }));
    setDrawerOpen(false);
  }, []);

  const handleOpenList = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed(false);
    } else {
      setDrawerOpen(true);
      // Mobile drawer: move focus to the search input on open.
      requestAnimationFrame(() => {
        document.getElementById("zone-list-search")?.focus();
      });
    }
  }, []);

  const handleCloseList = useCallback(() => {
    setDrawerOpen(false);
    setSidebarCollapsed(true);
  }, []);

  /** One slider changed → replace that factor's position (never mutates state). */
  const handleWeightChange = useCallback((key: FactorKey, v: number) => {
    setWeights((w) => ({ ...w, [key]: v }));
  }, []);

  // Escape closes the mobile drawer and returns focus to the floating toggle.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        requestAnimationFrame(() => toggleRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
    <div className="flex h-[calc(100dvh-3.5rem)]">
      {/* Zone list: persistent sidebar on lg+, overlay drawer on <lg */}
      <aside
        id={ZONE_LIST_PANEL_ID}
        aria-label={tz("title")}
        className={`fixed inset-y-0 left-0 top-14 z-40 w-[85vw] max-w-80 border-r border-border bg-card shadow-xl transition-transform duration-300 motion-reduce:transition-none lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "lg:hidden" : ""}`}
      >
        <ZoneList
          zones={displayScores?.features ?? []}
          selected={selection.zone}
          onSelect={handleListZoneSelect}
          onClose={handleCloseList}
          open={!sidebarCollapsed}
        />
      </aside>

      {/* Map wrapper — all absolute overlays live here, anchored to the map area */}
      <div className="relative min-w-0 flex-1">
        <MapView
          displayScores={displayScores}
          layerData={layerData}
          active={active}
          choroplethOn={choroplethOn}
          selected={selection}
          onZoneSelect={handleZoneSelect}
          onBasemapError={setBasemapError}
        />

        {/* Layers panel */}
        <div className="absolute left-3 top-14 z-20 w-64 max-h-[calc(100dvh-3.5rem)] overflow-y-auto rounded-xl border border-border bg-card/90 p-3 shadow-lg backdrop-blur lg:top-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("layersTitle")}
            </h2>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {active.size}/{LAYER_KEYS.length}
            </span>
          </div>
          <LayerToggle counts={layerCounts} active={active} onToggle={toggleLayer} />

          {active.size === 0 && (
            <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
              {t("emptyHint")}
            </p>
          )}

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

          {/* Custom weights accordion — below the choropleth toggle, collapsed by default */}
          <div className="mt-2 border-t border-border pt-2">
            <button
              type="button"
              aria-expanded={weightsOpen}
              onClick={() => setWeightsOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="flex items-center gap-1.5">
                <span>{tS("weightsTitle")}</span>
                {isCustom && (
                  <span className="rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                    {tS("customBadge")}
                  </span>
                )}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`transition-transform ${weightsOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {weightsOpen && (
              <div className="mt-1.5 flex flex-col gap-2">
                <p className="font-mono text-[9px] text-muted-foreground">
                  {tS("weightsIntro")}
                </p>
                {FACTOR_KEYS.map((k) => (
                  <div key={k}>
                    <div className="flex items-center justify-between">
                      <label htmlFor={`weight-${k}`} className="text-[10px] text-foreground">
                        {tS(`variable.${k}.name`)}
                        {k === "cafe" && (
                          <span className="text-muted-foreground">{tS("inverseMark")}</span>
                        )}
                      </label>
                      <span className="w-9 text-right font-mono text-[10px] tabular-nums text-accent">
                        {weights[k]}%
                      </span>
                    </div>
                    <input
                      id={`weight-${k}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={weights[k]}
                      onChange={(e) => handleWeightChange(k, Number(e.target.value))}
                      className="mt-0.5 w-full cursor-pointer accent-[#001aff]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setWeights(DEFAULT_POSITIONS)}
                  disabled={!isCustom}
                  className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:border-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tS("weightsReset")}
                </button>
                <p className="font-mono text-[9px] text-muted-foreground">
                  {tS("normalizedNote")}
                </p>
              </div>
            )}
          </div>

          {dataError && <p className="mt-2 text-[10px] text-red-500">{dataError}</p>}
          {loading && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">{t("loading")}</p>
          )}
        </div>

        {choroplethOn && (
          <div className="absolute bottom-3 left-3 z-20 hidden rounded-xl border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur sm:block">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t(isCustom ? "legend.titleCustom" : "legend.title")}
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
          <ScorePanel zone={selection.zone} allLayersOff={active.size === 0} />
        </div>

        {/* Mobile drawer backdrop */}
        {drawerOpen && (
          <div
            className="absolute inset-0 z-30 bg-black/40 lg:hidden"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* Floating open button (mobile: top-left, layers panel drops below; lg: below layers panel) */}
        <button
          ref={toggleRef}
          type="button"
          onClick={handleOpenList}
          aria-label={tz("openList")}
          aria-controls={ZONE_LIST_PANEL_ID}
          className={`absolute left-3 top-3 z-40 hidden h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:top-14 ${
            drawerOpen ? "max-lg:hidden" : "max-lg:flex"
          } ${sidebarCollapsed ? "lg:flex" : "lg:hidden"}`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M3 12h18M3 18h12" />
          </svg>
        </button>
      </div>
    </div>
  );
}