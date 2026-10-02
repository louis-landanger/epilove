import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";

/**
 * "Cinq écoles. Une ville. Zéro hasard." Revealed word by word on scroll by
 * the choreography (`data-reveal-words`); fully readable without it.
 * The ion field condenses into the logo mark behind it.
 */
export async function Manifesto() {
  const t = await getTranslations("marketing.manifesto");
  return (
    <section id="manifeste" aria-labelledby="manifesto-title" className="relative min-h-[170svh]">
      <div className="sticky top-0 flex min-h-svh items-end px-4 pt-28 pb-16 sm:px-10 lg:items-center lg:pb-0">
        <div className="max-w-[min(100%,58rem)] lg:max-w-[55%]">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="manifesto-title"
            data-reveal-words
            className="mt-6 font-display font-semibold text-[clamp(2.6rem,7.2vw,7rem)] text-paper leading-[0.92] tracking-[-0.03em]"
          >
            {t.rich("title", accent)}
          </h2>
          <p
            data-reveal-words
            className="mt-8 max-w-3xl text-[clamp(1.15rem,1.9vw,1.75rem)] text-paper/85 leading-snug"
          >
            {t.rich("body", accent)}
          </p>
          <p className="mt-8 font-mono text-volt text-xs uppercase tracking-[0.22em]">{t("signature")}</p>
        </div>
      </div>
    </section>
  );
}
