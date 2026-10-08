import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "./eyebrow";
import { LiveCount } from "./live-count";
import { MatchStage } from "./match/match-stage";

/**
 * The hero (docs/02-design.md, section 5): the title, the lead and the calls
 * to action beside the match, two fictional students of the campus whose
 * profile cards bond ("Liaison établie"), then the next two; on narrow
 * screens the match comes between the title and the lead. The schools and
 * the waiting list count underneath the calls to action.
 */
export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura" />
      <div className="hero-inner">
        <div className="hero-layout">
          <div data-hero-content className="hero-copy hero-heading">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1 id="hero-title" className="hero-title">
              {t("titleLead")} <em>{t("titleAccent")}</em>
            </h1>
          </div>
          <MatchStage />
          <div data-hero-content className="hero-copy hero-call">
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
      </div>
    </section>
  );
}
