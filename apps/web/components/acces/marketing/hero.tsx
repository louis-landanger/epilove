import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { IonFieldCanvas } from "./ion-field/ion-field-canvas";
import { IonFieldPoster } from "./ion-field/ion-field-poster";
import { LiveCount } from "./live-count";

/**
 * The hero's stage, pinned while the hero and the manifesto scroll by. The
 * live field draws its two atoms in `[data-field-pair]` (journey.ts); the
 * static poster of the pair stands in until it runs, or for good with
 * reduced motion and on modest devices.
 */
export function IonFieldBackdrop() {
  return (
    <div aria-hidden="true" className="-mb-[100svh] pointer-events-none sticky top-0 h-svh">
      <div data-field-pair className="hero-stage">
        <IonFieldPoster className="ion-field-poster absolute inset-0 size-full" />
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
 * The hero (docs/02-design.md, section 5): two atoms drawn to each other above
 * a short, quiet block of copy. One family for the title, the plasma point of
 * the logo as its only accent, a single call to action.
 */
export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="relative flex min-h-svh flex-col justify-end px-4 pt-28 pb-10 sm:px-10 sm:pb-14"
    >
      <div data-hero-content className="max-w-[46rem]">
        <h1 id="hero-title" className="hero-title font-semibold text-paper">
          {t("title")}
          <span className="text-plasma">.</span>
        </h1>
        <p className="hero-fade mt-6 max-w-[34rem] text-lg text-paper/80 leading-relaxed sm:text-xl">
          {t("lead")}
        </p>
        <div className="hero-fade mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
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
          <LiveCount initial={stats} />
        </div>
        <ul
          aria-label={t("schools")}
          className="hero-schools hero-fade mt-10 flex flex-wrap text-paper/60 text-sm"
        >
          {SCHOOLS.map((school) => (
            <li key={school.slug}>{school.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
