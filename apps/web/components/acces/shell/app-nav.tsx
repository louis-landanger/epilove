"use client";

import { cn } from "@epilove/ui";
import { Atom, CircleUser, Compass, Heart, LifeBuoy, MessageCircle, Settings } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/decouvrir", key: "discover", icon: Compass },
  { href: "/likes", key: "likes", icon: Heart },
  { href: "/messages", key: "messages", icon: MessageCircle },
  { href: "/campus", key: "campus", icon: Atom },
  { href: "/profil", key: "profile", icon: CircleUser },
] as const;

export type NavCounts = Partial<Record<(typeof TABS)[number]["key"], number>>;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Bottom tab bar on mobile, side rail on desktop (docs/02-design.md, section 6).
 * Routes of session B (`/decouvrir`, `/likes`, `/messages`, `/campus`) are linked
 * before they exist in this branch, hence the `Route` casts.
 */
export function AppNav({ counts = {} }: { counts?: NavCounts }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <>
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-paper/10 border-t bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            const count = counts[key] ?? 0;
            return (
              <li key={href}>
                <Link
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] transition-colors",
                    active ? "text-paper" : "text-paper/55 hover:text-paper/80",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
                    {count > 0 ? (
                      <span className="-top-1 -right-2 absolute min-w-4 rounded-full bg-plasma px-1 text-center font-semibold text-[0.6rem] text-ink leading-4">
                        {count > 9 ? "9+" : count}
                        <span className="sr-only"> {t("unread", { count })}</span>
                      </span>
                    ) : null}
                  </span>
                  {t(key)}
                  {active ? (
                    <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-plasma" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav
        aria-label={t("label")}
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-paper/10 border-r bg-ink px-4 py-6 lg:flex"
      >
        <Link href="/" className="mb-10 px-3 font-display font-semibold text-2xl tracking-tight">
          epilove<span className="text-plasma">.</span>
        </Link>
        <ul className="flex flex-col gap-1">
          {TABS.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            const count = counts[key] ?? 0;
            return (
              <li key={href}>
                <Link
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-2xl px-3 transition-colors",
                    active ? "bg-paper/10 text-paper" : "text-paper/65 hover:bg-paper/5 hover:text-paper",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
                  <span className="flex-1">{t(key)}</span>
                  {count > 0 ? (
                    <span className="rounded-full bg-plasma px-2 font-semibold text-ink text-xs leading-5">
                      {count > 99 ? "99+" : count}
                      <span className="sr-only"> {t("unread", { count })}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="mt-auto flex flex-col gap-1 text-sm">
          <li>
            <Link
              href={"/reglages" as Route}
              className="flex h-10 items-center gap-3 rounded-xl px-3 text-paper/60 hover:bg-paper/5 hover:text-paper"
            >
              <Settings className="size-4" aria-hidden="true" />
              {t("settings")}
            </Link>
          </li>
          <li>
            <Link
              href={"/aide" as Route}
              className="flex h-10 items-center gap-3 rounded-xl px-3 text-paper/60 hover:bg-paper/5 hover:text-paper"
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              {t("help")}
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
