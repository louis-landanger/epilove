import type { WaitlistStats } from "@epilove/contracts";
import { SCHOOLS } from "@epilove/core";
import { getTranslations } from "next-intl/server";
import { IonFieldCanvas } from "./ion-field/ion-field-canvas";
import { IonFieldPoster } from "./ion-field/ion-field-poster";
import { LiveCount } from "./live-count";
import { SchoolGlyph } from "./school-glyph";

/**
 * Backdrop shared by the hero and the manifesto: it stays pinned while both
 * scroll by, and the field condenses into the logo mark on the way.
 */
export function IonFieldBackdrop() {
  return (
    <div aria-hidden="true" className="-mb-[100svh] pointer-events-none sticky top-0 h-svh overflow-hidden">
      <IonFieldPoster className="absolute inset-0 size-full" />
      <IonFieldCanvas className="absolute inset-0 size-full" />
      <div className="hero-vignette absolute inset-0" />
    </div>
  );
}

function Word({ children, delay, className }: { children: string; delay: number; className?: string }) {
  return (
    <span className={`headline-word ${className ?? ""}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  );
}

export async function Hero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");
  const common = await getTranslations("common");
  const start = t("titleStart").split(" ");
  const accent = t("titleAccent").split(" ");

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="relative flex min-h-svh flex-col justify-end px-4 pt-28 pb-10 sm:px-10 sm:pb-14"
    >
      <div data-hero-content className="relative max-w-[min(100%,88rem)]">
        <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-paper/75 text-xs uppercase tracking-[0.22em]">
          <span className="inline-flex items-center gap-2 text-volt">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-volt shadow-[0_0_12px_var(--color-volt)]"
            />
            {t("eyebrow")}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span>{common("campus")}</span>
        </p>

        <h1
          id="hero-title"
          className="headline font-display font-semibold text-paper leading-[0.86] tracking-[-0.035em]"
        >
          <span className="sr-only">
            {t("titleStart")} {t("titleAccent")}.
          </span>
          <span aria-hidden="true" data-headline className="block">
            <span className="block">
              {start.map((word, index) => (
                <span key={word}>
                  <Word delay={80 + index * 90} className="headline-kinetic">
                    {word}
                  </Word>
                  {index < start.length - 1 ? " " : null}
                </span>
              ))}
            </span>
            <span className="block">
              {accent.map((word, index) => (
                <span key={word}>
                  <Word
                    delay={260 + index * 110}
                    className="font-normal font-serif text-plasma italic tracking-[-0.01em]"
                  >
                    {word}
                  </Word>
                  {index < accent.length - 1 ? " " : null}
                </span>
              ))}
              <Word delay={520} className="text-plasma">
                .
              </Word>
            </span>
          </span>
        </h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
          <p className="hero-fade max-w-xl text-lg text-paper/85 leading-relaxed sm:text-xl">{t("lead")}</p>
          <div className="hero-fade flex flex-col gap-5 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
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
                {t("secondaryCta")}
              </a>
            </div>
            <LiveCount initial={stats} />
          </div>
        </div>

        <div className="hero-fade mt-10 flex flex-col gap-3 border-paper/10 border-t pt-5 sm:flex-row sm:items-center sm:gap-6">
          <p className="font-mono text-paper/70 text-xs uppercase tracking-[0.18em]">{t("eligibility")}</p>
          <ul aria-label={t("schools")} className="flex flex-wrap gap-2">
            {SCHOOLS.map((school) => (
              <li
                key={school.slug}
                className="flex items-center gap-2 rounded-full border border-paper/15 bg-ink/40 px-3 py-1.5 font-mono text-paper/90 text-xs backdrop-blur-sm"
              >
                <SchoolGlyph slug={school.slug} className="size-3.5" />
                {school.name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Shown only once the live field runs (see marketing.css). */}
      <p
        aria-hidden="true"
        data-hero-content
        className="field-hint mt-6 max-w-xs font-mono text-[0.7rem] text-paper/60 uppercase tracking-[0.16em]"
      >
        <span className="hint-fine">{t("pointerHint")}</span>
        <span className="hint-coarse">{t("touchHint")}</span>
      </p>

      <a
        href="#manifeste"
        data-hero-content
        className="scroll-cue absolute right-4 bottom-10 hidden items-center gap-3 font-mono text-paper/70 text-xs uppercase tracking-[0.2em] sm:right-10 sm:bottom-14 md:flex"
      >
        {t("scroll")}
        <span aria-hidden="true" className="scroll-cue-line" />
      </a>
    </section>
  );
}
