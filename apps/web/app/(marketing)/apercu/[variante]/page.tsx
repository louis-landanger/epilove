import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GensHero } from "@/components/acces/marketing/gens/gens-hero";
import { HoloHero } from "@/components/acces/marketing/holo/holo-hero";
import { GameHero } from "@/components/acces/marketing/jeu/game-hero";
import { type HeroComponent, Landing } from "@/components/acces/marketing/landing";

/**
 * Heroes under study (docs/02-design.md, section 5): the whole landing page
 * around another hero, one address per direction, so the team can try each
 * one before it replaces the home page's.
 */
const HEROES: Record<string, HeroComponent> = {
  jeu: GameHero,
  holo: HoloHero,
  gens: GensHero,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(HEROES).map((variante) => ({ variante }));
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function HeroPreviewPage({ params }: { params: Promise<{ variante: string }> }) {
  const { variante } = await params;
  const Hero = HEROES[variante];
  if (!Hero) {
    notFound();
  }
  return <Landing Hero={Hero} />;
}
