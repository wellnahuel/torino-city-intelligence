"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { FactorKey, Zone } from "@/types/data";
import {
  DEFAULT_POSITIONS,
  computeContribution,
  computeZoneScore,
  normalizeWeights,
  weightsEqual,
  type ScoringWeights,
} from "@/lib/scoring";
import { InfoTip } from "./info-tip";

interface VariableRow {
  key: FactorKey;
  weight: number;
  raw: string;
  inverse: boolean;
}

interface ScorePanelProps {
  zone: Zone | null;
  allLayersOff: boolean;
  weights: ScoringWeights;
  /** Selected zone is currently in the comparison set (pin active). */
  inCompare: boolean;
  /** Compare set is at the 3-zone cap — add disabled. */
  compareFull: boolean;
  onToggleCompare: () => void;
}

export function ScorePanel({
  zone,
  allLayersOff,
  weights,
  inCompare,
  compareFull,
  onToggleCompare,
}: ScorePanelProps) {
  const t = useTranslations("Scoring");
  const tC = useTranslations("Compare");

  /** Current slider positions normalized to Σ=1 — the breakdown tracks live weights. */
  const normW = useMemo(() => normalizeWeights(weights), [weights]);
  const isCustom = !weightsEqual(weights, DEFAULT_POSITIONS);

  const rows: VariableRow[] = useMemo(() => {
    if (!zone) return [];
    const p = zone.properties;
    const fmt = (n: number | null, digits = 0) =>
      n === null || n === undefined ? "–" : n.toFixed(digits);

    return [
      {
        key: "cafe",
        weight: normW.cafe,
        raw: fmt(p.cafe_density, 2),
        inverse: true,
      },
      {
        key: "traffic",
        weight: normW.traffic,
        raw: fmt(p.traffic_raw, 2),
        inverse: false,
      },
      {
        key: "transit",
        weight: normW.transit,
        raw: fmt(p.stops500m, 0),
        inverse: false,
      },
      {
        key: "population",
        weight: normW.population,
        raw: fmt(p.pop2023, 0),
        inverse: false,
      },
      {
        key: "flow",
        weight: normW.flow,
        raw: fmt(p.flow_raw, 2),
        inverse: false,
      },
    ];
  }, [zone, normW]);

  /**
   * Total recomputed from zone norms + CURRENT weights at render — NOT from
   * properties.total (a held selection captured under earlier weights is stale).
   */
  const total = useMemo(
    () => (zone ? computeZoneScore(zone.properties, normW) : null),
    [zone, normW]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("title")}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {t("intro")}
        </p>
        {zone ? (
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">
              {zone.properties.name || zone.properties.ZONASTAT}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">
                {zone.properties.ZONASTAT}
              </span>
              <button
                type="button"
                aria-pressed={inCompare}
                title={inCompare ? tC("remove") : compareFull ? tC("maxReached") : tC("add")}
                aria-label={inCompare ? tC("remove") : tC("add")}
                disabled={!inCompare && compareFull}
                onClick={onToggleCompare}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  inCompare
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/60 hover:text-foreground"
                }`}
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
                  <path d="M12 17v5" />
                  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("noZone")}</p>
        )}
      </div>

      {zone ? (
        <>
          <div className="flex items-baseline justify-between rounded-lg border border-border bg-background px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {t(isCustom ? "customTotal" : "total")}
            </span>
            <span className="font-mono text-2xl font-semibold text-accent">
              {total === null ? "–" : Math.round(total * 10) / 10}
            </span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-1 pr-2 font-medium">{t("variablesTitle")}</th>
                <th className="pb-1 pr-2 text-right font-medium">{t("weight")}</th>
                <th className="pb-1 pr-2 text-right font-medium">{t("raw")}</th>
                <th className="pb-1 text-right font-medium">{t("contribution")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const contribution = computeContribution(zone.properties, r.key, normW);
                return (
                  <tr key={r.key} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-foreground">
                          {t(`variable.${r.key}.name`)}
                        </p>
                        <InfoTip label={t("infoLabel")}>
                          <p className="font-medium text-foreground">
                            {t(`variable.${r.key}.name`)}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {t(`variable.${r.key}.tooltip`)}
                          </p>
                          <p className="mt-2 border-t border-border/60 pt-1.5 text-muted-foreground">
                            {t("weightLabel")} {Math.round(r.weight * 100)}%
                          </p>
                        </InfoTip>
                        {r.inverse && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("inverseMark")}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        {t(`variable.${r.key}.desc`)}
                      </p>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">
                      {Math.round(r.weight * 100)}%
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                      {r.raw}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-accent">
                      {(contribution * 100).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("totalNote")}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {allLayersOff ? t("mapEmpty") : ""}
        </p>
      )}
    </div>
  );
}