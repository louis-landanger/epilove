import type { Locale } from "@atomes/core";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { publicHref } from "@/i18n/paths";
import { LocaleSwitcher } from "../locale/locale-switcher";
import { Logotype } from "./logo";
import { SoundToggle } from "./sound/sound-toggle";

/** Fixed top bar. On the landing the links are anchors; elsewhere they lead back to the landing. */
export async function SiteHeader({ onLanding = true }: { onLanding?: boolean }) {
  const t = await getTranslations("marketing.nav");
  const home = publicHref((await getLocale()) as Locale, "/");
  const prefix = onLanding ? "" : home;
  const links = [
    { href: `${prefix}#concept`, label: t("how") },
    { href: `${prefix}#course`, label: t("race") },
    { href: `${prefix}#pacte`, label: t("pact") },
    { href: `${prefix}#securite`, label: t("safety") },
    { href: `${prefix}#faq`, label: t("faq") },
  ];
  return (
    <header className="site-header fixed inset-x-0 top-0 z-40">
      <a href="#contenu" className="skip-link">
        {t("skip")}
      </a>
      <div className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-10 sm:py-4">
        <Link
          href={home}
          aria-label={t("home")}
          className="shrink-0 rounded-full border border-paper/10 bg-ink/55 py-1.5 pr-2 pl-2 backdrop-blur-md min-[420px]:pr-4"
        >
          <Logotype compact />
        </Link>
        <nav aria-label={t("label")} className="hidden lg:block">
          <ul className="flex items-center gap-1 rounded-full border border-paper/10 bg-ink/50 p-1 backdrop-blur-md">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-full px-4 py-2 font-mono text-paper/80 text-xs uppercase tracking-[0.16em] transition-colors hover:bg-paper/10 hover:text-paper"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          {onLanding ? <SoundToggle className="max-[359px]:hidden" /> : null}
          <LocaleSwitcher variant="marketing" />
          <a href={`${prefix}#rejoindre`} data-magnetic className="cta-small">
            {t("join")}
          </a>
        </div>
      </div>
    </header>
  );
}
