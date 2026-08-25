import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFoundPage() {
  const t = useTranslations("NotFound");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-mono text-2xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Link
        href="/"
        className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
      >
        {t("backHome")}
      </Link>
    </div>
  );
}