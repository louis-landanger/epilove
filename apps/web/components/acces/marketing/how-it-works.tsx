import { schoolColors } from "@atomes/tokens";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "./eyebrow";
import { LogoMark } from "./logo";

const STEPS = ["verify", "profile", "chemistry"] as const;

async function VerifyCard() {
  const t = await getTranslations("marketing.how.steps.verify.card");
  return (
    <div className="step-card-3d glass-card w-full max-w-sm p-6">
      <div className="flex items-center justify-between font-mono text-[0.7rem] text-paper/70 uppercase tracking-[0.18em]">
        <span>{t("label")}</span>
        <span className="text-volt">●</span>
      </div>
      <p className="mt-8 truncate font-mono text-lg text-paper">{t("email")}</p>
      <div className="mt-6 flex items-center gap-2" aria-hidden="true">
        {["4", "8", "1", "5", "1", "6"].map((digit, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative digits.
            key={index}
            className="code-digit grid h-12 flex-1 place-items-center rounded-xl border border-paper/15 bg-paper/5 font-mono text-paper text-xl"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            {digit}
          </span>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between font-mono text-xs">
        <span className="text-paper/70">{t("code")}</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-volt px-3 py-1 font-semibold text-ink">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("status")}
        </span>
      </div>
    </div>
  );
}

async function ProfileCard() {
  const t = await getTranslations("marketing.how.steps.profile.card");
  return (
    <div className="step-card-3d glass-card w-full max-w-sm overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden">
        <div className="profile-foil absolute inset-0" />
        <span className="absolute top-4 left-4 font-mono text-[0.7rem] text-paper/80 uppercase tracking-[0.18em]">
          {t("label")}
        </span>
        <span className="absolute right-5 bottom-3 font-display font-semibold text-[5.5rem] text-paper/95 leading-none tracking-tight">
          {t("symbol")}
        </span>
      </div>
      <div className="p-6">
        <p className="font-display font-semibold text-2xl text-paper">{t("name")}</p>
        <p className="mt-1 font-mono text-paper/70 text-xs">{t("detail")}</p>
        <div className="mt-5 rounded-2xl border border-paper/10 bg-paper/5 p-4">
          <p className="font-mono text-[0.7rem] text-paper/70 uppercase tracking-[0.16em]">{t("prompt")}</p>
          <p className="mt-2 font-serif text-paper text-xl italic leading-snug">{t("answer")}</p>
        </div>
      </div>
    </div>
  );
}

async function BondCard() {
  const t = await getTranslations("marketing.how.steps.chemistry.card");
  return (
    <div className="step-card-3d glass-card relative w-full max-w-sm overflow-hidden p-6">
      <div className="flex items-center justify-between font-mono text-[0.7rem] text-paper/70 uppercase tracking-[0.18em]">
        <span>{t("label")}</span>
        <span>T+21:00</span>
      </div>
      <div className="relative mx-auto my-6 h-44" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 300 160" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id="bond-gradient" x1="0" x2="1">
              <stop offset="0" stopColor={schoolColors.supbiotech} />
              <stop offset="1" stopColor={schoolColors.epita} />
            </linearGradient>
          </defs>
          <path d="M70 80 C 120 30, 180 130, 230 80" className="bond-arc" stroke="url(#bond-gradient)" />
          <circle cx="70" cy="80" r="26" fill={schoolColors.supbiotech} className="bond-atom" />
          <circle cx="230" cy="80" r="26" fill={schoolColors.epita} className="bond-atom bond-atom-late" />
        </svg>
        <LogoMark className="bond-flash absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 text-paper" />
      </div>
      <p className="text-center font-display font-semibold text-3xl text-paper">{t("status")}</p>
      <div className="mt-5 flex items-center justify-between font-mono text-xs">
        <span className="text-paper/70">{t("score")}</span>
        <span className="text-volt">0,87</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper/10" aria-hidden="true">
        <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-plasma to-volt" />
      </div>
    </div>
  );
}

const ILLUSTRATIONS = { verify: VerifyCard, profile: ProfileCard, chemistry: BondCard } as const;

/**
 * Three steps as cards that pin and stack while scrolling (CSS sticky: works
 * without JavaScript and on every screen); the choreography adds depth.
 */
export async function HowItWorks() {
  const t = await getTranslations("marketing.how");
  return (
    <section id="concept" aria-labelledby="how-title" className="relative px-4 pt-24 pb-24 sm:px-10 sm:pt-36">
      <div className="mx-auto max-w-7xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2
          id="how-title"
          data-reveal
          className="mt-6 max-w-4xl font-display font-semibold text-[clamp(2.4rem,6vw,5.5rem)] text-paper leading-[0.95] tracking-[-0.03em]"
        >
          {t("title")}
        </h2>

        <ol className="mt-14 flex flex-col gap-6 sm:mt-20" data-steps>
          {STEPS.map((step, index) => {
            const Illustration = ILLUSTRATIONS[step];
            return (
              <li
                key={step}
                data-step
                className="step-panel sticky"
                style={{ top: `calc(5.5rem + ${index * 1.25}rem)` }}
              >
                <article className="grid gap-8 rounded-[2rem] border border-paper/10 bg-[oklch(0.19_0.025_285)] p-6 shadow-[0_-30px_80px_-40px_oklch(0_0_0/0.9)] sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:p-14">
                  <div>
                    <p className="font-mono text-plasma text-sm tracking-[0.2em]">
                      <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <span className="sr-only">
                        {t("progress", { current: index + 1, total: STEPS.length })}
                      </span>
                      <span aria-hidden="true" className="text-paper/65">
                        {" "}
                        / {String(STEPS.length).padStart(2, "0")}
                      </span>
                    </p>
                    <h3 className="mt-4 font-display font-semibold text-[clamp(2rem,4.2vw,3.75rem)] text-paper leading-[0.98] tracking-[-0.02em]">
                      {t(`steps.${step}.title`)}
                    </h3>
                    <p className="mt-5 max-w-xl text-lg text-paper/80 leading-relaxed">
                      {t(`steps.${step}.body`)}
                    </p>
                  </div>
                  <figure className="step-stage flex flex-col items-center gap-3">
                    <Illustration />
                    <figcaption className="font-mono text-[0.65rem] text-paper/60 uppercase tracking-[0.18em]">
                      {t("illustration")}
                    </figcaption>
                  </figure>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
