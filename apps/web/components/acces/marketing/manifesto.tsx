import { getTranslations } from "next-intl/server";
import { accent, Eyebrow } from "./eyebrow";

/**
 * The logo mark drawn in dots, where the field condenses it (ion-field/journey.ts: above the text
 * on a portrait screen, beside it on a wide one), for those who see no particles (no GPU, reduced
 * motion): the same mark as the ion in orbit of logo.tsx, in the rivers' drawing's dots.
 */
function MarkDrawing() {
  return (
    <svg className="mark-drawing" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <ellipse className="mark-drawing-orbit" cx="32" cy="32" rx="22" ry="9" transform="rotate(-30 32 32)" />
      {/* The nucleus and the electron: a ring of dots each, a dot in the middle. */}
      <circle className="mark-drawing-nucleus" cx="32" cy="32" r="6.5" />
      <circle className="mark-drawing-nucleus" cx="32" cy="32" r="3.4" />
      <circle className="mark-drawing-nucleus mark-drawing-core" cx="32" cy="32" r="0.9" />
      <circle className="mark-drawing-electron" cx="51.05" cy="21" r="4" />
      <circle className="mark-drawing-electron mark-drawing-core" cx="51.05" cy="21" r="0.9" />
    </svg>
  );
}

/**
 * "Cinq écoles. Une ville. Zéro hasard." Revealed word by word on scroll by
 * the choreography (`data-reveal-words`); fully readable without it.
 * The ion field condenses into the logo mark behind it.
 */
export async function Manifesto() {
  const t = await getTranslations("marketing.manifesto");
  return (
    <section id="manifeste" aria-labelledby="manifesto-title" className="relative min-h-[170svh]">
      <div
        data-field-manifesto
        className="sticky top-0 flex min-h-svh items-end px-4 pt-28 pb-16 sm:px-10 lg:items-center lg:pb-0"
      >
        <MarkDrawing />
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
