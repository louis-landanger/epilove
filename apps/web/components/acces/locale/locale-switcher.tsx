"use client";

import { LOCALES, splitLocalePrefix } from "@atomes/core";
import { cn } from "@atomes/ui/cn";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { changeLocaleAction } from "./actions";

/** Each language is named in itself, whatever the current interface language. */
const NAMES = { fr: "Français", en: "English" } as const;

/**
 * FR / EN switch (PLT-04). A form, so it also works before JavaScript loads;
 * the buttons carry the language they lead to.
 */
export function LocaleSwitcher({
  variant = "app",
  className,
}: {
  variant?: "marketing" | "app";
  className?: string;
}) {
  const t = useTranslations("common.language");
  const current = useLocale();
  const pathname = splitLocalePrefix(usePathname() ?? "/").pathname;

  return (
    <form action={changeLocaleAction} className={className}>
      <input type="hidden" name="path" value={pathname} />
      <fieldset
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border p-0.5",
          variant === "marketing"
            ? "border-paper/15 bg-ink/55 backdrop-blur-md"
            : "border-paper/10 bg-paper/[0.04]",
        )}
      >
        <legend className="sr-only">{t("label")}</legend>
        {LOCALES.map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              lang={locale}
              aria-pressed={active}
              className={cn(
                "min-h-9 min-w-11 rounded-full px-3 font-mono text-xs uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2",
                active ? "bg-paper text-ink" : "text-paper/80 hover:bg-paper/10 hover:text-paper",
              )}
            >
              <span aria-hidden="true">{locale}</span>
              <span className="sr-only">{NAMES[locale]}</span>
            </button>
          );
        })}
      </fieldset>
    </form>
  );
}
