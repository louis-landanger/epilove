import type { Locale } from "@atomes/core";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import { FaqSection } from "@/components/acces/marketing/faq-section";
import { Hero, IonFieldBackdrop, IonFieldLayer } from "@/components/acces/marketing/hero";
import { HowItWorks } from "@/components/acces/marketing/how-it-works";
import { Manifesto } from "@/components/acces/marketing/manifesto";
import { LandingMotion } from "@/components/acces/marketing/motion/landing-motion";
import { PactSection } from "@/components/acces/marketing/pact-section";
import { JoinSection, RaceSection } from "@/components/acces/marketing/race-section";
import { SafetySection } from "@/components/acces/marketing/safety-section";
import { initialWaitlistStats } from "@/components/acces/marketing/server/api";
import { SiteFooter } from "@/components/acces/marketing/site-footer";
import { SiteHeader } from "@/components/acces/marketing/site-header";
import { SoundDesign } from "@/components/acces/marketing/sound/sound-design";
import { publicAlternates } from "@/i18n/paths";

// The kinetic headline plays on optical size and width: its own instance, on the landing only.
const headline = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-headline",
  display: "swap",
});

// Serif italics of the headline and section titles, above the fold: preloaded here only.
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

// Rendered per request in the visitor's language (ADR 0012): the race
// standings come from a 30-second cache and the client polls in between.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return {
    description: t("description"),
    alternates: publicAlternates((await getLocale()) as Locale, "/"),
  };
}

/** The landing page (docs/02-design.md, section 5) and the waiting list (ONB-01). */
export default async function HomePage() {
  const stats = await initialWaitlistStats();
  return (
    <div className={`${headline.variable} ${serif.variable}`}>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <IonFieldLayer />
        <div data-field-scope className="relative">
          <IonFieldBackdrop />
          <Hero stats={stats} />
          <Manifesto />
        </div>
        <HowItWorks />
        <RaceSection stats={stats} />
        <JoinSection />
        <PactSection />
        <SafetySection />
        <FaqSection />
      </main>
      <SiteFooter />
      <LandingMotion />
      <SoundDesign />
    </div>
  );
}
