import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "./eyebrow";
import { LiveCount } from "./live-count";
import { PeriodicTable } from "./periodic/periodic-table";

/**
 * The hero (docs/02-design.md, section 5): the campus periodic table, with
 * the title in the gap at its top, set with two real element tiles ("At"
 * for atomes, "Cr" for crochus). Screen readers and search engines get the
 * plain sentence; the tiles are decoration. Underneath, the lead, the calls
 * to action, the schools and the waiting list count.
 */
export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");
  const tile = (key: "titleFirst" | "titleSecond") => (
    <span
      className="title-tile"
      data-tile={key === "titleFirst" ? "first" : "second"}
      data-number={t(`${key}.number`)}
    >
      {t(`${key}.symbol`)}
    </span>
  );

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura" />
      <div className="hero-inner">
        <PeriodicTable>
          <div data-hero-content className="hero-heading">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1 id="hero-title" className="hero-title">
              <span className="sr-only">{t("title")}</span>
              <span aria-hidden="true">
                {t("titleLead")}{" "}
                <span className="nowrap">
                  {tile("titleFirst")}
                  {t("titleFirst.rest")}
                </span>
                {t("titleJoin")}
                <span className="nowrap">
                  {tile("titleSecond")}
                  {t("titleSecond.rest")}
                  {t("titleEnd")}
                </span>
              </span>
            </h1>
          </div>
        </PeriodicTable>
        <div data-hero-content className="hero-bottom">
          <p className="hero-lead">{t("lead")}</p>
          <div className="hero-actions">
            <a href="#rejoindre" data-magnetic data-cursor={t("cta")} className="cta-primary">
              <span>{t("cta")}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 10h12m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#concept" className="cta-ghost">
              {t("secondary")}
            </a>
          </div>
          <div className="hero-meta">
            <ul aria-label={t("schools")} className="hero-schools flex flex-wrap text-paper/60 text-sm">
              {SCHOOLS.map((school) => (
                <li key={school.slug}>{school.name}</li>
              ))}
            </ul>
            <LiveCount initial={stats} />
          </div>
        </div>
      </div>
    </section>
  );
}
