import type { WaitlistStats } from "@atomes/contracts";
import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";
import { SchoolRace } from "./school-race/school-race";
import { WaitlistForm } from "./waitlist/waitlist-form";

export async function RaceSection({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("marketing.race");
  return (
    <section id="course" aria-labelledby="race-title" className="relative px-4 py-24 sm:px-10 sm:py-36">
      <div className="race-glow" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2
          id="race-title"
          data-reveal
          className="mt-6 max-w-5xl font-display font-semibold text-[clamp(2.4rem,6vw,5.5rem)] text-paper leading-[0.95] tracking-[-0.03em]"
        >
          {t.rich("title", accent)}
        </h2>
        <p data-reveal className="mt-6 max-w-2xl text-lg text-paper/80 leading-relaxed">
          {t("lead")}
        </p>
        <SchoolRace initial={stats} />
      </div>
    </section>
  );
}

export async function JoinSection() {
  const t = await getTranslations("waitlist");
  const race = await getTranslations("marketing.race");
  return (
    <section
      id="rejoindre"
      aria-labelledby="join-title"
      className="relative scroll-mt-20 px-4 pb-24 sm:px-10 sm:pb-36"
    >
      <div className="join-panel relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-paper/10 p-6 sm:p-12 lg:p-16">
        <div className="relative grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2
              id="join-title"
              className="mt-6 font-display font-semibold text-[clamp(2.4rem,5.5vw,5rem)] text-paper leading-[0.95] tracking-[-0.03em]"
            >
              {t.rich("title", accent)}
            </h2>
            <p className="mt-6 max-w-lg text-lg text-paper/85 leading-relaxed">{t("lead")}</p>
            <p className="mt-4 max-w-lg text-paper/70 text-sm leading-relaxed">{race("referral")}</p>
          </div>
          <div className="lg:pt-16">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}
