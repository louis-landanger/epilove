import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";
import { PactCountdown } from "./pact-countdown";
import { PactStage } from "./pact-stage";

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

        <PactStage />
      </div>
    </section>
  );
}
