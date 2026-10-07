import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { Eyebrow } from "./eyebrow";
import { LiveCount } from "./live-count";

/**
 * The hero (docs/02-design.md, section 5): the title is the visual. Its last
 * words run across the whole width, and once the ion field is live the
 * particles write them, then leave them for the logo mark as the page
 * scrolls (journey.ts). They stay real text: the field samples their glyphs
 * (`[data-field-title]`, one `[data-tone]` per word), and without the field
 * they are simply shown. A short lead, the call to action and a quieter
 * second way in; the schools and the waiting list count underneath.
 */
/**
 * Width of the giant words in ems, for the stylesheet to size them to the
 * column (marketing.css, `.hero-word`): average advances of the heavy
 * grotesque and of the serif italic (set 8 % larger), on one line or two.
 */
function wordEms(word: string, accent: string) {
  const main = word.length * 0.6;
  const tail = (accent.length + 1) * 0.5 * 1.08;
  return {
    "--word-ems": (main + 0.25 + tail).toFixed(2),
    "--word-ems-stacked": Math.max(main, tail).toFixed(2),
  };
}

export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura" />
      <div className="hero-inner">
        <div data-hero-content className="hero-fade">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
        </div>
        <h1 id="hero-title" data-hero-content className="hero-title">
          <span className="hero-title-lead">{t("titleLead")}</span>{" "}
          <span
            data-field-title
            className="hero-word"
            style={wordEms(t("titleWord"), t("titleAccent")) as CSSProperties}
          >
            <span data-tone="paper" className="hero-word-main">
              {t("titleWord")}
            </span>{" "}
            <span className="hero-word-accent">
              <span data-tone="plasma">{t("titleAccent")}</span>
              <span data-tone="plasma">.</span>
            </span>
          </span>
        </h1>
        <div data-hero-content className="hero-bottom">
          <div className="hero-fade hero-call">
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
          </div>
          <div className="hero-fade hero-meta">
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
