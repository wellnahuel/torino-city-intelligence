"use client";

import { memo, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import type { Zone } from "@/types/data";
import { formatCellValue, zoneName } from "@/lib/zone-list";

interface ZoneListRowProps {
  zone: Zone;
  /** 1-based rank in the FULL sorted list (unaffected by search filtering). */
  rank: number;
  /** Display index within the visible (filtered) rows — used for roving tabindex. */
  index: number;
  selected: boolean;
  tabIndex: number;
  /** Zone is currently in the comparison set (toggle active). */
  inCompare: boolean;
  /** Compare set is at the 3-zone cap — add disabled. */
  compareFull: boolean;
  onToggleCompare: (zone: Zone) => void;
  onSelectRow: (zone: Zone) => void;
  onFocusRow: (e: FocusEvent<HTMLTableRowElement>) => void;
  registerRow: (el: HTMLTableRowElement | null) => void;
}

/**
 * A single zone row: compare toggle, rank, truncated name, total score and the
 * five raw factor values. Rendered as a focusable table row (roving tabindex +
 * `aria-selected` — aria-selected is only valid on row/option roles, so the
 * row is NOT a <button>; Enter/Space activate it like one).
 *
 * The leading compare toggle must NEVER trigger select/fly/scroll: it stops
 * propagation on click AND on Enter/Space keydown (the row's own handlers),
 * while arrow keys bubble to the table for roving tabindex.
 */
export const ZoneListRow = memo(function ZoneListRow({
  zone,
  rank,
  index,
  selected,
  tabIndex,
  inCompare,
  compareFull,
  onToggleCompare,
  onSelectRow,
  onFocusRow,
  registerRow,
}: ZoneListRowProps) {
  const tC = useTranslations("Compare");
  const p = zone.properties;
  const name = zoneName(zone);
  const toggleLabel = inCompare ? tC("remove") : compareFull ? tC("maxReached") : tC("add");

  const handleClick = (e: MouseEvent<HTMLTableRowElement>) => {
    e.currentTarget.focus();
    onSelectRow(zone);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectRow(zone);
    }
  };

  const cell = "px-0 py-1 text-right font-mono text-[10px] tabular-nums";

  return (
    <tr
      data-index={index}
      data-code={p.ZONASTAT}
      role="row"
      aria-selected={selected}
      tabIndex={tabIndex}
      ref={registerRow}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={onFocusRow}
      className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        selected ? "bg-accent/10" : "hover:bg-accent/5"
      }`}
    >
      <td className="w-6 px-0.5 py-1">
        <button
          type="button"
          aria-pressed={inCompare}
          disabled={!inCompare && compareFull}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare(zone);
          }}
          onKeyDown={(e) => {
            // Block the row's Enter/Space select; arrow keys pass → table roving intact.
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            inCompare
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border text-transparent hover:border-accent/60"
          }`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </td>
      <td className="w-6 px-0.5 py-1 font-mono text-[10px] tabular-nums text-muted-foreground">
        {rank}
      </td>
      <td className="min-w-0 px-1 py-1">
        <span
          className="block max-w-full truncate text-[10px] font-medium leading-tight"
          title={name}
        >
          {name}
        </span>
      </td>
      <td className={`${cell} font-semibold`}>{formatCellValue("total", p.total)}</td>
      <td className={cell}>{formatCellValue("cafe", p.cafe_density)}</td>
      <td className={cell}>{formatCellValue("traffic", p.traffic_raw)}</td>
      <td className={cell}>{formatCellValue("transit", p.stops500m)}</td>
      <td className={cell}>{formatCellValue("population", p.pop2023)}</td>
      <td className={cell}>{formatCellValue("flow", p.flow_raw)}</td>
    </tr>
  );
});