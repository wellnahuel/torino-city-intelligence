"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Zone } from "@/types/data";
import type { CompareMetricKey } from "@/types/data";
import type { CompareRow } from "@/lib/compare";
import { formatCellValue, zoneName, type SortKey } from "@/lib/zone-list";

interface ComparePanelProps {
  rows: CompareRow[];
  /** Compare list (2-3 zones) — index-aligned with row.values. */
  zones: Zone[];
  /** Overall winner index (overallWinner); -1 when none. */
  winnerIndex: number;
  onRemove: (zone: Zone) => void;
  /** → setCompareOpen(false): back to the single-zone ScorePanel. */
  onBack: () => void;
  onClear: () => void;
}

/** Rank 0 = absent → en dash; metric values go through the zone-list formatter. */
function formatValue(key: CompareMetricKey, v: number | string | null): string {
  if (v === null || v === undefined) return "–";
  if (key === "rank") return v === 0 ? "–" : String(v);
  return formatCellValue(key as Exclude<SortKey, "name">, typeof v === "number" ? v : null);
}

export function ComparePanel({ rows, zones, winnerIndex, onRemove, onBack, onClear }: ComparePanelProps) {
  const tC = useTranslations("Compare");
  const tS = useTranslations("Scoring");
  const headerRef = useRef<HTMLHeadingElement>(null);

  // COMPARE-9: focus moves to the panel header when the panel swaps in.
  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  // Defensive empty state — the overlay only swaps this panel in at ≥2 zones.
  if (zones.length < 2) {
    return <p className="text-xs text-muted-foreground">{tC("empty")}</p>;
  }

  const rowLabel = (key: CompareMetricKey) =>
    key === "total" ? tS("total") : key === "rank" ? tC("rankLabel") : tS(`variable.${key}.name`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          ref={headerRef}
          tabIndex={-1}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground focus-visible:outline-none"
        >
          {tC("title")}
        </h3>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {zones.length}/3
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {tC("clear")}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {tC("detailsTab")}
          </button>
        </div>
      </div>

      {winnerIndex >= 0 && zones[winnerIndex] && (
        <div aria-live="polite" className="rounded-lg bg-accent px-3 py-2 text-accent-foreground">
          <p className="text-[10px] uppercase tracking-widest opacity-80">{tC("winner")}</p>
          <p className="text-sm font-semibold">{zoneName(zones[winnerIndex])}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <caption className="sr-only">{tC("title")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="w-24 pb-1 pr-1 font-medium">
                {tS("variablesTitle")}
              </th>
              {zones.map((z, i) => (
                <th key={z.properties.ZONASTAT} scope="col" className="px-0.5 pb-1 align-bottom font-medium">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`truncate text-[10px] font-medium leading-tight ${
                        i === winnerIndex ? "text-accent" : ""
                      }`}
                      title={zoneName(z)}
                    >
                      {zoneName(z)}
                    </span>
                    <button
                      type="button"
                      aria-label={tC("removeZone", { name: zoneName(z) })}
                      onClick={() => onRemove(z)}
                      className="h-4 w-4 shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      ✕
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/60 last:border-0">
                <td className="py-1 pr-1 text-[10px] text-muted-foreground">{rowLabel(row.key)}</td>
                {row.values.map((v, i) => (
                  <td
                    key={i}
                    className={`py-1 px-0.5 text-right font-mono text-[10px] tabular-nums ${
                      i === row.winnerIndex ? "rounded bg-accent/10 font-semibold" : ""
                    }`}
                  >
                    {formatValue(row.key, v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}