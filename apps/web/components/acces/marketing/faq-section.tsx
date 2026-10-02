import { getTranslations } from "next-intl/server";
import { Eyebrow } from "./eyebrow";

const QUESTIONS = [
  "who",
  "free",
  "friends",
  "pact",
  "discretion",
  "waitlist",
  "when",
  "team",
  "help",
] as const;

/**
 * Native disclosure widgets: keyboard (Enter, Space), screen readers and
 * no-JavaScript support come for free; `name` makes them an exclusive accordion.
 */
export async function FaqSection() {
  const t = await getTranslations("marketing.faq");
  return (
    <section id="faq" aria-labelledby="faq-title" className="relative px-4 py-24 sm:px-10 sm:py-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="faq-title"
            data-reveal
            className="mt-6 font-display font-semibold text-[clamp(2.4rem,5vw,4.5rem)] text-paper leading-[0.95] tracking-[-0.03em] lg:sticky lg:top-28"
          >
            {t("title")}
          </h2>
        </div>
        <div className="border-paper/10 border-t">
          {QUESTIONS.map((key) => (
            <details key={key} name="faq" className="faq-item group border-paper/10 border-b">
              <summary className="faq-summary flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-display font-medium text-paper text-xl sm:text-2xl">
                {t(`items.${key}.question`)}
                <span aria-hidden="true" className="faq-icon relative size-6 shrink-0" />
              </summary>
              <div className="faq-answer">
                <p className="max-w-2xl pb-7 text-lg text-paper/80 leading-relaxed">
                  {t(`items.${key}.answer`)}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
