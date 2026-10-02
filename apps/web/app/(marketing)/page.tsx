import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FaqSection } from "@/components/acces/marketing/faq-section";
import { Hero, IonFieldBackdrop } from "@/components/acces/marketing/hero";
import { HowItWorks } from "@/components/acces/marketing/how-it-works";
import { Manifesto } from "@/components/acces/marketing/manifesto";
import { LandingMotion } from "@/components/acces/marketing/motion/landing-motion";
import { PactSection } from "@/components/acces/marketing/pact-section";
import { JoinSection, RaceSection } from "@/components/acces/marketing/race-section";
import { SafetySection } from "@/components/acces/marketing/safety-section";
import { initialWaitlistStats } from "@/components/acces/marketing/server/api";
import { SiteFooter } from "@/components/acces/marketing/site-footer";
import { SiteHeader } from "@/components/acces/marketing/site-header";

// Static page, refreshed every 30 s with the latest race standings; the
// client polls in between.
export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return { description: t("description") };
}

/** The landing page (docs/02-design.md, section 5) and the waiting list (ONB-01). */
export default async function HomePage() {
  const stats = await initialWaitlistStats();
  return (
    <>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
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
    </>
  );
}
