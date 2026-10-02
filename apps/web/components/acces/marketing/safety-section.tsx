import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "./eyebrow";

const ITEMS = [
  {
    key: "verified",
    icon: "M12 3 4.5 6v5.5c0 4.4 3.1 8.4 7.5 9.5 4.4-1.1 7.5-5.1 7.5-9.5V6L12 3Zm-3.2 9.3 2.3 2.3 4.3-4.6",
  },
  {
    key: "discreet",
    icon: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.6 9.6 0 0 1 12 4.9c4.6 0 8.3 3.3 9.5 7.1a10.7 10.7 0 0 1-2.6 4.1M6.1 6.2A10.6 10.6 0 0 0 2.5 12c1.2 3.8 4.9 7.1 9.5 7.1 1.6 0 3.1-.4 4.4-1.1",
  },
  {
    key: "moderation",
    icon: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.25 3.25 0 0 1 0 6.2",
  },
  {
    key: "data",
    icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.3 2.4 3.5 5.6 3.5 9s-1.2 6.6-3.5 9c-2.3-2.4-3.5-5.6-3.5-9S9.7 5.4 12 3Z",
  },
] as const;

/** Safety and discretion commitments: a deliberately calm, light section (docs/02, section 5). */
export async function SafetySection() {
  const t = await getTranslations("marketing.safety");
  return (
    <section
      id="securite"
      aria-labelledby="safety-title"
      className="safety-section relative bg-paper px-4 py-24 text-ink sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <Eyebrow tone="light">{t("eyebrow")}</Eyebrow>
            <h2
              id="safety-title"
              className="mt-6 font-display font-semibold text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.95] tracking-[-0.03em]"
            >
              {t("title")}
            </h2>
            <p className="mt-6 max-w-md text-ink/80 text-lg leading-relaxed">{t("lead")}</p>
            <Link
              href="/legal/confidentialite"
              className="mt-8 inline-flex items-center gap-2 font-mono text-ink text-xs uppercase tracking-[0.16em] underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              {t("link")}
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-[2rem] border border-ink/10 bg-ink/10 sm:grid-cols-2">
            {ITEMS.map((item) => (
              <li key={item.key} className="bg-paper p-6 sm:p-8">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-7 text-ink"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                <h3 className="mt-6 font-display font-semibold text-2xl">{t(`items.${item.key}.title`)}</h3>
                <p className="mt-3 text-ink/80 leading-relaxed">{t(`items.${item.key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
