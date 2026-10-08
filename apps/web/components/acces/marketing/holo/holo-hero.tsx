import type { WaitlistStats } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "../eyebrow";
import { LiveCount } from "../live-count";
import { HoloDeck } from "./holo-deck";

/**
 * Hero under study (`/apercu/holo`, docs/02-design.md, section 5): the title
 * in the middle and, at the bottom, a hand of holographic profile cards of
 * fictional students, one per school. A card can be thrown: to the right it
 * is liked, to the left passed; a like ends in a match. The schools and the
 * waiting list count under the calls to action.
 */
export async function HoloHero({ stats }: { stats: WaitlistStats | null }) {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero holo-hero">
      <div aria-hidden="true" data-hero-aura className="hero-aura holo-aura" />
      <HoloDeck
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
