import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/acces/auth/sign-out-button";
import { HelpResources } from "@/components/acces/help/help-resources";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.suspended");
  return { title: t("metaTitle") };
}

/** Suspended or banned members land here (the reasons were sent by email, DSA art. 17). */
export default async function SuspendedPage() {
  await connection();
  const t = await getTranslations("settings.suspended");
  return (
    <main id="contenu">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-16">
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
        <p className="text-lg text-paper/75">{t("body")}</p>
        <SignOutButton label={t("signOut")} />
        <h2 className="mt-6 font-semibold text-xl">{t("help")}</h2>
      </div>
      <HelpResources embedded />
    </main>
  );
}
