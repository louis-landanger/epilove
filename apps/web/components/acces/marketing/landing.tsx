import { Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import { FaqSection } from "./faq-section";
import { FleuvesHero } from "./fleuves/fleuves-hero";
import { HowItWorks } from "./how-it-works";
import { IonFieldLayer } from "./ion-field/ion-field-layer";
import { Manifesto } from "./manifesto";
import { LandingMotion } from "./motion/landing-motion";
import { PactSection } from "./pact-section";
import { JoinSection, RaceSection } from "./race-section";
import { SafetySection } from "./safety-section";
import { initialWaitlistStats } from "./server/api";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SoundDesign } from "./sound/sound-design";

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

/** The landing page (docs/02-design.md, section 5). */
export async function Landing() {
  const stats = await initialWaitlistStats();
  return (
    <div className={`${headline.variable} ${serif.variable}`}>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <IonFieldLayer />
        <div data-field-scope className="relative">
          <FleuvesHero />
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
