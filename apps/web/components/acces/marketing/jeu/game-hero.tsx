import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "../eyebrow";
import { LiveCount } from "../live-count";
import { AtomGame } from "./atom-game";

/**
 * Hero under study (`/apercu/jeu`, docs/02-design.md, section 5): a
 * chemistry test in three questions. The visitor finds their element, then
 * bonds with a fictional student of the campus; the logo's atom orbits
 * whatever the game shows. The schools and the waiting list count under the
 * calls to action.
 */
export async function GameHero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero game-hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura game-aura" />
      <AtomGame
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        meta={
          <div className="game-meta">
            <ul
              aria-label={t("schools")}
              className="hero-schools flex flex-wrap justify-center text-paper/60 text-sm"
            >
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
