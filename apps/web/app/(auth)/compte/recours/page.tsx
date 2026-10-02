import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Appeals } from "@/components/acces/account/appeals";
import { serverApi } from "@/lib/server/api-app";
import { requireMember } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.appeals");
  return { title: t("metaTitle") };
}

/** Reachable whatever the account status: sanctioned members must be able to contest. */
export default async function AppealsPage() {
  await requireMember();
  const t = await getTranslations("settings.appeals");
  const { decisions } = await (await serverApi()).account.decisions();
  return (
    <main id="contenu" className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-paper/70">{t("lead")}</p>
      <Appeals initial={decisions} />
    </main>
  );
}
