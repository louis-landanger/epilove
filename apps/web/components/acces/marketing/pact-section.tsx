import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";
import { LogoMark } from "./logo";
import { PactCountdown } from "./pact-countdown";

/** Teaser of the Pact (PAC-01 to PAC-03) with the countdown to the reveal. */
export async function PactSection() {
  const t = await getTranslations("marketing.pact");
  return (
    <section
      id="pacte"
      aria-labelledby="pact-title"
      className="relative overflow-hidden px-4 py-24 sm:px-10 sm:py-36"
    >
      <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="pact-title"
            data-reveal
            className="mt-6 font-display font-semibold text-[clamp(2.4rem,5.6vw,5.25rem)] text-paper leading-[0.95] tracking-[-0.03em]"
          >
            {t.rich("title", accent)}
          </h2>
          <p data-reveal className="mt-6 max-w-xl text-lg text-paper/85 leading-relaxed">
            {t("body")}
          </p>
          <div className="mt-12">
            <PactCountdown />
          </div>
        </div>

        <div
          aria-hidden="true"
          data-field-pact
          className="pact-stage relative mx-auto aspect-square w-full max-w-[30rem]"
        >
          <div className="pact-ring pact-ring-1" />
          <div className="pact-ring pact-ring-2" />
          <div className="pact-ring pact-ring-3" />
          <div className="pact-vial">
            <div className="pact-vial-liquid" />
            <div className="pact-vial-shine" />
          </div>
          <div className="pact-seal">
            <LogoMark className="size-12 text-ink" />
          </div>
          <p className="-translate-x-1/2 absolute bottom-[6%] left-1/2 whitespace-nowrap font-mono text-[0.65rem] text-paper/70 uppercase tracking-[0.2em]">
            {t("sample")} · 11.02.2027 · 20:00
          </p>
        </div>
      </div>
    </section>
  );
}
