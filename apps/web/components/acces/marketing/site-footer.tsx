import type { Locale } from "@epilove/core";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { publicHref } from "@/i18n/paths";
import { LogoMark } from "./logo";

const MARQUEE = ["one", "two", "three", "four"] as const;

/** Marquee, giant logotype, legal links and the non-affiliation notice. */
export async function SiteFooter({ onLanding = true }: { onLanding?: boolean }) {
  const t = await getTranslations("marketing.footer");
  const nav = await getTranslations("marketing.nav");
  const common = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const prefix = onLanding ? "" : publicHref(locale, "/");
  const items = MARQUEE.map((key) => t(`marquee.${key}`));

  return (
    <footer className="site-footer relative overflow-hidden border-paper/10 border-t">
      <div className="marquee border-paper/10 border-b py-5" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="marquee-group">
              {items.map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-8 font-display font-semibold text-[clamp(1.75rem,4vw,3.5rem)] text-paper tracking-tight"
                >
                  {item}
                  <LogoMark className="size-[0.9em] text-paper" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-16 pb-10 sm:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-3">
          <nav aria-label={t("explore")}>
            <p className="font-mono text-paper/70 text-xs uppercase tracking-[0.18em]">{t("explore")}</p>
            <ul className="mt-4 space-y-2">
              {(
                [
                  ["concept", nav("how")],
                  ["course", nav("race")],
                  ["pacte", nav("pact")],
                  ["securite", nav("safety")],
                  ["faq", nav("faq")],
                  ["rejoindre", nav("join")],
                ] as const
              ).map(([anchor, label]) => (
                <li key={anchor}>
                  <a href={`${prefix}#${anchor}`} className="footer-link">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t("legal")}>
            <p className="font-mono text-paper/70 text-xs uppercase tracking-[0.18em]">{t("legal")}</p>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href={publicHref(locale, "/legal/mentions-legales")} className="footer-link">
                  {t("legalNotice")}
                </Link>
              </li>
              <li>
                <Link href={publicHref(locale, "/legal/cgu")} className="footer-link">
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link href={publicHref(locale, "/legal/confidentialite")} className="footer-link">
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link href={publicHref(locale, "/legal/transparence")} className="footer-link">
                  {t("transparency")}
                </Link>
              </li>
            </ul>
          </nav>
          <div className="space-y-3 text-paper/75 text-sm leading-relaxed">
            <p>{common("notAffiliated")}</p>
            <p>{t("codename")}</p>
            <p className="font-mono text-paper/70 text-xs uppercase tracking-[0.16em]">{t("made")}</p>
            <a href="#top" className="footer-link inline-block">
              {t("backToTop")} ↑
            </a>
          </div>
        </div>
      </div>

      <p aria-hidden="true" className="footer-giant select-none" data-footer-giant>
        epilove
      </p>
    </footer>
  );
}
