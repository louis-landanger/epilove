import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { HeroStageAnchor } from "./hero-stage-anchor";
import { IonFieldCanvas } from "./ion-field/ion-field-canvas";
import { IonFieldPoster } from "./ion-field/ion-field-poster";
import { LiveCount } from "./live-count";

/**
 * Proportions of the hero's stage (marketing.css, `.hero-stage`): across the
 * viewport on wide screens, the two atoms on either side of the title; above
 * the copy on narrow ones, the two atoms on a diagonal.
 */
const STAGE_WIDE = 4.6;
const STAGE_TALL = 1.3;

/**
 * The hero's stage, pinned while the hero and the manifesto scroll by. The
 * live field draws its two atoms in `[data-field-pair]` (journey.ts); the
 * static poster of the pair, one per layout, stands in until it runs, or for
 * good with reduced motion and on modest devices.
 */
export function IonFieldBackdrop() {
  return (
    <div aria-hidden="true" className="-mb-[100svh] pointer-events-none sticky top-0 h-svh">
      <div
        data-field-pair
        className="hero-stage"
        style={{ "--stage-wide": STAGE_WIDE, "--stage-tall": STAGE_TALL } as CSSProperties}
      >
        <IonFieldPoster
          aspect={STAGE_WIDE}
          className="ion-field-poster hero-poster-wide absolute inset-0 size-full"
        />
        <IonFieldPoster
          aspect={STAGE_TALL}
          className="ion-field-poster hero-poster-tall absolute inset-0 size-full"
        />
      </div>
    </div>
  );
}

/**
 * The live field, behind the whole landing: it follows the visitor down the
 * page (journey.ts). Below every section's content (negative z-index in the
 * isolated `.marketing` root), so opaque cards hide it and glass shows it.
 */
export function IonFieldLayer() {
  return (
    <div aria-hidden="true" className="-z-10 pointer-events-none fixed inset-0">
      <IonFieldCanvas className="absolute inset-0 size-full" />
    </div>
  );
}

/**
 * The hero (docs/02-design.md, section 5): a title between two atoms drawn to
 * each other, a short lead, a single call to action; the schools and the
 * waiting list count in the bottom corners. One family for the title, the
 * plasma point of the logo as its only accent.
 */
export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="relative">
      <div data-hero-content className="hero-layout">
        <h1 id="hero-title" className="hero-title font-semibold text-paper">
          {t("title")}
          <span className="text-plasma">.</span>
        </h1>
        <div className="hero-below">
          <div className="hero-fade hero-call">
            <p className="max-w-[34rem] text-lg text-paper/80 leading-relaxed sm:text-xl">{t("lead")}</p>
            <a href="#rejoindre" data-magnetic data-cursor={t("cta")} className="cta-primary mt-8">
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
          </div>
          <div className="hero-fade mt-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <ul aria-label={t("schools")} className="hero-schools flex flex-wrap text-paper/60 text-sm">
              {SCHOOLS.map((school) => (
                <li key={school.slug}>{school.name}</li>
              ))}
            </ul>
            <LiveCount initial={stats} />
          </div>
        </div>
      </div>
      <HeroStageAnchor />
    </section>
  );
}
