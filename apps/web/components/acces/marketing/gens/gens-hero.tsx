import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "../eyebrow";
import { LiveCount } from "../live-count";
import { GensStage } from "./gens-stage";

/**
 * Hero under study (`/apercu/gens`, docs/02-design.md, section 5): people,
 * full screen, in photographs that follow one another (never an
 * identifiable face), the title's last words changing with them, and a fine
 * bond of light between two people of each photograph. The photographs hide
 * the ion field, which rests until the page scrolls (`data-field-cover`).
 */
export async function GensHero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero gens-hero" data-field-cover>
      <GensStage
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        meta={
          <div className="gens-meta">
            <ul aria-label={t("schools")} className="hero-schools flex flex-wrap text-paper/75 text-sm">
              {SCHOOLS.map((school) => (
                <li key={school.slug}>{school.name}</li>
              ))}
            </ul>
            <LiveCount initial={stats} />
          </div>
        }
      />
    </section>
  );
}
