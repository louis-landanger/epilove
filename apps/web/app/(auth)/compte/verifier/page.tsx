import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReverifyForm } from "@/components/acces/account/reverify-form";
import { requireMember } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.reverify");
  return { title: t("metaTitle") };
}

export default async function ReverifyPage() {
  const member = await requireMember();
  const t = await getTranslations("settings.reverify");
  return (
    <main id="contenu" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-lg text-paper/75">{t("lead", { email: member.email })}</p>
      <ReverifyForm email={member.email} />
    </main>
  );
}
