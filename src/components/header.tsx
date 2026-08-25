import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  const t = useTranslations("Header");

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
          {t("title")}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {t("subtitle")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}