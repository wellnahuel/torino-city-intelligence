"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useState } from "react";

const LOCALE_LABELS: Record<string, string> = {
  en: "EN",
  es: "ES",
  it: "IT",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        className="inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 font-mono text-xs tracking-widest text-foreground transition-colors hover:border-accent hover:text-accent"
      >
        {LOCALE_LABELS[locale]}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 flex flex-col rounded-md border border-border bg-card p-1 shadow-lg">
          {routing.locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLocale(l)}
              className={`rounded px-3 py-1.5 text-left font-mono text-xs tracking-widest transition-colors hover:bg-accent hover:text-accent-foreground ${
                l === locale ? "bg-accent text-accent-foreground" : "text-foreground"
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}