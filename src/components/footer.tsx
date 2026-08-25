import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("Footer");

  return (
    <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground md:px-6">
      <div className="flex flex-col gap-1">
        <p>{t("osm")}</p>
        <p>{t("aperto")}</p>
        <p>{t("derived")}</p>
      </div>
    </footer>
  );
}