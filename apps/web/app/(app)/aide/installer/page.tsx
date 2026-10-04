import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstallGuide } from "@/components/acces/install/install-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help.install");
  return { title: t("metaTitle") };
}

/** PLT-01: how to add Atomes to the home screen. */
export default async function InstallPage() {
  const t = await getTranslations("help.install");
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
        <p className="text-lg text-paper/75">{t("lead")}</p>
      </header>
      <InstallGuide />
    </main>
  );
}
