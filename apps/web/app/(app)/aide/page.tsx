import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HelpResources } from "@/components/acces/help/help-resources";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("metaTitle") };
}

/** Help resources (SAF-15), reachable from every screen of the app. */
export default function HelpPage() {
  return <HelpResources />;
}
