"use client";

import { useTranslations } from "next-intl";

export function MapLoading() {
  const t = useTranslations("Map");
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      {t("loading")}
    </div>
  );
}