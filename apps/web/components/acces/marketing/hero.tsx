import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";
import { LiveCount } from "./live-count";
import { MoleculePoster } from "./molecule/molecule-poster";
import { MoleculeStage } from "./molecule/molecule-stage";

/**
 * The hero (docs/02-design.md, section 5): the copy on the left and, on the
 * right, the molecule, two atoms with their orbits interlocked, "atomes
 * crochus" made of light. A short lead, the call to action and a quieter
 * second way in; the schools and the waiting list count underneath. On
 * narrow screens the molecule stands above the copy.
 */
export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura" />
      <div className="hero-grid">
        <div data-hero-content className="hero-copy">
          <div className="hero-fade">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
          </div>
          <h1 id="hero-title" className="hero-title font-semibold text-paper">
            {t.rich("title", accent)}
            <span className="text-plasma">.</span>
          </h1>
          <p className="hero-fade hero-lead">{t("lead")}</p>
          <div className="hero-fade hero-actions">
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
          <div className="hero-fade hero-meta">
            <ul aria-label={t("schools")} className="hero-schools flex flex-wrap text-paper/60 text-sm">
              {SCHOOLS.map((school) => (
                <li key={school.slug}>{school.name}</li>
              ))}
            </ul>
            <LiveCount initial={stats} />
          </div>
        </div>
        <div data-hero-stage className="hero-stage">
          <MoleculeStage className="hero-molecule">
            <MoleculePoster className="molecule-poster" />
          </MoleculeStage>
        </div>
      </div>
    </section>
  );
}
