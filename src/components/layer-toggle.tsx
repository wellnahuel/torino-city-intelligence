"use client";

import { useTranslations } from "next-intl";
import { LAYER_KEYS, type LayerKey } from "@/types/data";

interface LayerToggleProps {
  counts: Record<LayerKey, number>;
  active: Set<LayerKey>;
  onToggle: (key: LayerKey) => void;
}

export function LayerToggle({ counts, active, onToggle }: LayerToggleProps) {
  const t = useTranslations("Map");

  return (
    <div className="flex flex-col gap-1">
      {LAYER_KEYS.map((key) => {
        const on = active.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(key)}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
              on
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-accent/60 hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  on ? "bg-accent" : "bg-muted-foreground/40"
                }`}
              />
              {t(`layer.${key}`)}
            </span>
            <span className="font-mono text-[10px] tabular-nums opacity-70">
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}