"use client";

import { useTranslations } from "next-intl";

export function MapApp() {
  const t = useTranslations("Scoring");

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 lg:grid-cols-[1fr_320px]">
      <div className="flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Torino · 45.07, 7.69
          </p>
          <p className="mt-3 text-sm text-foreground">{t("intro")}</p>
        </div>
      </div>
      <aside className="border-t border-border p-4 lg:border-l lg:border-t-0">
        <p className="text-sm text-muted-foreground">{t("noZone")}</p>
      </aside>
    </div>
  );
}