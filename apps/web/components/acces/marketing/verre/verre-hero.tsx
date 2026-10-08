import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import { Eyebrow } from "../eyebrow";
import { LiveCount } from "../live-count";
import { GlassDrops } from "./glass-drops";

/** The words of a line, each in its own box: the glass draws them where the page lays them out. */
function words(text: string) {
  return text.split(" ").map((word, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the words of a fixed line, in order.
    <Fragment key={index}>
      {index > 0 ? " " : null}
      <span data-glass-word>{word}</span>
    </Fragment>
  ));
}

/**
 * Hero under study (`/apercu/verre`, docs/02-design.md, section 5): the
 * title, as wide as the screen, and in front of it two drops of liquid glass,
 * the two atoms, which bend and magnify it, snap together into one drop, then
 * slowly pull apart. Nothing to play with, no profile: the brand's colours,
 * its type and light. Without a GPU (or with reduced motion, still), the
 * title alone.
 */
export async function VerreHero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero verre-hero" data-field-cover>
      <div className="verre-inner">
        <div data-hero-content>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
        </div>
        <h1 id="hero-title" data-glass-title className="verre-title">
          <span className="verre-line">{words(t("titleLead"))}</span>{" "}
          <em className="verre-line">{words(t("titleAccent"))}</em>
        </h1>
        <div data-hero-content className="verre-call">
          <p className="verre-lead">{t("lead")}</p>
          <div className="verre-actions">
            <a href="#rejoindre" data-magnetic className="cta-primary">
              {t("cta")}
            </a>
            <a href="#concept" className="cta-ghost">
              {t("secondary")}
            </a>
          </div>
          <ul aria-label={t("schools")} className="hero-schools verre-schools">
            {SCHOOLS.map((school) => (
              <li key={school.slug}>{school.name}</li>
            ))}
          </ul>
          <div className="verre-count">
            <LiveCount initial={stats} />
          </div>
        </div>
      </div>
      <GlassDrops />
    </section>
  );
}
