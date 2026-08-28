"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import type { Zone } from "@/types/data";
import { ZoneListRow } from "@/components/zone-list-row";
import {
  FACTOR_DIRECTION,
  filterZones,
  sortZones,
  type SortKey,
  type SortMode,
} from "@/lib/zone-list";

const MODES: SortMode[] = ["best", "asc", "desc"];

/** Sortable header columns (rank is implicit and not sortable). */
const COLUMNS: { key: SortKey; width: string; unitKey?: string }[] = [
  { key: "name", width: "min-w-0" },
  { key: "total", width: "w-8" },
  { key: "cafe", width: "w-8", unitKey: "units.perKm2" },
  { key: "traffic", width: "w-9", unitKey: "units.perKm2" },
  { key: "transit", width: "w-9", unitKey: "units.stops" },
  { key: "population", width: "w-8", unitKey: "units.population" },
  { key: "flow", width: "w-8", unitKey: "units.perKm2" },
];

interface ZoneListProps {
  /** Source-order zones (scores.features) — the map's feature-id mapping depends on this order. */
  zones: Zone[];
  selected: Zone | null;
  /** Map-app sets source:"list" (fly) and closes the mobile drawer. */
  onSelect: (zone: Zone) => void;
  /** Closes the drawer/sidebar (mobile X button and lg collapse toggle). */
  onClose: () => void;
}

export function ZoneList({ zones, selected, onSelect, onClose }: ZoneListProps) {
  const t = useTranslations("ZoneList");

  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [query, setQuery] = useState("");
  const [focusIndex, setFocusIndex] = useState(-1);

  const rowEls = useRef<(HTMLTableRowElement | null)[]>([]);

  /** Full list sorted under the current key/mode — rank source (unaffected by search). */
  const sorted = useMemo(() => sortZones(zones, sortKey, sortMode), [zones, sortKey, sortMode]);

  /** Visible rows after search filtering, each carrying its full-list rank. */
  const rows = useMemo(
    () =>
      filterZones(sorted, query).map((zone, index) => ({
        zone,
        index,
        rank: sorted.indexOf(zone) + 1,
      })),
    [sorted, query]
  );

  const selectedCode = selected?.properties.ZONASTAT ?? null;

  const selectedVisibleIndex = useMemo(
    () =>
      selectedCode === null
        ? -1
        : rows.findIndex((r) => r.zone.properties.ZONASTAT === selectedCode),
    [rows, selectedCode]
  );

  /** Roving-tabindex target: the focused row, else the selected row, else the first row. */
  const tabbableIndex =
    rows.length === 0
      ? -1
      : Math.min(
          Math.max(focusIndex >= 0 ? focusIndex : selectedVisibleIndex >= 0 ? selectedVisibleIndex : 0, 0),
          rows.length - 1
        );

  /** Effective raw direction of the active sort (best-first is direction-aware). */
  const direction: "asc" | "desc" = sortMode === "best" ? FACTOR_DIRECTION[sortKey] : sortMode;

  const registerRow = useCallback((el: HTMLTableRowElement | null) => {
    if (!el) return;
    const i = Number(el.dataset.index);
    if (Number.isFinite(i)) rowEls.current[i] = el;
  }, []);

  const handleRowFocus = useCallback((e: FocusEvent<HTMLTableRowElement>) => {
    const i = Number(e.currentTarget.dataset.index);
    if (Number.isFinite(i)) setFocusIndex(i);
  }, []);

  const handleTableKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (rows.length === 0) return;
      const current = Math.max(0, tabbableIndex);
      const next =
        e.key === "ArrowDown" ? Math.min(current + 1, rows.length - 1) : Math.max(current - 1, 0);
      rowEls.current[next]?.focus();
    },
    [rows.length, tabbableIndex]
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey !== key) {
        setSortKey(key);
        setSortMode("best"); // a new column always starts best-first
      } else {
        setSortMode((prev) => (prev === "best" ? "asc" : prev === "asc" ? "desc" : "best"));
      }
    },
    [sortKey]
  );

  /** Keep the selected row in view when selection, filter or sort moves it off-screen. */
  useEffect(() => {
    if (selectedCode === null) return;
    const el = rowEls.current.find((r) => r?.dataset.code === selectedCode);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedCode, rows]);

  const headerColumns = useMemo(
    () =>
      COLUMNS.map((col) => ({
        ...col,
        label: col.key === "name" ? t("name") : col.key === "total" ? t("score") : t(`columns.${col.key}`),
        unit: col.unitKey ? t(col.unitKey) : null,
      })),
    [t]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("title")}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {t("count", { count: zones.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeList")}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeList")}
            className="hidden h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:inline-flex"
          >
            ‹
          </button>
        </div>
      </header>

      <div className="space-y-2 px-3 pb-2">
        <input
          id="zone-list-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div
          role="group"
          aria-label={t("aria.sortMode")}
          className="flex rounded-md border border-border p-0.5"
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={sortMode === m}
              onClick={() => setSortMode(m)}
              className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                sortMode === m
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`sort.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <table className="w-full table-fixed" onKeyDown={handleTableKeyDown}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              <th
                scope="col"
                className="w-6 px-0.5 pb-1 align-bottom font-medium text-muted-foreground"
              >
                {t("rank")}
              </th>
              {headerColumns.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
                    className={`${col.width} px-0 pb-1 align-bottom font-medium ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      title={col.label}
                      className={`flex w-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        col.key === "name" ? "items-start text-left" : "items-end text-right"
                      }`}
                    >
                      <span
                        className={`flex max-w-full items-center gap-0.5 ${
                          col.key === "name" ? "" : "flex-row-reverse"
                        }`}
                      >
                        <span className="truncate text-[9px] font-medium leading-tight">{col.label}</span>
                        {active && (
                          <span aria-hidden="true" className="text-[8px] leading-none">
                            {direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </span>
                      {col.unit && (
                        <span className="max-w-full truncate text-[8px] font-normal leading-none text-muted-foreground">
                          {col.unit}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 ? null : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[10px] text-muted-foreground">
                  {t("noResults", { query })}
                </td>
              </tr>
            ) : (
              rows.map(({ zone, rank, index }) => (
                <ZoneListRow
                  key={zone.properties.ZONASTAT}
                  zone={zone}
                  rank={rank}
                  index={index}
                  selected={zone.properties.ZONASTAT === selectedCode}
                  tabIndex={index === tabbableIndex ? 0 : -1}
                  onSelectRow={onSelect}
                  onFocusRow={handleRowFocus}
                  registerRow={registerRow}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}