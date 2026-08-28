"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Zone } from "@/types/data";
import { WEIGHTS } from "@/lib/scoring";
import { InfoTip } from "./info-tip";

interface VariableRow {
  key: "cafe" | "traffic" | "transit" | "population" | "flow";
  weight: number;
  raw: string;
  norm: number;
  inverse: boolean;
}

interface ScorePanelProps {
  zone: Zone | null;
  allLayersOff: boolean;
}

export function ScorePanel({ zone, allLayersOff }: ScorePanelProps) {
  const t = useTranslations("Scoring");

  const rows: VariableRow[] = useMemo(() => {
    if (!zone) return [];
    const p = zone.properties;
    const fmt = (n: number | null, digits = 0) =>
      n === null || n === undefined ? "–" : n.toFixed(digits);

    return [
      {
        key: "cafe",
        weight: WEIGHTS.cafe,
        raw: fmt(p.cafe_density, 2),
        norm: p.cafe_norm ?? 0,
        inverse: true,
      },
      {
        key: "traffic",
        weight: WEIGHTS.traffic,
        raw: fmt(p.traffic_raw, 2),
        norm: p.traffic_norm ?? 0,
        inverse: false,
      },
      {
        key: "transit",
        weight: WEIGHTS.transit,
        raw: fmt(p.stops500m, 0),
        norm: p.transit_norm ?? 0,
        inverse: false,
      },
      {
        key: "population",
        weight: WEIGHTS.population,
        raw: fmt(p.pop2023, 0),
        norm: p.pop_norm ?? 0,
        inverse: false,
      },
      {
        key: "flow",
        weight: WEIGHTS.flow,
        raw: fmt(p.flow_raw, 2),
        norm: p.flow_norm ?? 0,
        inverse: false,
      },
    ];
  }, [zone]);

  const total = zone?.properties.total ?? null;

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
            <span className="font-mono text-xs text-muted-foreground">
              {zone.properties.ZONASTAT}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("noZone")}</p>
        )}
      </div>

      {zone ? (
        <>
          <div className="flex items-baseline justify-between rounded-lg border border-border bg-background px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("total")}</span>
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
                const contribution = r.weight * (r.inverse ? 1 - r.norm : r.norm);
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