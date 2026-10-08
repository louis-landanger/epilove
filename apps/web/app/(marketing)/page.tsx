import type { Locale } from "@atomes/core";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/components/acces/marketing/hero";
import { Landing } from "@/components/acces/marketing/landing";
import { publicAlternates } from "@/i18n/paths";

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
export default function HomePage() {
  return <Landing Hero={Hero} />;
}
